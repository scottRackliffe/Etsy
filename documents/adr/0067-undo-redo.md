# ADR-067: Undo/redo for last N operations

## Status

Accepted

## Date

2026-05-24

## Context

Accidental saves are permanent. There is no undo mechanism anywhere in the application. A user who changes a price, status, or note by mistake has no way to revert without manually re-entering the old value (if they remember it).

## Decision

### Undo stack

- Client-side stack stored in React state (via a dedicated `useUndoRedo` hook), NOT in `localStorage`.
- Maximum depth: 10 entries. When an 11th is pushed, the oldest is discarded (FIFO eviction).
- Each entry:
  ```typescript
  interface UndoEntry {
    action: string; // human-readable: "Changed status to Sold"
    entity: string; // API entity path segment: "inventory" | "orders" | "customers"
    id: number; // record ID
    previousState: Record<string, unknown>; // field values BEFORE the change
    newState: Record<string, unknown>; // field values AFTER the change
    timestamp: number; // Date.now() at time of save
  }
  ```

### How entries are captured

- Before any successful `PATCH` request, the calling code captures the current (pre-save) field values for the changed fields.
- On successful `PATCH` response (200), the entry is pushed onto the undo stack and the redo stack is cleared.

### Undo behavior

1. Pop the most recent entry from the undo stack.
2. Issue `PATCH /api/<entity>/<id>` with the `previousState` values.
3. On success: push the entry onto the redo stack; show success toast "Undone: {action}".
4. On failure (including 409 concurrent edit per ADR-046): show error toast "Cannot undo — record was modified by another process. Reload to see the current state." The entry is discarded (not re-pushed).

### Redo behavior

1. Pop the most recent entry from the redo stack.
2. Issue `PATCH /api/<entity>/<id>` with the `newState` values.
3. On success: push the entry back onto the undo stack; show success toast "Redone: {action}".
4. On failure: same error handling as undo.

### Toast with undo action

- After every successful PATCH, a toast appears for 5 seconds with the message and an "Undo" button.
- Clicking "Undo" triggers the undo flow immediately.
- If the toast expires without clicking, the undo is still available via keyboard shortcut or a future UI control.

### Keyboard shortcuts

- `Cmd+Z` (macOS) / `Ctrl+Z` (Windows/Linux): Undo
- `Cmd+Shift+Z` (macOS) / `Ctrl+Shift+Z` (Windows/Linux): Redo
- These shortcuts are registered globally but only fire when no text input is focused (to avoid conflicting with native text undo in form fields).

### Scope and limitations

Undo/redo applies to form field edits within the Inventory Detail Panel and Order Detail Panel only. It does NOT apply to: list-level inline edits (ADR-062), batch operations (ADR-040), picture uploads/deletes, or entity creation/deletion. The undo stack is cleared when the user navigates to a different entity.

- **In scope:** Field updates via PATCH (status changes, price edits, note edits, etc.) in the Inventory Detail Panel and Order Detail Panel.
- **Out of scope:** `POST` (creates) and `DELETE` (deletes) are NOT undoable — they involve too many side effects (order items, activity log entries, file operations) to reverse safely.
- **Out of scope:** List-level inline edits (ADR-062), batch operations (ADR-040), picture uploads/deletes.
- The undo/redo stacks are **cleared when the user navigates to a different entity** to prevent stale undo across contexts.

> **Reconciliation note (2026-06-09):** Clarified undo/redo scope — limited to Inventory Detail and Order Detail panels only; excluded inline edits, batch ops, picture changes, and entity CRUD. Corrected prior statement that inline edits participate in undo stack.

## Consequences

- **Positive:** Safety net for accidental changes; familiar Cmd+Z pattern; toast-based undo is fast and discoverable; low implementation cost (client-side only, reuses existing PATCH endpoints).
- **Negative:** Limited to PATCH operations; 10-entry depth may not cover long editing sessions; stacks lost on navigation or page refresh; concurrent edits can block undo.

## Notes

- Cross-ref: ADR-046 (concurrent edit detection — 409 handling), ADR-049 (keyboard shortcuts registry).
- The `useUndoRedo` hook should be provided via React context so all pages share one stack.
- Future enhancement: persist undo stack to `sessionStorage` to survive page refreshes (not in v1).
