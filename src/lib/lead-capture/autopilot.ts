import { createClient } from '@supabase/supabase-js';
import { geocodeLocation } from './nominatim';
import { searchBusinesses, filterWithoutWebsite } from './overpass';
import { generateProposalMessage } from './proposal-generator';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTextMessage, checkWhatsAppNumber } from '@/lib/whatsapp/meta-api';
import { DEFAULT_CONFIG, type AutopilotConfig } from './config';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface CNPJLead {
  cnpj: string;
  nome: string;
  endereco: string;
  ddd: string;
  telefone: string;
  telefone_whatsapp: string;
  email: string | null;
  cnae: string;
  uf: string;
}

export async function getAutopilotConfig(accountId: string): Promise<AutopilotConfig | null> {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('autopilot_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as AutopilotConfig;
}

export async function createAutopilotConfig(
  accountId: string,
  userId: string,
  overrides: Partial<AutopilotConfig> = {}
): Promise<AutopilotConfig> {
  const db = getSupabaseAdmin();

  const config = {
    account_id: accountId,
    user_id: userId,
    is_active: false,
    location: DEFAULT_CONFIG.locations[0],
    locations: DEFAULT_CONFIG.locations,
    categories: DEFAULT_CONFIG.categories,
    radius_meters: DEFAULT_CONFIG.radius_meters,
    max_messages_per_day: DEFAULT_CONFIG.max_messages_per_day,
    follow_up_enabled: DEFAULT_CONFIG.follow_up_enabled,
    follow_up_delay_hours: DEFAULT_CONFIG.follow_up_delay_hours,
    last_run_at: null,
    ...overrides,
  };

  const { data, error } = await db
    .from('autopilot_config')
    .upsert(config, { onConflict: 'account_id' })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create autopilot config: ${error.message}`);
  }

  return data as AutopilotConfig;
}

export async function updateAutopilotConfig(
  accountId: string,
  updates: Partial<AutopilotConfig>
): Promise<void> {
  const db = getSupabaseAdmin();

  const { error } = await db
    .from('autopilot_config')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('account_id', accountId);

  if (error) {
    throw new Error(`Failed to update autopilot config: ${error.message}`);
  }
}

export async function startAutopilot(accountId: string): Promise<void> {
  await updateAutopilotConfig(accountId, { is_active: true });
  
  // Run autopilot in background with error logging
  runAutopilotCycle(accountId)
    .then(() => {
      console.log('[autopilot] cycle completed successfully');
    })
    .catch((error) => {
      console.error('[autopilot] cycle failed:', error);
      // Update status to failed so user can see it
      updateAutopilotConfig(accountId, { is_active: false }).catch(() => {});
    });
}

export async function stopAutopilot(accountId: string): Promise<void> {
  await updateAutopilotConfig(accountId, { is_active: false });
}

export async function runAutopilotCycle(accountId: string): Promise<void> {
  console.log(`[autopilot] Starting cycle for account ${accountId}`);
  
  const config = await getAutopilotConfig(accountId);
  
  if (!config || !config.is_active) {
    console.log('[autopilot] not active, skipping cycle');
    return;
  }

  console.log(`[autopilot] Config loaded: ${config.locations?.length || 0} locations, ${config.categories?.length || 0} categories`);

  const db = getSupabaseAdmin();

  // Check daily limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: messagesToday } = await db
    .from('captured_leads')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'contacted')
    .gte('created_at', today.toISOString());

  if ((messagesToday || 0) >= config.max_messages_per_day) {
    console.log(`[autopilot] daily limit reached: ${messagesToday}/${config.max_messages_per_day}`);
    return;
  }

  const remainingMessages = config.max_messages_per_day - (messagesToday || 0);
  const targetLeads = Math.min(100, remainingMessages);
  
  console.log(`[autopilot] Target: ${targetLeads} leads`);

  let totalSent = 0;

  // Loop through categories until we reach target
  for (const category of config.categories) {
    if (totalSent >= targetLeads) break;

    for (const location of config.locations) {
      if (totalSent >= targetLeads) break;

      console.log(`[autopilot] processing ${category} in ${location} (${totalSent}/${targetLeads})`);

      try {
        // Add timeout wrapper to prevent hanging
        const result = await Promise.race([
          processLocationCategory(
            accountId,
            config.user_id,
            location,
            category,
            config.radius_meters,
            targetLeads - totalSent
          ),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout after 30s')), 30000)
          )
        ]);
        
        totalSent += result;
        console.log(`[autopilot] Progress: ${totalSent}/${targetLeads} leads sent`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[autopilot] SKIP ${category} in ${location}: ${msg}`);
        // Continue to next location/category
      }
    }
  }

  // Update last run time
  await updateAutopilotConfig(accountId, {
    last_run_at: new Date().toISOString(),
  });

  console.log(`[autopilot] Completed: ${totalSent} leads sent`);
}

async function processLocationCategory(
  accountId: string,
  userId: string,
  location: string,
  category: string,
  radius: number,
  maxToSend: number
): Promise<number> {
  const db = getSupabaseAdmin();

  // Geocode location
  const geocode = await geocodeLocation(location);

  // Search businesses
  const businesses = await searchBusinesses(geocode.lat, geocode.lon, category, radius);
  const withoutWebsite = filterWithoutWebsite(businesses);

  if (withoutWebsite.length === 0) {
    console.log(`[autopilot] no businesses without website found for ${category} in ${location}`);
    return 0;
  }

  // Get WhatsApp config
  const { data: whatsappConfig } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!whatsappConfig) {
    console.error('[autopilot] WhatsApp not configured');
    return 0;
  }

  const accessToken = decrypt(whatsappConfig.access_token);
  let sent = 0;

  for (const business of withoutWebsite) {
    if (sent >= maxToSend) break;

    try {
      // 1. Validate phone format
      const cleanPhone = (business.phone || '').replace(/\D/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 13) {
        continue;
      }

      // 2. Check if number exists on WhatsApp
      const whatsappExists = await checkWhatsAppNumber({
        phoneNumberId: whatsappConfig.phone_number_id,
        accessToken,
        phone: business.phone || '',
      });

      if (!whatsappExists) {
        console.log(`[autopilot] SKIP ${business.name}: not on WhatsApp`);
        continue;
      }

      // 3. Check for duplicates
      const { data: existing } = await db
        .from('captured_leads')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', business.phone)
        .maybeSingle();

      if (existing) {
        continue;
      }

      // 4. Create or find contact
      const { data: existingContact } = await db
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', business.phone)
        .maybeSingle();

      let contactId = existingContact?.id || null;

      if (!contactId) {
        const { data: newContact } = await db
          .from('contacts')
          .insert({
            account_id: accountId,
            user_id: userId,
            phone: business.phone,
            name: business.name,
            company: business.name,
          })
          .select('id')
          .single();

        contactId = newContact?.id || null;
      }

      if (!contactId) {
        console.error(`[autopilot] Failed to create contact for ${business.name}`);
        continue;
      }

      // 5. Generate message with AI
      const city = location.split(',')[0] || location;
      const proposalMessage = await generateProposalMessage({
        business_name: business.name,
        business_type: category,
        city,
        sender_name: 'Equipe WACRM',
      });

      // 6. Save lead
      const { data: lead, error: leadError } = await db
        .from('captured_leads')
        .insert({
          campaign_id: null, // Will be set later if needed
          account_id: accountId,
          contact_id: contactId,
          business_name: business.name,
          business_type: category,
          address: business.address,
          phone: business.phone,
          email: business.email,
          osm_id: business.osm_id,
          latitude: business.lat,
          longitude: business.lon,
          has_website: false,
          website_url: null,
          status: 'pending',
          proposal_message: proposalMessage,
        })
        .select()
        .single();

      if (leadError || !lead) {
        console.error(`[autopilot] Failed to save lead for ${business.name}:`, leadError);
        continue;
      }

      // 7. Send WhatsApp message
      try {
        const messageId = await sendTextMessage({
          phoneNumberId: whatsappConfig.phone_number_id,
          accessToken,
          to: cleanPhone,
          text: proposalMessage,
        });

        // Update lead status
        await db
          .from('captured_leads')
          .update({
            status: 'contacted',
            whatsapp_message_id: messageId.messageId,
          })
          .eq('id', lead.id);

        sent++;
        console.log(`[autopilot] ✅ Sent to ${business.name} (${cleanPhone}) [${sent}/${maxToSend}]`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('exists: false')) {
          console.log(`[autopilot] SKIP ${business.name}: WhatsApp send failed (number doesn't exist)`);
        } else {
          console.error(`[autopilot] Failed to send to ${business.name}:`, errorMsg);
        }
      }

      // Small delay between messages
      await new Promise((resolve) => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`[autopilot] Error processing ${business.name}:`, error);
    }
  }

  return sent;
}

// ============================================================
// CNPJ Autopilot - Import leads from government database
// ============================================================

export async function runCNPJAutopilot(
  accountId: string,
  userId: string,
  storagePath: string,
  targetLeads: number = 100,
  fileName?: string
): Promise<void> {
  console.log(`[cnpj-autopilot] Starting CNPJ autopilot for account ${accountId}`);
  console.log(`[cnpj-autopilot] Target: ${targetLeads} leads`);
  console.log(`[cnpj-autopilot] Storage path: ${storagePath}`);

  const db = getSupabaseAdmin();

  // Get WhatsApp config
  const { data: whatsappConfig } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!whatsappConfig) {
    console.error('[cnpj-autopilot] WhatsApp not configured');
    return;
  }

  const accessToken = decrypt(whatsappConfig.access_token);

  // Create campaign
  const today = new Date().toISOString().split('T')[0];
  const { data: campaign, error: campaignError } = await db
    .from('lead_campaigns')
    .insert({
      account_id: accountId,
      user_id: userId,
      name: `Auto: CNPJ - ${today}`,
      location: 'Brasil',
      category: 'cnpj',
      radius_meters: 0,
      status: 'running',
      total_found: 0,
      total_without_website: 0,
      total_contacted: 0,
      storage_path: storagePath,
      file_name: fileName || storagePath.split('/').pop(),
    })
    .select()
    .single();

  if (campaignError || !campaign) {
    console.error('[cnpj-autopilot] Failed to create campaign:', campaignError);
    return;
  }

  console.log(`[cnpj-autopilot] Campaign created: ${campaign.id}`);

  // Download JSONL file from Supabase Storage
  const { data: fileData, error: downloadError } = await db.storage
    .from('cnpj-files')
    .download(storagePath);

  if (downloadError || !fileData) {
    console.error('[cnpj-autopilot] Failed to download file:', downloadError);
    await db
      .from('lead_campaigns')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', campaign.id);
    return;
  }

  const fileContent = await fileData.text();
  const allLines = fileContent.split('\n').filter(line => line.trim());

  // Get last processed line from config
  const { data: config } = await db
    .from('autopilot_config')
    .select('last_processed_line')
    .eq('account_id', accountId)
    .maybeSingle();

  const startLine = (config as any)?.last_processed_line || 0;
  const lines = allLines.slice(startLine);

  console.log(`[cnpj-autopilot] Loaded ${allLines.length} total leads, starting from line ${startLine}`);
  console.log(`[cnpj-autopilot] Processing ${lines.length} remaining leads`);

  let sent = 0;
  let processed = 0;
  let skipped = 0;
  let currentLine = startLine;

  for (const line of lines) {
    if (sent >= targetLeads) break;

    currentLine++;

    try {
      const lead: CNPJLead = JSON.parse(line);
      processed++;

      // Skip if no WhatsApp number
      if (!lead.telefone_whatsapp) { skipped++; continue; }

      // Check if WhatsApp number exists
      const whatsappExists = await checkWhatsAppNumber({
        phoneNumberId: whatsappConfig.phone_number_id,
        accessToken,
        phone: lead.telefone_whatsapp,
      });

      if (!whatsappExists) {
        skipped++;
        continue;
      }

      // Check for duplicate phone
      const { data: existingContact } = await db
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', lead.telefone_whatsapp)
        .maybeSingle();

      if (existingContact) { skipped++; continue; }

      // Create contact
      const { data: newContact, error: contactError } = await db
        .from('contacts')
        .insert({
          account_id: accountId,
          user_id: userId,
          phone: lead.telefone_whatsapp,
          name: lead.nome,
          company: lead.nome,
          email: lead.email,
        })
        .select('id')
        .single();

      if (contactError || !newContact) { skipped++; continue; }

      // Generate message
      const message = await generateProposalMessage({
        business_name: lead.nome,
        business_type: lead.cnae,
        city: lead.uf,
        sender_name: 'Equipe WACRM',
      });

      // Save lead
      const { data: leadData, error: leadError } = await db
        .from('captured_leads')
        .insert({
          campaign_id: campaign.id,
          account_id: accountId,
          contact_id: newContact.id,
          business_name: lead.nome,
          business_type: lead.cnae,
          address: lead.endereco,
          phone: lead.telefone_whatsapp,
          email: lead.email,
          latitude: null,
          longitude: null,
          has_website: false,
          website_url: null,
          status: 'pending',
          proposal_message: message,
        })
        .select()
        .single();

      if (leadError || !leadData) { skipped++; continue; }

      // Send WhatsApp message
      try {
        const result = await sendTextMessage({
          phoneNumberId: whatsappConfig.phone_number_id,
          accessToken,
          to: lead.telefone_whatsapp,
          text: message,
        });

        // Update lead status
        await db
          .from('captured_leads')
          .update({
            status: 'contacted',
            whatsapp_message_id: result.messageId,
          })
          .eq('id', leadData.id);

        sent++;
        console.log(`[cnpj-autopilot] ✅ Sent to ${lead.nome} (${lead.telefone_whatsapp}) [${sent}/${targetLeads}]`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('exists: false')) {
          console.log(`[cnpj-autopilot] SKIP ${lead.nome}: WhatsApp failed`);
        }
      }

      // Delay between messages
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      skipped++;
      console.error(`[cnpj-autopilot] Error processing lead:`, error);
    }

    if (currentLine % 10000 === 0) {
      console.log(`[cnpj-autopilot] Progress: line ${currentLine} | sent ${sent}/${targetLeads} | skipped ${skipped}`);
    }
  }

  // Update campaign status
  await db
    .from('lead_campaigns')
    .update({
      status: 'completed',
      total_found: processed,
      total_without_website: skipped,
      total_contacted: sent,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  // Save last processed line for resume
  await db
    .from('autopilot_config')
    .update({
      last_processed_line: currentLine,
      last_run_at: new Date().toISOString(),
    })
    .eq('account_id', accountId);

  console.log(`\n[cnpj-autopilot] Completed!`);
  console.log(`- Processed (valid JSON): ${processed}`);
  console.log(`- Sent: ${sent}`);
  console.log(`- Skipped (no WA/duplicate/error): ${skipped}`);
  console.log(`- Next run starts at line: ${currentLine}`);
  console.log(`- Campaign ID: ${campaign.id}`);
}

