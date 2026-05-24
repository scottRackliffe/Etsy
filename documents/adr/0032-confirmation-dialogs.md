# ADR-032: Confirmation dialogs for destructive and irreversible actions

## Status

Accepted

## Date

2026-05-24

## Context

No destructive action in the application requires user confirmation. Delete inventory, delete address, reject draft, disconnect Etsy, and publish to Etsy all execute on a single button click with no warning. This creates risk of accidental data loss and unintended Etsy API mutations.

## Decision

**All destructive and irreversible actions must present a confirmation dialog using the existing `Modal` component before executing.** The dialog pattern is standardized to eliminate ambiguity.

---

### Confirmation dialog spec (exact)

Every confirmation dialog uses the `Modal` component with these elements:

```
┌─────────────────────────────────────┐
│ [Title]                          ✕  │
├─────────────────────────────────────┤
│                                     │
│ [Description text]                  │
│                                     │
│ [Optional: affected item summary]   │
│                                     │
├─────────────────────────────────────┤
│              [Cancel]   [Confirm]   │
└─────────────────────────────────────┘
```

- **Title:** Action-specific (e.g., "Delete item?").
- **Description:** One sentence explaining the consequence.
- **Affected item:** Shows the record being acted on (order number, item number, customer name) so the user can verify.
- **Cancel button:** `<Button variant="secondary">Cancel</Button>`. Always on the left. Closes dialog, takes no action.
- **Confirm button:** `<Button variant="danger">` for destructive actions, `<Button variant="accent">` for significant-but-not-destructive actions. Label is action-specific (e.g., "Delete", "Void", "Publish"). Always on the right.
- **Escape key and backdrop click:** close dialog (cancel behavior). Already handled by `Modal`.

---

### Actions requiring confirmation (exact list)

**Destructive (data loss) — `variant="danger"` confirm button:**

| Action | Page | Title | Description | Confirm label |
|--------|------|-------|-------------|---------------|
| Delete inventory item | Inventory | "Delete item?" | "This will permanently delete item {item_number}. Items linked to orders cannot be deleted." | "Delete" |
| Delete customer address | Customers | "Delete address?" | "This will remove the address at {first_line}, {city}." | "Delete" |
| Delete customer | Customers | "Delete customer?" | "This will permanently delete {first_name} {last_name} and all their addresses. Customers linked to orders cannot be deleted." | "Delete" |
| Void order | Sales | "Void order?" | "This will void order {order_number}. Voided orders are excluded from active reports." | "Void order" |
| Reject listing draft | Inventory | "Reject draft?" | "This will reset the listing draft for item {item_number} back to draft state." | "Reject" |
| Disconnect Etsy | Header | "Disconnect Etsy?" | "This will clear your Etsy tokens. You will need to reconnect to sync orders or publish listings." | "Disconnect" |
| Clear all data (future) | Config | "Erase all data?" | "This will delete all inventory, orders, customers, and settings. This cannot be undone." | "Erase everything" |

**Significant but not destructive — `variant="accent"` confirm button:**

| Action | Page | Title | Description | Confirm label |
|--------|------|-------|-------------|---------------|
| Publish to Etsy | Inventory | "Publish to Etsy?" | "This will create a live listing on Etsy for item {item_number}. Review the preview below before confirming." | "Publish" |
| Mark order shipped | Sales | "Ship order?" | (Handled by the mark-shipped modal in ADR-031 — the modal itself serves as confirmation.) | "Confirm shipment" |
| Restore backup | Config | "Restore from backup?" | "This will replace all current data with the backup from {date}. A safety-net backup will be created first." | "Restore" |

**Actions that do NOT need confirmation:**

- Mark order paid (non-destructive, reversible).
- Save/update any field (normal data entry).
- Create records (inventory, customer, order).
- Sync Etsy receipts (non-destructive, additive).
- Generate AI listing content (overwrites draft only, not published data).
- Approve draft (positive action, no data loss).
- Download/export (read-only).

---

### Implementation pattern

Create a reusable `ConfirmDialog` wrapper around `Modal`:

```typescript
type ConfirmDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  detail?: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "accent";
  busy?: boolean;
};
```

- `ConfirmDialog` renders `Modal` with the standard layout.
- `busy` prop shows spinner on the confirm button while the action executes.
- After successful execution, the dialog closes automatically.
- If the action fails, the dialog stays open and shows a toast error.

Each page manages `confirmAction` state:

```typescript
const [confirmAction, setConfirmAction] = useState<{
  type: string;
  onConfirm: () => Promise<void>;
} | null>(null);
```

Destructive buttons set `confirmAction` instead of executing directly. `ConfirmDialog` reads from this state.

---

### Unsaved changes guard

Per ADR-030, when a user has modified fields in the inventory detail panel and attempts to navigate away (select another item, switch tabs), display:

- **Title:** "Unsaved changes"
- **Description:** "You have unsaved changes to item {item_number}. Do you want to discard them?"
- **Confirm label:** "Discard" (`variant="danger"`)
- **Cancel label:** "Keep editing"

This uses the same `ConfirmDialog` pattern.

## Consequences

- **Positive**
  - Prevents accidental data loss from mis-clicks.
  - Consistent confirmation pattern that users learn once.
  - Reusable `ConfirmDialog` component reduces per-page boilerplate.
  - Busy state on confirm button prevents double-clicks.
- **Negative**
  - Adds one extra click to destructive workflows.
  - Requires each page to manage confirmation state.
