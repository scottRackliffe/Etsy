import { getDb } from "@/lib/sqlite";
import { getSetting } from "@/lib/settings-store";
import { logger } from "@/lib/logging";

export type ActivitySource = "user" | "system" | "etsy_sync";

export type LogActivityParams = {
  action: string;
  entityType?: string;
  entityId?: number;
  entityLabel?: string;
  detail?: Record<string, unknown>;
  source?: ActivitySource;
};

const SENSITIVE_KEY = /key|token|secret/i;

function maskDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    out[key] = SENSITIVE_KEY.test(key) ? "****" : value;
  }
  return out;
}

export function logActivity(params: LogActivityParams): void {
  try {
    const db = getDb();
    const detailJson = params.detail ? JSON.stringify(maskDetail(params.detail)) : null;
    db.prepare(
      `INSERT INTO activity_log (action, entity_type, entity_id, entity_label, detail_json, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.action,
      params.entityType ?? null,
      params.entityId ?? null,
      params.entityLabel ?? null,
      detailJson,
      params.source ?? "user",
      new Date().toISOString()
    );
  } catch (error) {
    logger.warn("activity_log insert failed", {
      action: params.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type ActivityLogRow = {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  entity_label: string | null;
  detail_json: string | null;
  source: string;
  created_at: string;
};

export function rowToActivityItem(row: ActivityLogRow) {
  let detail: Record<string, unknown> | null = null;
  if (row.detail_json) {
    try {
      detail = JSON.parse(row.detail_json) as Record<string, unknown>;
    } catch {
      detail = null;
    }
  }
  return {
    id: row.id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    entity_label: row.entity_label,
    detail,
    source: row.source,
    created_at: row.created_at,
  };
}

export function listActivity(options: {
  limit: number;
  offset: number;
  entityType?: string;
  entityId?: number;
  action?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}) {
  const db = getDb();
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (options.entityType) {
    where.push("entity_type = ?");
    params.push(options.entityType);
  }
  if (options.entityId != null) {
    where.push("entity_id = ?");
    params.push(options.entityId);
  }
  if (options.action) {
    where.push("action = ?");
    params.push(options.action);
  }
  if (options.fromDate) {
    where.push("date(created_at) >= date(?)");
    params.push(options.fromDate);
  }
  if (options.toDate) {
    where.push("date(created_at) <= date(?)");
    params.push(options.toDate);
  }
  if (options.search?.trim()) {
    where.push("(entity_label LIKE ? OR action LIKE ?)");
    const term = `%${options.search.trim()}%`;
    params.push(term, term);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM activity_log ${whereSql}`).get(...params) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT * FROM activity_log ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, options.limit, options.offset) as ActivityLogRow[];

  return { items: rows.map(rowToActivityItem), total };
}

export function purgeOldActivityLog(): void {
  try {
    const raw = getSetting("activity_log.retention_days");
    const days = raw ? parseInt(raw, 10) : 365;
    if (!Number.isFinite(days) || days <= 0) return;
    getDb()
      .prepare(`DELETE FROM activity_log WHERE created_at < datetime('now', ?)`)
      .run(`-${days} days`);
  } catch (error) {
    logger.warn("activity_log retention purge failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
