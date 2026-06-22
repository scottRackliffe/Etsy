/**
 * Communications & Outreach Center (ADR-078 / WS-C).
 *
 * - Message-type catalog (closed, code-defined — extensible with no schema change)
 * - Candidate queries (ADR-078 §3)
 * - Template rendering with the closed merge-token set (ADR-078 §4)
 * - Communication log CRUD
 * - Send orchestrator (email + print channels)
 */
import { getDb } from "@/lib/sqlite";
import { getSetting } from "@/lib/settings-store";
import { logActivity } from "@/lib/activity-log";
import { sendEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/format-currency";
import { logger } from "@/lib/logging";

// ---------------------------------------------------------------------------
// Message-type catalog
// ---------------------------------------------------------------------------

export type MessageType = "payment_reminder" | "thank_you";
export type Channel = "email" | "print";
export type CommStatus = "queued" | "sent" | "printed" | "failed";

export const MESSAGE_TYPES: Record<
  MessageType,
  {
    label: string;
    defaultChannel: Channel;
    allowedChannels: Channel[];
    defaultSubject: string;
    defaultBody: string;
  }
> = {
  payment_reminder: {
    label: "Payment Reminder",
    defaultChannel: "email",
    allowedChannels: ["email", "print"],
    defaultSubject: "Payment reminder for order {{order_number}}",
    defaultBody: `Dear {{customer_first_name}},

This is a friendly reminder that your order {{order_number}} placed on {{order_date}} has a balance of {{amount_due}} that remains unpaid.

Please arrange payment at your earliest convenience.

Thank you,
{{business_name}}`,
  },
  thank_you: {
    label: "Thank-You Note",
    defaultChannel: "print",
    allowedChannels: ["email", "print"],
    defaultSubject: "Thank you for your order {{order_number}}!",
    defaultBody: `Dear {{customer_first_name}},

Thank you so much for your order {{order_number}}! We hope you enjoy your purchase.

{{#if tracking_number}}Your order has been shipped. Tracking number: {{tracking_number}} ({{shipper}}).{{/if}}

With gratitude,
{{business_name}}`,
  },
};

// ---------------------------------------------------------------------------
// Candidate row type returned by queries
// ---------------------------------------------------------------------------

export type CandidateRow = {
  order_id: number;
  order_number: string;
  customer_id: number | null;
  customer_name: string;
  customer_email: string | null;
  grand_total: number;
  order_date: string | null;
  shipping_date: string | null;
  is_shipped: 0 | 1;
  source_channel: string | null;
  payment_status: string | null;
  already_reminded_at: string | null;
};

// ---------------------------------------------------------------------------
// Candidate queries (ADR-078 §3)
// ---------------------------------------------------------------------------

export function getCandidates(
  type: MessageType,
  options: { limit: number; offset: number }
): { items: CandidateRow[]; total: number } {
  const db = getDb();

  if (type === "payment_reminder") {
    const baseWhere = `
      o.order_status = 'active'
      AND o.source_channel = 'manual'
      AND o.payment_status = 'unpaid'
    `;
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM orders o WHERE ${baseWhere}`).get() as { c: number }
    ).c;

    const rows = db
      .prepare(
        `
        SELECT
          o.id          AS order_id,
          COALESCE(o.order_number, CAST(o.id AS TEXT)) AS order_number,
          o.customer_id,
          COALESCE(c.first_name || ' ' || c.last_name, o.ship_to_first_name || ' ' || o.ship_to_last_name, 'Unknown') AS customer_name,
          c.email       AS customer_email,
          COALESCE(o.grand_total, 0) AS grand_total,
          o.order_date,
          o.shipping_date,
          CASE WHEN o.shipping_date IS NOT NULL THEN 1 ELSE 0 END AS is_shipped,
          o.source_channel,
          o.payment_status,
          (
            SELECT MAX(cl.created_at)
            FROM communication_log cl
            WHERE cl.order_id = o.id AND cl.message_type = 'payment_reminder'
          ) AS already_reminded_at
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE ${baseWhere}
        ORDER BY o.order_date DESC, o.id DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(options.limit, options.offset) as CandidateRow[];

    return { items: rows, total };
  }

  // thank_you
  const baseWhere = `
    o.order_status = 'active'
    AND o.shipping_date IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM communication_log cl
      WHERE cl.order_id = o.id
        AND cl.message_type = 'thank_you'
        AND cl.status IN ('sent', 'printed')
    )
  `;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM orders o WHERE ${baseWhere}`).get() as { c: number }
  ).c;

  const rows = db
    .prepare(
      `
      SELECT
        o.id          AS order_id,
        COALESCE(o.order_number, CAST(o.id AS TEXT)) AS order_number,
        o.customer_id,
        COALESCE(c.first_name || ' ' || c.last_name, o.ship_to_first_name || ' ' || o.ship_to_last_name, 'Unknown') AS customer_name,
        c.email       AS customer_email,
        COALESCE(o.grand_total, 0) AS grand_total,
        o.order_date,
        o.shipping_date,
        CASE WHEN o.shipping_date IS NOT NULL THEN 1 ELSE 0 END AS is_shipped,
        o.source_channel,
        o.payment_status,
        NULL AS already_reminded_at
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE ${baseWhere}
      ORDER BY o.shipping_date DESC, o.id DESC
      LIMIT ? OFFSET ?
      `
    )
    .all(options.limit, options.offset) as CandidateRow[];

  return { items: rows, total };
}

// ---------------------------------------------------------------------------
// Template rendering (ADR-078 §4)
// ---------------------------------------------------------------------------

export type RenderedTemplate = {
  subject: string;
  body: string;
  unknown_tokens: string[];
};

// The closed token set (ADR-078 §4).
const KNOWN_TOKENS = new Set([
  "customer_first_name",
  "customer_last_name",
  "customer_full_name",
  "order_number",
  "order_date",
  "order_total",
  "amount_due",
  "business_name",
  "business_email",
  "tracking_number",
  "shipper",
]);

function buildTokenMap(
  order: Record<string, unknown>,
  customer: Record<string, unknown> | null,
  business: { name: string; email: string },
  currencyCode: string,
  dateFormat: string
): Record<string, string> {
  function fmtDate(val: unknown): string {
    if (!val) return "";
    const s = String(val);
    if (dateFormat === "MM/DD/YYYY") {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        const yyyy = d.getUTCFullYear();
        return `${mm}/${dd}/${yyyy}`;
      }
    }
    return s;
  }

  const firstName = String(customer?.first_name ?? order.ship_to_first_name ?? "");
  const lastName = String(customer?.last_name ?? order.ship_to_last_name ?? "");
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Customer";
  const grandTotal = Number(order.grand_total ?? 0);

  return {
    customer_first_name: firstName || fullName,
    customer_last_name: lastName,
    customer_full_name: fullName,
    order_number: String(order.order_number ?? order.id ?? ""),
    order_date: fmtDate(order.order_date),
    order_total: formatCurrency(grandTotal, currencyCode),
    amount_due: formatCurrency(grandTotal, currencyCode),
    business_name: business.name,
    business_email: business.email,
    tracking_number: String(order.tracking_number ?? ""),
    shipper: String(order.shipper ?? ""),
  };
}

export function renderTemplate(
  type: MessageType,
  order: Record<string, unknown>,
  customer: Record<string, unknown> | null
): RenderedTemplate {
  const catalogEntry = MESSAGE_TYPES[type];
  const currencyCode = getSetting("ui.currency_code") ?? "USD";
  const dateFormat = getSetting("ui.date_format") ?? "YYYY-MM-DD";
  const businessName = getSetting("business_name") ?? "";
  const businessEmail = getSetting("email.from_address") ?? "";

  const subjectTemplate =
    getSetting(`comm.template.${type}.subject`) || catalogEntry.defaultSubject;
  const bodyTemplate = getSetting(`comm.template.${type}.body`) || catalogEntry.defaultBody;

  const tokenMap = buildTokenMap(order, customer, { name: businessName, email: businessEmail }, currencyCode, dateFormat);
  const unknownTokens: string[] = [];

  function applyTokens(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, token: string) => {
      if (KNOWN_TOKENS.has(token)) {
        return tokenMap[token] ?? "";
      }
      if (!unknownTokens.includes(token)) unknownTokens.push(token);
      return match; // leave verbatim per spec
    });
  }

  const subject = applyTokens(subjectTemplate);
  // Strip simple conditional blocks (e.g. {{#if tracking_number}}...{{/if}}) when token is empty
  const bodyWithConditionals = bodyTemplate.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, token: string, inner: string) => {
      const val = tokenMap[token];
      return val && val.trim() ? inner : "";
    }
  );
  const body = applyTokens(bodyWithConditionals);

  return { subject, body, unknown_tokens: unknownTokens };
}

// ---------------------------------------------------------------------------
// Communication log CRUD
// ---------------------------------------------------------------------------

export type CommLogRow = {
  id: number;
  message_type: string;
  channel: string;
  order_id: number | null;
  customer_id: number | null;
  recipient: string | null;
  subject: string | null;
  body_snapshot: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

export function recordCommunication(row: {
  message_type: string;
  channel: string;
  order_id: number | null;
  customer_id: number | null;
  recipient: string | null;
  subject: string | null;
  body_snapshot: string | null;
  status: CommStatus;
  error?: string | null;
  sent_at?: string | null;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO communication_log
         (message_type, channel, order_id, customer_id, recipient, subject, body_snapshot, status, error, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.message_type,
      row.channel,
      row.order_id ?? null,
      row.customer_id ?? null,
      row.recipient ?? null,
      row.subject ?? null,
      row.body_snapshot ?? null,
      row.status,
      row.error ?? null,
      row.sent_at ?? null
    );
  return result.lastInsertRowid as number;
}

export function updateCommunicationStatus(
  id: number,
  status: CommStatus,
  opts?: { error?: string; sent_at?: string }
): void {
  const db = getDb();
  db.prepare(
    `UPDATE communication_log SET status = ?, error = ?, sent_at = ? WHERE id = ?`
  ).run(status, opts?.error ?? null, opts?.sent_at ?? null, id);
}

export function getCommunicationLog(options: {
  type?: string;
  orderId?: number;
  limit: number;
  offset: number;
}): { items: CommLogRow[]; total: number } {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (options.type) {
    where.push("message_type = ?");
    params.push(options.type);
  }
  if (options.orderId != null) {
    where.push("order_id = ?");
    params.push(options.orderId);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM communication_log ${whereSql}`).get(...params) as {
      c: number;
    }
  ).c;

  const rows = db
    .prepare(
      `SELECT * FROM communication_log ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, options.limit, options.offset) as CommLogRow[];

  return { items: rows, total };
}

// ---------------------------------------------------------------------------
// Load order + customer for a given orderId (used by preview + send)
// ---------------------------------------------------------------------------

export function loadOrderForComm(orderId: number): {
  order: Record<string, unknown>;
  customer: Record<string, unknown> | null;
} | null {
  const db = getDb();
  const order = db
    .prepare(`SELECT * FROM orders WHERE id = ? AND order_status = 'active'`)
    .get(orderId) as Record<string, unknown> | undefined;
  if (!order) return null;

  const customer =
    order.customer_id != null
      ? (db
          .prepare(`SELECT * FROM customers WHERE id = ?`)
          .get(order.customer_id) as Record<string, unknown> | null)
      : null;

  return { order, customer };
}

// ---------------------------------------------------------------------------
// Send orchestrator (ADR-078 §5)
// ---------------------------------------------------------------------------

export type SendItemResult = {
  order_id: number;
  status: CommStatus;
  error?: string;
};

/** Server-side compliance gate — payment reminders only for manual-channel orders. */
function assertPaymentReminderCompliance(
  type: MessageType,
  order: Record<string, unknown>
): void {
  if (type === "payment_reminder" && order.source_channel !== "manual") {
    throw new Error("COMPLIANCE_VIOLATION");
  }
}

export async function sendCommunications(params: {
  type: MessageType;
  channel: Channel;
  orderIds: number[];
}): Promise<SendItemResult[]> {
  const results: SendItemResult[] = [];
  const successOrderIds: number[] = [];

  for (const orderId of params.orderIds) {
    const loaded = loadOrderForComm(orderId);
    if (!loaded) {
      results.push({ order_id: orderId, status: "failed", error: "Order not found or not active." });
      continue;
    }
    const { order, customer } = loaded;

    // Compliance gate (server-side, double-checked; also checked in the route).
    try {
      assertPaymentReminderCompliance(params.type, order);
    } catch {
      const errMsg = "Payment reminders are only available for manually-entered orders.";
      recordCommunication({
        message_type: params.type,
        channel: params.channel,
        order_id: orderId,
        customer_id: (order.customer_id as number | null) ?? null,
        recipient: params.channel === "email" ? ((customer?.email as string) ?? null) : "print",
        subject: null,
        body_snapshot: null,
        status: "failed",
        error: errMsg,
      });
      results.push({ order_id: orderId, status: "failed", error: errMsg });
      continue;
    }

    const rendered = renderTemplate(params.type, order, customer);

    if (params.channel === "email") {
      const emailAddress = (customer?.email as string | null) ?? null;
      if (!emailAddress) {
        const errMsg = "No email address for customer.";
        recordCommunication({
          message_type: params.type,
          channel: params.channel,
          order_id: orderId,
          customer_id: (order.customer_id as number | null) ?? null,
          recipient: null,
          subject: rendered.subject,
          body_snapshot: rendered.body,
          status: "failed",
          error: errMsg,
        });
        results.push({ order_id: orderId, status: "failed", error: errMsg });
        continue;
      }

      // Insert as queued first, then attempt send
      const logId = recordCommunication({
        message_type: params.type,
        channel: params.channel,
        order_id: orderId,
        customer_id: (order.customer_id as number | null) ?? null,
        recipient: emailAddress,
        subject: rendered.subject,
        body_snapshot: rendered.body,
        status: "queued",
      });

      const emailResult = await sendEmail({
        to: emailAddress,
        subject: rendered.subject,
        body: rendered.body,
      });

      if (emailResult.ok) {
        updateCommunicationStatus(logId, "sent", { sent_at: new Date().toISOString() });
        results.push({ order_id: orderId, status: "sent" });
        successOrderIds.push(orderId);
      } else {
        updateCommunicationStatus(logId, "failed", { error: emailResult.error });
        results.push({ order_id: orderId, status: "failed", error: emailResult.error });
      }
    } else {
      // print channel — log as printed (caller handles adding to print queue)
      recordCommunication({
        message_type: params.type,
        channel: params.channel,
        order_id: orderId,
        customer_id: (order.customer_id as number | null) ?? null,
        recipient: "print",
        subject: rendered.subject,
        body_snapshot: rendered.body,
        status: "printed",
        sent_at: new Date().toISOString(),
      });
      results.push({ order_id: orderId, status: "printed" });
      successOrderIds.push(orderId);
    }
  }

  // Activity log — one row per batch (ADR-078 §8)
  const successCount = successOrderIds.length;
  if (successCount > 0) {
    try {
      logActivity({
        action: "communication.sent",
        entityType: "communication",
        entityId: successOrderIds.length === 1 ? successOrderIds[0] : undefined,
        entityLabel: `${MESSAGE_TYPES[params.type].label} (${params.channel})`,
        detail: {
          message_type: params.type,
          channel: params.channel,
          count: successCount,
          order_ids: successOrderIds,
        },
        source: "user",
      });
    } catch (err) {
      logger.warn("communications: activity log failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const failedWithErrors = results.filter((r) => r.status === "failed");
  if (failedWithErrors.length > 0 && successCount === 0) {
    try {
      logActivity({
        action: "communication.failed",
        entityType: "communication",
        entityLabel: `${MESSAGE_TYPES[params.type].label} — all ${failedWithErrors.length} failed`,
        detail: { message_type: params.type, error: failedWithErrors[0]?.error ?? "unknown" },
        source: "user",
      });
    } catch {
      // best-effort
    }
  }

  return results;
}
