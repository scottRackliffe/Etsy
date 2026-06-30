# Operating the System — AiCE

This is the practical operations manual for running AiCE day to day.

Use this as your primary "how to use it" reference.

---

## 1) What is available now

### Fully available in UI

- Connect Etsy account (OAuth)
- Disconnect Etsy account
- Select Etsy shop
- View recent receipts/orders
- See paid/shipped status
- Receive actionable error messages with next steps

### Available through API (UI integration in progress)

- Inventory listing readiness check:
  - `GET /api/inventory/[id]/listing-readiness`
- AI listing generation for an item:
  - `POST /api/inventory/[id]/generate-listing-content`

### Planned (documented, phased UI delivery)

- Full Inventory CRUD workflow
- Full Customers workflow
- Orders/purchases editing and ship workflow
- Reports workflow (PDF/CSV)
- Shipping label workflow
- Outstanding/to-do workflow

This guide includes current operations and "ready-to-use when enabled" procedures.

---

## 2) Daily startup checklist

1. Open the app at your configured URL (local: `http://localhost:3000`).
2. Confirm connection badge in header:
   - **Connected** -> continue
   - **Not connected** -> click **Connect Etsy**
3. Select the correct shop from the shop dropdown.
4. Verify recent orders table loads.
5. Scan statuses:
   - unpaid orders
   - unshipped orders
   - any API/auth warning banners

---

## 3) Connect Etsy (first-time or re-connect)

1. Click **Connect Etsy**.
2. Sign in to Etsy and approve access.
3. You will be redirected back to dashboard.
4. Confirm:
   - shop selector is visible
   - receipts table loads

If sign-in fails:

- Read the banner title and action list.
- Follow suggested actions exactly (for example reconnect, verify redirect URI).

---

## 4) Disconnect Etsy

1. Click **Disconnect** in the header.
2. Confirm UI returns to not-connected state.
3. Reconnect if needed later.

Use disconnect when:

- changing Etsy accounts
- troubleshooting stale auth
- rotating credentials

---

## 5) Shop selection and order viewing

1. Use shop selector to choose the shop you want to operate on.
2. Wait for loading state to finish.
3. Use table columns for quick triage:
   - **Date**: recency
   - **Order #**: reference id
   - **Ship to**: fulfillment destination
   - **Total**: order value (with shipping breakdown if shown)
   - **Paid** and **Shipped**: immediate action flags

Operational recommendation:

- Work newest-to-oldest unless you have aging/risk exceptions.
- Prioritize paid + not shipped first.

---

## 6) Error handling workflow (operator standard)

The system uses a consistent error model:

- what happened
- why it matters
- what to do next (actions)

When any error appears:

1. Read the **title** first.
2. Read the **user message** (problem summary).
3. Execute actions in order.
4. Retry once after completing actions.
5. If still failing, capture:
   - timestamp
   - screen/action you attempted
   - exact banner message
   - order/shop context

### Common errors and operator actions

- **Not connected / unauthorized**
  - Connect Etsy and retry.
- **Shop/receipts load failed**
  - Refresh page -> retry.
  - If repeated: disconnect and reconnect.
- **OAuth callback/verification error**
  - Retry Connect Etsy.
  - Verify app redirect URI configuration matches exactly.
- **Listing generation blocked (validation)**
  - Fill missing fields (item number, description, condition, price, pictures).
  - Retry when readiness is true.

---

## 7) Listing generation operating procedure

Use this flow for each item before requesting listing content.

### Step A — Item readiness (hard gate)

Required data must exist on the item:

- `item_number`
- `description`
- `condition_code`
- `sale_revenue` (> 0)
- at least one picture (main or condition)

If missing, do not proceed.

### Step B — Pictures quality check

Before generation:

- Ensure first picture is best hero image.
- Ensure condition photos show defects clearly.
- Ensure images represent actual item accurately.

Reference best practices:

- `system/tips/Etsy_Photo_Guide.md`
- `documents/pictures-and-sales.md`

### Step C — Run readiness endpoint (API-integrated flow)

Call:

- `GET /api/inventory/[id]/listing-readiness`

Proceed only when:

- `ready: true`

If `ready: false`, complete missing fields listed in `missing_fields`.

### Step D — Generate listing content

Call:

- `POST /api/inventory/[id]/generate-listing-content`

System behavior:

- sends all item pictures (main + condition)
- sends item context (description, condition, tags, price context)
- applies listing guidance documents
- writes response back to inventory listing fields

### Step E — Review generated content

Verify:

- title is clear and searchable
- description is accurate and non-misleading
- tags are relevant, non-duplicate, and buyer-intent focused
- category path is sensible (if returned)

Adjust manually if needed before publishing/listing workflow.

---

## 8) Quality standards for listings (operator checklist)

Before publishing any listing content:

- [ ] Photos are original and accurate.
- [ ] Condition is honestly disclosed.
- [ ] Title is readable and front-loaded with key terms.
- [ ] Description includes material, era, condition, and notable flaws.
- [ ] Price reflects costs and market comparables.
- [ ] Tags are relevant (max 13; no duplicates).
- [ ] No policy-risk wording or misleading claims.

Guidance sources:

- `documents/etsy-listing-template-and-requirements.md`
- `system/tips/How_to_Win_on_Etsy.md`
- `documents/etsy-compliance.md`

---

## 9) Recommended operator cadence

### Daily

- Connect/check auth
- Select shop
- Review new receipts
- Resolve obvious exception items

### Weekly

- Validate listing quality on newly added inventory
- Re-check pricing assumptions against recent sales
- Review any repeated error patterns

### Monthly

- Confirm Etsy policy links/assumptions are still current
- Audit incomplete item records blocking listing generation

---

## 10) Recovery and escalation

If operations are blocked:

1. Try reconnect flow.
2. Retry operation with one known-good shop/item.
3. Check setup/env (`documents/installation.md`, `documents/setup/ENV_MATRIX.md`).
4. For pre-AiCE / EBC recovery context (historical only), see [`archive/interim/Recovery_Instructions.md`](../archive/interim/Recovery_Instructions.md).

Escalate with:

- exact operation attempted
- item id / order id / shop id
- user-visible message + actions shown
- whether retry after action resolved it

---

## 11) Document update rule

When UI changes:

- update this guide first (operator view),
- then update tutorial/help references,
- then update searchable topic catalog.

This keeps user-facing operations guidance aligned with real UI behavior.
