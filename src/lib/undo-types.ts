export type UndoEntity = "inventory" | "orders" | "customers";

export type UndoEntry = {
  action: string;
  entity: UndoEntity;
  id: number;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  timestamp: number;
  updatedAt: string | null;
  onPatched?: (patch: Record<string, unknown>) => void;
};

export const UNDO_STACK_MAX = 10;

export function entityApiPath(entity: UndoEntity, id: number): string {
  return `/api/${entity}/${id}`;
}

export function pickChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { previousState: Record<string, unknown>; newState: Record<string, unknown> } {
  const previousState: Record<string, unknown> = {};
  const newState: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    previousState[key] = before[key] ?? null;
    newState[key] = after[key];
  }
  return { previousState, newState };
}
