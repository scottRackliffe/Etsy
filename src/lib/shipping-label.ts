import type { OrderShipToSnapshot, ShippingInfoData } from "@/lib/shipping-info";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAddress(lines: string[]): string {
  return lines.filter(Boolean).join("<br/>");
}

export function buildShippingLabelHtml(
  order: OrderShipToSnapshot & { id?: number },
  shipper: string,
  info: ShippingInfoData
): string {
  const orderLabel = order.order_number ?? (order.id != null ? `Order ${order.id}` : "Order");
  const toName = [order.ship_to_first_name, order.ship_to_last_name].filter(Boolean).join(" ");
  const toAddress = formatAddress([
    escapeHtml(toName),
    escapeHtml(order.ship_to_address_line_1 ?? ""),
    order.ship_to_address_line_2 ? escapeHtml(order.ship_to_address_line_2) : "",
    escapeHtml(
      [order.ship_to_city, order.ship_to_state_province, order.ship_to_postal_code]
        .filter(Boolean)
        .join(", ")
    ),
    escapeHtml(order.ship_to_country ?? ""),
  ]);
  const fromAddress = formatAddress([
    escapeHtml(info.return_name),
    escapeHtml(info.return_address_line_1),
    info.return_address_line_2 ? escapeHtml(info.return_address_line_2) : "",
    escapeHtml(
      [info.return_city, info.return_state, info.return_postal_code].filter(Boolean).join(", ")
    ),
    escapeHtml(info.return_country),
    info.phone ? escapeHtml(info.phone) : "",
    info.account_number ? `Acct: ${escapeHtml(info.account_number)}` : "",
  ]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Shipping label — ${escapeHtml(orderLabel)}</title>
  <style>
    @page { size: 4in 6in; margin: 0.25in; }
    body { font-family: Courier, monospace; margin: 0; padding: 0.25in; color: #111; }
    h1 { font-size: 14pt; margin: 0 0 12px; }
    .carrier { font-size: 11pt; font-weight: bold; margin-bottom: 16px; }
    .block { border: 2px solid #111; padding: 12px; margin-bottom: 16px; min-height: 1.5in; }
    .label { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .address { font-size: 12pt; line-height: 1.35; }
    .meta { font-size: 9pt; margin-top: 12px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <h1>Shipping label</h1>
  <p class="carrier">${escapeHtml(shipper)} · ${escapeHtml(orderLabel)}</p>
  <div class="block">
    <div class="label">Ship to</div>
    <div class="address">${toAddress}</div>
  </div>
  <div class="block">
    <div class="label">Return / sender</div>
    <div class="address">${fromAddress}</div>
  </div>
  ${order.tracking_number ? `<p class="meta">Tracking: ${escapeHtml(order.tracking_number)}</p>` : ""}
  <p class="meta no-print">Generated locally — no carrier API connection.</p>
  <script class="no-print">window.onload = function() { window.print(); };</script>
</body>
</html>`;
}
