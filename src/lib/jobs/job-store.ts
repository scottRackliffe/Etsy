/**
 * In-memory job tracking (ADR-043). Single-process, single-user local app.
 */

export type JobStatus = "running" | "completed" | "failed" | "cancelled";

export type JobProgress = {
  current: number;
  total: number;
  message: string;
};

export type JobRecord = {
  id: string;
  type: string;
  status: JobStatus;
  progress: JobProgress;
  startedAt: string;
  elapsedMs: number;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    user_message: string;
  };
  cancelled: boolean;
};

const CLEANUP_MS = 5 * 60 * 1000;

// Persist across Next.js HMR in development
const globalJobs = globalThis as typeof globalThis & { __jobStore?: Map<string, JobRecord> };
if (!globalJobs.__jobStore) {
  globalJobs.__jobStore = new Map<string, JobRecord>();
}
const jobs = globalJobs.__jobStore;

function randomJobId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 12; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `job_${suffix}`;
}

function scheduleCleanup(id: string): void {
  setTimeout(() => {
    const job = jobs.get(id);
    if (job && job.status !== "running") jobs.delete(id);
  }, CLEANUP_MS);
}

export function findRunningJobByType(type: string): JobRecord | undefined {
  for (const job of jobs.values()) {
    if (job.type === type && job.status === "running") return job;
  }
  return undefined;
}

export function createJob(type: string, initial?: Partial<JobProgress>): JobRecord {
  const id = randomJobId();
  const now = new Date().toISOString();
  const record: JobRecord = {
    id,
    type,
    status: "running",
    progress: {
      current: initial?.current ?? 0,
      total: initial?.total ?? 0,
      message: initial?.message ?? "Starting…",
    },
    startedAt: now,
    elapsedMs: 0,
    cancelled: false,
  };
  jobs.set(id, record);
  return record;
}

export function getJob(id: string): JobRecord | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  job.elapsedMs = Date.now() - new Date(job.startedAt).getTime();
  return job;
}

export function updateJobProgress(id: string, progress: Partial<JobProgress>): void {
  const job = jobs.get(id);
  if (!job || job.status !== "running") return;
  job.progress = { ...job.progress, ...progress };
  job.elapsedMs = Date.now() - new Date(job.startedAt).getTime();
}

export function isJobCancelled(id: string): boolean {
  return jobs.get(id)?.cancelled === true;
}

export function completeJob(id: string, result: unknown, message = "Complete"): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "completed";
  job.result = result;
  job.progress.message = message;
  job.progress.current = job.progress.total > 0 ? job.progress.total : job.progress.current;
  job.elapsedMs = Date.now() - new Date(job.startedAt).getTime();
  scheduleCleanup(id);
}

export function failJob(
  id: string,
  error: { code: string; message: string; user_message: string }
): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "failed";
  job.error = error;
  job.elapsedMs = Date.now() - new Date(job.startedAt).getTime();
  scheduleCleanup(id);
}

export function cancelJob(id: string): JobRecord | undefined {
  const job = jobs.get(id);
  if (!job || job.status !== "running") return job;
  job.cancelled = true;
  job.status = "cancelled";
  job.progress.message = "Cancelled by user";
  job.elapsedMs = Date.now() - new Date(job.startedAt).getTime();
  scheduleCleanup(id);
  return job;
}

export function jobToJson(job: JobRecord) {
  return {
    ok: true,
    job_id: job.id,
    status: job.status,
    progress: job.progress,
    started_at: job.startedAt,
    elapsed_ms: job.elapsedMs,
    ...(job.status === "completed" ? { result: job.result } : {}),
    ...(job.status === "failed" ? { error: job.error } : {}),
    ...(job.status === "cancelled" ? { result: job.result } : {}),
  };
}
