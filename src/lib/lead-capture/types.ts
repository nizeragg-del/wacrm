export interface LeadCampaign {
  id: string;
  account_id: string;
  user_id: string;
  name: string;
  location: string;
  category: string;
  radius_meters: number;
  status: CampaignStatus;
  total_found: number;
  total_without_website: number;
  total_contacted: number;
  created_at: string;
  updated_at: string;
}

export type CampaignStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface CapturedLead {
  id: string;
  campaign_id: string;
  account_id: string;
  contact_id: string | null;
  business_name: string;
  business_type: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  osm_id: number | null;
  latitude: number | null;
  longitude: number | null;
  has_website: boolean;
  website_url: string | null;
  status: LeadStatus;
  proposal_message: string | null;
  whatsapp_message_id: string | null;
  created_at: string;
}

export type LeadStatus = 'pending' | 'contacted' | 'responded' | 'converted';

export interface OSMBusiness {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  osm_id: number;
  lat: number;
  lon: number;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
}

export interface CreateCampaignInput {
  name: string;
  location: string;
  category: string;
  radius_meters?: number;
}

export interface ProposalMessageInput {
  business_name: string;
  business_type: string;
  city: string;
  sender_name: string;
  website_url?: string;
}
