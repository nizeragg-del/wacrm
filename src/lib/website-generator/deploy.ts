import { supabaseAdmin } from '@/lib/flows/admin-client'
import { engineSendText } from '@/lib/flows/meta-send'
import { createRepoAndPush } from './github'
import { deployToVercel } from './vercel'
import { updateOrderStatus } from './generator'
import { ensureClienteComSiteTag } from './tags'
import type { WebsiteOrder } from './types'

export interface WebsiteDeployResult {
  success: true
  alreadyDeployed: boolean
  order: WebsiteOrder
  repo_url: string | null
  deploy_url: string | null
  deployment_id: string | null
}

function repoNameForOrder(order: WebsiteOrder): string {
  const company = order.specifications.empresa_nome || 'site'
  const slug = company
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'site'
  return `landing-${slug}-${order.id.slice(0, 8)}`
}

async function loadOrder(orderId: string): Promise<WebsiteOrder | null> {
  const { data, error } = await supabaseAdmin()
    .from('website_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load order: ${error.message}`)
  return (data as WebsiteOrder | null) ?? null
}

async function claimOrderForDeploy(
  orderId: string,
  force: boolean,
): Promise<WebsiteOrder | null> {
  if (force) {
    const order = await loadOrder(orderId)
    if (!order) return null
    if (order.status !== 'deployed') {
      await updateOrderStatus(orderId, 'deploying')
    }
    return order
  }

  const { data, error } = await supabaseAdmin()
    .from('website_orders')
    .update({ status: 'deploying', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'awaiting_payment')
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`Failed to claim order for deploy: ${error.message}`)
  return (data as WebsiteOrder | null) ?? null
}

async function notifyCustomer(order: WebsiteOrder, deployUrl: string): Promise<void> {
  const db = supabaseAdmin()
  const { data: run } = await db
    .from('flow_runs')
    .select('user_id')
    .eq('account_id', order.account_id)
    .eq('contact_id', order.contact_id)
    .eq('conversation_id', order.conversation_id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!run) return

  await engineSendText({
    accountId: order.account_id,
    userId: (run as { user_id: string }).user_id,
    conversationId: order.conversation_id,
    contactId: order.contact_id,
    text: `Seu site esta no ar!\n\nAcesse agora: ${deployUrl}\n\nCompartilhe com seus clientes e nas redes sociais! Se precisar de qualquer alteracao, e so me chamar.`,
  })
}

export async function deployPaidWebsiteOrder(
  orderId: string,
  options: { force?: boolean; notify?: boolean } = {},
): Promise<WebsiteDeployResult> {
  const force = options.force ?? false
  const notify = options.notify ?? true

  const claimed = await claimOrderForDeploy(orderId, force)
  if (!claimed) {
    const existing = await loadOrder(orderId)
    if (!existing) throw new Error('Order not found')
    if (existing.status === 'deployed' || existing.deploy_url) {
      return {
        success: true,
        alreadyDeployed: true,
        order: existing,
        repo_url: existing.repo_url,
        deploy_url: existing.deploy_url,
        deployment_id: existing.vercel_deployment_id,
      }
    }
    throw new Error(`Order is not awaiting payment (status: ${existing.status})`)
  }

  if (claimed.status === 'deployed' && claimed.deploy_url && !force) {
    return {
      success: true,
      alreadyDeployed: true,
      order: claimed,
      repo_url: claimed.repo_url,
      deploy_url: claimed.deploy_url,
      deployment_id: claimed.vercel_deployment_id,
    }
  }

  try {
    if (!claimed.generated_code) {
      throw new Error('Order has no generated_code to publish')
    }

    const repoName = repoNameForOrder(claimed)
    const repoResult = await createRepoAndPush(
      claimed.generated_code,
      repoName,
      `Landing page - ${claimed.specifications.empresa_nome}`,
    )

    const deployResult = await deployToVercel(
      repoResult.repo_url,
      repoResult.repo_name,
    )

    await updateOrderStatus(orderId, 'deployed', {
      repo_url: repoResult.repo_url,
      deploy_url: deployResult.deploy_url,
      vercel_deployment_id: deployResult.deployment_id,
    })

    await ensureClienteComSiteTag(claimed.contact_id)

    if (notify) {
      try {
        await notifyCustomer(claimed, deployResult.deploy_url)
      } catch (sendErr) {
        console.error('[website-deploy] failed to send deploy notification:', sendErr)
      }
    }

    return {
      success: true,
      alreadyDeployed: false,
      order: { ...claimed, status: 'deployed' },
      repo_url: repoResult.repo_url,
      deploy_url: deployResult.deploy_url,
      deployment_id: deployResult.deployment_id,
    }
  } catch (err) {
    await updateOrderStatus(orderId, 'failed', {
      error_message: err instanceof Error ? err.message : 'Deploy failed',
    }).catch((updateErr) => {
      console.error('[website-deploy] failed to mark deploy failure:', updateErr)
    })
    throw err
  }
}
