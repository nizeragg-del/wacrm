import { createClient } from '@supabase/supabase-js';
import { geocodeLocation } from './nominatim';
import { searchBusinesses, filterWithoutWebsite } from './overpass';
import { generateProposalMessage } from './proposal-generator';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTextMessage } from '@/lib/whatsapp/meta-api';
import { DEFAULT_CONFIG, type AutopilotConfig } from './config';
import type { LeadCampaign, OSMBusiness } from './types';

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

  // Process ONLY FIRST location and FIRST category (to avoid timeout)
  // Next run will process the next one
  const firstLocation = config.locations[0];
  const firstCategory = config.categories[0];

  if (!firstLocation || !firstCategory) {
    console.log('[autopilot] no locations or categories configured');
    return;
  }

  console.log(`[autopilot] processing ${firstCategory} in ${firstLocation}`);

  try {
    await processLocationCategory(
      accountId,
      config.user_id,
      firstLocation,
      firstCategory,
      config.radius_meters,
      Math.min(remainingMessages, 50)
    );
  } catch (error) {
    console.error(`[autopilot] FAILED to process ${firstCategory} in ${firstLocation}:`, error);
  }

  // Rotate: move first location/category to end of array for next run
  const newLocations = [...config.locations.slice(1), firstLocation];
  const newCategories = firstLocation === config.locations[config.locations.length - 1]
    ? [...config.categories.slice(1), firstCategory]
    : config.categories;

  await updateAutopilotConfig(accountId, {
    locations: newLocations,
    categories: newCategories,
    last_run_at: new Date().toISOString(),
  });

  console.log('[autopilot] cycle completed, next run will process next category');
}

async function processLocationCategory(
  accountId: string,
  userId: string,
  location: string,
  category: string,
  radius: number,
  maxMessages: number
): Promise<void> {
  const db = getSupabaseAdmin();

  console.log(`[autopilot] === Starting processLocationCategory ===`);
  console.log(`[autopilot] Location: ${location}, Category: ${category}, Radius: ${radius}`);

  // Geocode location
  console.log(`[autopilot] Geocoding ${location}...`);
  let geocode;
  try {
    geocode = await geocodeLocation(location);
    console.log(`[autopilot] Geocoded: ${geocode.lat}, ${geocode.lon}`);
  } catch (error) {
    console.error(`[autopilot] GEOCODING FAILED:`, error);
    throw error;
  }

  // Search businesses (no delay needed - single request)
  console.log(`[autopilot] Searching ${category} in ${location}...`);
  const businesses = await searchBusinesses(geocode.lat, geocode.lon, category, radius);
  console.log(`[autopilot] Found ${businesses.length} businesses`);
  
  const withoutWebsite = filterWithoutWebsite(businesses);
  console.log(`[autopilot] ${withoutWebsite.length} without website`);

  if (withoutWebsite.length === 0) {
    console.log(`[autopilot] no businesses without website found for ${category} in ${location}`);
    return;
  }

  // Create campaign
  console.log(`[autopilot] Creating campaign...`);
  const { data: campaign, error: campaignError } = await db
    .from('lead_campaigns')
    .insert({
      account_id: accountId,
      user_id: userId,
      name: `Auto: ${category} - ${location.split(',')[0]}`,
      location,
      category,
      radius_meters: radius,
      status: 'running',
      total_found: businesses.length,
      total_without_website: withoutWebsite.length,
      total_contacted: 0,
    })
    .select()
    .single();

  if (campaignError || !campaign) {
    console.error('[autopilot] failed to create campaign:', campaignError);
    return;
  }

  const campaignData = campaign as LeadCampaign;
  let saved = 0;

  // Save leads (limited batch)
  const leadsToSave = withoutWebsite.slice(0, maxMessages);
  console.log(`[autopilot] Saving ${leadsToSave.length} leads...`);
  
  for (const business of leadsToSave) {
    try {
      const result = await saveLeadOnly(campaignData, business);
      if (result) saved++;
    } catch (error) {
      console.error(`[autopilot] failed to save lead:`, error);
    }
  }
  console.log(`[autopilot] Saved ${saved} leads`);

  // Update campaign
  await db
    .from('lead_campaigns')
    .update({
      total_without_website: saved,
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  // Send messages in background (non-blocking)
  sendMessagesForCampaign(campaign.id, accountId, Math.min(saved, 10))
    .then(() => console.log(`[autopilot] Messages sent for campaign ${campaign.id}`))
    .catch((error) => console.error(`[autopilot] Failed to send messages:`, error));
}

async function processAutopilotLead(
  campaign: LeadCampaign,
  business: OSMBusiness
): Promise<boolean> {
  const db = getSupabaseAdmin();

  // Validate phone
  const cleanPhone = (business.phone || '').replace(/\D/g, '');
  if (cleanPhone.length < 10 || cleanPhone.length > 13) {
    console.log(`[autopilot] Skipping ${business.name}: invalid phone "${business.phone}"`);
    return false;
  }

  // Check if campaign still exists (might have been deleted)
  const { data: campaignExists } = await db
    .from('lead_campaigns')
    .select('id')
    .eq('id', campaign.id)
    .maybeSingle();

  if (!campaignExists) {
    console.warn(`[autopilot] Campaign ${campaign.id} no longer exists, skipping lead`);
    return false;
  }

  // Check for duplicates
  const { data: existing } = await db
    .from('captured_leads')
    .select('id')
    .eq('account_id', campaign.account_id)
    .eq('phone', business.phone)
    .in('status', ['contacted', 'converted'])
    .maybeSingle();

  if (existing) {
    console.log(`[autopilot] phone ${cleanPhone} already contacted, skipping`);
    return false;
  }

  // Check if exists in this campaign
  const { data: existingInCampaign } = await db
    .from('captured_leads')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('phone', business.phone)
    .maybeSingle();

  if (existingInCampaign) {
    return false;
  }

  // Create or find contact
  const { data: existingContact } = await db
    .from('contacts')
    .select('id')
    .eq('account_id', campaign.account_id)
    .eq('phone', business.phone)
    .maybeSingle();

  let contactId = existingContact?.id || null;

  if (!contactId) {
    const { data: newContact } = await db
      .from('contacts')
      .insert({
        account_id: campaign.account_id,
        user_id: campaign.user_id,
        phone: business.phone,
        name: business.name,
        company: business.name,
      })
      .select('id')
      .single();

    contactId = newContact?.id || null;
  }

  // Generate message
  const city = campaign.location.split(',')[0] || campaign.location;
  console.log(`[autopilot] Generating message for ${business.name}...`);
  const proposalMessage = await generateProposalMessage({
    business_name: business.name,
    business_type: campaign.category,
    city,
    sender_name: 'Equipe WACRM',
  });
  console.log(`[autopilot] Message generated for ${business.name}`);

  // Create lead
  console.log(`[autopilot] Saving lead for ${business.name}...`);
  const { data: lead, error: leadError } = await db
    .from('captured_leads')
    .insert({
      campaign_id: campaign.id,
      account_id: campaign.account_id,
      contact_id: contactId,
      business_name: business.name,
      business_type: campaign.category,
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
    console.error('[autopilot] failed to save lead:', leadError);
    return false;
  }

  // Send WhatsApp
  try {
    const messageId = await sendWhatsAppMessage(
      campaign.account_id,
      business.phone || '',
      proposalMessage
    );

    if (messageId === null) {
      return false;
    }

    await db
      .from('captured_leads')
      .update({
        status: 'contacted',
        whatsapp_message_id: messageId,
      })
      .eq('id', lead.id);

    await db.rpc('increment_campaign_contacted', {
      p_campaign_id: campaign.id,
    });

    return true;
  } catch (error) {
    console.error('[autopilot] failed to send WhatsApp:', error);
    return false;
  }
}

async function sendWhatsAppMessage(
  accountId: string,
  phone: string,
  message: string
): Promise<string | null> {
  const db = getSupabaseAdmin();

  const { data: config } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!config) {
    throw new Error('WhatsApp not configured');
  }

  // Decrypt the access token
  const accessToken = decrypt(config.access_token);

  const cleanPhone = phone.replace(/\D/g, '');

  try {
    const result = await sendTextMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: cleanPhone,
      text: message,
    });

    return result.messageId;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Handle "number doesn't exist on WhatsApp"
    if (errorMsg.includes('exists: false')) {
      return null;
    }
    
    throw error;
  }
}

async function saveLeadOnly(
  campaign: LeadCampaign,
  business: OSMBusiness
): Promise<boolean> {
  const db = getSupabaseAdmin();

  // Validate phone
  const cleanPhone = (business.phone || '').replace(/\D/g, '');
  if (cleanPhone.length < 10 || cleanPhone.length > 13) {
    console.log(`[autopilot] SKIP ${business.name}: phone "${business.phone}" invalid (${cleanPhone.length} digits)`);
    return false;
  }

  // Check for duplicates
  const { data: existing } = await db
    .from('captured_leads')
    .select('id')
    .eq('account_id', campaign.account_id)
    .eq('phone', business.phone)
    .maybeSingle();

  if (existing) {
    console.log(`[autopilot] SKIP ${business.name}: phone already exists`);
    return false;
  }

  // Check if exists in this campaign
  const { data: existingInCampaign } = await db
    .from('captured_leads')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('phone', business.phone)
    .maybeSingle();

  if (existingInCampaign) {
    console.log(`[autopilot] SKIP ${business.name}: already in this campaign`);
    return false;
  }

  // Create or find contact
  const { data: existingContact } = await db
    .from('contacts')
    .select('id')
    .eq('account_id', campaign.account_id)
    .eq('phone', business.phone)
    .maybeSingle();

  let contactId = existingContact?.id || null;

  if (!contactId) {
    const { data: newContact } = await db
      .from('contacts')
      .insert({
        account_id: campaign.account_id,
        user_id: campaign.user_id,
        phone: business.phone,
        name: business.name,
        company: business.name,
      })
      .select('id')
      .single();

    contactId = newContact?.id || null;
  }

  // Save lead WITHOUT message (will send later)
  const { error } = await db
    .from('captured_leads')
    .insert({
      campaign_id: campaign.id,
      account_id: campaign.account_id,
      contact_id: contactId,
      business_name: business.name,
      business_type: campaign.category,
      address: business.address,
      phone: business.phone,
      email: business.email,
      osm_id: business.osm_id,
      latitude: business.lat,
      longitude: business.lon,
      has_website: false,
      website_url: null,
      status: 'pending',
      proposal_message: null,
    });

  if (error) {
    console.error(`[autopilot] FAILED to save ${business.name}:`, error.message);
    return false;
  }

  console.log(`[autopilot] SAVED ${business.name} (${business.phone})`);
  return true;
}

async function sendMessagesForCampaign(
  campaignId: string,
  accountId: string,
  maxMessages: number
): Promise<void> {
  const db = getSupabaseAdmin();

  // Get all pending leads for this campaign
  const { data: leads, error } = await db
    .from('captured_leads')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .is('proposal_message', null)
    .limit(maxMessages);

  if (error || !leads || leads.length === 0) {
    console.log('[autopilot] No pending leads to send messages to');
    return;
  }

  console.log(`[autopilot] Sending messages to ${leads.length} leads...`);
  let sent = 0;

  for (const lead of leads) {
    try {
      // Generate message with AI
      const city = lead.address?.split(',').pop() || 'São Paulo';
      const proposalMessage = await generateProposalMessage({
        business_name: lead.business_name,
        business_type: lead.business_type || 'business',
        city,
        sender_name: 'Equipe WACRM',
      });

      // Update lead with message
      await db
        .from('captured_leads')
        .update({ proposal_message: proposalMessage })
        .eq('id', lead.id);

      // Send WhatsApp
      const messageId = await sendWhatsAppMessage(
        accountId,
        lead.phone || '',
        proposalMessage
      );

      if (messageId) {
        await db
          .from('captured_leads')
          .update({
            status: 'contacted',
            whatsapp_message_id: messageId,
          })
          .eq('id', lead.id);

        sent++;
        console.log(`[autopilot] Sent message to ${lead.business_name}`);
      }

      // Delay between messages (respect rate limits)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`[autopilot] Failed to send message to ${lead.business_name}:`, error);
    }
  }

  console.log(`[autopilot] Sent ${sent} messages`);
}
