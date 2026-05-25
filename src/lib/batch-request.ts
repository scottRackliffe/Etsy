import { resolveBatchIds } from "@/lib/batch-resolve";

export type BatchRequestBody = {
  action?: string;
  ids?: unknown;
  filter?: unknown;
  params?: Record<string, unknown>;
};

export function parseBatchIdList(
  entity: "orders" | "inventory" | "customers",
  body: BatchRequestBody
): number[] {
  const ids = resolveBatchIds(entity, body.ids, body.filter);
  if (ids.length === 0) {
    throw new Error("EMPTY_IDS");
  }
  return ids;
}
