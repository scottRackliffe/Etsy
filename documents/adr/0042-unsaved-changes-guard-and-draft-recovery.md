# ADR-042: Unsaved changes guard and draft recovery

## Status

Accepted

## Date

2026-05-24

## Context

Navigating away from a form silently discards edits. Browser crashes or accidental tab closure loses all unsaved form data. ADR-032 defines a confirmation dialog pattern, and ADR-030 mentions an unsaved-changes guard for the Inventory detail panel, but there is no systematic approach across all forms in the application. Users editing orders, customers, or configuration can lose minutes of work without warning.

## Decision

### 1. Scope — which forms are protected

Every form that edits a persisted record or creates a new one is protected:

| Page                                   | Form                              | Protection level          |
| -------------------------------------- | --------------------------------- | ------------------------- |
| Sales — order detail (ADR-031)         | Order editing panel               | Guard + auto-save draft   |
| Inventory — detail panel (ADR-030)     | Inventory editing panel           | Guard + auto-save draft   |
| Inventory — Listing Content section (ADR-030) | Listing content editing    | Guard + auto-save draft   |
| Customers — detail editing             | Customer editing form             | Guard only (simpler form) |
| Config — all sections (ADR-034)        | Each config section independently | Guard only                |

"Guard" = navigation warning when dirty. "Auto-save draft" = periodic save to localStorage for crash recovery.

### 2. Dirty tracking (`isDirty`)

Each protected form tracks whether it has unsaved changes:

**Implementation:**

- On form load (or after a successful save), capture a snapshot of the current form values as `savedState`
- On every form field change, compare current form state to `savedState` using deep equality
- `isDirty = !deepEqual(currentState, savedState)`
- Use a custom hook: `useDirtyTracking(initialValues)` → returns `{ isDirty, savedState, markClean, resetToSaved }`

**What counts as dirty:**

- Any field value differs from the saved state (including clearing a field to empty string when it was previously non-empty)
- Adding, removing, or reordering items in a list (e.g., order items, other costs)

**What does NOT count as dirty:**

- Computed/read-only fields changing (e.g., total_cost recalculation)
- Focus/blur without value change
- Whitespace-only differences in text fields are NOT considered dirty (trim before comparing)

### 3. Navigation guard

When `isDirty` is true and the user attempts to navigate away, a confirmation dialog is shown.

**Triggers:**

1. **Tab navigation:** User clicks a different tab in the app header → intercept via the tab change handler
2. **In-page navigation:** User clicks a different record in a list (e.g., different order in Sales) → intercept via the list selection handler
3. **Browser navigation:** User clicks browser back/forward, types a new URL, or closes the tab → intercept via `beforeunload` event
4. **Route change:** Next.js App Router — use tab/list handlers (items 1–2) for in-app navigation; use `beforeunload` for browser close/refresh. Do not use Pages Router `router.events` (not available in App Router).

**Dialog content (using ConfirmDialog from ADR-032):**

> **Updated 2026-06-21 (ADR-079 / WS-E): the dialog now has THREE choices, including Save.**
> This supersedes the prior two-button form below.
>
> **Implemented (WS-E1, 2026-06-21):** the dialog is `src/components/ui/UnsavedChangesDialog.tsx`,
> driven by `UnsavedChangesContext`. The active editor registers a validate-and-save handler via
> `registerSaveHandler()` (SEMS editors do this through `useSemsEditorGuard`). **Fallback:** if a
> dirty form has *not* registered a save handler, the dialog shows the original **two** buttons
> (Discard changes / Keep editing) — so legacy forms behave exactly as before.

- Title: "Unsaved Changes"
- Body: "You have unsaved changes. What would you like to do?"
- **Save changes** (primary): run the form's validate-and-save.
  - On success → toast **"Changes saved."**, clear dirty flag, then continue the original
    navigation.
  - On **validation failure** → cancel the navigation, close the dialog, keep the form open with
    field-level errors, toast "Fix the highlighted fields to save." (This is how the
    previously-feared validation edge case is handled — the user stays on the form.)
- **Discard changes**: revert to saved snapshot, clear dirty flag, toast **"Changes cancelled."**,
  then continue the original navigation.
- **Keep editing**: dismiss the dialog, cancel navigation, return to the form.

_Outcome guarantee (owner requirement):_ the user always ends with a **changes-saved** message, a
**changes-cancelled** message, or is **returned to the form** at the prior location; the dirty
flag is cleared after Save or Discard.

_(Historical note: the original spec said "No 'Save and continue' button … to avoid edge cases
with validation failures." That concern is now resolved by the validation-failure handling
above.)_

**`beforeunload` behavior:**

- When `isDirty` is true, register a `beforeunload` handler that calls `event.preventDefault()` and sets `event.returnValue = ""`
- The browser shows its native "Leave site?" dialog (content cannot be customized)
- The handler is removed when `isDirty` becomes false or the component unmounts after a successful save

**Implementation pattern:**

```typescript
useEffect(() => {
  if (!isDirty) return;
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [isDirty]);
```

### 4. Auto-save to localStorage (draft recovery)

For long forms (inventory detail, order detail, and other SEMS editors), the current form state is periodically saved to `localStorage` to protect against browser crashes, power loss, or accidental closure.

**Draft key format:** `draft:<entity_type>:<entity_id>`

- Examples: `draft:inventory:42`, `draft:order:15`, `draft:inventory:new` (for new records)
- The key includes the entity ID to avoid conflicts between records

**Draft value format:**

```json
{
  "savedAt": "2026-05-24T19:30:00Z",
  "formState": { ... },
  "entityVersion": "2026-05-24T18:00:00Z"
}
```

- `savedAt`: ISO 8601 timestamp of when the draft was saved (for display in the recovery banner)
- `formState`: the full form state object (same shape as the form's state)
- `entityVersion`: the `updated_at` value of the entity when the form was loaded (to detect if the server record changed since the draft was created)

**Auto-save interval:** Every **30 seconds** while the form is dirty

- Uses `setInterval` started when `isDirty` becomes true; cleared when `isDirty` becomes false or on unmount
- Only writes if the form state has actually changed since the last auto-save (avoid unnecessary writes)
- Auto-save is silent (no toast or visual indicator); the user does not need to know it's happening

**Draft size limit:** If a draft exceeds 500 KB (unlikely but possible with large text fields), skip the auto-save and log a warning. This prevents filling up localStorage.

### 5. Draft recovery on page load

When a protected form loads, it checks for a matching draft in `localStorage`.

**Recovery flow:**

1. Check `localStorage` for key `draft:<entity_type>:<entity_id>`
2. If no draft exists → load normally from API
3. If a draft exists:
   a. Compare `entityVersion` in the draft to the current `updated_at` from the API
   b. If the server record is newer than the draft → discard the draft silently (it's stale), load from API
   c. If the draft is newer or same version → show the recovery banner

**Recovery banner:**

```
┌─────────────────────────────────────────────────────────────────┐
│ ℹ️  Recovered unsaved changes from 2:30 PM today.  [Restore] [Discard] │
└─────────────────────────────────────────────────────────────────┘
```

- Banner appears at the top of the form panel, below the header but above the form fields
- Background: `var(--ui-yellow)` at 15% opacity with `var(--ui-yellow)` left border
- "Restore" button: loads the draft's `formState` into the form, marks the form as dirty, dismisses the banner
- "Discard" button: removes the draft from `localStorage`, dismisses the banner, keeps the server-loaded data
- The banner is dismissible (has an `×` close button that acts as "Discard")

**Time formatting in banner:** Relative time if < 24 hours ("2:30 PM today", "yesterday at 4:15 PM"), otherwise absolute date ("May 22, 2026 at 3:45 PM").

### 6. Draft lifecycle

| Event                                                               | Action                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Form loads, no draft                                                | Normal load from API                                        |
| Form loads, draft exists, server is newer                           | Discard draft silently                                      |
| Form loads, draft exists, draft is current                          | Show recovery banner                                        |
| User clicks "Restore"                                               | Load draft into form, mark dirty                            |
| User clicks "Discard" on banner                                     | Delete draft from localStorage                              |
| User saves form successfully                                        | Delete draft from localStorage, update `savedState`         |
| User clicks "Discard Changes" in nav guard                          | Delete draft from localStorage, navigate away               |
| User navigates away without saving (no guard, e.g., form not dirty) | Draft remains in localStorage (will be recovered next time) |
| Auto-save fires while dirty                                         | Write/update draft in localStorage                          |

### 7. Cleanup

- Drafts older than **7 days** are automatically cleaned up on app load
- On the root layout mount, iterate `localStorage` keys matching `draft:*`, parse each, and delete any where `savedAt` is > 7 days ago
- This prevents localStorage accumulation from abandoned edits

### 8. Custom hook API

The system provides a reusable hook that encapsulates all behavior:

```typescript
function useDraftRecovery<T>(entityType: string, entityId: string | number, serverData: T, serverUpdatedAt: string) {
  // Returns:
  isDirty: boolean;
  formState: T;
  setFormState: (updates: Partial<T>) => void;
  draftBanner: ReactNode | null;  // recovery banner component, or null
  markClean: () => void;          // call after successful save
  discardDraft: () => void;       // programmatic draft discard
}
```

This hook combines dirty tracking, `beforeunload`, auto-save, and draft recovery into a single integration point per form.

### 9. Interaction with Offline Queue (ADR-050)

> Added 2026-06-09 — specifies behavior when the offline mutation queue conflicts with draft recovery.

When the mutation queue replays after reconnection and encounters a 409 (stale record), the queued mutation is marked as failed. If a local draft exists for the same entity, the draft is preserved and the user is notified via the notification center (ADR-051) to review and resubmit. The draft recovery banner will appear on next visit to that entity, allowing the user to restore the draft, review the current server state, and manually resubmit their changes.

## Consequences

- **Positive:** Users never silently lose form data on navigation; crash recovery via auto-save protects against browser/system failures; the reusable hook makes it easy to add protection to any form; stale draft detection prevents overwriting newer server data.
- **Negative:** localStorage has a ~5 MB limit per origin, though individual drafts are small; the 30-second auto-save interval means up to 30 seconds of work could be lost in a crash; deep equality comparison on every keystroke could be expensive for very large forms (mitigated by debouncing the comparison); the `beforeunload` native dialog cannot be customized and may confuse users who see two different dialog styles.

## Notes

- Cross-references: ADR-030 (inventory detail — primary consumer of this guard + draft recovery), ADR-031 (order detail — consumer of guard + draft recovery), ADR-032 (ConfirmDialog — used for the in-app navigation guard dialog), ADR-034 (Settings sections — consumer of guard only, no auto-save needed)
- The `beforeunload` event is the only way to intercept browser close/refresh; it shows a browser-native dialog that cannot be styled or have custom text in modern browsers
- For "new record" forms (creating a new item/order), use the key `draft:<entity_type>:new`; if the user starts creating two new items, the second overwrites the first draft (acceptable trade-off for simplicity)
- This ADR supersedes the brief mention of dirty tracking in ADR-030 §4 and provides the full specification
