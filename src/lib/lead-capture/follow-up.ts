import { createClient } from '@supabase/supabase-js';
import type { CapturedLead } from './types';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const FOLLOW_UP_MESSAGES: Record<string, string[]> = {
  restaurant: [
    'Oi! Vi que o site para o {{business}} ficou pronto. Quer dar uma olhada? 🍽️',
    'Oi novamente! O site que criei para o {{business}} já está pronto. Posso te mostrar?',
  ],
  dentist: [
    'Oi! O site para a clínica {{business}} ficou incrível. Quer ver? 🦷',
    'Oi! Lembrei do site para o {{business}}. Posso enviar o link?',
  ],
  beauty: [
    'Oi! O site para o salão {{business}} ficou lindo! Quer conferir? 💇',
    'Oi novamente! O site do {{business}} está pronto. Quer dar uma olhada?',
  ],
  default: [
    'Oi! Tudo bem? O site que criei para o {{business}} ficou pronto. Quer ver? 😊',
    'Oi! Lembrando do site para o {{business}}. Posso te enviar o link?',
  ],
};

export async function processFollowUps(): Promise<{ processed: number; failed: number }> {
  const db = getSupabaseAdmin();
  const now = new Date();

  // Find leads that need follow-up
  // (contacted more than 24h ago, no response, follow-up not sent yet)
  const { data: leads, error } = await db
    .from('captured_leads')
    .select(`
      *,
      lead_campaigns!inner (
        account_id,
        category
      )
    `)
    .eq('status', 'contacted')
    .not('whatsapp_message_id', 'is', null)
    .lt('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
    .is('follow_up_sent_at', null)
    .limit(50);

  if (error) {
    console.error('[follow-up] query failed:', error);
    return { processed: 0, failed: 0 };
  }

  if (!leads || leads.length === 0) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const lead of leads) {
    try {
      const leadData = lead as CapturedLead & {
        lead_campaigns: { account_id: string; category: string };
      };

      const category = leadData.lead_campaigns?.category || 'default';
      const messages = FOLLOW_UP_MESSAGES[category] || FOLLOW_UP_MESSAGES.default;
      const message = messages[0].replace(/\{\{business\}\}/g, leadData.business_name);

      await sendFollowUp(
        leadData.lead_campaigns.account_id,
        leadData.phone!,
        message
      );

      await db
        .from('captured_leads')
        .update({
          follow_up_sent_at: now.toISOString(),
        })
        .eq('id', lead.id);

      processed++;
    } catch (error) {
      console.error('[follow-up] failed to send:', error);
      failed++;
    }

    // Delay between messages
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { processed, failed };
}

async function sendFollowUp(
  accountId: string,
  phone: string,
  message: string
): Promise<void> {
  const db = getSupabaseAdmin();

  const { data: config } = await db
    .from('whatsapp_config')
    .select('phone_number_id')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!config) {
    throw new Error('WhatsApp not configured');
  }

  const evolutionUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const cleanPhone = phone.replace(/\D/g, '');
  const jid = `${cleanPhone}@s.whatsapp.net`;

  const response = await fetch(`${evolutionUrl}/message/sendText/${config.phone_number_id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.EVOLUTION_API_KEY || '',
    },
    body: JSON.stringify({
      number: jid,
      text: message,
    }),
  });

  if (!response.ok) {
    const data = await response.json();
    if (data?.response?.message?.[0]?.exists === false) {
      return; // Number doesn't exist, skip silently
    }
    throw new Error(`Evolution API error: ${response.statusText}`);
  }
}
