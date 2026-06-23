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

    console.log(`[cnpj-autopilot] Starting autopilot from ${paths.length} file(s)`);

    // Run autopilot in background (non-blocking)
    runCNPJAutopilot(
      user.accountId,
      user.userId,
      paths,
      targetLeads,
      fileName
    ).catch((error) => {
      console.error('[cnpj-autopilot] Failed:', error);
    });

    return NextResponse.json({ 
      message: 'CNPJ autopilot started',
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
