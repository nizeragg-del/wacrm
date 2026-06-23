import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runAutopilotCycle } from '@/lib/lead-capture/autopilot';

/**
 * Cron job for running autopilot cycles automatically.
 *
 * Queries autopilot_config where is_active = true, then runs each one.
 * Auth: uses AUTOMATION_CRON_SECRET.
 * Hosting: hit on a schedule (Vercel Cron / external pinger).
 * Recommended: run every hour.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }

  const supplied = request.headers.get('x-cron-secret') ?? '';
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);

  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Find all active autopilot configs
    const { data: configs, error } = await db
      .from('autopilot_config')
      .select('account_id')
      .eq('is_active', true);

    if (error) {
      console.error('[cron-autopilot] query failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No active autopilots' });
    }

    let processed = 0;
    let failed = 0;

    for (const config of configs) {
      try {
        console.log(`[cron-autopilot] running autopilot for account ${config.account_id}`);
        await runAutopilotCycle(config.account_id);
        processed++;
      } catch (error) {
        console.error(`[cron-autopilot] failed for account ${config.account_id}:`, error);
        failed++;
      }
    }

    return NextResponse.json({ processed, failed });
  } catch (error) {
    console.error('[cron-autopilot] cron failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
