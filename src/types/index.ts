export type Shop = { shop_id: number; shop_name: string };

export type InventoryItem = {
  id: number;
  item_number: string | null;
  description: string | null;
  purchase_cost: number | null;
  shipping_cost: number | null;
  sale_revenue: number | null;
  date_purchased: string | null;
  date_listed: string | null;
  date_of_sale: string | null;
  shipping_date: string | null;
  picture_1: string | null;
  picture_2: string | null;
  picture_3: string | null;
  picture_4: string | null;
  picture_5: string | null;
  picture_6: string | null;
  picture_7: string | null;
  picture_8: string | null;
  picture_9: string | null;
  picture_10: string | null;
  picture_11: string | null;
  picture_12: string | null;
  picture_13: string | null;
  picture_14: string | null;
  picture_15: string | null;
  picture_16: string | null;
  picture_17: string | null;
  picture_18: string | null;
  picture_19: string | null;
  picture_20: string | null;
  video_path: string | null;
  thumbnail_path: string | null;
  condition_code: string | null;
  has_condition_issue: number | null;
  condition_notes: string | null;
  condition_picture_1: string | null;
  condition_picture_2: string | null;
  condition_picture_3: string | null;
  condition_picture_4: string | null;
  condition_picture_5: string | null;
  status: string | null;
  etsy_listing_id: string | null;
  etsy_when_made: string | null;
  etsy_taxonomy_id: number | null;
  etsy_who_made: string | null;
  etsy_shipping_profile_id: number | null;
  etsy_return_policy_id: number | null;
  quantity: number | null;
  category_tags: string | null;
  store_category: string | null;
  materials: string | null;
  item_weight: number | null;
  item_weight_unit: string | null;
  item_length: number | null;
  item_width: number | null;
  item_height: number | null;
  item_dimensions_unit: string | null;
  is_supply: number | null;
  picture_classifications: string | null;
  listing_title: string | null;
  listing_description: string | null;
  listing_tags: string | null;
  listing_category_path: string | null;
  listing_title_strategy: string | null;
  listing_product_story: string | null;
  listing_condition_clarity: string | null;
  listing_attributes: string | null;
  etsy_attributes_json: string | null;
  listing_pricing_shipping_notes: string | null;
  listing_quality_checklist: string | null;
  listing_draft_state: string | null;
  listing_draft_source: string | null;
  listing_export_id: string | null;
  listing_approved_at: string | null;
  listing_published_at: string | null;
  is_listed: number | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type Receipt = {
  receipt_id: number;
  order_id: number;
  name: string;
  first_line: string;
  second_line: string | null;
  city: string;
  state: string | null;
  zip: string;
  country_iso: string;
  total_price: string;
  total_shipping_cost: string;
  currency_code: string;
  was_paid: boolean;
  was_shipped: boolean;
  creation_tsz: number;
  message_from_buyer: string | null;
};

export type Customer = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address_1: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  default_address_id: number | null;
  currency_code: string | null;
  is_active: number | null;
  notes: string | null;
  order_count?: number;
  created_at: string;
  updated_at: string;
};

export type CustomerAddress = {
  id: number;
  customer_id: number;
  label: string | null;
  first_line: string | null;
  second_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: number;
  order_number: string | null;
  customer_id: number | null;
  order_date: string | null;
  order_status: string | null;
  payment_status: string | null;
  was_paid: number | null;
  shipper: string | null;
  seller_shipping_cost: number | null;
  tracking_number: string | null;
  shipped_without_paid_override: number | null;
  etsy_receipt_id: string | null;
  shipping_date: string | null;
  ship_to_first_name: string | null;
  ship_to_last_name: string | null;
  ship_to_address_line_1: string | null;
  ship_to_address_line_2: string | null;
  ship_to_city: string | null;
  ship_to_state_province: string | null;
  ship_to_country: string | null;
  ship_to_postal_code: string | null;
  subtotal: number | null;
  shipping_total: number | null;
  tax_total: number | null;
  discount_total: number | null;
  discount_reason: string | null;
  grand_total: number | null;
  source_channel: string | null;
  easypost_shipment_id: string | null;
  label_url: string | null;
  label_format: string | null;
  shipping_rate_cents: number | null;
  shipping_carrier_service: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
};

export type OrderItem = {
  id: number;
  order_id: number;
  inventory_id: number;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  created_at: string;
  updated_at: string;
};

export type Purchase = {
  id: number;
  inventory_id: number;
  vendor_name: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  shipping_price: number | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type UiErrorVariant = "error" | "success" | "info";

export type UiError = {
  title: string;
  message: string;
  actions: string[];
  /** ISO 8601 — when the error was recorded (shown on error cards). */
  occurredAt?: string;
  /** Visual style: error (red), success (green), info (blue). Auto-detected from title if omitted. */
  variant?: UiErrorVariant;
};

export type ApiErrorShape = {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
    user_message?: string;
    actions?: string[];
    can_retry?: boolean;
  };
  fields?: Record<string, string[]>;
};

export type ListingReadiness = {
  ready: boolean;
  missing_fields?: Record<string, string[]>;
  picture_count?: number;
};

export type ListingMode = "manual" | "integrated_ai" | "portable_import";

export type AiConfig = {
  provider: string;
  model: string;
  baseUrl?: string | null;
  timeoutMs: number;
  retryCount: number;
  tokenBudget: number;
  apiKeyConfigured: boolean;
};

export type PublishPreview = {
  can_publish: boolean;
  warnings: string[];
  preview_hash: string;
  preview_generated_at: string;
  staged_flow: string[];
  payload_preview: unknown;
};

export type AppTab =
  | "dashboard"
  | "sales"
  | "inventory"
  | "customers"
  | "reports"
  | "outstanding"
  | "tutorial"
  | "config";

export type OutstandingItem = {
  type:
    | "paid_not_shipped"
    | "not_paid"
    | "etsy_not_synced"
    | "not_listed"
    | "incomplete_address"
    | "missing_shipping_cost"
    | "validation_issue"
    | "missing_etsy_fields";
  id: string;
  summary: string;
  targetTab: AppTab;
  targetRecordId: number | string;
  date: string;
};

export type PaginationInfo = {
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
};

export type BusinessExpense = {
  id: number;
  expense_date: string;
  date_paid: string | null;
  amount: number;
  currency_code: string;
  payment_method: string | null;
  vendor_id: number | null;
  vendor_name: string | null;
  category: string;
  subcategory: string | null;
  tax_deductible: number;
  tax_category: string | null;
  business_use_pct: number;
  is_cogs: number;
  is_asset: number;
  depreciation_years: number | null;
  inventory_id: number | null;
  invoice_number: string | null;
  receipt_attached: number;
  receipt_path: string | null;
  paid_by: string | null;
  is_recurring: number;
  recurring_frequency: string | null;
  recurring_next_date: string | null;
  contract_end_date: string | null;
  gl_account: string | null;
  fiscal_quarter: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Vendor = {
  id: number;
  name: string;
  address_1: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  account_number: string | null;
  payment_terms: string | null;
  tax_id: string | null;
  is_preferred: number;
  vendor_category: string | null;
  default_shipping_method: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  purchase_count?: number;
  total_spend?: number;
  last_purchase_date?: string | null;
};
