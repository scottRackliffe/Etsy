import { NextRequest, NextResponse } from "next/server";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { cancelJob, getJob, jobToJson } from "@/lib/jobs/job-store";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { jobId } = await context.params;
    const job = getJob(jobId);
    if (!job) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Job not found",
        userMessage: "That operation is no longer available. It may have finished or expired.",
        actions: ["Start the operation again."],
        canRetry: false,
      });
    }
    return NextResponse.json(jobToJson(job));
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Job request failed",
        userMessage: "We could not read job status.",
        actions: ["Try again."],
      })
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { jobId } = await context.params;
    const job = cancelJob(jobId);
    if (!job) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Job not found",
        userMessage: "That operation is no longer available.",
        actions: ["Start the operation again."],
        canRetry: false,
      });
    }
    return NextResponse.json(jobToJson(job));
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Job request failed",
        userMessage: "We could not read job status.",
        actions: ["Try again."],
      })
    );
  }
}
