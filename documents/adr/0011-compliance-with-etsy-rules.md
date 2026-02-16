# ADR-011: Compliance with Etsy rules

## Status

Accepted

## Date

2025-02-15

## Context

The application uses the Etsy Open API and supports sellers who list and sell on Etsy. Etsy’s API Terms of Use, Seller Policy (House Rules), listing and image requirements, and vintage/item policies impose obligations on developers and sellers. We must follow these so the app and its users remain in good standing with Etsy and avoid access loss or policy violations.

## Decision

We **follow all applicable Etsy rules** that apply to our use of the API and to the seller workflows we support. Compliance is documented and maintained in **[documents/etsy-compliance.md](../etsy-compliance.md)**.

**Scope**

- **API:** We comply with Etsy’s API Terms of Use (no scraping, OAuth for private data, rate limits, no caching of API responses—we minimize calls and respect rate limits; trademark disclaimer when required, no dormant app).
- **Seller policies:** We do not contradict Etsy’s seller policies; we remind or link to them where helpful (e.g. prohibited items).
- **Listing and images:** We support accurate condition disclosure (condition code, notes, up to 5 condition pictures) and original photos of the actual item, consistent with Etsy’s listing and image requirements.
- **Vintage/antique:** We use condition terms and documentation (notes, condition pictures) that align with Etsy’s vintage policy (accurate description, photos that show condition).
- **Data and privacy:** We use OAuth only; we store only what’s needed; we do not resell or misuse Etsy or buyer data.

**Actions**

- Implement and operate the app in line with the checklist in etsy-compliance.md.
- When Etsy updates terms or policies, review and update etsy-compliance.md and any affected ADRs (e.g. condition codes in ADR-002) so we remain compliant.

## Consequences

- **Positive**
  - Reduces risk of API access loss, account issues, or policy violations.
  - Single place (etsy-compliance.md) to track what we follow and what to do.
- **Negative**
  - We must monitor Etsy policy/API changes and update docs and behavior when needed.

## Notes

- etsy-compliance.md contains the detailed mapping of Etsy rules to our behavior and links to official Etsy policy URLs. This ADR records the decision to comply and maintain that document.
