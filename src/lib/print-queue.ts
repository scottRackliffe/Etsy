const QUEUE_KEY = "printQueue";
const MAX_QUEUE = 50;

export type PrintQueueDocType = "invoice" | "thank-you" | "label";

export type PrintQueueEntry = {
  type: PrintQueueDocType;
  orderId: number;
  orderNumber: string;
  addedAt: string;
};

export const PRINT_QUEUE_CHANGED_EVENT = "esm-print-queue-changed";

function notify(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PRINT_QUEUE_CHANGED_EVENT));
  }
}

function readQueue(): PrintQueueEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PrintQueueEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: PrintQueueEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  notify();
}

export function printQueueLength(): number {
  return readQueue().length;
}

export function listPrintQueue(): PrintQueueEntry[] {
  return readQueue();
}

export function addToPrintQueue(
  type: PrintQueueDocType,
  orderId: number,
  orderNumber: string
): "added" | "duplicate" | "full" {
  const queue = readQueue();
  if (queue.length >= MAX_QUEUE) return "full";
  if (queue.some((e) => e.type === type && e.orderId === orderId)) return "duplicate";
  queue.push({
    type,
    orderId,
    orderNumber,
    addedAt: new Date().toISOString(),
  });
  writeQueue(queue);
  return "added";
}

export function addOrdersToPrintQueue(
  orders: Array<{ id: number; order_number: string | null }>,
  type: PrintQueueDocType
): { added: number; duplicate: number; full: boolean } {
  let added = 0;
  let duplicate = 0;
  let full = false;
  for (const order of orders) {
    const result = addToPrintQueue(type, order.id, order.order_number ?? `Order ${order.id}`);
    if (result === "added") added += 1;
    else if (result === "duplicate") duplicate += 1;
    else full = true;
  }
  return { added, duplicate, full };
}

export function printQueueTypeLabel(type: PrintQueueDocType): string {
  switch (type) {
    case "invoice":
      return "Invoice";
    case "thank-you":
      return "Thank-you note";
    case "label":
      return "Shipping label";
  }
}

export function removePrintQueueEntry(type: PrintQueueDocType, orderId: number): void {
  const next = readQueue().filter((e) => !(e.type === type && e.orderId === orderId));
  writeQueue(next);
}

export function removePrintQueueEntries(
  entries: Array<{ type: PrintQueueDocType; orderId: number }>
): void {
  const keys = new Set(entries.map((e) => `${e.type}:${e.orderId}`));
  const next = readQueue().filter((e) => !keys.has(`${e.type}:${e.orderId}`));
  writeQueue(next);
}

export function clearPrintQueue(): void {
  writeQueue([]);
}
