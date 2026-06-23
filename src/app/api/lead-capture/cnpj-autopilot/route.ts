import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runCNPJAutopilot } from '@/lib/lead-capture/autopilot';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return null;
  }

  const db = getSupabaseAdmin();
  const { data: profile } = await db
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    accountId: profile?.account_id,
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { storagePath, storagePaths, fileName, targetLeads = 100 } = body;

    const paths = storagePaths || (storagePath ? [storagePath] : []);

    if (paths.length === 0) {
      return NextResponse.json({ error: 'storagePaths or storagePath is required' }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // Save job to autopilot_config for cron pickup
    const { error } = await db
      .from('autopilot_config')
      .upsert({
        account_id: user.accountId,
        user_id: user.userId,
        cnpj_storage_paths: paths,
        cnpj_file_name: fileName,
        cnpj_target_leads: targetLeads,
        cnpj_job_status: 'pending',
        is_active: false,
        location: 'Brasil',
        locations: ['Brasil'],
        categories: ['cnpj'],
        radius_meters: 0,
        max_messages_per_day: 100,
        follow_up_enabled: false,
        follow_up_delay_hours: 24,
      }, { onConflict: 'account_id' });

    if (error) {
      console.error('[cnpj-autopilot] Failed to save job:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[cnpj-autopilot] Job saved for account ${user.accountId}, ${paths.length} file(s)`);

    return NextResponse.json({ 
      message: 'CNPJ job saved. Cron will process it shortly.',
      files: paths.length,
      targetLeads 
    });
  } catch (error) {
    console.error('[cnpj-autopilot] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
