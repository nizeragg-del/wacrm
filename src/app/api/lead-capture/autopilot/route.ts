import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getAutopilotConfig,
  createAutopilotConfig,
  startAutopilot,
  stopAutopilot,
  runAutopilotCycle,
} from '@/lib/lead-capture/autopilot';

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

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let config = await getAutopilotConfig(user.accountId);

    if (!config) {
      config = await createAutopilotConfig(user.accountId, user.userId);
    }

    return NextResponse.json({ config });
  } catch (error) {
    console.error('[autopilot] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, config: configUpdates } = body;

    if (action === 'start') {
      await createAutopilotConfig(user.accountId, user.userId, configUpdates);
      await startAutopilot(user.accountId);
      return NextResponse.json({ message: 'Autopilot started' });
    }

    if (action === 'stop') {
      await stopAutopilot(user.accountId);
      return NextResponse.json({ message: 'Autopilot stopped' });
    }

    if (action === 'run') {
      // Manual trigger
      runAutopilotCycle(user.accountId).catch((error) => {
        console.error('[autopilot] manual run failed:', error);
      });
      return NextResponse.json({ message: 'Autopilot cycle started' });
    }

    if (action === 'update') {
      await createAutopilotConfig(user.accountId, user.userId, configUpdates);
      return NextResponse.json({ message: 'Config updated' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[autopilot] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
