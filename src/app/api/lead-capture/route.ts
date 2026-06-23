import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCampaign, getCampaigns, runCampaign } from '@/lib/lead-capture';

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

    const campaigns = await getCampaigns(user.accountId);
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('[lead-capture] GET error:', error);
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
    const { name, location, category, radius_meters, auto_run } = body;

    if (!name || !location || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: name, location, category' },
        { status: 400 }
      );
    }

    const campaign = await createCampaign(user.accountId, user.userId, {
      name,
      location,
      category,
      radius_meters,
    });

    if (auto_run) {
      runCampaign(campaign.id).catch((error) => {
        console.error('[lead-capture] auto-run failed:', error);
      });
    }

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error('[lead-capture] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
