import { getDb } from "@/lib/sqlite";
import { logger } from "@/lib/logging";

type SessionRow = {
  id: number;
  service: string;
  started_at: string;
  ended_at: string | null;
  last_heartbeat: string;
  duration_seconds: number;
};

/**
 * Start a new connection session. Closes any stale open session for
 * the same service first (using the last heartbeat as the end time).
 * Returns the new session id.
 */
export function startSession(service: string): number {
  const db = getDb();
  const now = new Date().toISOString();

  closeStaleSession(service);

  const result = db
    .prepare(
      `INSERT INTO connection_sessions (service, started_at, last_heartbeat, duration_seconds)
       VALUES (@service, @now, @now, 0)`
    )
    .run({ service, now });

  return Number(result.lastInsertRowid);
}

/**
 * Update the heartbeat for the most recent open session of a service.
 * Also updates duration_seconds as elapsed since started_at.
 */
export function heartbeatSession(service: string): void {
  const db = getDb();
  const now = new Date().toISOString();

  const open = db
    .prepare(
      `SELECT id, started_at FROM connection_sessions
       WHERE service = @service AND ended_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get({ service }) as Pick<SessionRow, "id" | "started_at"> | undefined;

  if (!open) return;

  const elapsed = Math.floor(
    (Date.now() - new Date(open.started_at).getTime()) / 1000
  );

  db.prepare(
    `UPDATE connection_sessions
     SET last_heartbeat = @now, duration_seconds = @elapsed
     WHERE id = @id`
  ).run({ now, elapsed, id: open.id });
}

/**
 * End the most recent open session for a service.
 * Calculates final duration_seconds.
 */
export function endSession(service: string): void {
  const db = getDb();
  const now = new Date().toISOString();

  const open = db
    .prepare(
      `SELECT id, started_at FROM connection_sessions
       WHERE service = @service AND ended_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get({ service }) as Pick<SessionRow, "id" | "started_at"> | undefined;

  if (!open) return;

  const elapsed = Math.floor(
    (Date.now() - new Date(open.started_at).getTime()) / 1000
  );

  db.prepare(
    `UPDATE connection_sessions
     SET ended_at = @now, last_heartbeat = @now, duration_seconds = @elapsed
     WHERE id = @id`
  ).run({ now, elapsed, id: open.id });
}

/**
 * Close any open session whose last heartbeat is older than 10 minutes.
 * Uses the last_heartbeat as the end time.
 */
function closeStaleSession(service: string): void {
  const db = getDb();

  const stale = db
    .prepare(
      `SELECT id, started_at, last_heartbeat FROM connection_sessions
       WHERE service = @service AND ended_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get({ service }) as Pick<SessionRow, "id" | "started_at" | "last_heartbeat"> | undefined;

  if (!stale) return;

  const elapsed = Math.floor(
    (new Date(stale.last_heartbeat).getTime() - new Date(stale.started_at).getTime()) / 1000
  );

  db.prepare(
    `UPDATE connection_sessions
     SET ended_at = @ended_at, duration_seconds = @elapsed
     WHERE id = @id`
  ).run({ ended_at: stale.last_heartbeat, elapsed, id: stale.id });

  logger.info("Closed stale connection session", {
    service,
    session_id: stale.id,
    duration_seconds: elapsed,
  });
}

export type MonthlySessionHours = {
  service: string;
  month: string;
  total_hours: number;
};

/**
 * Return total connected hours per service per month.
 */
export function getMonthlySessionHours(months = 6): MonthlySessionHours[] {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  cutoff.setDate(1);
  cutoff.setHours(0, 0, 0, 0);

  const rows = db
    .prepare(
      `SELECT service,
              strftime('%Y-%m', started_at) AS month,
              ROUND(SUM(duration_seconds) / 3600.0, 1) AS total_hours
       FROM connection_sessions
       WHERE started_at >= @cutoff
       GROUP BY service, month
       ORDER BY month DESC, service ASC`
    )
    .all({ cutoff: cutoff.toISOString() }) as MonthlySessionHours[];

  return rows;
}

/**
 * Delete all connection session records. Returns row count.
 */
export function purgeConnectionSessions(): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM connection_sessions").run();
  return result.changes;
}
