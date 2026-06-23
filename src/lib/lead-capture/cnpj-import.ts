import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTextMessage } from '@/lib/whatsapp/meta-api';

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

// Verificar se número existe no WhatsApp
async function checkWhatsAppNumber(
  phoneNumberId: string,
  accessToken: string,
  phone: string
): Promise<boolean> {
  const evolutionUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const url = `${evolutionUrl}/chat/whatsappNumbers/${phoneNumberId}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EVOLUTION_API_KEY || '',
      },
      body: JSON.stringify({ numbers: [phone] }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data[0]?.exists === true;
    }
    
    return false;
  } catch (err) {
    console.error('checkWhatsAppNumber failed:', err);
    return false;
  }
}

// Importar leads do arquivo JSONL
export async function importCNPJLeads(
  accountId: string,
  userId: string,
  filePath: string,
  limit: number = 100
): Promise<{ imported: number; whatsappValid: number; skipped: number }> {
  const db = getSupabaseAdmin();
  
  // Get WhatsApp config
  const { data: whatsappConfig } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!whatsappConfig) {
    throw new Error('WhatsApp not configured');
  }

  const accessToken = decrypt(whatsappConfig.access_token);
  
  // Read JSONL file
  const fileContent = readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n').filter(line => line.trim());
  
  let imported = 0;
  let whatsappValid = 0;
  let skipped = 0;
  
  console.log(`[cnpj-import] Processing ${Math.min(lines.length, limit)} leads...`);
  
  for (let i = 0; i < Math.min(lines.length, limit); i++) {
    try {
      const lead: CNPJLead = JSON.parse(lines[i]);
      
      // Skip if no WhatsApp number
      if (!lead.telefone_whatsapp) {
        skipped++;
        continue;
      }
      
      // Check if WhatsApp number exists
      const whatsappExists = await checkWhatsAppNumber(
        whatsappConfig.phone_number_id,
        accessToken,
        lead.telefone_whatsapp
      );
      
      if (!whatsappExists) {
        console.log(`[cnpj-import] SKIP ${lead.nome}: not on WhatsApp`);
        skipped++;
        continue;
      }
      
      whatsappValid++;
      
      // Check for duplicate phone
      const { data: existingContact } = await db
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', lead.telefone_whatsapp)
        .maybeSingle();
      
      if (existingContact) {
        skipped++;
        continue;
      }
      
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
      
      if (contactError || !newContact) {
        console.error(`[cnpj-import] Failed to create contact for ${lead.nome}:`, contactError);
        skipped++;
        continue;
      }
      
      imported++;
      console.log(`[cnpj-import] ✅ Imported ${lead.nome} (${lead.telefone_whatsapp}) [${imported}/${limit}]`);
      
      // Small delay between checks
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`[cnpj-import] Error processing lead:`, error);
      skipped++;
    }
  }
  
  console.log(`\n[cnpj-import] Summary:`);
  console.log(`- Imported: ${imported}`);
  console.log(`- WhatsApp valid: ${whatsappValid}`);
  console.log(`- Skipped: ${skipped}`);
  
  return { imported, whatsappValid, skipped };
}
