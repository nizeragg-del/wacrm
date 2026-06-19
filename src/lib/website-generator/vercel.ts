const VERCEL_API_URL = 'https://api.vercel.com'

export interface VercelDeployResult {
  deploy_url: string
  deployment_id: string
  alias: string[]
}

function getVercelToken(): string {
  const token = process.env.VERCEL_TOKEN || ''
  if (!token) throw new Error('VERCEL_TOKEN environment variable not set')
  return token
}

function vercelUrl(path: string): string {
  const teamId = process.env.VERCEL_TEAM_ID || ''
  return `${VERCEL_API_URL}${path}${teamId ? (path.includes('?') ? '&' : '?') + `teamId=${teamId}` : ''}`
}

async function vercelRequest(path: string, init: RequestInit = {}) {
  const res = await fetch(vercelUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${getVercelToken()}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Vercel API error: ${data.error?.message || res.statusText}`)
  }
  return data
}

async function vercelPost(path: string, body: unknown) {
  return vercelRequest(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function vercelGet(path: string) {
  return vercelRequest(path)
}

async function waitForDeployment(deploymentId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 18; attempt++) {
    const deployment = await vercelGet(`/v13/deployments/${deploymentId}`)
    const state = deployment.readyState || deployment.state

    if (state === 'READY') {
      return deployment.url ? `https://${deployment.url}` : null
    }
    if (state === 'ERROR' || state === 'CANCELED') {
      throw new Error(`Vercel deployment ended with state ${state}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }

  return null
}

export async function deployToVercel(
  repoUrl: string,
  repoName: string,
): Promise<VercelDeployResult> {
  getVercelToken()

  const repoPath = repoUrl.replace('https://github.com/', '')
  const [repoOwner, repo] = repoPath.split('/')
  if (!repoOwner || !repo) throw new Error(`Invalid GitHub repo URL: ${repoUrl}`)
  const fullRepo = `${repoOwner}/${repo.replace('.git', '')}`

  let project: any
  try {
    const projects = await vercelGet('/v9/projects?limit=100')
    project = projects.projects?.find((p: any) => p.name === repoName)
  } catch {
    // Project lookup is best-effort; creation below will surface real errors.
  }

  if (!project) {
    project = await vercelPost('/v11/projects', {
      name: repoName,
      gitRepository: {
        type: 'github',
        repo: fullRepo,
      },
    })
  }

  const deployData = await vercelPost(
    '/v13/deployments?skipAutoDetectionConfirmation=1',
    {
      name: repoName,
      project: project.id || project.name,
      target: 'production',
      gitSource: {
        type: 'github',
        repoId: project.link?.repoId || project.id,
        ref: 'main',
      },
    },
  )

  const deployId = deployData.id || deployData.uid
  if (!deployId) throw new Error('Vercel deployment returned no id')

  const previewUrl = deployData.url ? `https://${deployData.url}` : null
  const readyUrl = await waitForDeployment(deployId)
  const aliasTarget = `${repoName}.vercel.app`
  const aliases = Array.isArray(deployData.alias) ? [...deployData.alias] : []

  let deployUrl = readyUrl || previewUrl
  try {
    await vercelPost(`/v2/now/deployments/${deployId}/aliases`, {
      alias: aliasTarget,
    })
    deployUrl = `https://${aliasTarget}`
    aliases.push(aliasTarget)
  } catch (err) {
    console.warn('[vercel] alias assignment skipped:', err)
  }

  if (!deployUrl) {
    throw new Error('Vercel deployment returned no usable URL')
  }

  return {
    deploy_url: deployUrl,
    deployment_id: deployId,
    alias: aliases,
  }
}
