import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getCampaign,
  getCampaignLeads,
  runCampaign,
} from '@/lib/lead-capture';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId } = await params;
    const campaign = await getCampaign(campaignId, user.accountId);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const leads = await getCampaignLeads(campaignId);

    return NextResponse.json({ campaign, leads });
  } catch (error) {
    console.error('[lead-capture] GET detail error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId } = await params;
    const campaign = await getCampaign(campaignId, user.accountId);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'running') {
      // Allow re-running if status is stuck (more than 5 minutes)
      const campaignAge = Date.now() - new Date(campaign.updated_at).getTime();
      const FIVE_MINUTES = 5 * 60 * 1000;
      
      if (campaignAge < FIVE_MINUTES) {
        return NextResponse.json(
          { error: 'Campaign is already running' },
          { status: 409 }
        );
      }
      
      // Reset stuck campaign
      const db = getSupabaseAdmin();
      await db
        .from('lead_campaigns')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', campaignId);
    }

    runCampaign(campaignId).catch((error) => {
      console.error('[lead-capture] run failed:', error);
    });

    return NextResponse.json({ message: 'Campaign started' });
  } catch (error) {
    console.error('[lead-capture] POST run error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId } = await params;
    const db = getSupabaseAdmin();

    const { error } = await db
      .from('lead_campaigns')
      .delete()
      .eq('id', campaignId)
      .eq('account_id', user.accountId);

    if (error) {
      throw new Error(`Failed to delete campaign: ${error.message}`);
    }

    return NextResponse.json({ message: 'Campaign deleted' });
  } catch (error) {
    console.error('[lead-capture] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
