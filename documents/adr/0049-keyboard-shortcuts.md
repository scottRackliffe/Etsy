# ADR-049: Keyboard shortcuts

## Status
Accepted

## Date
2026-05-24

## Context
Every action in the application requires mouse clicks. Power users working through large inventories or processing multiple orders need keyboard shortcuts for common operations to maintain workflow efficiency.

## Decision
Implement a keyboard shortcut system with global shortcuts, page-specific shortcuts, and DataTable navigation.

### Global shortcuts (active from any page)

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Cmd/Ctrl+K` | Open global search | Per ADR-041 |
| `Cmd/Ctrl+S` | Save current form | Only when a form element has focus; prevents browser save-page dialog |
| `Cmd/Ctrl+N` | Create new record | Context-sensitive: new order on Sales, new item on Inventory, new customer on Customers, no-op on other pages |
| `Escape` | Close topmost modal/dialog/search | Closes in order: search overlay → modal → detail panel |
| `?` | Show keyboard shortcuts help modal | Only when no input/textarea has focus |

### Page-specific shortcuts

| Page | Shortcut | Action |
|------|----------|--------|
| Sales, Dashboard | `Cmd/Ctrl+Shift+S` | Trigger Etsy sync |
| Reports | `Cmd/Ctrl+P` | Print/preview current report |
| Inventory | `Cmd/Ctrl+Shift+I` | Open CSV import modal (ADR-047) |

### DataTable navigation (when a DataTable has focus)

| Shortcut | Action |
|----------|--------|
| `↑` (Arrow Up) | Select previous row |
| `↓` (Arrow Down) | Select next row |
| `Enter` | Open selected record in detail panel |
| `Delete` or `Backspace` | Delete selected record (triggers ConfirmDialog per ADR-032) |
| `Home` | Select first row |
| `End` | Select last row |
| `Page Up` | Jump up 10 rows |
| `Page Down` | Jump down 10 rows |

### Implementation

#### `useKeyboardShortcuts` hook

```typescript
interface ShortcutConfig {
  key: string;           // e.g., "k", "s", "n", "Escape", "ArrowUp"
  modifiers?: ('meta' | 'ctrl' | 'shift' | 'alt')[];
  action: () => void;
  enabled?: boolean;     // default true; allows conditional shortcuts
  scope?: 'global' | 'page' | 'table';
}

function useKeyboardShortcuts(shortcuts: ShortcutConfig[]): void;
```

- Global shortcuts are registered in the app shell layout (`src/app/layout.tsx`).
- Page-specific shortcuts are registered in each page component using the hook.
- DataTable shortcuts are registered within the `DataTable` shared component itself.

#### Conflict resolution
- Page-specific shortcuts override global shortcuts when the page is active.
- Shortcuts are disabled when an `<input>`, `<textarea>`, or `[contenteditable]` element has focus (except `Escape` and `Cmd/Ctrl+S` which always work).
- The `?` help shortcut is disabled when any input has focus.

#### Shortcut hints
- All buttons and toolbar actions that have associated shortcuts show the shortcut in their `title` attribute (tooltip on hover).
- Format: "Save (⌘S)" on macOS, "Save (Ctrl+S)" on Windows/Linux.
- Detection: use `navigator.platform` or `navigator.userAgentData` to determine OS for display.

#### Help modal
- Triggered by `?` key when no input is focused.
- Displays a categorized list of all active shortcuts for the current page.
- Sections: "Global", "This Page", "Table Navigation".
- Modal uses the standard `Modal` component (ADR-028).

### Protected browser shortcuts (never override)

The following shortcuts must NOT be intercepted:
- `Cmd/Ctrl+R` (reload)
- `Cmd/Ctrl+T` (new tab)
- `Cmd/Ctrl+W` (close tab)
- `Cmd/Ctrl+L` (address bar)
- `Cmd/Ctrl+F` (browser find)
- `Cmd/Ctrl+A` (select all — in inputs)
- `Cmd/Ctrl+C/V/X` (copy/paste/cut)
- `Cmd/Ctrl+Z/Shift+Z` (undo/redo — in inputs)
- `F5` (reload)
- `F12` (dev tools)
- `Alt+Left/Right` (browser back/forward)

## Consequences
- **Positive**: Significantly faster workflow for power users. Discoverable via help modal and tooltips. Progressive enhancement — all actions remain accessible via mouse.
- **Negative**: Learning curve for users unfamiliar with keyboard shortcuts. Risk of accidentally triggering destructive actions (mitigated by confirmation dialogs per ADR-032). Must maintain shortcut registry as new features are added.

## Notes
- Cross-references: ADR-041 (global search — `Cmd+K` trigger), ADR-045 (accessibility — keyboard navigation is also an a11y requirement), ADR-028 (shared components — Modal for help dialog), ADR-032 (confirmation dialogs — Delete shortcut always confirms)
- The `useKeyboardShortcuts` hook should call `event.preventDefault()` only for shortcuts it handles, to avoid swallowing unrelated key events.
- Future consideration: user-customizable shortcuts stored in settings. Not in scope for v1.
