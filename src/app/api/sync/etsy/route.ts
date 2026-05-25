/**
 * POST /api/sync/etsy — async job (ADR-043) with progress polling.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { parsePositiveInt } from "@/lib/api-utils";
import { syncEtsyReceipts } from "@/lib/etsy-sync";
import {
  completeJob,
  createJob,
  failJob,
  findRunningJobByType,
  isJobCancelled,
  jobToJson,
  updateJobProgress,
} from "@/lib/jobs/job-store";
import { getSetting } from "@/lib/settings-store";

const ETSY_SYNC_JOB_TYPE = "etsy_sync";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const body = (await request.json().catch(() => ({}))) as {
      shop_id?: number | string;
    };

    const shopId = parsePositiveInt(body.shop_id != null ? String(body.shop_id) : null)
      ?? parsePositiveInt(getSetting("etsy.active_shop_id"));

    if (!shopId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "shop_id required",
        userMessage: "A valid shop_id is required for sync.",
        actions: ["Select a shop and retry sync."],
        fields: { shop_id: ["Must be a positive integer"] },
        canRetry: false,
      });
    }

    const running = findRunningJobByType(ETSY_SYNC_JOB_TYPE);
    if (running) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "JOB_ALREADY_RUNNING",
            message: "An Etsy sync is already in progress",
            user_message: "An Etsy sync is already in progress. Wait for it to finish or cancel it.",
            actions: ["Wait for the current sync to complete."],
            can_retry: false,
          },
          job_id: running.id,
        },
        { status: 409 }
      );
    }

    const job = createJob(ETSY_SYNC_JOB_TYPE, {
      current: 0,
      total: 0,
      message: "Starting Etsy sync…",
    });

    void runSyncJob(job.id, cookieStore, shopId);

    return NextResponse.json(
      {
        ok: true,
        job_id: job.id,
        status: "running",
      },
      { status: 202 }
    );
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "ETSY_API_FAILED",
        message: "Failed to sync Etsy receipts",
        userMessage: "We could not start Etsy sync right now.",
        actions: ["Retry in a moment.", "Reconnect Etsy if your session expired."],
      })
    );
  }
}

async function runSyncJob(
  jobId: string,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  shopId: number
): Promise<void> {
  try {
    const result = await syncEtsyReceipts(cookieStore, shopId, {
      onProgress: (progress) => updateJobProgress(jobId, progress),
      shouldCancel: () => isJobCancelled(jobId),
    });

    if (isJobCancelled(jobId)) {
      completeJob(jobId, {
        ...result,
        last_synced_at: getSetting("last_etsy_sync_at"),
        cancelled: true,
      });
      return;
    }

    if (result.synced === 0 && result.skipped_already_imported === 0 && result.skipped_errors.length > 0) {
      failJob(jobId, {
        code: "ETSY_API_FAILED",
        message: "All receipts failed to import",
        user_message: "We could not import any receipts. Check that your Etsy shop has orders.",
      });
      return;
    }

    completeJob(jobId, {
      ...result,
      last_synced_at: getSetting("last_etsy_sync_at"),
    });
  } catch (error) {
    if (error instanceof ApiRouteError) {
      failJob(jobId, {
        code: error.code,
        message: error.message,
        user_message: error.userMessage,
      });
      return;
    }
    const message = error instanceof Error ? error.message : "Failed to sync Etsy receipts";
    failJob(jobId, {
      code: "ETSY_API_FAILED",
      message,
      user_message: "We could not sync Etsy receipts right now.",
    });
  }
}

/** GET /api/sync/etsy?job_id= — poll job status (convenience alias). */
export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("job_id");
  if (!jobId) {
    return NextResponse.json({
      ok: true,
      last_synced_at: getSetting("last_etsy_sync_at"),
    });
  }
  const { getJob } = await import("@/lib/jobs/job-store");
  const job = getJob(jobId);
  if (!job) {
    return errorResponse(
      new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Job not found",
        userMessage: "Sync job not found.",
        actions: ["Start sync again."],
        canRetry: false,
      })
    );
  }
  return NextResponse.json(jobToJson(job));
}
