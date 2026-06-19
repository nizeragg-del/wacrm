import { supabaseAdmin } from '@/lib/flows/admin-client'

const TAG_NAME = 'Cliente com Site'

/**
 * Ensures the "Cliente com Site" tag exists and is applied to the contact.
 * If the tag doesn't exist, it's created. Then it's upserted into contact_tags.
 *
 * Called after a successful deploy in simulate-payment and asaas-webhook.
 * Best-effort: errors are logged but never thrown (non-fatal).
 */
export async function ensureClienteComSiteTag(contactId: string): Promise<void> {
  const admin = supabaseAdmin()

  try {
    // 1. Find or create the tag
    let tagId: string | null = null

    const { data: existingTag } = await admin
      .from('tags')
      .select('id')
      .eq('name', TAG_NAME)
      .maybeSingle()

    if (existingTag) {
      tagId = existingTag.id
    } else {
      const { data: newTag, error: createErr } = await admin
        .from('tags')
        .insert({ name: TAG_NAME })
        .select('id')
        .maybeSingle()

      if (createErr) throw createErr
      tagId = newTag?.id ?? null
    }

    if (!tagId) {
      console.error('[ensureClienteComSiteTag] failed to get or create tag')
      return
    }

    // 2. Apply tag to contact (upsert — idempotent)
    const { error: upsertErr } = await admin
      .from('contact_tags')
      .upsert(
        { contact_id: contactId, tag_id: tagId },
        { onConflict: 'contact_id,tag_id' },
      )

    if (upsertErr) throw upsertErr
  } catch (err) {
    console.error('[ensureClienteComSiteTag] non-fatal error:', err)
  }
}
