import { getSetting } from "@/lib/settings-store";

export type ShippingInfoData = {
  return_name: string;
  return_address_line_1: string;
  return_address_line_2: string;
  return_city: string;
  return_state: string;
  return_postal_code: string;
  return_country: string;
  account_number: string;
  phone: string;
};

export const EMPTY_SHIPPING_INFO: ShippingInfoData = {
  return_name: "",
  return_address_line_1: "",
  return_address_line_2: "",
  return_city: "",
  return_state: "",
  return_postal_code: "",
  return_country: "US",
  account_number: "",
  phone: "",
};

const CARRIER_KEYS: Record<string, string> = {
  USPS: "shipping_info_usps",
  UPS: "shipping_info_ups",
  FedEx: "shipping_info_fedex",
  DHL: "shipping_info_dhl",
  Other: "shipping_info_other",
};

export function shippingInfoSettingKey(shipper: string): string {
  return CARRIER_KEYS[shipper] ?? CARRIER_KEYS.Other;
}

export function parseShippingInfo(raw: string | null | undefined): ShippingInfoData {
  if (!raw?.trim()) return { ...EMPTY_SHIPPING_INFO };
  try {
    const parsed = JSON.parse(raw) as Partial<ShippingInfoData>;
    return { ...EMPTY_SHIPPING_INFO, ...parsed };
  } catch {
    return { ...EMPTY_SHIPPING_INFO };
  }
}

export function getShippingInfoForCarrier(shipper: string): ShippingInfoData {
  return parseShippingInfo(getSetting(shippingInfoSettingKey(shipper)));
}

export function isShippingInfoComplete(shipper: string, info: ShippingInfoData): boolean {
  const base =
    info.return_name.trim() &&
    info.return_address_line_1.trim() &&
    info.return_city.trim() &&
    info.return_state.trim() &&
    info.return_postal_code.trim() &&
    info.return_country.trim();
  if (!base) return false;
  if (["UPS", "FedEx", "DHL"].includes(shipper) && !info.account_number.trim()) {
    return false;
  }
  return true;
}

export type OrderShipToSnapshot = {
  shipper?: string | null;
  ship_to_first_name?: string | null;
  ship_to_last_name?: string | null;
  ship_to_address_line_1?: string | null;
  ship_to_address_line_2?: string | null;
  ship_to_city?: string | null;
  ship_to_state_province?: string | null;
  ship_to_country?: string | null;
  ship_to_postal_code?: string | null;
  order_number?: string | null;
  tracking_number?: string | null;
};

export function isOrderShipToComplete(order: OrderShipToSnapshot): boolean {
  return Boolean(
    order.shipper?.trim() &&
    order.ship_to_first_name?.trim() &&
    order.ship_to_last_name?.trim() &&
    order.ship_to_address_line_1?.trim() &&
    order.ship_to_city?.trim() &&
    order.ship_to_state_province?.trim() &&
    order.ship_to_country?.trim() &&
    order.ship_to_postal_code?.trim()
  );
}

export function missingShipToFields(order: OrderShipToSnapshot): string[] {
  const checks: Array<[string, string | null | undefined]> = [
    ["Shipper", order.shipper],
    ["Ship-to first name", order.ship_to_first_name],
    ["Ship-to last name", order.ship_to_last_name],
    ["Ship-to address", order.ship_to_address_line_1],
    ["Ship-to city", order.ship_to_city],
    ["Ship-to state", order.ship_to_state_province],
    ["Ship-to country", order.ship_to_country],
    ["Ship-to postal code", order.ship_to_postal_code],
  ];
  return checks.filter(([, value]) => !value?.trim()).map(([label]) => label);
}
