# Tutorial: How Etsy works, how AiCE helps, and tips to improve sales

This tutorial explains **how Etsy works**, **how the AiCE application helps you**, and **practical tips to improve sales**—including how to set prices. It is part of the app’s **Tutorial and tips** tab (tutorial and tips merged): use **Search** to find topics, the **Index** to browse, and **links to files in the tips folder** to open your own PDFs and docs outside the program. See [knowledge-base-design.md](knowledge-base-design.md) for the full design.

---

## Part 1: How Etsy works

### The marketplace

- **Etsy** is a marketplace where buyers search for and buy handmade, vintage, and craft supply items (and related categories). Sellers list items in their **shop**; buyers browse, purchase, and pay through Etsy (or approved payment methods).
- Your **shop** has a name, policies (returns, shipping, etc.), and **listings**. Each **listing** is one product (or a variation, e.g. size/color) with a title, description, photos, price, and shipping options.
- When a buyer purchases, Etsy creates an **order** (receipt). You see it in Etsy Seller Manager (and in this app once connected). You’re responsible for shipping, customer service, and following your own shop policies and Etsy’s rules.

### Listings and search

- Listings are **searchable** by title, tags, and category. Etsy’s search ranks listings using relevance, recency, and other factors. Good **titles**, **tags**, and **categories** help buyers find you.
- **Photos** must be of the actual item; they heavily influence both search and buyer decisions. The **first photo** is the main image buyers see in search results.
- **Vintage** on Etsy means at least **20 years old**; **antiques** are often considered 100+ years. Condition must be disclosed clearly (see [pictures-and-sales.md](pictures-and-sales.md) and our condition section).

### Orders and money

- When an order is placed, you get a **sale notification**. You can view orders in Etsy Seller Manager (Orders) or—after connecting—in **this app** (Orders tab).
- Etsy charges **listing fees** (per listing), **transaction fees** (percentage of sale + payment processing), and optional **ad fees** (e.g. Offsite Ads). Your **net** is sale price minus Etsy fees, your costs (item, shipping, packaging), and any other costs. This app helps you track **purchase cost**, **sale revenue**, **shipping cost**, and **other costs** so you can see real profit.

### Shop policies

- Sellers set **shop policies** in Etsy (returns, cancellations, privacy, etc.). Buyers see these before or after purchase. Clear policies build trust and reduce disputes. This app doesn’t replace Etsy policies; it helps you manage **orders**, **inventory**, and **customers** around them.

---

## Part 2: How this application helps

### Connection to Etsy

- The app uses **Etsy’s official API** (OAuth). You **connect your Etsy account** once; the app can then read your **shops** and **orders (receipts)** so you don’t have to switch back and forth to Etsy for every sale.
- You stay in control: you can **disconnect** anytime. We follow [Etsy’s rules](etsy-compliance.md) so your account stays in good standing.

### What the app does

| Area               | How it helps                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**      | Quick view of activity and outstanding items (e.g. orders to ship).                                                                                                                                                                                                                                                                                              |
| **Orders**         | See Etsy orders in one place; mark paid/shipped; print labels, thank-you notes, invoices; link orders to your inventory and customers.                                                                                                                                                                                                                           |
| **Inventory**      | Track each item: description, costs, dates, photos, condition. **Start small** — add the basics and a hero photo — then let AiCE **Generate Listing** (it researches comparable items, suggests a price, and writes the **title, description, and tags**) and **Evaluate Listing Quality**. Keep working each listing up toward a **world-class** score so it earns the search traffic to sell quickly and at the right price, then **Publish to Etsy** once it passes (score ≥ 85). |
| **Customers**      | Store buyer names and addresses; link purchases to customers; use data for thank-you notes and invoices.                                                                                                                                                                                                                                                         |
| **Reports**        | Thank-you note, invoice, sales list, costs (including postal/shipping spend by carrier — USPS, UPS, FedEx, DHL), profit by item, sales tax, inventory aging, and an accounting export — so you know where your money goes. (Income at-a-glance lives on the Dashboard.)                                                                                          |
| **Settings**       | Connect/disconnect Etsy, set default shipper, business details for invoices; optional link to your own “why pictures matter” or other guides.                                                                                                                                                                                                                    |

### Tutorial and guides in the app

- The app exposes **Tutorial and tips** (one tab) that includes this document and [pictures-and-sales.md](pictures-and-sales.md). In Settings you can add a path or URL to **your own** guides (e.g. Etsy Seller Handbook PDFs, pricing notes) so everything is in one place.

---

## Part 3: Tips to improve sales

### Photos

- Use **original photos** of the actual item. First image = main search image (your hero); make it clear and well lit. Include **multiple angles** and **detail shots** (up to 20 in the app; Etsy allows up to 20 images per listing). AiCE can suggest a **shot list** of exactly which photos a world-class listing needs.
- For **vintage/antique**, document **condition** honestly: use the condition grade (Mint/Near Mint through Fair/As-Is), **condition notes** (e.g. patina, crazing, foxing), and **condition pictures** (up to 5) so buyers know exactly what they’re getting. See [pictures-and-sales.md](pictures-and-sales.md).

### Titles and keywords

- **Titles** and **tags** feed Etsy search. Use terms buyers actually search for. Include material, era, style, color, size where relevant. Avoid stuffing; keep it readable.
- Let AiCE **Generate Listing** to draft your title, description, and tags from your photos and item details (it researches comparable listings and prices). Review and refine the draft, then run **Evaluate Listing Quality** and keep working it up toward a world-class score before you publish — a stronger listing earns more search traffic, which sells the item faster and for a better price.

### Improving a listing with the remediation cycle

Once AiCE has generated a listing for an item, run **Evaluate Listing Quality** to score it on a 0–100 scale. The score is checked against an **85-point gate**: below 85 the listing is flagged for improvement; at 85 or above, **Publish to Etsy** becomes active.

The quality score breaks down into a list of specific things to fix. Some the AI can handle automatically; some only you can supply.

**What the AI needs before it can start.** Before **Generate Listing** is available, the item must have:
- An item number
- A description
- A condition
- At least one photo

Everything else (price, category, shipping) is either written as a recommendation by Generate Listing, or flagged by the quality score for you to complete afterward.

**Running the cycle.** After you see the quality score, two cycle buttons appear:
- **Start cycle** (or **Cycle again** after the first pass) — runs one improvement pass. The AI rewrites only the flagged listing text (title, description, and tags) using the scoring engine's own guidance, then re-scores and shows you the **point change** so you can see whether progress is real.
- **Advance AI** — brings in a more capable AI model for a tougher pass. Use this if the standard cycle has stalled or you want to push the score higher. You can reach for it at any point.

You are in control: **you must approve every pass** by tapping one of those buttons. There is no automatic loop, and you can stop anytime by simply moving on.

**Per-row Fix and global refine.** Each AI-fixable item in the score breakdown has its own **Fix** button so you can target just that one field. The **global refine box** below the score lets you type freeform feedback — for example, "Emphasize the hand-painted details" — and the AI incorporates it on the next pass.

**Items only you can supply.** The quality score will also flag things the AI cannot fix on its own: required photos, the Etsy category, the shipping profile, and item attributes. For photos, tap **Download PDF** to get a printable shot list that tells you exactly which photos to shoot and what each one must show. Once you have added those photos and filled in the structured fields, run **Evaluate Listing Quality** again — those items will clear from the list.

### Descriptions

- Describe the item clearly: dimensions, materials, condition, and any flaws. For vintage/antique, accurate descriptions reduce returns and build trust. Our **condition notes** and **condition pictures** help you keep a consistent record you can copy or summarize into Etsy.

### Policies and trust

- Set **clear shop policies** on Etsy (returns, shipping times, communication). Respond to messages promptly. Ship on time and use **tracking** when possible. This app helps you **mark shipped**, choose **shipper** (USPS, UPS, FedEx, DHL), and track **postal/shipping spend by carrier** (in the Costs report) so you can balance cost and service.

### Pricing (see Part 4)

- Price fairly for your market and your costs. Use this app to track **purchase cost**, **shipping cost**, **other costs**, and **sale revenue** so you know your **profit** and can adjust prices or costs.

---

## Part 4: How to set prices

### Know your costs

- **Item cost:** What you paid (purchase cost). Track it in **Inventory** in this app.
- **Shipping cost:** What you pay the carrier (USPS, UPS, FedEx, DHL). Track it per order (and by vendor in **Reports**). You can charge the buyer a shipping price or fold it into the item price; either way, know your **actual** shipping cost.
- **Other costs:** Repairs, cleaning, materials, fees. Use the **other costs** (amount + description) in Inventory so nothing is missed.
- **Etsy fees:** Listing fee per listing; transaction fee (percentage of sale + payment processing); optional ad fees. Check Etsy’s current fee page: [Etsy Fees and Taxes](https://www.etsy.com/help/article/136) (last verified 2026-02-16). Your **sale revenue** in this app is what you receive; Etsy has already taken its cut from the buyer’s payment.

### Cost-based pricing (floor)

- **Minimum price** should cover: item cost + your shipping cost + other costs + Etsy fees (if not already deducted) + a margin you’re happy with. Use **Reports** (costs, income) in this app to see if you’re above or below that floor over time.

### Market-based pricing

- See what **similar items** sell for on Etsy: search similar items, filter for comparable condition/era/category, and review sold listings to calibrate actual market pricing. Price in line with the market unless you have a reason to be higher (rarity, condition, presentation) or lower (clearance, minor flaws).
- For **vintage/antique**, condition (Mint/Near Mint vs Fair/As-Is) and documentation (photos, notes) justify price differences. Our condition section helps you document so you can price accordingly.

### Psychology and presentation

- **Round numbers** ($25, $50) or **charm prices** ($24.99) are common; choose what fits your shop. **Free shipping** (with price folded into the item) can increase conversion; track your real shipping cost so you don’t underprice.
- **Clear photos and descriptions** support higher prices because buyers feel confident. Use the app’s picture and condition workflow so every listing is consistent and trustworthy.

### Adjust over time

- Use **Income (month-to-date, year-to-date)** and **Costs** reports in this app to see if you’re profitable. If margins are thin, consider raising prices, reducing costs, or improving presentation (photos, descriptions) so you can justify the price.

---

## Quick reference

| Topic                              | Where in the app                            | Where in this doc                                      |
| ---------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Connect Etsy                       | Settings; Dashboard                         | Part 2                                                 |
| View orders                        | Orders                                      | Part 2                                                 |
| Track inventory & costs            | Inventory                                   | Part 2, Part 4                                         |
| Add pictures (directory → preview) | Inventory (main + condition)                | Part 2; [pictures-and-sales.md](pictures-and-sales.md) |
| Condition (grade, notes, pics)     | Inventory → Condition                       | Part 3; Part 4                                         |
| Generate a listing                 | Inventory (detail panel)                    | Part 3                                                 |
| Evaluate quality / remediation     | Inventory (detail panel)                    | Part 3                                                 |
| Customers                          | Customers                                   | Part 2                                                 |
| Income & costs reports             | Reports                                     | Part 2, Part 4                                         |
| Postal/shipping spend by carrier   | Costs report                                | Part 2                                                 |
| Set prices                         | — (use Etsy + this app’s cost/revenue data) | Part 4                                                 |

---

## Part 5: How to operate this system (practical)

### Daily workflow (current UI)

1. Open dashboard and confirm connection status.
2. If not connected, click **Connect Etsy** and complete OAuth.
3. Select the shop you want to work on.
4. Review recent orders:
   - prioritize unpaid/unshipped items,
   - check totals and ship-to details.
5. Resolve any error banner actions before continuing.

### Listing workflow (API-ready, UI integration ongoing)

For each inventory item before listing request:

1. Ensure required fields exist:
   - item number
   - description
   - condition code
   - sale revenue (>0)
   - at least one picture
2. Run listing readiness check.
3. Only when ready, request listing content generation.
4. Review generated title/description/tags before publish/list actions.

### If something fails

- Read the error title and message.
- Follow each action listed by the system in order.
- Retry once after completing actions.
- If still failing, capture details (time, shop/item/order id, exact message) and escalate.

---

_For installation and setup, see [installation.md](installation.md). For day-to-day operations, see [operating-the-system.md](operating-the-system.md). For Etsy rules we follow, see [etsy-compliance.md](etsy-compliance.md)._
