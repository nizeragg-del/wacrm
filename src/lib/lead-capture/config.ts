export interface AutopilotConfig {
  id: string;
  account_id: string;
  user_id: string;
  is_active: boolean;
  location: string;
  locations: string[];
  categories: string[];
  radius_meters: number;
  max_messages_per_day: number;
  follow_up_enabled: boolean;
  follow_up_delay_hours: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_CATEGORIES = [
  'restaurant',
  'dentist',
  'beauty',
  'bakery',
  'pharmacy',
  'gym',
  'mechanic',
  'lawyer',
  'vet',
  'bar',
];

export const DEFAULT_LOCATIONS = [
  'São Paulo, Brasil',
  'Campinas, Brasil',
  'Sorocaba, Brasil',
  'Santos, Brasil',
  'Ribeirão Preto, Brasil',
  'São José dos Campos, Brasil',
  'Piracicaba, Brasil',
  'Bauru, Brasil',
  'Jundiaí, Brasil',
  'Marília, Brasil',
];

export const DEFAULT_CONFIG = {
  categories: DEFAULT_CATEGORIES,
  locations: DEFAULT_LOCATIONS,
  radius_meters: 10000,
  max_messages_per_day: 100,
  follow_up_enabled: true,
  follow_up_delay_hours: 24,
};
