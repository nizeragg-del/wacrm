import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { processFollowUps } from '@/lib/lead-capture/follow-up';

/**
 * Cron job for sending follow-up messages to leads that haven't responded.
 *
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

  try {
    const result = await processFollowUps();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[lead-capture-followup] cron failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
