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

