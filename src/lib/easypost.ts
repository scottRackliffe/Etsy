import EasyPostClient from "@easypost/api";
import { getSetting, setSetting } from "@/lib/settings-store";
import { logActivity } from "@/lib/activity-log";
import { logger } from "@/lib/logging";
import { encryptValue, decryptValue } from "@/lib/secret-crypto";

// ---------------------------------------------------------------------------
// API key management (encrypted at rest, AES-256-GCM — via secret-crypto.ts)
// ---------------------------------------------------------------------------

/** Store the EasyPost production API key encrypted in settings */
export function setEasyPostApiKey(plainKey: string): void {
  setSetting("easypost.api_key_encrypted", encryptValue(plainKey));
  logActivity({
    action: "easypost.api_key_updated",
    entityType: "setting",
    source: "user",
  });
}

/** Store the EasyPost test API key encrypted in settings */
export function setEasyPostTestApiKey(plainKey: string): void {
  setSetting("easypost.test_api_key_encrypted", encryptValue(plainKey));
  logActivity({
    action: "easypost.test_api_key_updated",
    entityType: "setting",
    source: "user",
  });
}

/** Get the current EasyPost mode: "production" or "test" */
export function getEasyPostMode(): "production" | "test" {
  const mode = getSetting("easypost.mode");
  return mode === "test" ? "test" : "production";
}

/** Get the plaintext EasyPost API key for the active mode (env var takes precedence) */
export function getEasyPostApiKey(): string | null {
  const envKey = process.env.EASYPOST_API_KEY;
  if (envKey) return envKey;

  const mode = getEasyPostMode();
  const settingKey = mode === "test" ? "easypost.test_api_key_encrypted" : "easypost.api_key_encrypted";
  const encrypted = getSetting(settingKey);
  if (!encrypted) return null;
  try {
    return decryptValue(encrypted);
  } catch {
    logger.warn(`easypost: failed to decrypt stored ${mode} API key`);
    return null;
  }
}

/** Returns true if EasyPost is configured for the active mode */
export function isEasyPostConfigured(): boolean {
  return !!getEasyPostApiKey();
}

/** Build a new EasyPost client instance */
function getClient(): InstanceType<typeof EasyPostClient> {
  const key = getEasyPostApiKey();
  if (!key) {
    throw new Error("EasyPost API key not configured");
  }
  return new EasyPostClient(key);
}

// ---------------------------------------------------------------------------
// Carrier tracking URL helpers
// ---------------------------------------------------------------------------

const TRACKING_URL_TEMPLATES: Record<string, string> = {
  USPS: "https://tools.usps.com/go/TrackConfirmAction?tLabels=",
  UPS: "https://www.ups.com/track?tracknum=",
  FedEx: "https://www.fedex.com/fedextrack/?trknbr=",
  DHL: "https://www.dhl.com/en/express/tracking.html?AWB=",
};

export function getTrackingUrl(carrier: string, trackingCode: string): string {
  const prefix = TRACKING_URL_TEMPLATES[carrier] ?? TRACKING_URL_TEMPLATES.USPS;
  return `${prefix}${encodeURIComponent(trackingCode)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShippingRate = {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  delivery_days: number | null;
  delivery_date: string | null;
};

export type CreateShipmentResult = {
  shipment_id: string;
  rates: ShippingRate[];
  address_verified: boolean;
  address_corrections: string[] | null;
};

export type BuyLabelResult = {
  tracking_number: string;
  tracking_url: string;
  label_url: string;
  carrier: string;
  service: string;
  rate_cents: number;
};

export type AddressValidationResult = {
  valid: boolean;
  original: Record<string, string>;
  verified: Record<string, string>;
  corrections: string[];
};

// ---------------------------------------------------------------------------
// Shipment + Rates
// ---------------------------------------------------------------------------

export async function createShipmentAndGetRates(params: {
  fromAddress: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  toAddress: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  parcel: {
    weight: number; // oz
    length?: number; // in
    width?: number; // in
    height?: number; // in
  };
}): Promise<CreateShipmentResult> {
  const client = getClient();

  const verifyFlags = getSetting("easypost.address_validation") === "on"
    ? ["delivery"]
    : [];

  const shipment = await client.Shipment.create({
    from_address: params.fromAddress,
    to_address: {
      ...params.toAddress,
      verify: verifyFlags,
    },
    parcel: {
      weight: params.parcel.weight,
      length: params.parcel.length ?? undefined,
      width: params.parcel.width ?? undefined,
      height: params.parcel.height ?? undefined,
    },
  });

  const rates: ShippingRate[] = (shipment.rates ?? []).map((r) => ({
    id: String(r.id ?? ""),
    carrier: String(r.carrier ?? ""),
    service: String(r.service ?? ""),
    rate: String(r.rate ?? "0"),
    currency: String(r.currency ?? "USD"),
    delivery_days: typeof r.delivery_days === "number" ? r.delivery_days : null,
    delivery_date: typeof r.delivery_date === "string" ? r.delivery_date : null,
  }));

  rates.sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));

  const toAddr = (shipment as unknown as Record<string, unknown>).to_address as Record<string, unknown> | undefined;
  const verifications = toAddr?.verifications as Record<string, unknown> | undefined;
  const addressVerified = !!verifications?.delivery;

  return {
    shipment_id: shipment.id,
    rates,
    address_verified: addressVerified,
    address_corrections: null,
  };
}

// ---------------------------------------------------------------------------
// Buy Label
// ---------------------------------------------------------------------------

export async function buyLabel(shipmentId: string, rateId: string): Promise<BuyLabelResult> {
  const client = getClient();
  const shipment = await client.Shipment.buy(shipmentId, rateId);

  const raw = shipment as unknown as Record<string, unknown>;
  const trackingCode = String(raw.tracking_code ?? "");
  const selectedRate = raw.selected_rate as Record<string, unknown> | undefined;
  const postageLabel = raw.postage_label as Record<string, unknown> | undefined;

  const carrier = String(selectedRate?.carrier ?? "");
  const service = String(selectedRate?.service ?? "");
  const rateAmount = parseFloat(String(selectedRate?.rate ?? "0"));
  const labelUrl = String(postageLabel?.label_url ?? "");

  logActivity({
    action: "shipping.label_purchased",
    entityType: "shipment",
    entityLabel: shipmentId,
    detail: { carrier, service, tracking_code: trackingCode, rate_cents: Math.round(rateAmount * 100) },
    source: "user",
  });

  return {
    tracking_number: trackingCode,
    tracking_url: getTrackingUrl(carrier, trackingCode),
    label_url: labelUrl,
    carrier,
    service,
    rate_cents: Math.round(rateAmount * 100),
  };
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

export async function refundShipment(shipmentId: string): Promise<string> {
  const client = getClient();
  const result = await client.Shipment.refund(shipmentId);
  const status = String((result as unknown as Record<string, unknown>).refund_status ?? "submitted");

  logActivity({
    action: "shipping.label_refunded",
    entityType: "shipment",
    entityLabel: shipmentId,
    detail: { refund_status: status },
    source: "user",
  });

  return status;
}

// ---------------------------------------------------------------------------
// Address Validation
// ---------------------------------------------------------------------------

export async function validateAddress(params: {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}): Promise<AddressValidationResult> {
  const client = getClient();
  const address = await client.Address.create({
    ...params,
    verify: ["delivery"],
  });

  const raw = address as unknown as Record<string, unknown>;
  const verifications = raw.verifications as Record<string, unknown> | undefined;
  const delivery = verifications?.delivery as Record<string, unknown> | undefined;
  const valid = delivery?.success === true;
  const errors = (delivery?.errors ?? []) as Array<{ message: string }>;

  return {
    valid,
    original: {
      street1: params.street1,
      city: params.city,
      state: params.state,
      zip: params.zip,
    },
    verified: {
      street1: String(raw.street1 ?? params.street1),
      city: String(raw.city ?? params.city),
      state: String(raw.state ?? params.state),
      zip: String(raw.zip ?? params.zip),
    },
    corrections: errors.map((e) => e.message),
  };
}

// ---------------------------------------------------------------------------
// Test Connection
// ---------------------------------------------------------------------------

export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getClient();
    await client.Address.create({
      street1: "417 Montgomery Street",
      city: "San Francisco",
      state: "CA",
      zip: "94104",
      country: "US",
      verify: ["delivery"],
    });
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn("easypost: connection test failed", { error: msg });
    return { ok: false, error: msg };
  }
}
