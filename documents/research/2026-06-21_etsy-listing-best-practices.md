# Etsy Listing Best Practices — Research for the Quality Rubric (ADR-082)

**Date:** 2026-06-21
**Purpose:** Evidence base for the per-field and per-photo quality rubric (ADR-082) and the
listing lifecycle (ADR-081). Vintage/antique focus (Trudy's Classic Treasures).
**Authority weighting:** Etsy Seller Handbook / Help Center is **authoritative**; third-party SEO
sources are corroborating/opinion and flagged as such. Where they conflict, **Etsy's official
guidance governs.**

> ⚠️ **Most important finding — titles changed.** In Aug 2025 Etsy published *"New Guidance for
> Listing Titles"* that **reverses** the long-standing "stuff all 140 characters" advice. Etsy now
> says: clearly state the item (noun) first, put the **top ~3 objective descriptors** up front,
> use **fewer than 15 words**, write naturally, **don't repeat words**, and **move subjective and
> gifting/price/shipping words out of the title**. Several SEO blogs still recommend "use all
> 140" — that is **outdated**; follow Etsy. (Sources [E1][E2][T1][T2][T3].)

---

## 1. Titles

**Etsy official guidance ([E2] Seller Handbook, [E1]):**
- Clearly state the item for sale (the **noun**, e.g. "mug", "dress") — once.
- Include the most important traits **upfront**: color, material, size (top ~3 for the category).
- Streamline for clarity/scannability — **consider using fewer than 15 words**.
- Move subjective words ("perfect", "beautiful") to the description.
- Don't repeat words. Only include holiday/occasion/recipient if **essential to what the item
  is** ("birthday candle"). **Remove** price/shipping/sale words (Etsy badges those in search).
- Avoid aspirational/gifting phrases ("gift for him") in the title — put in tags/attributes.

**Corroborating (opinion/data) [T1][T2][T3]:**
- Hard limit **140 chars**, but **~70 chars is the mobile-visible cutoff** (~70%+ traffic is
  mobile; titles truncate). Keep high-intent keywords in the **first ~40–70 characters**.
- Some sources suggest an optimal 100–130 chars (10–15 words) to cover 5–6 phrases while staying
  readable; all agree **noun-first, no stuffing, no repeats**.

**Rubric-ready criteria:** noun/item-type first; top 2–3 objective descriptors in first ~70 chars;
≤15 words; reads naturally (no ALL-CAPS, ≤1–2 commas); no repeated words; no subjective/gifting/
price/shipping terms.

## 2. Descriptions

**Etsy/SEO consensus [D1][D2][D3][D4][E3]:**
- **First ~160 characters are critical** — they are the Etsy search snippet **and** the Google
  meta description. Front-load the **primary keyword + what the item is + a compelling reason**.
  Don't open with "Thanks for visiting my shop!".
- Etsy's algorithm (since 2022) reads description keywords, but **mainly the first few sentences**
  matter for SEO; the rest is for **conversion** (answer questions, build confidence).
- **Length:** ~**250–400 words recommended** (≥150 minimum; >500 rarely read).
- **Structure:** hook (160 chars) → details (materials, **dimensions/measurements**, what's
  included) → era/brand/story (vintage buyers buy nostalgia) → **condition + flaws** → care →
  shipping/processing → light CTA.
- **Scannable:** short paragraphs/bullets (60%+ mobile). Natural keywords; **don't** copy the
  title in or dump all 13 tags at the bottom. No medical/health claims; no trademarked brands.

## 3. Tags

**Etsy/SEO consensus [E3][D2][T5][V2]:**
- Use **all 13** tags; each up to **20 characters**.
- **Multi-word long-tail phrases** ("retro black cat mom apparel"), not single words.
- **Don't repeat** the same words across tags; **don't duplicate** categories/attributes/materials
  (those already act as tags).
- Mix broad + specific; for vintage **include era variants** ("60s", "1960s", "sixties") **plus**
  color, material, style, cut — buyers often search by type/style, not era ([E4]).

## 4. Category & attributes

**Etsy policy [V1][V3]:**
- Select the **correct top category**: **Vintage = at least 20 years old** (2026 ⇒ made ~2006 or
  earlier). Mis-categorizing is a policy violation (suppression/removal).
- Choose the **most specific** taxonomy node.
- Fill **all applicable attributes** (they're "hidden tags"): material from the **official list**
  (don't pick "other" when a real option exists), color, style, occasion. Vintage requires
  age/era info (`when_made`); `who_made` accordingly.

## 5. Condition disclosure (vintage/antique) — high value

**Etsy [E4] + guides [V1][V3][C1]:**
- Use a **standard grade**: Mint/NOS · Excellent · Very Good · Good · Fair · Poor/As-Is. (Maps to
  app's `condition_code`: Mint/Near Mint, Excellent, Very Good, Good, Fair/As-Is.)
- **Disclose every flaw**: stains, tears, repairs, missing parts, odors, fading, scratches, chips,
  cracks. Use **measurable, neutral language** ("0.5 mm chip on rear edge, 12 o'clock"), not
  subjective terms.
- **Photograph all flaws** clearly, with a **scale reference**; show every angle incl. **back,
  bottom, labels/maker's marks**.
- Don't over-clean (can remove patina/value). "Explain it the way you'd explain it to your
  mother" — simple but thorough. Honest condition ⇒ fewer returns, better reviews.

## 6. Pricing & shipping

**Etsy/SEO [E1][D2][PR1]:**
- Price should account for Etsy fees (~**10–11%** transaction+processing) and a real margin.
- **Feb 2026 update: shipping price is a direct ranking factor** — high shipping is penalized;
  competitive/affordable (or free-shipping) helps ranking ([PR1]).
- Set a **realistic processing time** (under-promising then shipping late hurts). Configure a
  shipping profile + accurate package dimensions/weight.
- Don't put price/shipping/sale wording in the title (Etsy badges it).

## 7. Photos — most critical for conversion

**Etsy specs [P1][P2][P3][P4][E5]:**
- **Resolution:** **≥2000 px on the shortest side (required for zoom)**; **3000 px recommended**.
  First image min 635×635. sRGB. JPEG ~90% (PNG compresses worse on Etsy's CDN). DPI irrelevant on
  screen — **pixel count** is what matters.
- **Count:** up to **10 photos + 1 video**; **use all 10** (≥5 strongly recommended). More photos
  ⇒ higher buyer confidence and better ranking.
- **First image / crop safety:** Etsy auto-crops to **1:1, 4:3, and 3:4** by device. Shoot **square
  (2400×2400 or 3000×3000) or 4:3**, **center the subject** with a generous safe-zone margin
  (~10–15%) so nothing critical is cropped in search thumbnails.
- **Quality:** sharp focus; **natural, diffused light** (avoid filters that distort color);
  **clean/neutral background**; consistent orientation across the listing.

**Recommended shot set (maps to ADR-072 taxonomy + ADR-083 shot list):**

| Shot | Purpose / pass spec |
| --- | --- |
| Hero (`hero`) | Whole item, front-on, square/4:3, centered, clean bg, sharp, fills frame within safe zone. |
| Angles (`angle`) ×2+ | Show form/sides not visible in hero. |
| Detail (`detail`) | Close-up of texture/material/key feature, sharp. |
| Backstamp/mark (`backstamp`) | Sharp close-up of maker's mark/label/stamp (authenticity) — if applicable. |
| Condition/flaw (`imperfection`) | Each disclosed flaw shown clearly, with scale — if flaws noted. |
| Scale/in-context (`scale`/`lifestyle`) | Item next to a known object or in a room for size/feel. |
| Measurement (`measurement`) | Dimensions shown (ruler/overlay) — see ADR-084. |
| Underside/back (`underside`) | Bottom/back, especially for vintage. |
| Grouping (`grouping`) | Set/extras included. |
| Video (optional) | Short (~5–15s) rotation/detail; small ranking/confidence boost. |

---

## 8. Proposed scoring rubric (feeds ADR-082)

Weighted 0–100; **pass = 85**, **target = 98**. Suggested category weights:
**Photos 40 · Title 15 · Description 15 · Tags 10 · Category/Attributes 10 · Condition 5 ·
Pricing/Shipping 5.** Per-criterion specs are in ADR-082 §2–§8 (revised 2026-06-21 to match the
findings above — notably the **title** change and **photo resolution = shortest side**).

Highest-impact, most-measurable findings:
1. **Titles: noun-first, ≤15 words, top-3 descriptors up front, no stuffing/subjective/price words**
   (Etsy official; reverses old advice).
2. **Description first 160 chars** = Etsy snippet + Google meta; ~250–400 words; no "thanks for
   visiting" opener.
3. **Tags:** all 13, multi-word, no repeats, no category/attribute duplication; era variants for
   vintage.
4. **Vintage = 20+ years**, correct category + `when_made`; material from official list (not
   "other").
5. **Condition:** standard grade + **measurable** flaw disclosure + flaw photos with scale.
6. **Photos: ≥2000px shortest side (3000 recommended), use all 10, square/4:3 centered for
   auto-crop.**
7. **Shipping price is a 2026 ranking factor** — keep it competitive.
8. Mobile dominates (~70% of traffic) — titles truncate ~70 chars; design for mobile.

---

## 9. Cross-platform & industry guidance (eBay, Chairish, 1stDibs, general e-commerce)

Researched to make the rubric robust beyond Etsy. The **convergent** themes below are strong
signals because independent platforms agree.

**eBay [eB1][eB2][eB3][eB4][eB5]:**
- Title 80 chars, **brand/noun first**, then model/size/color/material/condition; skip filler
  ("amazing", "look"). Keyword match in title is the strongest search signal.
- **Item-specifics completeness is the #2 ranking factor** and gates **filtered search** — fill
  **every** specific (required, recommended, **and optional**): Brand, Condition (granular), Material,
  Country/Region, Style, **Era/Year (vintage)**, Size, Color, Model/pattern.
- **12 photos minimum (up to 24)**, ≥1600px long side, **white/neutral bg on first**, no
  watermarks/text on main; shoot **every angle (front, back, sides, top, bottom, tag, mark)** +
  **every defect** + **scale reference**.
- Descriptions don't feed search but drive conversion/returns: opening line = what it is;
  **bullet** dimensions/materials/era; honest, specific condition; what's included/not included.

**Chairish [CH1] / 1stDibs [DB1] (high-end vintage/antique):**
- **Transparency over buzzwords**; listings ranked/searched by **specificity**.
- Title format ≈ **[Date/Period] + [Maker] + [Style] + [Item type]**, concise (~4–10 words).
- Required structured info: **maker's mark/signature, materials/medium, provenance, place of
  origin, style, maker/brand, condition, age**. Chairish **requires brand info** for post-1990s
  and flags listings incomplete without it. **Always include images of maker's marks/tags.**
- Photos: **natural light, white/neutral bg, ≥2000px** (1stDibs verifies ≥2000px wide; Chairish
  caps at 2000px); shot set: **hero front eye-level**, **45° angle (depth)**, **back**,
  **underside**, **detail of signature/material**, **scale (person/common object)**,
  **condition/flaw**. Photograph item **fully assembled, as displayed in use**.
- Condition must be **measurable**: "Light scratches on left arm consistent with age. No
  structural issues." — never just "good vintage condition".
- 5-part description: **Name/Year/Maker → Dimensions block (H/W/D) → Condition (specific) →
  Provenance → Shipping**.

**General e-commerce / CRO [GE1][GE2][GE3][GE4][GE5]:**
- **Image stack hierarchy:** hero (clean bg, **product fills ~85% of frame**) → detail close-ups
  → lifestyle/in-context → scale → specs/dimensions infographic. **≥5 images per item**; min
  **1000×1000 (2000+ for zoom)**.
- **Video (15–60s functional demo)** measurably lifts add-to-cart (~+18% in one audit).
- Descriptions: **benefit-led, scannable**, ~**150–300 words**, lead paragraph + 3–5 bullets +
  short narrative; technical specs in structured/accordion blocks.
- **Mobile-first**: most failures are insufficient imagery, vague value prop, buried social
  proof; design for small screens.

### Convergent principles → into the rubric (ADR-082)

1. **Attribute/item-specifics completeness is a top-tier ranking + discoverability factor on
   every platform** → weight Category/Attributes seriously and require era/material/maker.
2. **Use all photo slots; multi-angle incl. back + underside + maker's mark; flaw shots with a
   scale reference** → photo coverage criteria.
3. **Measurable, objective condition language** (size/location/type of flaw), never bare
   adjectives → condition criterion.
4. **Maker's mark / signature photo is required for marked vintage/antique** (Chairish/1stDibs
   mandate it) → photo coverage criterion (conditional).
5. **Provenance/story** adds value for vintage → recommended description section.
6. **Hero fills ~85% of frame on clean/neutral bg, ≥2000px, centered for crop** → per-photo spec.
7. **Video** is a consistent conversion lift → recommended (bonus) shot.

## 10. Photography technique & shot-list standard (for ADR-083)

**Lighting & color (antique-aware) [PT3][PT2][V3]:**
- One **large, diffused key light at ~45°** front-side; **reflector / white foam board** opposite
  for fill to control shadow depth.
- **Reflective items** (glass/metal/glaze): use **black cards or a polarizer** to control glare
  and define edges.
- **Antiques:** use **raking light** (light at a shallow angle across the surface) to reveal
  **patina, wood grain, texture, and surface imperfections** — a key trust/quality signal.
- **Color accuracy is critical for vintage:** manual white balance + a **color-calibration card**;
  **natural window light / overcast** gives the most color-accurate result; **no filters** that
  shift color; check the histogram to protect highlights. Keep setup **consistent across all
  items** (same light position, background, editing).

**Standard angle/shot set [PT1][PT3][PT4][P-Etsy]:**
- Front (hero) → **3/4 (45°, shows depth)** → side profile → **back** → **top-down / underside**
  → **detail macro crops** (grain, stitching, hardware, joinery, finish).
- **7–10 photos convert significantly better** than 1–3; use all 10 slots.
- Baseline minimum set: **hero (clean bg) · lifestyle/in-use · detail close-up · scale reference ·
  packaging**; bonus slots: extra angles, **infographic** (sizing/features/care).
- **Vintage-specific shots:** **maker's mark/stamp**, condition/flaw close-ups, **size in
  historical context**, period-appropriate styling, **functional demonstration**, set/collection
  display.

## 11. Video & dimension imagery (for ADR-083 video + ADR-084)

**Etsy listing video (official + practice) [VID-Etsy][VID1][VID2][VID3]:**
- **5–15 seconds**, **< 100 MB**, MP4/MOV (H.264), **audio auto-removed** (no music/voiceover),
  min 500px / **1080p recommended**. Etsy Help states aspect **2:1 or 1:2**; practitioners report
  **1:1 square (or 4:5)** displays best on mobile — design for square/vertical, verify against
  Etsy's current rule at publish.
- **First 2–3 seconds = the "money shot"** (hero/in-use). 4-shot formula: **hero/in-use →
  context → detail (texture) → scale (hold 1–2s)**. ~**10–12s** ideal. **Use/scale videos get
  ~40% more engagement than plain 360° spins** (Etsy 2025 seller survey, via [VID1]). Steady
  tripod, natural light. (Matches app spec: ADR-026 video 5–15s / ≤100MB.)

**Dimension / size imagery (ADR-084) [DI1][DI2][DI3][DI4]:**
- **75% of buyers** say images are very influential; **~22% have returned an item because size
  differed from expectation** — a labeled dimensions image directly reduces returns.
- Overlay style: **dual-arrow measurement lines** for the relevant dimensions; **floating,
  high-contrast labels** that **don't obscure the product**; **dual units (in + cm)** for clarity;
  **large legible fonts** that survive thumbnail size; **safe margins** (no edge clipping);
  **accurate/truthful scaling**; **consistent style across the catalog**; add **alt text**.
- **Keep the primary/hero image clean** — put the annotated dimensions image in a **secondary
  slot** (marketplaces forbid/penalize text on the main image; Etsy is lenient but hero should be
  clean).
- Per-shape logic: **box-like → H × W × D**; **round/cylindrical → diameter × height**;
  **artwork/framed → frame size + image/visible size**.

## Sources

- [E1] Value Added Resource — Etsy listing-title guidance summary: https://www.valueaddedresource.net/etsy-guidance-listing-titles-ai/
- [E2] Etsy Seller Handbook — "New Guidance for Listing Titles, and a Tool to Help": https://www.etsy.com/seller-handbook/article/1399426136697
- [E3] Etsy SEO complete guide (ListingForge): https://www.listing-forge.com/blog/etsy-seo-guide
- [E4] Etsy Seller Handbook — "Secrets to Successful Vintage Selling: Titles, Tags and Shipping": https://www.etsy.com/seller-handbook/article/26823083385
- [E5] Etsy specs (soona): https://soona.co/image-resizer/etsy-image-size-specs
- [T1] How the Etsy Algorithm Works in 2026 (Listybox): https://listybox.com/blog/how-etsy-algorithm-works-2026
- [T2] Etsy title optimization 2026 (ListEZ): https://listez.app/blog/etsy-title-optimization-guide-2026
- [T3] The 70-Character Rule (S27 POD): https://www.s27pod.com/blog/etsy-title-optimization.html
- [T5] Etsy listing SEO step-by-step (Listybox): https://listybox.com/blog/etsy-listing-seo-optimization-step-by-step-guide
- [D1] Etsy description SEO (CraftPilot): https://craftpilot.io/blog/etsy-description-seo
- [D2] Etsy SEO guide (ListingForge): https://www.listing-forge.com/blog/etsy-seo-guide
- [D3] Etsy description template 2026 (ListingForge): https://www.listing-forge.com/blog/etsy-description-template
- [D4] Etsy descriptions that rank 2026 (ImgSEO): https://imgseo.io/blog/how-to-write-etsy-descriptions-that-rank-2026
- [V1] Selling Used & Vintage on Etsy (Insight Agent): https://www.insightagent.app/guides/selling-used-vintage-items-on-etsy
- [V2] Etsy listing requirements checklist (Vetsy): https://vetsy.io/policies/listing-requirements
- [V3] How to Sell Vintage on Etsy (CraftPilot): https://craftpilot.io/blog/etsy-vintage-selling-guide
- [C1] Documenting item condition 2026 (EuroSaleOnline): https://eurosaleonline.com/countries/documenting-item-condition
- [P1] Etsy listing photo size guide 2026 (Designkit): https://www.designkit.com/blog/etsy-listing-photo-size-guide
- [P2] Etsy image size guide 2026 (PixelBatch): https://pixelbatch.io/blog/etsy-image-requirements
- [P3] Etsy specs 2026 (soona): https://soona.co/image-resizer/etsy-image-size-specs
- [P4] Etsy image size requirements 2026 (Insight Agent): https://www.insightagent.app/guides/etsy-image-size-requirements
- [PR1] Etsy algorithm 2026 — shipping as ranking factor (Listybox): https://listybox.com/blog/how-etsy-algorithm-works-2026
- [eB1] eBay selling best practices 2026 (ListingForge): https://www.listing-forge.com/blog/ebay-selling-best-practices
- [eB2] How to write an eBay listing that sells 2026 (ILoveListing): https://ilovelisting.com/blog/how-to-write-ebay-listing-that-sells
- [eB3] eBay SEO guide 2026 (Droopify): https://www.droopify.co/en/blog/ebay-seo-guide-dropshipping
- [eB4] eBay listing optimization checklist 2026 (eCommercePlayer): https://www.ecommerceplayer.com/blog/ebay-listing-optimization-2026
- [eB5] eBay listing optimization 2026 (Underpriced AI): https://underpricedai.com/blog/ebay-listing-optimization-guide
- [CH1] Creating a Listing — Chairish Help Center: https://support.chairish.com/hc/en-us/articles/4407214005271-Creating-a-Listing
- [DB1] How to sell on 1stDibs — seller guide (EntrepreneurBytes): https://entrepreneurbytes.com/blog/1stdibs-for-design
- [GE1] Ecommerce product page optimization 2026 (DigitalApplied): https://www.digitalapplied.com/blog/ecommerce-product-page-optimization-2026-conversion-framework
- [GE2] E-commerce listing optimisation 2026 (Saucery): https://www.saucery.ai/ecommerce-listing-optimisation/
- [GE3] Step-by-step product listing guide 2026 (BigEyedeers): https://www.bigeyedeers.co.uk/step-by-step-product-listing-guide-for-ecommerce-2026/
- [GE4] Product detail pages are the new homepage (OnlineStoreNews): https://onlinestorenews.com/product-detail-pages-are-becoming-the-new-homepage/
- [GE5] Build a product page that converts 2026 (OnlineStoreNews): https://onlinestorenews.com/how-to-build-a-product-page-that-converts-in-2026-a-complete-guide/
- [PT1] Product photography shot list template 2026 (Araluma): https://araluma.com/blog/product-photography-shot-list-template-shopify-social-2026/
- [PT2] Ecommerce product photography guide 2026 (Shootify): https://shootify.us/product-photographer-2026-for-e-commerce-images/
- [PT3] Product photography setup for furniture 2026 (FurnitureConnect): https://www.furnitureconnect.com/en/blog/product-photography-setup
- [PT4] How to build a product photography shot list (ProductAI): https://www.productai.photo/blog/how-to-build-a-product-photography-shot-list-template-examples
- [P-Etsy] Etsy product photography ideas (Insight Agent): https://www.insightagent.app/guides/etsy-product-photography-ideas
- [VID-Etsy] How to add a listing video — Etsy Help: https://help.etsy.com/hc/en-us/articles/360053206073-How-to-Add-a-Listing-Video
- [VID1] Etsy listing video requirements 2026 (Fluxnote): https://fluxnote.io/guides/etsy-listing-video-requirements
- [VID2] Etsy listing video size & requirements (Insight Agent): https://www.insightagent.app/guides/etsy-listing-video-requirements-size
- [VID3] Etsy listing video creation guide 2026 (Insight Agent): https://www.insightagent.app/guides/etsy-listing-video-creation-guide
- [DI1] Representing product sizes in images (Retouching Labs): https://retouchinglabs.com/representing-different-product-sizes-in-product-images/
- [DI2] Why every product page needs a visual dimensions guide (Intuera): https://intuera.eu/2025/08/12/why-every-product-page-needs-a-visual-dimensions-guide/
- [DI3] Amazon listing images guide 2026 (Designkit): https://www.designkit.com/blog/amazon-product-listing-images-guide
- [DI4] Product dimension line generator (IMG101): https://www.img101.com/tools/product-dimension-line-generator/

> Note: third-party SEO blogs vary in reliability and some recommend outdated "use all 140
> characters" titling; this document defers to Etsy's official Seller Handbook guidance [E2][E4]
> where conflicts exist.
