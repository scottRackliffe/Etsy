import { useCallback } from "react";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export function formatPhone(raw: string, country: string = "US"): string {
  if (!raw.trim()) return "";
  const cc = (country.trim().toUpperCase() || "US") as CountryCode;
  const phone = parsePhoneNumberFromString(raw, cc);
  if (phone) return phone.formatInternational();
  return raw;
}

export function usePhoneFormat() {
  return useCallback((raw: string, country?: string): string => {
    return formatPhone(raw, country);
  }, []);
}
