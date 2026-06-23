import { createClient } from '@supabase/supabase-js';
import { geocodeLocation } from './nominatim';
import { searchBusinesses, filterWithoutWebsite } from './overpass';
import { generateProposalMessage } from './proposal-generator';
import type {
  LeadCampaign,
  CapturedLead,
  CreateCampaignInput,
  OSMBusiness,
} from './types';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function createCampaign(
  accountId: string,
  userId: string,
  input: CreateCampaignInput
): Promise<LeadCampaign> {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('lead_campaigns')
    .insert({
      account_id: accountId,
      user_id: userId,
      name: input.name,
      location: input.location,
      category: input.category,
      radius_meters: input.radius_meters || 5000,
      status: 'pending',
      total_found: 0,
      total_without_website: 0,
      total_contacted: 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create campaign: ${error.message}`);
  }

  return data as LeadCampaign;
}

export async function getCampaigns(accountId: string): Promise<LeadCampaign[]> {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('lead_campaigns')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch campaigns: ${error.message}`);
  }

  return (data || []) as LeadCampaign[];
}

export async function getCampaign(campaignId: string, accountId: string): Promise<LeadCampaign | null> {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('lead_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('account_id', accountId)
    .single();

  if (error) {
    return null;
  }

  return data as LeadCampaign;
}

export async function getCampaignLeads(campaignId: string): Promise<CapturedLead[]> {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('captured_leads')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch leads: ${error.message}`);
  }

  return (data || []) as CapturedLead[];
}

export async function runCampaign(campaignId: string): Promise<void> {
  const db = getSupabaseAdmin();

  const { data: campaign, error: fetchError } = await db
    .from('lead_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (fetchError || !campaign) {
    throw new Error('Campaign not found');
  }

  const campaignData = campaign as LeadCampaign;

  await updateCampaignStatus(campaignId, 'running');

  try {
    // Add delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const geocode = await geocodeLocation(campaignData.location);
    
    // Add delay before Overpass request
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    const businesses = await searchBusinesses(
      geocode.lat,
      geocode.lon,
      campaignData.category,
      campaignData.radius_meters
    );

    const withoutWebsite = filterWithoutWebsite(businesses);

    // Count how many already have WhatsApp messages sent
    const { count: alreadyContacted } = await db
      .from('captured_leads')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'contacted');

    await db
      .from('lead_campaigns')
      .update({
        total_found: businesses.length,
        total_without_website: withoutWebsite.length,
        total_contacted: alreadyContacted || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    // Process leads with delay between each
    for (let i = 0; i < withoutWebsite.length; i++) {
      const business = withoutWebsite[i];
      await processLead(campaignData, business);
      
      // Add delay between leads to avoid rate limits
      if (i < withoutWebsite.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    await updateCampaignStatus(campaignId, 'completed');
  } catch (error) {
    console.error('[lead-capture] campaign failed:', error);
    await updateCampaignStatus(campaignId, 'failed');
    throw error;
  }
}

async function processLead(campaign: LeadCampaign, business: OSMBusiness): Promise<void> {
  const db = getSupabaseAdmin();

  // Validate phone number format (Brazilian numbers should have 10-11 digits)
  const cleanPhone = (business.phone || '').replace(/\D/g, '');
  const isValidPhone = cleanPhone.length >= 10 && cleanPhone.length <= 13;

  // Skip if no valid phone
  if (!isValidPhone || !business.phone) {
    return;
  }

  // DUPLICATION CHECK: Skip if this phone was already contacted in ANY campaign for this account
  const { data: alreadyContacted } = await db
    .from('captured_leads')
    .select('id, campaign_id')
    .eq('account_id', campaign.account_id)
    .eq('phone', business.phone)
    .in('status', ['contacted', 'converted'])
    .maybeSingle();

  if (alreadyContacted) {
    console.warn(`[lead-capture] Phone ${cleanPhone} already contacted in campaign ${alreadyContacted.campaign_id}, skipping`);
    return;
  }

  // DUPLICATION CHECK: Skip if this phone already exists in THIS campaign
  const { data: existingInCampaign } = await db
    .from('captured_leads')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('phone', business.phone)
    .maybeSingle();

  if (existingInCampaign) {
    console.warn(`[lead-capture] Phone ${cleanPhone} already exists in this campaign, skipping`);
    return;
  }

  const city = campaign.location.split(',')[0] || campaign.location;

  const { data: existingContact } = await db
    .from('contacts')
    .select('id')
    .eq('account_id', campaign.account_id)
    .eq('phone', business.phone || '')
    .maybeSingle();

  let contactId = existingContact?.id || null;

  if (!contactId && business.phone && isValidPhone) {
    const { data: newContact, error: contactError } = await db
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

    if (!contactError && newContact) {
      contactId = newContact.id;
    }
  }

  const proposalMessage = await generateProposalMessage({
    business_name: business.name,
    business_type: campaign.category,
    city,
    sender_name: 'Equipe WACRM',
  });

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

  if (leadError) {
    console.error('[lead-capture] failed to save lead:', leadError);
    return;
  }

  if (business.phone && contactId && isValidPhone) {
    try {
      const messageId = await sendWhatsAppMessage(
        campaign.account_id,
        business.phone,
        proposalMessage
      );

      // If messageId is null, number doesn't exist on WhatsApp
      if (messageId === null) {
        await db
          .from('captured_leads')
          .update({
            status: 'pending',
            proposal_message: `${proposalMessage}\n\n[AVISO: Número sem WhatsApp]`,
          })
          .eq('id', lead.id);
        return;
      }

      await db
        .from('captured_leads')
        .update({
          status: 'contacted',
          whatsapp_message_id: messageId,
        })
        .eq('id', lead.id);

      // Use RPC to increment atomically to avoid race conditions
      await db.rpc('increment_campaign_contacted', {
        p_campaign_id: campaign.id,
      });
    } catch (error) {
      console.error('[lead-capture] failed to send WhatsApp:', error);
    }
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
    .select('phone_number_id, access_token')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!config) {
    throw new Error('WhatsApp not configured for this account');
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

  const data = await response.json();

  // Handle "number doesn't exist on WhatsApp" - skip gracefully
  if (data?.response?.message?.[0]?.exists === false) {
    console.warn(`[whatsapp] Number ${cleanPhone} does not exist on WhatsApp, skipping`);
    return null;
  }

  if (!response.ok) {
    const errText = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(`Evolution API error: ${errText}`);
  }

  return data?.key?.id || data?.messageId || `evo-${Date.now()}`;
}

async function updateCampaignStatus(
  campaignId: string,
  status: LeadCampaign['status']
): Promise<void> {
  const db = getSupabaseAdmin();

  await db
    .from('lead_campaigns')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId);
}
