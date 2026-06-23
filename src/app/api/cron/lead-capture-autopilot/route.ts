import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runAutopilotCycle, processOneCNPJLead } from '@/lib/lead-capture/autopilot';

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }

  // Accept secret from header OR query param (for external cron services)
  const url = new URL(request.url);
  const supplied = request.headers.get('x-cron-secret') ?? url.searchParams.get('secret') ?? '';
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

  const results: { autopilot: number; cnpjProcessed: number; errors: string[] } = {
    autopilot: 0,
    cnpjProcessed: 0,
    errors: [],
  };

  // 1. Process regular autopilot cycles
  try {
    const { data: configs } = await db
      .from('autopilot_config')
      .select('account_id')
      .eq('is_active', true);

    if (configs && configs.length > 0) {
      for (const config of configs) {
        try {
          await runAutopilotCycle(config.account_id);
          results.autopilot++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          results.errors.push(`autopilot ${config.account_id}: ${msg}`);
        }
      }
    }
  } catch (error) {
    results.errors.push(`autopilot query failed: ${error}`);
  }

  // 2. Process ONE CNPJ lead from pending job (fast, < 10s)
  try {
    // Debug: check all configs with CNPJ data
    const { data: allConfigs } = await db
      .from('autopilot_config')
      .select('account_id, cnpj_job_status, cnpj_storage_paths')
      .not('cnpj_storage_paths', 'is', null);

    if (allConfigs && allConfigs.length > 0) {
      console.log(`[cron] Found ${allConfigs.length} configs with CNPJ data:`, JSON.stringify(allConfigs.map(c => ({ id: c.account_id, status: c.cnpj_job_status, paths: c.cnpj_storage_paths }))));
    }

    const { data: job } = await db
      .from('autopilot_config')
      .select('account_id, user_id, cnpj_storage_paths, cnpj_file_name, cnpj_target_leads, cnpj_job_status')
      .in('cnpj_job_status', ['pending', 'running'])
      .not('cnpj_storage_paths', 'is', null)
      .limit(1)
      .maybeSingle();

    console.log(`[cron] CNPJ job query result:`, job ? `found (${job.cnpj_job_status})` : 'not found');

    if (job && job.cnpj_storage_paths && job.user_id) {
      // Mark as running on first pickup
      if (job.cnpj_job_status === 'pending') {
        await db
          .from('autopilot_config')
          .update({ cnpj_job_status: 'running' })
          .eq('account_id', job.account_id);
      }

      try {
        const done = await processOneCNPJLead(
          job.account_id,
          job.user_id,
          job.cnpj_storage_paths,
          job.cnpj_target_leads || 100
        );

        if (done) {
          await db
            .from('autopilot_config')
            .update({ cnpj_job_status: 'completed' })
            .eq('account_id', job.account_id);
        }

        results.cnpjProcessed = 1;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.errors.push(`cnpj ${job.account_id}: ${msg}`);
      }
    }
  } catch (error) {
    results.errors.push(`cnpj query failed: ${error}`);
  }

  return NextResponse.json(results);
}
