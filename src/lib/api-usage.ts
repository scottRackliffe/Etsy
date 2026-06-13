import { getDb } from "@/lib/sqlite";
import { logger } from "@/lib/logging";

/**
 * Log an outbound API call to an external service.
 * Fire-and-forget — never throws.
 */
export function logApiCall(
  service: string,
  endpoint: string,
  statusCode?: number | null
): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO api_call_log (service, endpoint, status_code, created_at)
       VALUES (@service, @endpoint, @status_code, @created_at)`
    ).run({
      service,
      endpoint,
      status_code: statusCode ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn("Failed to log API call", {
      service,
      endpoint,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export type MonthlyUsageRow = {
  service: string;
  month: string;
  call_count: number;
};

/**
 * Delete all rows from api_call_log. Returns the number of rows removed.
 */
export function purgeApiCallLog(): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM api_call_log").run();
  return result.changes;
}

/**
 * Return aggregated API call counts per service per month.
 * @param months How many months back to include (default 6).
 */
export function getMonthlyUsage(months = 6): MonthlyUsageRow[] {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  cutoff.setDate(1);
  cutoff.setHours(0, 0, 0, 0);

  const rows = db
    .prepare(
      `SELECT service,
              strftime('%Y-%m', created_at) AS month,
              COUNT(*) AS call_count
       FROM api_call_log
       WHERE created_at >= @cutoff
       GROUP BY service, month
       ORDER BY month DESC, service ASC`
    )
    .all({ cutoff: cutoff.toISOString() }) as MonthlyUsageRow[];

  return rows;
}
