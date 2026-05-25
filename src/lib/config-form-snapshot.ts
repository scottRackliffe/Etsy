import type { AiConfig } from "@/types";
import type { AutoSyncInterval } from "@/lib/auto-sync-interval";

export type BusinessProfileSnapshot = {
  business_name: string;
  business_address_line_1: string;
  business_address_line_2: string;
  business_city: string;
  business_state_province: string;
  business_postal_code: string;
  business_country: string;
  business_phone: string;
  business_email: string;
};

export type ShippingSettingsSnapshot = {
  default_carrier: string;
  default_origin_zip: string;
  default_weight_oz: string;
};

export type TaxSettingsSnapshot = {
  default_rate: string;
};

export type DisplaySettingsSnapshot = {
  date_format: string;
  currency_code: string;
  page_size: string;
};

export type PublishConfigSnapshot = {
  taxonomyId: string;
  shippingProfileId: string;
  readinessStateId: string;
  imageIds: string;
  whoMade: string;
  whenMade: string;
  imageMaxDimension: string;
  imageTargetDpi: string;
  imageJpegQuality: string;
  allowPartialImageUpload: string;
  imageUploadAttempts: string;
};

export type IconConfigSnapshot = {
  screenHeaderPath: string;
  reportHeaderPath: string;
  screenHeaderSizePx: string;
  reportHeaderWidthPx: string;
};

export type ConfigFormSnapshot = {
  businessProfile: BusinessProfileSnapshot;
  shippingSettings: ShippingSettingsSnapshot;
  taxSettings: TaxSettingsSnapshot;
  displaySettings: DisplaySettingsSnapshot;
  backupSchedule: string;
  autoSyncInterval: AutoSyncInterval;
  publishConfig: PublishConfigSnapshot;
  iconConfig: IconConfigSnapshot;
  aiModel: string;
  aiBaseUrl: string;
  aiTimeoutMs: number;
  aiRetryCount: number;
  aiTokenBudget: number;
  aiApiKeyDraft: string;
};

export function buildConfigFormSnapshot(input: {
  businessProfile: BusinessProfileSnapshot;
  shippingSettings: ShippingSettingsSnapshot;
  taxSettings: TaxSettingsSnapshot;
  displaySettings: DisplaySettingsSnapshot;
  backupSchedule: string;
  autoSyncInterval: AutoSyncInterval;
  publishConfig: PublishConfigSnapshot;
  iconConfig: IconConfigSnapshot;
  aiConfig: AiConfig | null;
  aiApiKeyDraft: string;
}): ConfigFormSnapshot {
  return {
    businessProfile: input.businessProfile,
    shippingSettings: input.shippingSettings,
    taxSettings: input.taxSettings,
    displaySettings: input.displaySettings,
    backupSchedule: input.backupSchedule,
    autoSyncInterval: input.autoSyncInterval,
    publishConfig: input.publishConfig,
    iconConfig: input.iconConfig,
    aiModel: input.aiConfig?.model ?? "gpt-4.1-mini",
    aiBaseUrl: input.aiConfig?.baseUrl ?? "",
    aiTimeoutMs: input.aiConfig?.timeoutMs ?? 30000,
    aiRetryCount: input.aiConfig?.retryCount ?? 1,
    aiTokenBudget: input.aiConfig?.tokenBudget ?? 2000,
    aiApiKeyDraft: input.aiApiKeyDraft,
  };
}
