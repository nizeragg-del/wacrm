import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runAutopilotCycle, runCNPJAutopilot } from '@/lib/lead-capture/autopilot';

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

  const results: { autopilot: number; cnpj: number; errors: string[] } = {
    autopilot: 0,
    cnpj: 0,
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

  // 2. Process pending CNPJ autopilot jobs
  try {
    const { data: cnpjJobs } = await db
      .from('autopilot_config')
      .select('account_id, user_id, cnpj_storage_paths, cnpj_file_name, cnpj_target_leads')
      .eq('cnpj_job_status', 'pending')
      .not('cnpj_storage_paths', 'is', null);

    if (cnpjJobs && cnpjJobs.length > 0) {
      for (const job of cnpjJobs) {
        if (!job.cnpj_storage_paths || !job.user_id) continue;

        try {
          // Mark as running
          await db
            .from('autopilot_config')
            .update({ cnpj_job_status: 'running' })
            .eq('account_id', job.account_id);

          await runCNPJAutopilot(
            job.account_id,
            job.user_id,
            job.cnpj_storage_paths,
            job.cnpj_target_leads || 100,
            job.cnpj_file_name
          );

          // Mark as done
          await db
            .from('autopilot_config')
            .update({ cnpj_job_status: 'completed' })
            .eq('account_id', job.account_id);

          results.cnpj++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          results.errors.push(`cnpj ${job.account_id}: ${msg}`);
          await db
            .from('autopilot_config')
            .update({ cnpj_job_status: 'failed' })
            .eq('account_id', job.account_id);
        }
      }
    }
  } catch (error) {
    results.errors.push(`cnpj query failed: ${error}`);
  }

  return NextResponse.json(results);
}
