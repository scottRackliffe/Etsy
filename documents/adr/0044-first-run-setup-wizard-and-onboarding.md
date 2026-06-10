# ADR-044: First-run setup wizard and onboarding

## Status

Accepted

## Date

2026-05-24

## Context

When a new user opens the app for the first time, they see an empty dashboard with no guidance on what to do first. There is no indication of which features to configure, how to connect to Etsy, or where to start adding inventory. The system needs a guided first-run experience that walks the user through essential setup steps and gives them clear next actions.

## Decision

### 1. First-run detection

A new setting key determines whether the wizard has been completed:

| Key               | Values                       | Description                                                |
| ----------------- | ---------------------------- | ---------------------------------------------------------- |
| `setup.completed` | `"true"` or absent/`"false"` | Whether the first-run wizard has been completed or skipped |

**Detection logic (on app load):**

1. Query `settings` table for `setup.completed`
2. If the key is absent or value is `"false"` → show the setup wizard
3. If value is `"true"` → skip the wizard, load the dashboard normally

This check happens in the root layout or dashboard page load. The wizard is shown as a modal overlay on top of the dashboard (not a separate route).

### 2. Wizard UI structure

The wizard is a full-screen modal with 4 sequential steps, displayed as a centered card.

**Modal specification:**

- Full-screen backdrop (dark overlay, `var(--ui-background)` at 90% opacity)
- Centered card: width `max-w-lg` (512px), background `var(--ui-card-bg)`, rounded corners, `var(--ui-border)` border
- Progress indicator: 4 dots at the top of the card, filled dot for current/completed steps, outline for remaining
- Navigation: "Back" (secondary button) and "Next" / "Get Started" (primary accent button)
- "Skip for now" link: bottom of the card on every step (small text, `var(--ui-muted)` color)
- No close button or backdrop click to dismiss (user must explicitly skip or complete)
- ARIA: `role="dialog"`, `aria-modal="true"`, `aria-label="Setup wizard"`

### 3. Wizard steps

#### Step 1: Welcome

**Content:**

- Heading: "Welcome to Etsy Sales Manager"
- Subheading: "Your personal tool for managing inventory, orders, customers, and Etsy listings for your vintage and antique business."
- Body text: "Let's get you set up in just a few steps. This will take about 2 minutes."
- Decorative element: App logo or a simple illustration (optional, accent-colored icon of a shop)
- Button: "Let's Go →" (primary accent)
- No "Back" button on this step

#### Step 2: Business Profile

**Content:**

- Heading: "Your Business"
- Subheading: "Tell us about your shop. You can change these anytime in Config."
- Form fields (all optional — user can leave blank and fill in later):
  - Business Name: text input, placeholder "e.g., Trudy's Classic Treasures"
  - Business Address: text inputs for address line 1, city, state, postal code, country
- **Pre-fill behavior:** If any of these settings already exist in the `settings` table (e.g., `business_name`, `business_address_line_1`, etc. from ADR-034 §1), pre-fill the form fields
- On "Next": save any non-empty fields via `PUT /api/settings/[key]` for each key
- Validation: None required (all fields optional)

#### Step 3: Connect Etsy

**Content:**

- Heading: "Connect Your Etsy Shop"
- Subheading: "Link your Etsy account to sync orders, customers, and listings automatically."
- Connection states:
  - **Not connected (default):** Large "Connect to Etsy" button (accent color) → initiates OAuth flow (ADR-007)
  - **Connecting:** Button shows spinner + "Connecting..." (during OAuth redirect)
  - **Connected:** Green success badge with shop name: "✓ Connected to [Shop Name]" — "Next" button enabled
  - **Error:** Red error text: "Could not connect to Etsy. Please try again." with retry button
- "Skip for now" link: prominently visible; skipping is a valid choice (user can connect later from Config)
- OAuth flow: Opens Etsy OAuth in the same window (standard flow from ADR-007). On return, the wizard detects the token and shows the connected state.

#### Step 4: Get Started

**Content:**

- Heading: "You're All Set!"
- Subheading: "Here's what you can do next:"
- Three action cards (horizontally arranged, each clickable):
  1. **"Add Your First Item"**
     - Icon: inventory/box icon
     - Description: "Start building your inventory"
     - Click action: close wizard → navigate to `/inventory`

  2. **"Sync Etsy Orders"**
     - Icon: sync/refresh icon
     - Description: "Import your recent Etsy sales"
     - Click action: close wizard → navigate to `/sales` and trigger sync
     - Only shown if Etsy is connected (Step 3 completed); otherwise replaced with:
     - **"Explore Sales"**: "Manually add your first order" → navigate to `/sales`

  3. **"Explore Tutorials"**
     - Icon: book/lightbulb icon
     - Description: "Learn tips and best practices"
     - Click action: close wizard → navigate to `/tutorial`

  4. **"Load sample data"** (ADR-069)
     - Icon: sparkles / demo icon
     - Description: "Explore the app with demo inventory and orders"
     - Click action: `POST /api/seed/sample-data` (ConfirmDialog per ADR-032), then close wizard → `/dashboard`
     - On 409 (already loaded): toast with link to Config to remove sample data first

- Button: "Go to Dashboard" (primary accent) — closes wizard, stays on dashboard
- No "Back" button on this step (it's the final step; going back would be confusing)

### 4. Wizard completion

On completing or skipping the wizard:

1. Set `setup.completed` to `"true"` via `PUT /api/settings/setup.completed` with body `{ "value": "true" }` (per ADR-018 §8)
2. Dismiss the wizard modal
3. Navigate to the selected destination (or stay on dashboard)
4. The wizard will never appear again (unless `setup.completed` is manually cleared)

**"Skip for now" behavior on any step:**

- Immediately sets `setup.completed` to `"true"` via `PUT /api/settings/setup.completed`
- Dismisses the wizard
- Navigates to the dashboard
- No data from partially-completed steps is saved (except Step 2, which saves on "Next")

### 5. API integration

**Settings used:**

| Setting key               | Written by step  | Description                        |
| ------------------------- | ---------------- | ---------------------------------- |
| `setup.completed`         | Step 4 (or skip) | Wizard completion flag             |
| `business_name`           | Step 2           | Business name                      |
| `business_address_line_1` | Step 2           | Address line 1 (ADR-017 / ADR-034) |
| `business_city`           | Step 2           | City                               |
| `business_state_province` | Step 2           | State                              |
| `business_postal_code`    | Step 2           | Postal code                        |
| `business_country`        | Step 2           | Country                            |

All writes use `PUT /api/settings/[key]` with `{ value }` per key (ADR-018 §8), batched via Config helper pattern (ADR-034).

The Etsy connection in Step 3 uses `GET /api/auth/etsy` and `GET /api/auth/etsy/callback` (ADR-007, ADR-018 §1).

### 6. Post-wizard contextual guidance

After the wizard, empty-state messages on each tab provide contextual next-action guidance:

| Tab       | Empty state message                                                                                     | CTA button                       |
| --------- | ------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Sales     | "No orders yet. Sync from Etsy or create your first manual order."                                      | "Sync Etsy Orders" / "New Order" |
| Inventory | "No items yet. Add your first inventory item to get started."                                           | "Add Item"                       |
| Customers | "No customers yet. Customers are created automatically when you sync Etsy orders or add manual orders." | "Sync Etsy Orders" / "New Order" |
| Reports   | "No reports generated yet. Once you have orders, you can generate sales, tax, and profit reports here." | — (no CTA, informational only)   |

These empty states use the `EmptyState` component (ADR-028) with the messages above. They are always present regardless of whether the wizard was completed or skipped.

### 7. Accessibility

- Wizard modal has focus trap (per ADR-045)
- Progress dots have `aria-label="Step N of 4: [step name]"` and `aria-current="step"` for current step
- All form inputs in Step 2 have associated `<label>` elements
- Action cards in Step 4 are focusable and activatable via Enter key
- "Skip for now" link is keyboard-accessible
- Wizard content is readable by screen readers in logical order

## Consequences

- **Positive:** New users get a guided experience that reduces confusion and time-to-first-value; the wizard is lightweight (4 steps, ~2 minutes); skippable for experienced users; post-wizard empty states continue to guide users after setup; no new database tables required (uses existing `settings`).
- **Negative:** The wizard is modal and blocking (user cannot explore the app without completing or skipping it); the wizard is simple and may not cover all configuration needs (e.g., tax rate, default shipper) — but these are available in Config; the OAuth flow within a modal can be awkward if the redirect doesn't return cleanly.

## Notes

- Cross-references: ADR-034 (Config — business profile settings, same keys used in Step 2), ADR-007 (OAuth flow — used in Step 3), ADR-016 (dashboard — wizard overlays the dashboard), ADR-028 (EmptyState component — post-wizard empty states on tabs), ADR-045 (accessibility — focus trap and ARIA in wizard modal)
- The setting key `setup.completed` uses dot-notation consistent with existing settings keys
- Future consideration: a "reset wizard" option in Config could set `setup.completed = "false"` for demonstration/testing purposes, but this is not in scope for v1
- Optional sample data: Step 4 card triggers ADR-069; wizard does not auto-load demo data without user action
