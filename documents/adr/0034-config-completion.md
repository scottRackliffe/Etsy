# ADR-034: Config completion — all application settings on one page

## Status

Accepted (updated 2026-06-18)

## Date

2026-05-24

## Context

The Config page needs to surface every application setting the user may need to adjust, organized into logical sections. Early versions only had AI settings, Etsy publish defaults, and icon paths. This has been expanded to include all settings documented across ADRs, business profile, shipping, tax, display preferences, backup/restore, and more.

## Decision

**The Config page is a single scrollable page with card sections in a responsive grid (`lg:grid-cols-2` and `lg:grid-cols-3`).** No internal tabs. Each section has a heading, form fields, and a dedicated Save button.

---

### Complete section inventory (22 sections)

| # | Section | Setting keys | Notes |
|---|---------|-------------|-------|
| 1 | **Business profile** | `business_name`, `business_address_line_1..2`, `business_city`, `business_state_province`, `business_postal_code`, `business_country`, `business_phone`, `business_email`, `business_logo_path`, `report_header_logo_path` | Logo upload + preview. Report header image upload. Used in invoices/reports (ADR-013). |
| 2 | **Etsy connection** | Session-based + `last_etsy_sync_at`, `etsy_token_expires_at`, `sync.auto_interval` | Connection status badge, shop info, auto-sync interval selector, Connect/Reconnect/Disconnect buttons. |
| 3 | **Shipping Info (labels)** | `shipping_info_usps`, `shipping_info_ups`, `shipping_info_fedex`, `shipping_info_dhl`, `shipping_info_other` | Delegated to `ShippingInfoSection.tsx`. Per-carrier return address for label generation. |
| 4 | **Shipping defaults** | `shipping.default_carrier`, `shipping.default_origin_zip`, `shipping.default_weight_oz`, `shipping.usps_account`, `shipping.ups_account`, `shipping.fedex_account` | Default carrier dropdown (USPS/UPS/FedEx/DHL/Other), origin zip, weight, carrier account numbers. |
| 5 | **Shipping API (EasyPost)** | `easypost.mode`, `easypost.api_key_encrypted`, `easypost.test_api_key_encrypted`, `easypost.address_validation`, `easypost.label_format`, `easypost.label_size`, `easypost.default_weight_oz`, `easypost.default_length_in`, `easypost.default_width_in`, `easypost.default_height_in`, `easypost.preferred_carrier`, `easypost.preferred_service` | Production/Test mode toggle (radio buttons; `easypost.mode` = `"production"` \| `"test"`, default `"production"`). Yellow "TEST MODE" badge when test mode active. Production API Key (password input, saved as `easypost.api_key_encrypted`). Test API Key (password input, saved as `easypost.test_api_key_encrypted`). Dimensions, label format/size, address validation checkbox, preferred carrier/service. Test connection button (indicates which mode is being tested). |
| 6 | **Tax settings** | `tax.default_rate` | Percentage input (e.g. 8.25 for 8.25%). Per ADR-039. |
| 7 | **Accounting** | `chart_of_accounts`, `gl_transaction_rules` tables | Delegated to `ChartOfAccountsSection.tsx`. COA management + GL rule reference table. |
| 8 | **Item numbering** | `inventory.number_prefix`, `inventory.number_padding` | Prefix + padding digits with live preview and next-number display. |
| 9 | **Order numbering** | `order.number_prefix`, `order.number_padding` | Same pattern as item numbering. |
| 10 | **Store categories** | `inventory.store_categories` | Textarea (one per line). Count display. |
| 11 | **Etsy categories & attributes** | Taxonomy cache tables | Sync button, last sync timestamp, node count. Loads Etsy taxonomy for listing creation. |
| 12 | **Display preferences** | `ui.date_format`, `ui.currency_code`, `ui.page_size`, `ui.timezone`, `first_day_of_week`, `repeat_customer_threshold`, `activity_log.retention_days` | Date format, currency, page size, timezone (all IANA zones), first day of week (Sun/Mon/Sat), repeat customer badge threshold, activity log retention. |
| 13 | **AI settings** | `ai.provider`, `ai.model`, `ai.api_key_encrypted`, `ai.base_url`, `ai.timeout_ms`, `ai.retry_count`, `ai.token_budget` | Model name, API key (password), base URL, timeout/retries/token budget. Save + Test connection buttons. |
| 14 | **Publish defaults** | `etsy.publish.default_taxonomy_id`, `etsy.publish.shipping_profile_id`, `etsy.publish.return_policy_id`, `etsy.publish.default_who_made`, `etsy.publish.default_when_made`, `etsy.publish.image_max_dimension`, `etsy.publish.image_jpeg_quality`, `etsy.publish.image_target_dpi`, `etsy.publish.image_upload_attempts`, `etsy.publish.allow_partial_image_upload`, `etsy.publish.readiness_state_id`, `etsy.publish.image_ids`, `etsy.developer_mode`, `listing.min_quality_score` | Etsy listing defaults. Taxonomy ID, shipping/return policy IDs, who/when made, image settings (dimension, quality, DPI, upload retries, partial upload toggle). Min listing quality score gate. Developer mode checkbox. |
| 15 | **Icons and sizing** | `ui.icons.screen_header_path`, `ui.icons.report_header_path`, `ui.icons.screen_header_size_px`, `ui.icons.report_header_width_px` | Path inputs for bundled icon assets. |
| 16 | **Content & paths** | `pictures_matter_url`, `thumbnail_size`, `tutorial_system_folder_path` | "Why pictures matter" URL, thumbnail max dimension (100–400px), custom tutorial tips folder path. |
| 17 | **Sample Data** | N/A (uses `/api/seed/sample-data`) | Load / Remove sample data buttons with confirmation dialogs. Status display. Per ADR-069. |
| 18 | **API Usage** | `api_usage` table | Monthly call table by service, connected hours, Purge button with confirmation. |
| 19 | **Backup and restore** | `backup_schedule`, `backup_directory`, `backup_time`, `backup_day`, `backup_include_pictures`, `backup_max_count`, `last_backup_at` | Schedule (manual/daily/weekly), directory, time, day (for weekly), include pictures toggle, retention count, backup history table with Restore/Download/Delete. Per ADR-027. |
| 20 | **Database integrity** | `last_integrity_check`, `integrity_warning` | Run integrity check button. Displays last check timestamp and any warnings. Per ADR-058. |

---

### Layout structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Configuration                                                    │
├──────────────────────────────┬──────────────────────────────────┤
│ Business profile (logo/addr) │ Etsy connection (status/sync)    │
├──────────────────────────────┼──────────────────────────────────┤
│ Shipping Info (per-carrier)  │                                  │
├──────────────────────────────┼──────────────────────────────────┤
│ Shipping defaults            │ Shipping API (EasyPost)          │
├──────────────────────────────┼──────────────────────────────────┤
│ Tax settings                 │ Accounting (COA + GL rules)      │
├──────────────────────────────┼──────────────────────────────────┤
│ Item numbering               │ Order numbering                  │
├──────────────────────────────┼──────────────────────────────────┤
│ Store categories             │ Etsy categories & attributes     │
├──────────────────────────────┼──────────────────────────────────┤
│ Display preferences          │                                  │
├──────────────────────┬───────┴───────────┬─────────────────────┤
│ AI settings          │ Publish defaults   │ Icons and sizing    │
├──────────────────────┴───────────────────┴─────────────────────┤
│ Content & paths                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Sample Data                                                     │
├─────────────────────────────────────────────────────────────────┤
│ API Usage                                                       │
├─────────────────────────────────────────────────────────────────┤
│ Backup and restore          │ Database integrity                │
└─────────────────────────────────────────────────────────────────┘
```

On screens < `lg`: single column, cards stack vertically.

---

### Settings persistence

All settings use the `settings` key/value table and `/api/settings/[key]` endpoint. Each section saves as a batch of PUT calls via `saveSettingsKeys()`. Concurrent edit detection uses `If-Match` / `updated_at` headers.

---

### Settings NOT in Config (by design)

| Setting key(s) | Reason |
|----------------|--------|
| `etsy_access_token_encrypted`, `etsy_refresh_token_encrypted`, `etsy_token_expires_at` | Internal — managed by OAuth flow |
| `app.session.current_id` | Internal — managed by auth middleware |
| `etsy.oauth.state`, `etsy.oauth.verifier` | Internal — OAuth PKCE flow only |
| `etsy.active_shop_id` | Set by OAuth connect flow |
| `panel_layout` | Deferred to post-v1 (ADR-009/024) |
| `setup.completed` | Managed by setup wizard (ADR-044), not directly editable |
| `outstanding_sort_*` | Per-page sort state, not a global setting |
| `default_picture_directory` | Deferred; bulk import is post-v1 |

## Consequences

- **Positive**
  - All application settings accessible from one page — no hidden settings requiring API calls.
  - Business profile enables complete invoices and professional reports.
  - Shipping defaults streamline the mark-shipped workflow.
  - Display preferences let users control date/currency formatting.
  - Backup UI implements ADR-027 frontend requirements.
  - Content & paths section exposes tutorial folder and picture settings previously hidden.
  - Database integrity section shows check history, not just the action button.
  - Publish defaults expose all advanced image settings previously only saved but not editable.
- **Negative**
  - Config page is the largest page — card layout keeps it scannable.
  - Business logo upload requires the image serving infrastructure from ADR-033.
