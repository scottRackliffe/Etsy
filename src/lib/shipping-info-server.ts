import { getSetting } from "@/lib/settings-store";
import {
  parseShippingInfo,
  shippingInfoSettingKey,
  type ShippingInfoData,
} from "@/lib/shipping-info";

export function getShippingInfoForCarrier(shipper: string): ShippingInfoData {
  return parseShippingInfo(getSetting(shippingInfoSettingKey(shipper)));
}
