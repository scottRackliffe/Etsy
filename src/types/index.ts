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
  quantity: number | null;
  category_tags: string | null;
  listing_title: string | null;
  listing_description: string | null;
  listing_tags: string | null;
  listing_category_path: string | null;
  listing_title_strategy: string | null;
  listing_product_story: string | null;
  listing_condition_clarity: string | null;
  listing_attributes: string | null;
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
  created_at: string | null;
  updated_at: string | null;
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
  is_default: number | null;
  created_at: string | null;
  updated_at: string | null;
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
  grand_total: number | null;
  source_channel: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  items?: OrderItem[];
};

export type OrderItem = {
  id: number;
  order_id: number;
  inventory_id: number;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
};

export type UiError = {
  title: string;
  message: string;
  actions: string[];
  /** ISO 8601 — when the error was recorded (shown on error cards). */
  occurredAt?: string;
};

export type ApiErrorShape = {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
    user_message?: string;
    actions?: string[];
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
    | "validation_issue";
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
