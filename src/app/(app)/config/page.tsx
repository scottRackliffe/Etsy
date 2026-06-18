"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import {
  AUTO_SYNC_OPTIONS,
  parseAutoSyncInterval,
  type AutoSyncInterval,
} from "@/lib/auto-sync-interval";
import { formStatesEqual } from "@/lib/deep-equal-form";
import { buildConfigFormSnapshot, type ConfigFormSnapshot } from "@/lib/config-form-snapshot";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { ChartOfAccountsSection } from "@/components/config/ChartOfAccountsSection";
import { ShippingInfoSection } from "@/components/config/ShippingInfoSection";
import { useProgressOperation } from "@/hooks/useProgressOperation";
import type { ApiErrorShape, AiConfig } from "@/types";

type EtsyConnectionInfo = {
  redirect_uri: string | null;
  connected_at: string | null;
  token_expires_at: string | null;
  last_etsy_sync_at: string | null;
};

function formatConnectionTimestamp(value: string | null | undefined): string {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

const BUSINESS_KEYS = [
  "business_name",
  "business_address_line_1",
  "business_address_line_2",
  "business_city",
  "business_state_province",
  "business_postal_code",
  "business_country",
  "business_phone",
  "business_email",
] as const;

type BusinessProfile = Record<(typeof BUSINESS_KEYS)[number], string>;

type ShippingSettings = {
  default_carrier: string;
  default_origin_zip: string;
  default_weight_oz: string;
  usps_account: string;
  ups_account: string;
  fedex_account: string;
};

type EasyPostSettings = {
  api_key: string;
  test_api_key: string;
  mode: "production" | "test";
  address_validation: string;
  label_format: string;
  label_size: string;
  default_weight_oz: string;
  default_length_in: string;
  default_width_in: string;
  default_height_in: string;
  preferred_carrier: string;
  preferred_service: string;
};

type TaxSettings = {
  default_rate: string;
};

type DisplaySettings = {
  date_format: string;
  currency_code: string;
  page_size: string;
  timezone: string;
  first_day_of_week: string;
  fiscal_year_type: string;
  fiscal_year_end_month: string;
  fiscal_year_end_day: string;
};

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
  "America/Indiana/Indianapolis",
  "America/Detroit",
  "America/Boise",
] as const;

type BackupEntry = {
  filename: string;
  created_at: string;
  size_bytes: number;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ConfigPage() {
  const {
    aiConfig,
    setAiConfig,
    publishConfig,
    setPublishConfig,
    iconConfig,
    setIconConfig,
    shops,
    connect,
    logout,
    setError,
    setApiError,
  } = useApp();

  const [aiApiKeyDraft, setAiApiKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiFieldErrors, setAiFieldErrors] = useState<Record<string, string>>({});
  const [etsyInfo, setEtsyInfo] = useState<EtsyConnectionInfo | null>(null);
  const [etsyInfoLoading, setEtsyInfoLoading] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>({
    business_name: "",
    business_address_line_1: "",
    business_address_line_2: "",
    business_city: "",
    business_state_province: "",
    business_postal_code: "",
    business_country: "US",
    business_phone: "",
    business_email: "",
  });
  const [businessLoading, setBusinessLoading] = useState(false);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [logoUploading, setLogoUploading] = useState(false);
  const [reportHeaderPath, setReportHeaderPath] = useState<string | null>(null);
  const [reportHeaderVersion, setReportHeaderVersion] = useState(0);
  const [reportHeaderUploading, setReportHeaderUploading] = useState(false);
  const [sampleDataBusy, setSampleDataBusy] = useState(false);
  const [sampleDataLoaded, setSampleDataLoaded] = useState<boolean | null>(null);
  const [loadSampleConfirm, setLoadSampleConfirm] = useState(false);
  const [removeSampleConfirm, setRemoveSampleConfirm] = useState(false);
  const [shippingSettings, setShippingSettings] = useState<ShippingSettings>({
    default_carrier: "USPS",
    default_origin_zip: "",
    default_weight_oz: "",
    usps_account: "",
    ups_account: "",
    fedex_account: "",
  });
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({ default_rate: "" });
  const [easypostSettings, setEasypostSettings] = useState<EasyPostSettings>({
    api_key: "",
    test_api_key: "",
    mode: "production",
    address_validation: "off",
    label_format: "pdf",
    label_size: "4x6",
    default_weight_oz: "",
    default_length_in: "",
    default_width_in: "",
    default_height_in: "",
    preferred_carrier: "",
    preferred_service: "",
  });
  const [easypostConnected, setEasypostConnected] = useState<boolean | null>(null);
  const [easypostTesting, setEasypostTesting] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>({
    date_format: "MM/DD/YYYY",
    currency_code: "USD",
    page_size: "25",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    first_day_of_week: "0",
    fiscal_year_type: "calendar",
    fiscal_year_end_month: "12",
    fiscal_year_end_day: "31",
  });
  const [picturesMatterUrl, setPicturesMatterUrl] = useState("");
  const [thumbnailSize, setThumbnailSize] = useState("200");
  const [tutorialFolderPath, setTutorialFolderPath] = useState("");
  const [lastIntegrityCheck, setLastIntegrityCheck] = useState<string | null>(null);
  const [integrityWarning, setIntegrityWarning] = useState<string | null>(null);
  const [backupSchedule, setBackupSchedule] = useState("manual");
  const [backupDirectory, setBackupDirectory] = useState("./backups");
  const [backupTime, setBackupTime] = useState("02:00");
  const [backupDay, setBackupDay] = useState("0");
  const [backupIncludePictures, setBackupIncludePictures] = useState(false);
  const [backupMaxCount, setBackupMaxCount] = useState("25");
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [autoSyncInterval, setAutoSyncInterval] = useState<AutoSyncInterval>("off");
  const [repeatCustomerThreshold, setRepeatCustomerThreshold] = useState("2");
  const [activityRetentionDays, setActivityRetentionDays] = useState("365");
  const [itemNumberPrefix, setItemNumberPrefix] = useState("ITEM");
  const [itemNumberPadding, setItemNumberPadding] = useState("4");
  const [nextItemPreview, setNextItemPreview] = useState<string | null>(null);
  const [orderNumberPrefix, setOrderNumberPrefix] = useState("ORD");
  const [orderNumberPadding, setOrderNumberPadding] = useState("4");
  const [nextOrderPreview, setNextOrderPreview] = useState<string | null>(null);
  const [storeCategories, setStoreCategories] = useState("");
  const [apiUsage, setApiUsage] = useState<Array<{ service: string; month: string; call_count: number }>>([]);
  const [sessionHours, setSessionHours] = useState<Array<{ service: string; month: string; total_hours: number }>>([]);
  const [apiUsageLoading, setApiUsageLoading] = useState(false);
  const [purgeUsageConfirm, setPurgeUsageConfirm] = useState(false);
  const [extraSettingsLoading, setExtraSettingsLoading] = useState(false);
  const [taxonomySyncing, setTaxonomySyncing] = useState(false);
  const [taxonomyLastSync, setTaxonomyLastSync] = useState<string | null>(null);
  const [taxonomyNodeCount, setTaxonomyNodeCount] = useState(0);
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<Map<string, string>>(new Map());
  const [configBaseline, setConfigBaseline] = useState<ConfigFormSnapshot | null>(null);
  const { setFormDirty, registerOnDiscard } = useUnsavedChanges();
  const { modal: progressModal, run: runWithProgress } = useProgressOperation();

  const configSnapshot = useMemo(
    () =>
      buildConfigFormSnapshot({
        businessProfile,
        shippingSettings,
        taxSettings,
        displaySettings,
        backupSchedule,
        backupDirectory,
        backupTime,
        backupDay,
        backupIncludePictures,
        backupMaxCount,
        autoSyncInterval,
        publishConfig,
        iconConfig,
        aiConfig,
        aiApiKeyDraft,
      }),
    [
      businessProfile,
      shippingSettings,
      taxSettings,
      displaySettings,
      backupSchedule,
      backupDirectory,
      backupTime,
      backupDay,
      backupIncludePictures,
      backupMaxCount,
      autoSyncInterval,
      publishConfig,
      iconConfig,
      aiConfig,
      aiApiKeyDraft,
    ]
  );

  const configDirty = useMemo(() => {
    if (!configBaseline) return false;
    return !formStatesEqual(configSnapshot, configBaseline);
  }, [configSnapshot, configBaseline]);

  useEffect(() => {
    setFormDirty(configDirty);
  }, [configDirty, setFormDirty]);

  useBeforeUnload(configDirty);

  const markConfigClean = useCallback(() => {
    setConfigBaseline(configSnapshot);
  }, [configSnapshot]);

  const restoreConfigFromBaseline = useCallback(() => {
    if (!configBaseline) return;
    setBusinessProfile(configBaseline.businessProfile);
    setShippingSettings(configBaseline.shippingSettings);
    setTaxSettings(configBaseline.taxSettings);
    setDisplaySettings(configBaseline.displaySettings);
    setBackupSchedule(configBaseline.backupSchedule);
    setBackupDirectory(configBaseline.backupDirectory);
    setBackupTime(configBaseline.backupTime);
    setBackupDay(configBaseline.backupDay);
    setBackupIncludePictures(configBaseline.backupIncludePictures);
    setBackupMaxCount(configBaseline.backupMaxCount);
    setAutoSyncInterval(configBaseline.autoSyncInterval);
    setPublishConfig(configBaseline.publishConfig);
    setIconConfig(configBaseline.iconConfig);
    setAiApiKeyDraft("");
    if (aiConfig) {
      setAiConfig({
        ...aiConfig,
        model: configBaseline.aiModel,
        baseUrl: configBaseline.aiBaseUrl,
        timeoutMs: configBaseline.aiTimeoutMs,
        retryCount: configBaseline.aiRetryCount,
        tokenBudget: configBaseline.aiTokenBudget,
      });
    }
  }, [configBaseline, aiConfig, setAiConfig, setPublishConfig, setIconConfig]);

  useEffect(() => {
    return registerOnDiscard(restoreConfigFromBaseline);
  }, [registerOnDiscard, restoreConfigFromBaseline]);

  const saveAutoSyncSettings = () =>
    void saveSettingsKeys(
      [{ key: "sync.auto_interval", value: autoSyncInterval }],
      "Auto-sync saved",
      "Etsy orders will sync automatically while the app is open."
    );

  const loadBackups = useCallback(async () => {
    setBackupLoading(true);
    try {
      const response = await fetch("/api/backup", { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        backups?: BackupEntry[];
      };
      if (!response.ok) throw data;
      setBackups(data.backups ?? []);
    } catch (err) {
      setApiError("Could not load backups", "We could not load the backup list.", err);
    } finally {
      setBackupLoading(false);
    }
  }, [setApiError]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const loadApiUsage = useCallback(async () => {
    setApiUsageLoading(true);
    try {
      const response = await fetch("/api/usage?months=6", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        items?: Array<{ service: string; month: string; call_count: number }>;
        sessions?: Array<{ service: string; month: string; total_hours: number }>;
      };
      setApiUsage(data.items ?? []);
      setSessionHours(data.sessions ?? []);
    } catch {
      // non-critical — silently ignore
    } finally {
      setApiUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApiUsage();
  }, [loadApiUsage]);

  const loadEtsyConnectionInfo = useCallback(async () => {
    setEtsyInfoLoading(true);
    try {
      const response = await fetch("/api/auth/etsy/info", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as EtsyConnectionInfo & ApiErrorShape;
      if (!response.ok) throw data;
      setEtsyInfo({
        redirect_uri: data.redirect_uri ?? null,
        connected_at: data.connected_at ?? null,
        token_expires_at: data.token_expires_at ?? null,
        last_etsy_sync_at: data.last_etsy_sync_at ?? null,
      });
    } catch (err) {
      setApiError(
        "Could not load Etsy connection info",
        "We could not load Etsy connection details.",
        err
      );
    } finally {
      setEtsyInfoLoading(false);
    }
  }, [setApiError]);

  useEffect(() => {
    void loadEtsyConnectionInfo();
  }, [loadEtsyConnectionInfo]);

  const loadBusinessProfile = useCallback(async () => {
    setBusinessLoading(true);
    try {
      const response = await fetch("/api/settings?limit=500", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        items?: Array<{ key: string; value: string; updated_at?: string }>;
      };
      if (!response.ok) throw data;
      const map = new Map((data.items ?? []).map((row) => [row.key, row.value]));
      const updatedAtMap = new Map<string, string>();
      for (const row of data.items ?? []) {
        if (row.updated_at) updatedAtMap.set(row.key, row.updated_at);
      }
      setSettingsUpdatedAt(updatedAtMap);
      setBusinessProfile({
        business_name: map.get("business_name") ?? "",
        business_address_line_1: map.get("business_address_line_1") ?? "",
        business_address_line_2: map.get("business_address_line_2") ?? "",
        business_city: map.get("business_city") ?? "",
        business_state_province: map.get("business_state_province") ?? "",
        business_postal_code: map.get("business_postal_code") ?? "",
        business_country: map.get("business_country") ?? "US",
        business_phone: map.get("business_phone") ?? "",
        business_email: map.get("business_email") ?? "",
      });
      const rawLogo = map.get("business_logo_path") ?? "";
      setLogoPath(rawLogo || null);
      const rawReportHeader = map.get("report_header_logo_path") ?? "";
      setReportHeaderPath(rawReportHeader || null);
      setShippingSettings({
        default_carrier: map.get("shipping.default_carrier") ?? "USPS",
        default_origin_zip: map.get("shipping.default_origin_zip") ?? "",
        default_weight_oz: map.get("shipping.default_weight_oz") ?? "",
        usps_account: map.get("shipping.usps_account") ?? "",
        ups_account: map.get("shipping.ups_account") ?? "",
        fedex_account: map.get("shipping.fedex_account") ?? "",
      });
      setTaxSettings({ default_rate: map.get("tax.default_rate") ?? "" });
      setEasypostSettings({
        api_key: "",
        test_api_key: "",
        mode: (map.get("easypost.mode") ?? "production") as "production" | "test",
        address_validation: map.get("easypost.address_validation") ?? "off",
        label_format: map.get("easypost.label_format") ?? "pdf",
        label_size: map.get("easypost.label_size") ?? "4x6",
        default_weight_oz: map.get("easypost.default_weight_oz") ?? "",
        default_length_in: map.get("easypost.default_length_in") ?? "",
        default_width_in: map.get("easypost.default_width_in") ?? "",
        default_height_in: map.get("easypost.default_height_in") ?? "",
        preferred_carrier: map.get("easypost.preferred_carrier") ?? "",
        preferred_service: map.get("easypost.preferred_service") ?? "",
      });
      setEasypostConnected(map.has("easypost.api_key_encrypted") && !!map.get("easypost.api_key_encrypted"));
      setDisplaySettings({
        date_format: map.get("ui.date_format") ?? "MM/DD/YYYY",
        currency_code: map.get("ui.currency_code") ?? "USD",
        page_size: map.get("ui.page_size") ?? "25",
        timezone: map.get("ui.timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone,
        first_day_of_week: map.get("first_day_of_week") ?? "0",
        fiscal_year_type: map.get("fiscal.year_type") ?? "calendar",
        fiscal_year_end_month: map.get("fiscal.year_end_month") ?? "12",
        fiscal_year_end_day: map.get("fiscal.year_end_day") ?? "31",
      });
      setPicturesMatterUrl(map.get("pictures_matter_url") ?? "");
      setThumbnailSize(map.get("thumbnail_size") ?? "200");
      setTutorialFolderPath(map.get("tutorial_system_folder_path") ?? "");
      setLastIntegrityCheck(map.get("last_integrity_check") ?? null);
      setIntegrityWarning(map.get("integrity_warning") ?? null);
      setBackupSchedule(map.get("backup_schedule") ?? "manual");
      setBackupDirectory(map.get("backup_directory") ?? "./backups");
      setBackupTime(map.get("backup_time") ?? "02:00");
      setBackupDay(map.get("backup_day") ?? "0");
      setBackupIncludePictures(map.get("backup_include_pictures") === "true");
      setBackupMaxCount(map.get("backup_max_count") ?? "25");
      setLastBackupAt(map.get("last_backup_at") ?? null);
      setAutoSyncInterval(parseAutoSyncInterval(map.get("sync.auto_interval")));
      setRepeatCustomerThreshold(map.get("repeat_customer_threshold") ?? "2");
      setActivityRetentionDays(map.get("activity_log.retention_days") ?? "365");
      setItemNumberPrefix(map.get("inventory.number_prefix") || "ITEM");
      setItemNumberPadding(map.get("inventory.number_padding") || "4");
      setOrderNumberPrefix(map.get("order.number_prefix") || "ORD");
      setOrderNumberPadding(map.get("order.number_padding") || "4");
      setStoreCategories(map.get("inventory.store_categories") ?? "");
      setConfigBaseline(
        buildConfigFormSnapshot({
          businessProfile: {
            business_name: map.get("business_name") ?? "",
            business_address_line_1: map.get("business_address_line_1") ?? "",
            business_address_line_2: map.get("business_address_line_2") ?? "",
            business_city: map.get("business_city") ?? "",
            business_state_province: map.get("business_state_province") ?? "",
            business_postal_code: map.get("business_postal_code") ?? "",
            business_country: map.get("business_country") ?? "US",
            business_phone: map.get("business_phone") ?? "",
            business_email: map.get("business_email") ?? "",
          },
          shippingSettings: {
            default_carrier: map.get("shipping.default_carrier") ?? "USPS",
            default_origin_zip: map.get("shipping.default_origin_zip") ?? "",
            default_weight_oz: map.get("shipping.default_weight_oz") ?? "",
            usps_account: map.get("shipping.usps_account") ?? "",
            ups_account: map.get("shipping.ups_account") ?? "",
            fedex_account: map.get("shipping.fedex_account") ?? "",
          },
          taxSettings: { default_rate: map.get("tax.default_rate") ?? "" },
          displaySettings: {
            date_format: map.get("ui.date_format") ?? "MM/DD/YYYY",
            currency_code: map.get("ui.currency_code") ?? "USD",
            page_size: map.get("ui.page_size") ?? "25",
            timezone: map.get("ui.timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone,
            first_day_of_week: map.get("first_day_of_week") ?? "0",
            fiscal_year_type: map.get("fiscal.year_type") ?? "calendar",
            fiscal_year_end_month: map.get("fiscal.year_end_month") ?? "12",
            fiscal_year_end_day: map.get("fiscal.year_end_day") ?? "31",
          },
          backupSchedule: map.get("backup_schedule") ?? "manual",
          backupDirectory: map.get("backup_directory") ?? "./backups",
          backupTime: map.get("backup_time") ?? "02:00",
          backupDay: map.get("backup_day") ?? "0",
          backupIncludePictures: map.get("backup_include_pictures") === "true",
          backupMaxCount: map.get("backup_max_count") ?? "25",
          autoSyncInterval: parseAutoSyncInterval(map.get("sync.auto_interval")),
          publishConfig,
          iconConfig,
          aiConfig,
          aiApiKeyDraft: "",
        })
      );
    } catch (err) {
      setApiError("Could not load business profile", "We could not load business settings.", err);
    } finally {
      setBusinessLoading(false);
    }
  }, [setApiError, publishConfig, iconConfig, aiConfig]);

  useEffect(() => {
    void loadBusinessProfile();
  }, [loadBusinessProfile]);

  const saveBusinessProfile = async () => {
    setBusinessLoading(true);
    try {
      const serverTimestamps = new Map<string, string>();
      for (const key of BUSINESS_KEYS) {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        const updatedAt = settingsUpdatedAt.get(key);
        if (updatedAt) headers["If-Match"] = updatedAt;

        const response = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ value: businessProfile[key] }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { updated_at?: string };
        if (!response.ok) throw data;
        if (data.updated_at) serverTimestamps.set(key, data.updated_at);
      }
      setSettingsUpdatedAt((prev) => {
        const next = new Map(prev);
        for (const [k, v] of serverTimestamps) next.set(k, v);
        return next;
      });
      setError({
        title: "Business profile saved",
        message: "Your business details were saved for invoices and reports.",
        actions: ["Generate a report to verify the header."],
      });
      markConfigClean();
    } catch (err) {
      setApiError("Could not save business profile", "We could not save business settings.", err);
    } finally {
      setBusinessLoading(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setLogoUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/settings/logo", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string } & ApiErrorShape;
      if (!res.ok) throw data;
      setLogoPath(data.path ?? null);
      setLogoVersion((v) => v + 1);
    } catch (err) {
      setApiError("Logo upload failed", "We could not save the business logo.", err);
    } finally {
      setLogoUploading(false);
    }
  };

  const removeLogo = async () => {
    setLogoUploading(true);
    try {
      const res = await fetch("/api/settings/logo", { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setLogoPath(null);
    } catch (err) {
      setApiError("Could not remove logo", "We could not remove the business logo.", err);
    } finally {
      setLogoUploading(false);
    }
  };

  const uploadReportHeader = async (file: File) => {
    setReportHeaderUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/settings/report-header", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string } & ApiErrorShape;
      if (!res.ok) throw data;
      setReportHeaderPath(data.path ?? null);
      setReportHeaderVersion((v) => v + 1);
    } catch (err) {
      setApiError("Report header upload failed", "We could not save the report header.", err);
    } finally {
      setReportHeaderUploading(false);
    }
  };

  const removeReportHeader = async () => {
    setReportHeaderUploading(true);
    try {
      const res = await fetch("/api/settings/report-header", { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setReportHeaderPath(null);
    } catch (err) {
      setApiError("Could not remove report header", "We could not remove the report header.", err);
    } finally {
      setReportHeaderUploading(false);
    }
  };

  const saveSettingsKeys = async (
    updates: Array<{ key: string; value: string }>,
    successTitle: string,
    successMessage: string
  ) => {
    setExtraSettingsLoading(true);
    try {
      const serverTimestamps = new Map<string, string>();
      for (const update of updates) {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        const updatedAt = settingsUpdatedAt.get(update.key);
        if (updatedAt) headers["If-Match"] = updatedAt;

        const response = await fetch(`/api/settings/${encodeURIComponent(update.key)}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ value: update.value }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { updated_at?: string };
        if (!response.ok) throw data;
        if (data.updated_at) serverTimestamps.set(update.key, data.updated_at);
      }
      setSettingsUpdatedAt((prev) => {
        const next = new Map(prev);
        for (const [k, v] of serverTimestamps) next.set(k, v);
        return next;
      });
      setError({ title: successTitle, message: successMessage, actions: ["Settings saved."] });
      markConfigClean();
    } catch (err) {
      setApiError("Could not save settings", "We could not save those settings.", err);
    } finally {
      setExtraSettingsLoading(false);
    }
  };

  const saveShippingSettings = () =>
    void saveSettingsKeys(
      [
        { key: "shipping.default_carrier", value: shippingSettings.default_carrier },
        { key: "shipping.default_origin_zip", value: shippingSettings.default_origin_zip },
        { key: "shipping.default_weight_oz", value: shippingSettings.default_weight_oz },
        { key: "shipping.usps_account", value: shippingSettings.usps_account },
        { key: "shipping.ups_account", value: shippingSettings.ups_account },
        { key: "shipping.fedex_account", value: shippingSettings.fedex_account },
      ],
      "Shipping defaults saved",
      "Default carrier and package settings were updated."
    );

  const saveEasypostSettings = async () => {
    setExtraSettingsLoading(true);
    try {
      const updates: Array<{ key: string; value: string }> = [
        { key: "easypost.mode", value: easypostSettings.mode },
        { key: "easypost.address_validation", value: easypostSettings.address_validation },
        { key: "easypost.label_format", value: easypostSettings.label_format },
        { key: "easypost.label_size", value: easypostSettings.label_size },
        { key: "easypost.default_weight_oz", value: easypostSettings.default_weight_oz },
        { key: "easypost.default_length_in", value: easypostSettings.default_length_in },
        { key: "easypost.default_width_in", value: easypostSettings.default_width_in },
        { key: "easypost.default_height_in", value: easypostSettings.default_height_in },
        { key: "easypost.preferred_carrier", value: easypostSettings.preferred_carrier },
        { key: "easypost.preferred_service", value: easypostSettings.preferred_service },
      ];
      if (easypostSettings.api_key.trim()) {
        updates.push({ key: "easypost.api_key", value: easypostSettings.api_key.trim() });
      }
      if (easypostSettings.test_api_key.trim()) {
        updates.push({ key: "easypost.test_api_key", value: easypostSettings.test_api_key.trim() });
      }
      await saveSettingsKeys(
        updates,
        "Shipping API settings saved",
        "EasyPost configuration updated."
      );
      if (easypostSettings.api_key.trim()) {
        setEasypostSettings((c) => ({ ...c, api_key: "" }));
        setEasypostConnected(true);
      }
      if (easypostSettings.test_api_key.trim()) {
        setEasypostSettings((c) => ({ ...c, test_api_key: "" }));
      }
    } catch {
      setExtraSettingsLoading(false);
    }
  };

  const testEasypostConnection = async () => {
    setEasypostTesting(true);
    try {
      const res = await fetch("/api/shipping/test-connection", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (data.ok) {
        setEasypostConnected(true);
        setError({ title: "Connected", message: "EasyPost connection successful.", actions: [] });
      } else {
        setEasypostConnected(false);
        setApiError("Connection failed", data.error ?? "Could not connect to EasyPost.", undefined);
      }
    } catch (err) {
      setEasypostConnected(false);
      setApiError("Connection failed", "Could not reach EasyPost.", err);
    } finally {
      setEasypostTesting(false);
    }
  };

  const saveTaxSettings = () =>
    void saveSettingsKeys(
      [{ key: "tax.default_rate", value: taxSettings.default_rate }],
      "Tax settings saved",
      "Default sales tax rate was updated."
    );

  const saveDisplaySettings = () =>
    void saveSettingsKeys(
      [
        { key: "ui.date_format", value: displaySettings.date_format },
        { key: "ui.currency_code", value: displaySettings.currency_code },
        { key: "ui.page_size", value: displaySettings.page_size },
        { key: "ui.timezone", value: displaySettings.timezone },
        { key: "first_day_of_week", value: displaySettings.first_day_of_week },
        { key: "fiscal.year_type", value: displaySettings.fiscal_year_type },
        { key: "fiscal.year_end_month", value: displaySettings.fiscal_year_end_month },
        { key: "fiscal.year_end_day", value: displaySettings.fiscal_year_end_day },
        { key: "repeat_customer_threshold", value: repeatCustomerThreshold },
        { key: "activity_log.retention_days", value: activityRetentionDays },
      ],
      "Display preferences saved",
      "Display settings were updated."
    );

  const savePicturesAndTutorialSettings = () =>
    void saveSettingsKeys(
      [
        { key: "pictures_matter_url", value: picturesMatterUrl },
        { key: "thumbnail_size", value: thumbnailSize },
        { key: "tutorial_system_folder_path", value: tutorialFolderPath },
      ],
      "Content settings saved",
      "Picture and tutorial path settings were updated."
    );

  const loadNextItemPreview = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/next-number", {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as { next_number?: string };
      if (res.ok) setNextItemPreview(data.next_number ?? null);
    } catch {
      setNextItemPreview(null);
    }
  }, []);

  const loadNextOrderPreview = useCallback(async () => {
    try {
      const res = await fetch("/api/orders/next-number", {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as { next_number?: string };
      if (res.ok) setNextOrderPreview(data.next_number ?? null);
    } catch {
      setNextOrderPreview(null);
    }
  }, []);

  useEffect(() => {
    void loadNextItemPreview();
    void loadNextOrderPreview();
  }, [loadNextItemPreview, loadNextOrderPreview]);

  const saveItemNumberSettings = async () => {
    const prefix = itemNumberPrefix.trim() || "ITEM";
    const pad = Math.max(2, Math.min(6, parseInt(itemNumberPadding, 10) || 4));
    setItemNumberPrefix(prefix);
    setItemNumberPadding(String(pad));
    await saveSettingsKeys(
      [
        { key: "inventory.number_prefix", value: prefix },
        { key: "inventory.number_padding", value: String(pad) },
      ],
      "Item numbering saved",
      `New items will be numbered like ${prefix}-${"0".repeat(pad - 1)}1.`
    );
    void loadNextItemPreview();
  };

  const saveOrderNumberSettings = async () => {
    const prefix = orderNumberPrefix.trim() || "ORD";
    const pad = Math.max(2, Math.min(6, parseInt(orderNumberPadding, 10) || 4));
    setOrderNumberPrefix(prefix);
    setOrderNumberPadding(String(pad));
    await saveSettingsKeys(
      [
        { key: "order.number_prefix", value: prefix },
        { key: "order.number_padding", value: String(pad) },
      ],
      "Order numbering saved",
      `New orders will be numbered like ${prefix}-${"0".repeat(pad - 1)}1.`
    );
    void loadNextOrderPreview();
  };

  const saveStoreCategories = () => {
    const cleaned = storeCategories
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(",");
    void saveSettingsKeys(
      [{ key: "inventory.store_categories", value: cleaned }],
      "Store categories saved",
      cleaned
        ? `${cleaned.split(",").length} categories available for inventory items.`
        : "Store categories cleared."
    );
  };

  const loadTaxonomyStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/etsy-taxonomy/sync", {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        lastSyncAt?: string | null;
        nodeCount?: number;
      };
      if (res.ok) {
        setTaxonomyLastSync(data.lastSyncAt ?? null);
        setTaxonomyNodeCount(data.nodeCount ?? 0);
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void loadTaxonomyStatus();
  }, [loadTaxonomyStatus]);

  const syncTaxonomy = async () => {
    setTaxonomySyncing(true);
    try {
      const res = await fetch("/api/etsy-taxonomy/sync", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        nodesInserted?: number;
        lastSyncAt?: string;
        error?: { user_message?: string };
      };
      if (!res.ok) {
        throw data;
      }
      setTaxonomyLastSync(data.lastSyncAt ?? null);
      setTaxonomyNodeCount(data.nodesInserted ?? 0);
      setError({
        title: "Etsy categories synced",
        message: `Loaded ${data.nodesInserted?.toLocaleString() ?? 0} categories from Etsy.`,
        actions: [
          "Categories are now available when creating listings.",
        ],
      });
    } catch (err) {
      setApiError(
        "Category sync failed",
        "Could not sync Etsy categories.",
        err
      );
    } finally {
      setTaxonomySyncing(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/seed/sample-data", {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json().catch(() => ({}))) as { loaded?: boolean };
        if (response.ok) {
          setSampleDataLoaded(Boolean(data.loaded));
        } else {
          setSampleDataLoaded(false);
        }
      } catch {
        setSampleDataLoaded(false);
      }
    })();
  }, []);

  const loadSampleData = async () => {
    setSampleDataBusy(true);
    try {
      const response = await fetch("/api/seed/sample-data", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        items?: number;
        customers?: number;
        orders?: number;
      };
      if (!response.ok) throw data;
      setSampleDataLoaded(true);
      setLoadSampleConfirm(false);
      setError({
        title: "Sample data loaded",
        message: `Added ${data.items ?? 0} items, ${data.customers ?? 0} customers, and ${data.orders ?? 0} orders.`,
        actions: ["Refresh other tabs to see demo records."],
      });
    } catch (err) {
      setApiError("Could not load sample data", "We could not load sample data.", err);
    } finally {
      setSampleDataBusy(false);
    }
  };

  const removeSampleData = async () => {
    setSampleDataBusy(true);
    try {
      const response = await fetch("/api/seed/sample-data", {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok && response.status !== 204) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setSampleDataLoaded(false);
      setRemoveSampleConfirm(false);
      setError({
        title: "Sample data removed",
        message: "Demo inventory, customers, and orders were removed.",
        actions: ["Refresh other tabs to see updated data."],
      });
    } catch (err) {
      setApiError("Could not remove sample data", "We could not remove sample data.", err);
    } finally {
      setSampleDataBusy(false);
    }
  };

  const createBackup = async () => {
    setBackupLoading(true);
    try {
      await runWithProgress({
        title: "Creating backup",
        statusText: "Copying database to your backup folder…",
        fn: async () => {
          const response = await fetch("/api/backup", {
            method: "POST",
            headers: { Accept: "application/json" },
          });
          const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
            filename?: string;
            size_bytes?: number;
          };
          if (!response.ok) throw data;
          setError({
            title: "Backup created",
            message: `Saved ${data.filename ?? "backup"} (${formatBytes(data.size_bytes ?? 0)}).`,
            actions: ["Your data is backed up locally."],
          });
          await loadBackups();
        },
      });
    } catch {
      /* modal handles error */
    } finally {
      setBackupLoading(false);
    }
  };

  const restoreBackup = async (filename: string) => {
    setBackupLoading(true);
    try {
      await runWithProgress({
        title: "Restoring backup",
        statusText: "Creating safety backup and restoring database…",
        fn: async () => {
          const response = await fetch("/api/backup/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ filename }),
          });
          const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
            pre_restore_backup?: string;
          };
          if (!response.ok) throw data;
          setRestoreTarget(null);
          await loadBackups();
          window.location.reload();
        },
      });
    } catch {
      /* modal handles error */
    } finally {
      setBackupLoading(false);
    }
  };

  const deleteBackup = async (filename: string) => {
    setBackupLoading(true);
    try {
      const response = await fetch(`/api/backup/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok && response.status !== 204) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      await loadBackups();
    } catch (err) {
      setApiError("Delete failed", "We could not delete that backup.", err);
    } finally {
      setBackupLoading(false);
    }
  };

  const validateAiSettings = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    const model = (aiConfig?.model ?? "").trim();
    if (!model) errs.model = "Model is required.";

    if (!aiConfig?.apiKeyConfigured && !aiApiKeyDraft.trim()) {
      errs.apiKey = "API key is required.";
    } else if (aiApiKeyDraft && !aiApiKeyDraft.trim().startsWith("sk-")) {
      errs.apiKey = "API key should start with \"sk-\".";
    }

    const timeoutSec = Math.round((aiConfig?.timeoutMs ?? 30000) / 1000);
    if (timeoutSec < 5) errs.timeout = "Minimum 5 seconds.";
    else if (timeoutSec > 120) errs.timeout = "Maximum 120 seconds.";

    const retries = aiConfig?.retryCount ?? 1;
    if (retries < 1) errs.retries = "At least 1 retry.";
    else if (retries > 5) errs.retries = "Maximum 5 retries.";

    const tokens = aiConfig?.tokenBudget ?? 2000;
    if (tokens < 100) errs.tokens = "Minimum 100 tokens.";
    else if (tokens > 16000) errs.tokens = "Maximum 16,000 tokens.";

    return errs;
  };

  const saveAiSettings = async () => {
    const errs = validateAiSettings();
    setAiFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const response = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          provider: "openai",
          model: aiConfig?.model ?? "gpt-4.1-mini",
          api_key: aiApiKeyDraft || undefined,
          base_url: aiConfig?.baseUrl ?? "",
          timeout_ms: aiConfig?.timeoutMs ?? 30000,
          retry_count: aiConfig?.retryCount ?? 1,
          token_budget: aiConfig?.tokenBudget ?? 2000,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        config?: AiConfig;
      };
      if (!response.ok) throw data;
      if (data.config) setAiConfig(data.config);
      setAiApiKeyDraft("");
      setError(null);
      setAiFieldErrors({});
      markConfigClean();
    } catch (err) {
      setApiError("Could not save AI settings", "We could not save AI settings.", err);
    } finally {
      setSaving(false);
    }
  };

  const testAiSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/ai/test-connection", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      setError({
        title: "AI connection is ready",
        message: "Your integrated AI provider responded successfully.",
        actions: ["You can now use Generate in app for listing drafts."],
      });
    } catch (err) {
      setApiError("AI connection test failed", "We could not verify AI connection.", err);
    } finally {
      setSaving(false);
    }
  };

  const savePublishSettings = async () => {
    setSaving(true);
    try {
      const updates: Array<{ key: string; value: string }> = [
        { key: "etsy.publish.default_taxonomy_id", value: publishConfig.taxonomyId.trim() },
        { key: "etsy.publish.shipping_profile_id", value: publishConfig.shippingProfileId.trim() },
        { key: "etsy.publish.return_policy_id", value: publishConfig.returnPolicyId.trim() },
        { key: "etsy.publish.readiness_state_id", value: publishConfig.readinessStateId.trim() },
        { key: "etsy.publish.image_ids", value: publishConfig.imageIds.trim() },
        {
          key: "etsy.publish.default_who_made",
          value: publishConfig.whoMade.trim() || "someone_else",
        },
        {
          key: "etsy.publish.default_when_made",
          value: publishConfig.whenMade.trim() || "2010_2019",
        },
        {
          key: "etsy.publish.image_max_dimension",
          value: publishConfig.imageMaxDimension.trim() || "2000",
        },
        {
          key: "etsy.publish.image_target_dpi",
          value: publishConfig.imageTargetDpi.trim() || "300",
        },
        {
          key: "etsy.publish.image_jpeg_quality",
          value: publishConfig.imageJpegQuality.trim() || "82",
        },
        {
          key: "etsy.publish.allow_partial_image_upload",
          value: publishConfig.allowPartialImageUpload.trim() || "false",
        },
        {
          key: "etsy.publish.image_upload_attempts",
          value: publishConfig.imageUploadAttempts.trim() || "3",
        },
        {
          key: "etsy.developer_mode",
          value: publishConfig.developerMode.trim() || "false",
        },
        {
          key: "listing.min_quality_score",
          value: publishConfig.minQualityScore.trim() || "80",
        },
      ];
      for (const update of updates) {
        const response = await fetch(`/api/settings/${encodeURIComponent(update.key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ value: update.value }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        if (!response.ok) throw data;
      }
      setError({
        title: "Publish settings saved",
        message: "Etsy publish defaults were saved successfully.",
        actions: ["You can now publish approved listing drafts to Etsy."],
      });
      markConfigClean();
    } catch (err) {
      setApiError(
        "Could not save publish settings",
        "We could not save Etsy publish settings.",
        err
      );
    } finally {
      setSaving(false);
    }
  };

  const saveIconSettings = async () => {
    setSaving(true);
    try {
      const updates: Array<{ key: string; value: string }> = [
        {
          key: "ui.icons.screen_header_path",
          value: iconConfig.screenHeaderPath.trim() || "/icons/screen-header.png",
        },
        {
          key: "ui.icons.report_header_path",
          value: iconConfig.reportHeaderPath.trim() || "/icons/report-header.png",
        },
        {
          key: "ui.icons.screen_header_size_px",
          value: iconConfig.screenHeaderSizePx.trim() || "32",
        },
        {
          key: "ui.icons.report_header_width_px",
          value: iconConfig.reportHeaderWidthPx.trim() || "220",
        },
      ];
      const iconTimestamps = new Map<string, string>();
      for (const update of updates) {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        const updatedAt = settingsUpdatedAt.get(update.key);
        if (updatedAt) headers["If-Match"] = updatedAt;

        const response = await fetch(`/api/settings/${encodeURIComponent(update.key)}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ value: update.value }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { updated_at?: string };
        if (!response.ok) throw data;
        if (data.updated_at) iconTimestamps.set(update.key, data.updated_at);
      }
      setSettingsUpdatedAt((prev) => {
        const next = new Map(prev);
        for (const [k, v] of iconTimestamps) next.set(k, v);
        return next;
      });
      setError({
        title: "Icon settings saved",
        message: "Screen and report icon configuration was updated.",
        actions: ["Refresh or switch tabs to verify icon rendering."],
      });
      markConfigClean();
    } catch (err) {
      setApiError("Could not save icon settings", "We could not save icon settings.", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ProgressModal {...progressModal} />
      <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
        <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Configuration</h3>
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 lg:col-span-2">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Business profile</h4>
            <p className="mb-3 text-xs text-[var(--ui-muted)]">
              Upload your business images for printed documents.
            </p>
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-[var(--ui-body)]">
                  Print logo <span className="font-normal text-[var(--ui-muted)]">— envelopes, thank-you notes, invoices</span>
                </p>
                <div className="flex items-center gap-3">
                  {logoPath ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/uploads/${logoPath.replace(/^uploads\//, "")}?v=${logoVersion}`}
                        alt="Print logo"
                        className="h-20 w-20 rounded-lg border border-[var(--ui-border)] object-contain bg-[var(--ui-card-bg)]"
                      />
                      <Button variant="danger" size="sm" onClick={removeLogo} busy={logoUploading}>
                        Remove
                      </Button>
                    </>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-4 py-3 text-sm text-[var(--ui-muted)] hover:border-[var(--ui-accent)]">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {logoUploading ? "Uploading…" : "Upload print logo"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={logoUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadLogo(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-[var(--ui-body)]">
                  Report header <span className="font-normal text-[var(--ui-muted)]">— top of PDF reports</span>
                </p>
                <div className="flex items-center gap-3">
                  {reportHeaderPath ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/uploads/${reportHeaderPath.replace(/^uploads\//, "")}?v=${reportHeaderVersion}`}
                        alt="Report header"
                        className="h-16 w-auto max-w-[240px] rounded-lg border border-[var(--ui-border)] object-contain bg-[var(--ui-card-bg)]"
                      />
                      <Button variant="danger" size="sm" onClick={removeReportHeader} busy={reportHeaderUploading}>
                        Remove
                      </Button>
                    </>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-4 py-3 text-sm text-[var(--ui-muted)] hover:border-[var(--ui-accent)]">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {reportHeaderUploading ? "Uploading…" : "Upload report header"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={reportHeaderUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadReportHeader(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                value={businessProfile.business_name}
                onChange={(e) =>
                  setBusinessProfile((c) => ({ ...c, business_name: e.target.value }))
                }
                placeholder="Business name"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
              />
              <input
                value={businessProfile.business_address_line_1}
                onChange={(e) =>
                  setBusinessProfile((c) => ({ ...c, business_address_line_1: e.target.value }))
                }
                placeholder="Address line 1"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
              />
              <input
                value={businessProfile.business_address_line_2}
                onChange={(e) =>
                  setBusinessProfile((c) => ({ ...c, business_address_line_2: e.target.value }))
                }
                placeholder="Address line 2 (optional)"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
              />
              <input
                value={businessProfile.business_city}
                onChange={(e) =>
                  setBusinessProfile((c) => ({ ...c, business_city: e.target.value }))
                }
                placeholder="City"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
              <input
                value={businessProfile.business_state_province}
                onChange={(e) =>
                  setBusinessProfile((c) => ({ ...c, business_state_province: e.target.value }))
                }
                placeholder="State / Province"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
              <input
                value={businessProfile.business_postal_code}
                onChange={(e) =>
                  setBusinessProfile((c) => ({ ...c, business_postal_code: e.target.value }))
                }
                placeholder="Postal code"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
              <input
                value={businessProfile.business_country}
                onChange={(e) =>
                  setBusinessProfile((c) => ({ ...c, business_country: e.target.value }))
                }
                placeholder="Country"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
              <input
                value={businessProfile.business_phone}
                onChange={(e) =>
                  setBusinessProfile((c) => ({ ...c, business_phone: e.target.value }))
                }
                placeholder="Phone"
                type="tel"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
              <input
                value={businessProfile.business_email}
                onChange={(e) =>
                  setBusinessProfile((c) => ({ ...c, business_email: e.target.value }))
                }
                placeholder="Email"
                type="email"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </div>
            <Button
              variant="accent"
              size="lg"
              onClick={saveBusinessProfile}
              disabled={businessLoading}
              busy={businessLoading}
              className="mt-3"
            >
              Save business profile
            </Button>
          </div>
          <div
            id="etsy-connection"
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 lg:col-span-2"
          >
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Etsy connection</h4>
            <p className="mb-3 text-xs text-[var(--ui-muted)]">
              OAuth status and sync metadata for your shop.
            </p>
            <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs text-[var(--ui-muted)]">Connection status</dt>
                <dd className="mt-0.5">
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      shops.length
                        ? "border-[var(--ui-green)]/30 bg-[var(--ui-green)]/10 text-[var(--ui-green)]"
                        : "border-[var(--ui-border)] bg-[var(--ui-neutral)] text-[var(--ui-muted)]"
                    }`}
                  >
                    {shops.length ? "Connected" : "Not connected"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ui-muted)]">Shop name</dt>
                <dd className="mt-0.5 text-[var(--ui-body)]">{shops[0]?.shop_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ui-muted)]">Shop ID</dt>
                <dd className="mt-0.5 font-mono text-[var(--ui-body)]">
                  {shops[0]?.shop_id ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ui-muted)]">Connected since</dt>
                <dd className="mt-0.5 text-[var(--ui-body)]">
                  {etsyInfoLoading
                    ? "Loading…"
                    : formatConnectionTimestamp(etsyInfo?.connected_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ui-muted)]">Token expires</dt>
                <dd className="mt-0.5 text-[var(--ui-body)]">
                  {etsyInfoLoading
                    ? "Loading…"
                    : formatConnectionTimestamp(etsyInfo?.token_expires_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ui-muted)]">Last Etsy sync</dt>
                <dd className="mt-0.5 text-[var(--ui-body)]">
                  {etsyInfoLoading
                    ? "Loading…"
                    : formatConnectionTimestamp(etsyInfo?.last_etsy_sync_at)}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs text-[var(--ui-muted)]">Auto-sync interval</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <select
                    value={autoSyncInterval}
                    onChange={(e) => setAutoSyncInterval(parseAutoSyncInterval(e.target.value))}
                    className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1.5 text-sm"
                  >
                    {AUTO_SYNC_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={saveAutoSyncSettings}
                    disabled={extraSettingsLoading}
                  >
                    Save auto-sync
                  </Button>
                </dd>
                <p className="mt-1 text-xs text-[var(--ui-muted)]">
                  Runs only while this app is open in your browser.
                </p>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs text-[var(--ui-muted)]">Redirect URI</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-[var(--ui-body)]">
                  {etsyInfoLoading ? "Loading…" : (etsyInfo?.redirect_uri ?? "Not configured")}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="accent" size="lg" onClick={connect}>
                {shops.length ? "Reconnect Etsy" : "Connect Etsy"}
              </Button>
              {shops.length > 0 ? (
                <Button variant="secondary" size="lg" onClick={() => setDisconnectOpen(true)}>
                  Disconnect
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="lg"
                onClick={() => void loadEtsyConnectionInfo()}
                disabled={etsyInfoLoading}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ShippingInfoSection
            onError={(title, message, err) => setApiError(title, message, err)}
            onSuccess={(title, message) =>
              setError({ title, message, actions: ["Settings saved."] })
            }
          />
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Shipping defaults</h4>
            <FormField label="Default carrier">
              <select
                value={shippingSettings.default_carrier}
                onChange={(e) =>
                  setShippingSettings((c) => ({ ...c, default_carrier: e.target.value }))
                }
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                {["USPS", "UPS", "FedEx", "DHL", "Other"].map((carrier) => (
                  <option key={carrier} value={carrier}>
                    {carrier}
                  </option>
                ))}
              </select>
            </FormField>
            <input
              value={shippingSettings.default_origin_zip}
              onChange={(e) =>
                setShippingSettings((c) => ({ ...c, default_origin_zip: e.target.value }))
              }
              placeholder="Origin postal code"
              className="mb-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <input
              value={shippingSettings.default_weight_oz}
              onChange={(e) =>
                setShippingSettings((c) => ({ ...c, default_weight_oz: e.target.value }))
              }
              placeholder="Default package weight (oz)"
              type="number"
              className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <FormField label="USPS account number">
              <input
                value={shippingSettings.usps_account}
                onChange={(e) =>
                  setShippingSettings((c) => ({ ...c, usps_account: e.target.value }))
                }
                placeholder="USPS account number"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <FormField label="UPS account number">
              <input
                value={shippingSettings.ups_account}
                onChange={(e) =>
                  setShippingSettings((c) => ({ ...c, ups_account: e.target.value }))
                }
                placeholder="UPS account number"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <FormField label="FedEx account number">
              <input
                value={shippingSettings.fedex_account}
                onChange={(e) =>
                  setShippingSettings((c) => ({ ...c, fedex_account: e.target.value }))
                }
                placeholder="FedEx account number"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <Button
              variant="accent"
              size="lg"
              onClick={saveShippingSettings}
              disabled={extraSettingsLoading}
              className="mt-3"
            >
              Save shipping defaults
            </Button>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Shipping API (EasyPost)</h4>
            <div className="mb-3 flex items-center gap-4">
              <span className="text-sm text-[var(--ui-body)]">Mode:</span>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="easypost-mode"
                  value="production"
                  checked={easypostSettings.mode === "production"}
                  onChange={() => setEasypostSettings((c) => ({ ...c, mode: "production" }))}
                  className="h-4 w-4"
                />
                <span className={easypostSettings.mode === "production" ? "font-semibold text-[var(--ui-title)]" : "text-[var(--ui-muted)]"}>Production</span>
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="easypost-mode"
                  value="test"
                  checked={easypostSettings.mode === "test"}
                  onChange={() => setEasypostSettings((c) => ({ ...c, mode: "test" }))}
                  className="h-4 w-4"
                />
                <span className={easypostSettings.mode === "test" ? "font-semibold text-[var(--ui-yellow)]" : "text-[var(--ui-muted)]"}>Test</span>
              </label>
              {easypostSettings.mode === "test" && (
                <Badge label="TEST MODE" variant="warning" />
              )}
            </div>
            <FormField label="Production API Key" helpText={easypostConnected ? "Production key is saved. Paste a new key to replace it." : "Paste your EasyPost production API key (starts with EZAK). It will be encrypted."}>
              <input
                value={easypostSettings.api_key}
                onChange={(e) => setEasypostSettings((c) => ({ ...c, api_key: e.target.value }))}
                placeholder={easypostConnected ? "Paste new key to replace current one" : "EZAK..."}
                autoComplete="off"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm font-mono"
              />
              {easypostConnected && !easypostSettings.api_key && (
                <p className="mt-1 text-xs text-[var(--ui-green)]">Production key is configured and saved.</p>
              )}
            </FormField>
            <FormField label="Test API Key" helpText="Paste your EasyPost test API key (starts with EZTEST). Used when mode is set to Test. No real charges.">
              <input
                value={easypostSettings.test_api_key}
                onChange={(e) => setEasypostSettings((c) => ({ ...c, test_api_key: e.target.value }))}
                placeholder="EZTESTxxxxxxxx..."
                autoComplete="off"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm font-mono"
              />
            </FormField>
            <div className="mb-2 flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void testEasypostConnection()}
                disabled={easypostTesting}
                busy={easypostTesting}
              >
                Test connection ({easypostSettings.mode})
              </Button>
              {easypostConnected === true && (
                <span className="text-xs text-[var(--ui-green)]">Connected</span>
              )}
              {easypostConnected === false && (
                <span className="text-xs text-[var(--ui-red)]">Not connected</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Default weight (oz)">
                <input
                  value={easypostSettings.default_weight_oz}
                  onChange={(e) => setEasypostSettings((c) => ({ ...c, default_weight_oz: e.target.value }))}
                  placeholder="12"
                  type="number"
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
              <FormField label="Default length (in)">
                <input
                  value={easypostSettings.default_length_in}
                  onChange={(e) => setEasypostSettings((c) => ({ ...c, default_length_in: e.target.value }))}
                  placeholder="8"
                  type="number"
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
              <FormField label="Default width (in)">
                <input
                  value={easypostSettings.default_width_in}
                  onChange={(e) => setEasypostSettings((c) => ({ ...c, default_width_in: e.target.value }))}
                  placeholder="5"
                  type="number"
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
              <FormField label="Default height (in)">
                <input
                  value={easypostSettings.default_height_in}
                  onChange={(e) => setEasypostSettings((c) => ({ ...c, default_height_in: e.target.value }))}
                  placeholder="5"
                  type="number"
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <FormField label="Label format">
                <select
                  value={easypostSettings.label_format}
                  onChange={(e) => setEasypostSettings((c) => ({ ...c, label_format: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                >
                  <option value="pdf">PDF</option>
                  <option value="png">PNG</option>
                </select>
              </FormField>
              <FormField label="Label size">
                <select
                  value={easypostSettings.label_size}
                  onChange={(e) => setEasypostSettings((c) => ({ ...c, label_size: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                >
                  <option value="4x6">4x6 (thermal)</option>
                  <option value="letter">Letter (8.5x11)</option>
                </select>
              </FormField>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-[var(--ui-body)]">
              <input
                type="checkbox"
                checked={easypostSettings.address_validation === "on"}
                onChange={(e) =>
                  setEasypostSettings((c) => ({
                    ...c,
                    address_validation: e.target.checked ? "on" : "off",
                  }))
                }
                className="h-4 w-4 rounded border-[var(--ui-border)]"
              />
              Validate addresses before rate shopping
            </label>
            <FormField label="Preferred carrier" helpText="Used for batch operations. Leave as Any for best price.">
              <select
                value={easypostSettings.preferred_carrier}
                onChange={(e) => setEasypostSettings((c) => ({ ...c, preferred_carrier: e.target.value }))}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                <option value="">Any</option>
                <option value="USPS">USPS</option>
                <option value="UPS">UPS</option>
                <option value="FedEx">FedEx</option>
                <option value="DHL">DHL</option>
              </select>
            </FormField>
            <FormField label="Preferred service" helpText="e.g. GroundAdvantage, Priority. Leave blank for any.">
              <input
                value={easypostSettings.preferred_service}
                onChange={(e) => setEasypostSettings((c) => ({ ...c, preferred_service: e.target.value }))}
                placeholder="e.g. GroundAdvantage"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <Button
              variant="accent"
              size="lg"
              onClick={() => void saveEasypostSettings()}
              disabled={extraSettingsLoading}
              className="mt-3"
            >
              Save shipping API settings
            </Button>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Tax settings</h4>
            <FormField label="Default sales tax rate" helpText="Percentage, e.g. 8.25 for 8.25%">
              <input
                value={taxSettings.default_rate}
                onChange={(e) => setTaxSettings({ default_rate: e.target.value })}
                placeholder="8.25"
                type="number"
                step="0.01"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <Button
              variant="accent"
              size="lg"
              onClick={saveTaxSettings}
              disabled={extraSettingsLoading}
              className="mt-3"
            >
              Save tax settings
            </Button>
          </div>

          <ChartOfAccountsSection />

          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Item numbering</h4>
            <p className="mb-3 text-xs text-[var(--ui-muted)]">
              Auto-generate item numbers when creating new inventory. Format: PREFIX-0001.
            </p>
            <FormField label="Prefix" helpText="Letters or short code prepended to the sequence number.">
              <input
                value={itemNumberPrefix}
                onChange={(e) => setItemNumberPrefix(e.target.value.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase())}
                placeholder="ITEM"
                maxLength={10}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <FormField label="Padding digits" helpText="Number of digits (2-6). E.g. 4 → 0001, 6 → 000001.">
              <input
                type="number"
                min={2}
                max={6}
                value={itemNumberPadding}
                onChange={(e) => setItemNumberPadding(e.target.value)}
                onBlur={() => {
                  const n = parseInt(itemNumberPadding, 10);
                  if (!Number.isFinite(n) || n < 2) setItemNumberPadding("2");
                  else if (n > 6) setItemNumberPadding("6");
                }}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <div className="mt-2 rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2">
              <p className="text-xs text-[var(--ui-muted)]">Preview</p>
              <p className="mt-0.5 font-mono text-sm text-[var(--ui-title)]">
                {(() => {
                  const prefix = itemNumberPrefix.trim() || "ITEM";
                  const pad = Math.max(2, Math.min(6, parseInt(itemNumberPadding, 10) || 4));
                  return `${prefix}-${"0".repeat(pad - 1)}1`;
                })()}
              </p>
              {nextItemPreview && (
                <p className="mt-1 text-xs text-[var(--ui-green)]">
                  Next item will be: <strong>{nextItemPreview}</strong>
                </p>
              )}
            </div>
            <Button
              variant="accent"
              size="lg"
              onClick={() => void saveItemNumberSettings()}
              disabled={extraSettingsLoading}
              className="mt-3"
            >
              Save item numbering
            </Button>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Order numbering</h4>
            <p className="mb-3 text-xs text-[var(--ui-muted)]">
              Auto-generate order numbers when creating manual orders. Format: PREFIX-0001.
            </p>
            <FormField label="Prefix" helpText="Letters or short code prepended to the sequence number.">
              <input
                value={orderNumberPrefix}
                onChange={(e) => setOrderNumberPrefix(e.target.value.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase())}
                placeholder="ORD"
                maxLength={10}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <FormField label="Padding digits" helpText="Number of digits (2-6). E.g. 4 → 0001, 6 → 000001.">
              <input
                type="number"
                min={2}
                max={6}
                value={orderNumberPadding}
                onChange={(e) => setOrderNumberPadding(e.target.value)}
                onBlur={() => {
                  const n = parseInt(orderNumberPadding, 10);
                  if (!Number.isFinite(n) || n < 2) setOrderNumberPadding("2");
                  else if (n > 6) setOrderNumberPadding("6");
                }}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <div className="mt-2 rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2">
              <p className="text-xs text-[var(--ui-muted)]">Preview</p>
              <p className="mt-0.5 font-mono text-sm text-[var(--ui-title)]">
                {(() => {
                  const prefix = orderNumberPrefix.trim() || "ORD";
                  const pad = Math.max(2, Math.min(6, parseInt(orderNumberPadding, 10) || 4));
                  return `${prefix}-${"0".repeat(pad - 1)}1`;
                })()}
              </p>
              {nextOrderPreview && (
                <p className="mt-1 text-xs text-[var(--ui-green)]">
                  Next order will be: <strong>{nextOrderPreview}</strong>
                </p>
              )}
            </div>
            <Button
              variant="accent"
              size="lg"
              onClick={() => void saveOrderNumberSettings()}
              disabled={extraSettingsLoading}
              className="mt-3"
            >
              Save order numbering
            </Button>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Store categories</h4>
            <p className="mb-3 text-xs text-[var(--ui-muted)]">
              Your internal categories for grouping inventory and reporting.
              One category per line. These appear as a dropdown on each item.
            </p>
            <FormField label="Categories" helpText="One per line. New categories can also be added from the inventory detail panel.">
              <textarea
                value={storeCategories.replace(/,/g, "\n")}
                onChange={(e) => setStoreCategories(e.target.value.replace(/\n/g, ","))}
                placeholder={"Glassware\nJewelry\nKitchen\nArt\nFurniture\nTextiles"}
                rows={6}
                spellCheck
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            {storeCategories.trim() && (
              <p className="mt-1 text-xs text-[var(--ui-muted)]">
                {storeCategories.split(",").filter((s) => s.trim()).length} categories defined
              </p>
            )}
            <Button
              variant="accent"
              size="lg"
              onClick={saveStoreCategories}
              disabled={extraSettingsLoading}
              className="mt-3"
            >
              Save store categories
            </Button>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">
              Etsy categories &amp; attributes
            </h4>
            <p className="mb-3 text-xs text-[var(--ui-muted)]">
              Load Etsy&apos;s category taxonomy and per-category attributes for use in listing creation.
              Attributes are fetched on demand when you select a category in the listing workshop.
            </p>
            {taxonomyLastSync ? (
              <div className="mb-3 space-y-1 text-xs text-[var(--ui-body)]">
                <p>
                  <span className="font-medium text-[var(--ui-title)]">Last sync:</span>{" "}
                  {new Date(taxonomyLastSync).toLocaleString()}
                </p>
                <p>
                  <span className="font-medium text-[var(--ui-title)]">Categories loaded:</span>{" "}
                  {taxonomyNodeCount.toLocaleString()}
                </p>
              </div>
            ) : (
              <p className="mb-3 text-xs text-[var(--ui-yellow)]">
                Categories have not been synced yet. Click the button below to load them from Etsy.
              </p>
            )}
            <Button
              variant="accent"
              size="lg"
              busy={taxonomySyncing}
              onClick={() => void syncTaxonomy()}
            >
              {taxonomyLastSync ? "Refresh Etsy categories" : "Load Etsy categories"}
            </Button>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">
              Display preferences
            </h4>
            <FormField label="Date format">
              <select
                value={displaySettings.date_format}
                onChange={(e) => setDisplaySettings((c) => ({ ...c, date_format: e.target.value }))}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                {["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"].map((fmt) => (
                  <option key={fmt} value={fmt}>
                    {fmt}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Currency">
              <select
                value={displaySettings.currency_code}
                onChange={(e) =>
                  setDisplaySettings((c) => ({ ...c, currency_code: e.target.value }))
                }
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                {["USD", "CAD", "GBP", "EUR", "AUD"].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Records per page">
              <select
                value={displaySettings.page_size}
                onChange={(e) => setDisplaySettings((c) => ({ ...c, page_size: e.target.value }))}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                {["10", "25", "50", "100"].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Timezone">
              <select
                value={displaySettings.timezone}
                onChange={(e) => setDisplaySettings((c) => ({ ...c, timezone: e.target.value }))}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                {(() => {
                  let allTimezones: string[];
                  try {
                    allTimezones = Intl.supportedValuesOf("timeZone");
                  } catch {
                    allTimezones = [...COMMON_TIMEZONES];
                  }
                  if (!allTimezones.includes(displaySettings.timezone)) {
                    allTimezones = [displaySettings.timezone, ...allTimezones];
                  }
                  return allTimezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </option>
                  ));
                })()}
              </select>
            </FormField>
            <FormField label="First day of week" helpText="Used for calendar displays and weekly reports.">
              <select
                value={displaySettings.first_day_of_week}
                onChange={(e) => setDisplaySettings((c) => ({ ...c, first_day_of_week: e.target.value }))}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="6">Saturday</option>
              </select>
            </FormField>
            <FormField label="Fiscal year" helpText="Calendar year ends Dec 31. Fiscal lets you set a custom year-end date for reports.">
              <select
                value={displaySettings.fiscal_year_type}
                onChange={(e) => setDisplaySettings((c) => ({ ...c, fiscal_year_type: e.target.value }))}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                <option value="calendar">Calendar year (Jan 1 – Dec 31)</option>
                <option value="fiscal">Fiscal year (custom end date)</option>
              </select>
            </FormField>
            {displaySettings.fiscal_year_type === "fiscal" && (
              <div className="rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                <p className="mb-2 text-xs font-medium text-[var(--ui-title)]">Fiscal year-end date</p>
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Month">
                    <select
                      value={displaySettings.fiscal_year_end_month}
                      onChange={(e) => setDisplaySettings((c) => ({ ...c, fiscal_year_end_month: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    >
                      <option value="1">January</option>
                      <option value="2">February</option>
                      <option value="3">March</option>
                      <option value="4">April</option>
                      <option value="5">May</option>
                      <option value="6">June</option>
                      <option value="7">July</option>
                      <option value="8">August</option>
                      <option value="9">September</option>
                      <option value="10">October</option>
                      <option value="11">November</option>
                      <option value="12">December</option>
                    </select>
                  </FormField>
                  <FormField label="Day">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={displaySettings.fiscal_year_end_day}
                      onChange={(e) => setDisplaySettings((c) => ({ ...c, fiscal_year_end_day: e.target.value }))}
                      onBlur={() => {
                        const d = parseInt(displaySettings.fiscal_year_end_day, 10);
                        if (!Number.isFinite(d) || d < 1) setDisplaySettings((c) => ({ ...c, fiscal_year_end_day: "1" }));
                        else if (d > 31) setDisplaySettings((c) => ({ ...c, fiscal_year_end_day: "31" }));
                      }}
                      className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                  </FormField>
                </div>
                <p className="mt-2 text-xs text-[var(--ui-muted)]">
                  Fiscal year ends on{" "}
                  {new Date(2000, parseInt(displaySettings.fiscal_year_end_month, 10) - 1, parseInt(displaySettings.fiscal_year_end_day, 10) || 1)
                    .toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                  . Reports will use this as the year boundary.
                </p>
              </div>
            )}
            <FormField label="Repeat customer threshold" helpText="Number of orders before a customer gets the Repeat badge.">
              <input
                type="number"
                min={2}
                max={50}
                value={repeatCustomerThreshold}
                onChange={(e) => setRepeatCustomerThreshold(e.target.value)}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <FormField label="Activity log retention (days)" helpText="Entries older than this are purged on startup.">
              <input
                type="number"
                min={1}
                max={9999}
                value={activityRetentionDays}
                onChange={(e) => setActivityRetentionDays(e.target.value)}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <Button
              variant="accent"
              size="lg"
              onClick={saveDisplaySettings}
              disabled={extraSettingsLoading}
              className="mt-3"
            >
              Save display preferences
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold">AI settings</h4>
            <p className="mb-2 text-xs text-[var(--ui-muted)]">
              Required for <strong>Add New Item</strong> AI research and listing generation.
            </p>
            <FormField label="Model" helpText="OpenAI model name (e.g. gpt-4.1-mini)" required error={aiFieldErrors.model}>
              <input
                value={aiConfig?.model ?? ""}
                onChange={(e) => {
                  setAiFieldErrors((prev) => { const { model: _, ...rest } = prev; return rest; });
                  setAiConfig((current) => ({
                    provider: current?.provider ?? "openai",
                    model: e.target.value,
                    baseUrl: current?.baseUrl ?? null,
                    timeoutMs: current?.timeoutMs ?? 30000,
                    retryCount: current?.retryCount ?? 1,
                    tokenBudget: current?.tokenBudget ?? 2000,
                    apiKeyConfigured: current?.apiKeyConfigured ?? false,
                  }));
                }}
                placeholder="gpt-4.1-mini"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <FormField label="API key" helpText="Your OpenAI API key (stored encrypted)" required error={aiFieldErrors.apiKey}>
              <input
                value={aiApiKeyDraft}
                onChange={(e) => {
                  setAiFieldErrors((prev) => { const { apiKey: _, ...rest } = prev; return rest; });
                  setAiApiKeyDraft(e.target.value);
                }}
                placeholder={aiConfig?.apiKeyConfigured ? "••••••••  (saved — enter new key to replace)" : "sk-..."}
                type="password"
                autoComplete="off"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
              {aiConfig?.apiKeyConfigured && !aiApiKeyDraft && !aiFieldErrors.apiKey && (
                <p className="mt-1 text-xs text-[var(--ui-green)]">API key is configured.</p>
              )}
            </FormField>
            <FormField label="Base URL" helpText="Custom API endpoint. Leave blank for default OpenAI.">
              <input
                value={aiConfig?.baseUrl ?? ""}
                onChange={(e) =>
                  setAiConfig((c) =>
                    c ? { ...c, baseUrl: e.target.value || null } : c
                  )
                }
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <div className="grid grid-cols-3 gap-2">
              <FormField label="Timeout (sec)" helpText="5–120 seconds" error={aiFieldErrors.timeout}>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={Math.round((aiConfig?.timeoutMs ?? 30000) / 1000)}
                  onChange={(e) => {
                    setAiFieldErrors((prev) => { const { timeout: _, ...rest } = prev; return rest; });
                    const raw = parseInt(e.target.value, 10);
                    if (Number.isNaN(raw)) return;
                    setAiConfig((c) => c ? { ...c, timeoutMs: raw * 1000 } : c);
                  }}
                  onBlur={() => {
                    const secs = Math.round((aiConfig?.timeoutMs ?? 30000) / 1000);
                    const clamped = Math.max(5, Math.min(120, secs));
                    if (clamped !== secs) setAiConfig((c) => c ? { ...c, timeoutMs: clamped * 1000 } : c);
                  }}
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
              <FormField label="Retries" helpText="1–5 attempts" error={aiFieldErrors.retries}>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={aiConfig?.retryCount ?? 1}
                  onChange={(e) => {
                    setAiFieldErrors((prev) => { const { retries: _, ...rest } = prev; return rest; });
                    const raw = parseInt(e.target.value, 10);
                    if (Number.isNaN(raw)) return;
                    setAiConfig((c) => c ? { ...c, retryCount: raw } : c);
                  }}
                  onBlur={() => {
                    const n = aiConfig?.retryCount ?? 1;
                    const clamped = Math.max(1, Math.min(5, n));
                    if (clamped !== n) setAiConfig((c) => c ? { ...c, retryCount: clamped } : c);
                  }}
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
              <FormField label="Max tokens" helpText="100–16,000" error={aiFieldErrors.tokens}>
                <input
                  type="number"
                  min={100}
                  max={16000}
                  step={100}
                  value={aiConfig?.tokenBudget ?? 2000}
                  onChange={(e) => {
                    setAiFieldErrors((prev) => { const { tokens: _, ...rest } = prev; return rest; });
                    const raw = parseInt(e.target.value, 10);
                    if (Number.isNaN(raw)) return;
                    setAiConfig((c) => c ? { ...c, tokenBudget: raw } : c);
                  }}
                  onBlur={() => {
                    const n = aiConfig?.tokenBudget ?? 2000;
                    const clamped = Math.max(100, Math.min(16000, n));
                    if (clamped !== n) setAiConfig((c) => c ? { ...c, tokenBudget: clamped } : c);
                  }}
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="accent" size="lg" onClick={saveAiSettings} busy={saving}>
                Save AI settings
              </Button>
              <Button variant="secondary" size="lg" onClick={testAiSettings} disabled={saving}>
                Test connection
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Publish defaults</h4>
            <p className="mb-2 text-xs text-[var(--ui-muted)]">
              Etsy listing defaults applied when publishing approved drafts.
            </p>
            <p className="mb-3 text-xs text-[var(--ui-yellow)]">
              Per-item overrides on inventory records take precedence at publish time.
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <FormField label="Default Taxonomy ID" helpText="Etsy category ID for your listings" required>
                <input
                  value={publishConfig.taxonomyId}
                  onChange={(e) => setPublishConfig((c) => ({ ...c, taxonomyId: e.target.value }))}
                  placeholder="e.g. 1074"
                  type="number"
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
              <FormField label="Shipping profile ID" helpText="From Etsy shop settings" required>
                <input
                  value={publishConfig.shippingProfileId}
                  onChange={(e) =>
                    setPublishConfig((c) => ({ ...c, shippingProfileId: e.target.value }))
                  }
                  placeholder="From Etsy shop settings"
                  type="number"
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
              <FormField label="Return policy ID" helpText="From Etsy shop settings" required>
                <input
                  value={publishConfig.returnPolicyId}
                  onChange={(e) =>
                    setPublishConfig((c) => ({ ...c, returnPolicyId: e.target.value }))
                  }
                  placeholder="From Etsy shop settings"
                  type="number"
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
              <FormField label="Who made" required>
                <select
                  value={publishConfig.whoMade || "someone_else"}
                  onChange={(e) => setPublishConfig((c) => ({ ...c, whoMade: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                >
                  <option value="i_did">I did</option>
                  <option value="someone_else">Someone else</option>
                  <option value="collective">A member of my shop</option>
                </select>
              </FormField>
              <FormField label="When made" required>
                <select
                  value={publishConfig.whenMade || "2010_2019"}
                  onChange={(e) => setPublishConfig((c) => ({ ...c, whenMade: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                >
                  <option value="made_to_order">Made to order</option>
                  <option value="2020_2026">2020–2026</option>
                  <option value="2010_2019">2010–2019</option>
                  <option value="2004_2009">2004–2009</option>
                  <option value="2000_2003">2000–2003</option>
                  <option value="1990s">1990s</option>
                  <option value="1980s">1980s</option>
                  <option value="1970s">1970s</option>
                  <option value="1960s">1960s</option>
                  <option value="1950s">1950s</option>
                  <option value="1940s">1940s</option>
                  <option value="1930s">1930s</option>
                  <option value="1920s">1920s</option>
                  <option value="1910s">1910s</option>
                  <option value="1900s">1900s</option>
                  <option value="1800s">1800s</option>
                  <option value="1700s">1700s</option>
                  <option value="before_1700">Before 1700</option>
                </select>
              </FormField>
              <FormField label="Max image dimension (px)">
                <input
                  value={publishConfig.imageMaxDimension}
                  onChange={(e) =>
                    setPublishConfig((c) => ({ ...c, imageMaxDimension: e.target.value }))
                  }
                  placeholder="2000"
                  type="number"
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
              <FormField label="JPEG quality (1–100)">
                <input
                  value={publishConfig.imageJpegQuality}
                  onChange={(e) =>
                    setPublishConfig((c) => ({ ...c, imageJpegQuality: e.target.value }))
                  }
                  placeholder="82"
                  type="number"
                  min="1"
                  max="100"
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
              <FormField label="Image target DPI" helpText="Target resolution for uploaded images.">
                <input
                  value={publishConfig.imageTargetDpi}
                  onChange={(e) =>
                    setPublishConfig((c) => ({ ...c, imageTargetDpi: e.target.value }))
                  }
                  placeholder="300"
                  type="number"
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
              <FormField label="Image upload retries" helpText="Number of upload attempts per image.">
                <input
                  value={publishConfig.imageUploadAttempts}
                  onChange={(e) =>
                    setPublishConfig((c) => ({ ...c, imageUploadAttempts: e.target.value }))
                  }
                  placeholder="3"
                  type="number"
                  min="1"
                  max="10"
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-[var(--ui-body)]">
              <input
                type="checkbox"
                checked={publishConfig.allowPartialImageUpload === "true"}
                onChange={(e) =>
                  setPublishConfig((c) => ({
                    ...c,
                    allowPartialImageUpload: e.target.checked ? "true" : "false",
                  }))
                }
                className="h-4 w-4 rounded border-[var(--ui-border)]"
              />
              Allow partial image upload (publish even if some images fail)
            </label>
            <div className="mt-3">
              <FormField
                label="Minimum listing quality score"
                helpText="Listings must reach this score before they can be approved for publishing to Etsy. Set 0 to disable the gate."
                required
              >
                <input
                  value={publishConfig.minQualityScore}
                  onChange={(e) =>
                    setPublishConfig((c) => ({ ...c, minQualityScore: e.target.value }))
                  }
                  placeholder="80"
                  type="number"
                  min="0"
                  max="100"
                  className="w-full max-w-[8rem] rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </FormField>
            </div>
            <div className="mt-3 rounded border border-[var(--ui-yellow)]/30 bg-[var(--ui-yellow)]/5 p-3">
              <label className="flex items-center gap-2 text-sm text-[var(--ui-body)]">
                <input
                  type="checkbox"
                  checked={publishConfig.developerMode === "true"}
                  onChange={(e) =>
                    setPublishConfig((c) => ({
                      ...c,
                      developerMode: e.target.checked ? "true" : "false",
                    }))
                  }
                  className="h-4 w-4 rounded border-[var(--ui-border)]"
                />
                Developer Mode
              </label>
              <p className="mt-1 text-xs text-[var(--ui-muted)]">
                When enabled, publish creates a draft listing on Etsy without activating it.
                Use during development and testing to avoid accidental live listings.
              </p>
            </div>
            <Button
              variant="accent"
              size="lg"
              onClick={savePublishSettings}
              disabled={saving}
              className="mt-3"
            >
              Save publish defaults
            </Button>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold">Icons and sizing</h4>
            <p className="mb-2 text-xs text-[var(--ui-muted)]">
              Use `/icons/...` paths for bundled install-safe assets.
            </p>
            <input
              value={iconConfig.screenHeaderPath}
              onChange={(e) => setIconConfig((c) => ({ ...c, screenHeaderPath: e.target.value }))}
              placeholder="/icons/screen-header.png"
              className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <input
              value={iconConfig.screenHeaderSizePx}
              onChange={(e) => setIconConfig((c) => ({ ...c, screenHeaderSizePx: e.target.value }))}
              placeholder="Screen icon size px"
              className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <input
              value={iconConfig.reportHeaderPath}
              onChange={(e) => setIconConfig((c) => ({ ...c, reportHeaderPath: e.target.value }))}
              placeholder="/icons/report-header.png"
              className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <input
              value={iconConfig.reportHeaderWidthPx}
              onChange={(e) =>
                setIconConfig((c) => ({ ...c, reportHeaderWidthPx: e.target.value }))
              }
              placeholder="Report icon width px"
              className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <Button variant="secondary" size="lg" onClick={saveIconSettings} disabled={saving} className="mt-2">
              Save icon settings
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Content &amp; paths</h4>
            <p className="mb-3 text-xs text-[var(--ui-muted)]">
              URLs and folder paths used by picture and tutorial features.
            </p>
            <FormField label="Why pictures matter URL" helpText="Link displayed near image upload areas.">
              <input
                value={picturesMatterUrl}
                onChange={(e) => setPicturesMatterUrl(e.target.value)}
                placeholder="https://example.com/why-pictures-matter"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <FormField label="Thumbnail size (px)" helpText="Max dimension for auto-generated thumbnails (100–400).">
              <input
                value={thumbnailSize}
                onChange={(e) => setThumbnailSize(e.target.value)}
                placeholder="200"
                type="number"
                min={100}
                max={400}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <FormField label="Custom tutorial tips folder" helpText="Folder path for additional user-created tips content.">
              <input
                value={tutorialFolderPath}
                onChange={(e) => setTutorialFolderPath(e.target.value)}
                placeholder="./system/tips"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </FormField>
            <Button
              variant="accent"
              size="lg"
              onClick={savePicturesAndTutorialSettings}
              disabled={extraSettingsLoading}
              className="mt-3"
            >
              Save content settings
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
          <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Sample Data</h4>
          <p className="mb-3 text-xs text-[var(--ui-muted)]">
            Load example inventory, customers, and orders to explore the application.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="accent"
              size="lg"
              onClick={() => setLoadSampleConfirm(true)}
              disabled={sampleDataBusy || sampleDataLoaded === true}
            >
              Load Sample Data
            </Button>
            {sampleDataLoaded ? (
              <Button
                variant="danger"
                size="lg"
                onClick={() => setRemoveSampleConfirm(true)}
                disabled={sampleDataBusy}
              >
                Remove Sample Data
              </Button>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-[var(--ui-muted)]">
            {sampleDataLoaded === null
              ? "Checking sample data status…"
              : sampleDataLoaded
                ? "Sample data is loaded."
                : "No sample data loaded."}
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-[var(--ui-title)]">API Usage</h4>
              <p className="text-xs text-[var(--ui-muted)]">
                External API calls per service per month (last 6 months).
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadApiUsage()}
                disabled={apiUsageLoading}
              >
                Refresh
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setPurgeUsageConfirm(true)}
                disabled={apiUsageLoading || apiUsage.length === 0}
              >
                Purge
              </Button>
            </div>
          </div>
          {apiUsageLoading ? (
            <p className="text-sm text-[var(--ui-muted)]">Loading usage data…</p>
          ) : apiUsage.length === 0 && sessionHours.length === 0 ? (
            <p className="text-sm text-[var(--ui-muted)]">No API usage recorded yet.</p>
          ) : (
            <>
              {apiUsage.length > 0 && (
                <div className="overflow-x-auto">
                  <p className="mb-1 text-xs font-semibold text-[var(--ui-muted)]">API Calls</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--ui-border)] text-left text-xs text-[var(--ui-muted)]">
                        <th className="pb-2 pr-4">Month</th>
                        {Array.from(new Set(apiUsage.map((r) => r.service)))
                          .sort()
                          .map((svc) => (
                            <th key={svc} className="pb-2 pr-4 capitalize">
                              {svc}
                            </th>
                          ))}
                        <th className="pb-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const services = Array.from(new Set(apiUsage.map((r) => r.service))).sort();
                        const months = Array.from(new Set(apiUsage.map((r) => r.month))).sort(
                          (a, b) => b.localeCompare(a)
                        );
                        const currentMonth = new Date().toISOString().slice(0, 7);
                        return months.map((month) => {
                          const rowTotal = apiUsage
                            .filter((r) => r.month === month)
                            .reduce((sum, r) => sum + r.call_count, 0);
                          return (
                            <tr
                              key={month}
                              className={`border-b border-[var(--ui-border)] ${month === currentMonth ? "bg-[var(--ui-card-bg)]" : ""}`}
                            >
                              <td className="py-2 pr-4 font-mono text-[var(--ui-body)]">
                                {month}
                                {month === currentMonth && (
                                  <span className="ml-2 text-xs text-[var(--ui-green)]">current</span>
                                )}
                              </td>
                              {services.map((svc) => {
                                const row = apiUsage.find(
                                  (r) => r.month === month && r.service === svc
                                );
                                return (
                                  <td key={svc} className="py-2 pr-4 tabular-nums text-[var(--ui-body)]">
                                    {row ? row.call_count.toLocaleString() : "—"}
                                  </td>
                                );
                              })}
                              <td className="py-2 font-semibold tabular-nums text-[var(--ui-title)]">
                                {rowTotal.toLocaleString()}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}

              {sessionHours.length > 0 && (
                <div className={`overflow-x-auto${apiUsage.length > 0 ? " mt-4 border-t border-[var(--ui-border)] pt-3" : ""}`}>
                  <p className="mb-1 text-xs font-semibold text-[var(--ui-muted)]">Connected Hours</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--ui-border)] text-left text-xs text-[var(--ui-muted)]">
                        <th className="pb-2 pr-4">Month</th>
                        {Array.from(new Set(sessionHours.map((r) => r.service)))
                          .sort()
                          .map((svc) => (
                            <th key={svc} className="pb-2 pr-4 capitalize">
                              {svc} (hrs)
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const services = Array.from(new Set(sessionHours.map((r) => r.service))).sort();
                        const months = Array.from(new Set(sessionHours.map((r) => r.month))).sort(
                          (a, b) => b.localeCompare(a)
                        );
                        const currentMonth = new Date().toISOString().slice(0, 7);
                        return months.map((month) => (
                          <tr
                            key={month}
                            className={`border-b border-[var(--ui-border)] ${month === currentMonth ? "bg-[var(--ui-card-bg)]" : ""}`}
                          >
                            <td className="py-2 pr-4 font-mono text-[var(--ui-body)]">
                              {month}
                              {month === currentMonth && (
                                <span className="ml-2 text-xs text-[var(--ui-green)]">current</span>
                              )}
                            </td>
                            {services.map((svc) => {
                              const row = sessionHours.find(
                                (r) => r.month === month && r.service === svc
                              );
                              return (
                                <td key={svc} className="py-2 pr-4 tabular-nums text-[var(--ui-body)]">
                                  {row ? row.total_hours.toLocaleString() : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div
          id="backup-restore"
          className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-[var(--ui-title)]">Backup and restore</h4>
              <p className="text-xs text-[var(--ui-muted)]">
                Local SQLite backups (ADR-027). Rolling retention keeps recent copies.
              </p>
            </div>
            <Button variant="accent" size="lg" onClick={createBackup} disabled={backupLoading}>
              Backup now
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <FormField label="Automatic backup">
              <select
                value={backupSchedule}
                onChange={(e) => setBackupSchedule(e.target.value)}
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]"
              >
                <option value="manual">Manual only</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </FormField>
            {(backupSchedule === "daily" || backupSchedule === "weekly") && (
              <FormField label="Backup time">
                <input
                  type="time"
                  value={backupTime}
                  onChange={(e) => setBackupTime(e.target.value)}
                  className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]"
                />
              </FormField>
            )}
            {backupSchedule === "weekly" && (
              <FormField label="Backup day">
                <select
                  value={backupDay}
                  onChange={(e) => setBackupDay(e.target.value)}
                  className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]"
                >
                  <option value="0">Sunday</option>
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                </select>
              </FormField>
            )}
            <Button
              variant="secondary"
              size="lg"
              onClick={() =>
                void saveSettingsKeys(
                  [
                    { key: "backup_schedule", value: backupSchedule },
                    { key: "backup_time", value: backupTime },
                    { key: "backup_day", value: backupDay },
                  ],
                  "Backup schedule saved",
                  backupSchedule === "manual"
                    ? "Backups will run only when you choose Backup now."
                    : `Automatic ${backupSchedule} backups run while the app is open.`
                )
              }
              disabled={extraSettingsLoading}
            >
              Save schedule
            </Button>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField label="Backup directory">
              <input
                value={backupDirectory}
                onChange={(e) => setBackupDirectory(e.target.value)}
                placeholder="./backups"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]"
              />
            </FormField>
            <FormField label="Max backups to keep">
              <input
                type="number"
                min={1}
                max={100}
                value={backupMaxCount}
                onChange={(e) => setBackupMaxCount(e.target.value)}
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]"
              />
            </FormField>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-xs text-[var(--ui-muted)]">
                <input
                  type="checkbox"
                  checked={backupIncludePictures}
                  onChange={(e) => setBackupIncludePictures(e.target.checked)}
                />
                Include pictures in backup
              </label>
              <p className="mt-1 text-xs text-[var(--ui-muted)]">
                Include uploaded photos in backup (increases backup size)
              </p>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="lg"
              onClick={() =>
                void saveSettingsKeys(
                  [
                    { key: "backup_directory", value: backupDirectory },
                    { key: "backup_max_count", value: backupMaxCount },
                    { key: "backup_include_pictures", value: backupIncludePictures ? "true" : "false" },
                  ],
                  "Backup settings saved",
                  "Backup directory, retention, and picture settings were updated."
                )
              }
              disabled={extraSettingsLoading}
            >
              Save backup settings
            </Button>
            {lastBackupAt && (
              <p className="text-xs text-[var(--ui-muted)]">
                Last backup: {formatConnectionTimestamp(lastBackupAt)}
              </p>
            )}
          </div>

          {backupLoading && backups.length === 0 ? (
            <p className="text-sm text-[var(--ui-muted)]">Loading backups…</p>
          ) : backups.length === 0 ? (
            <p className="text-sm text-[var(--ui-muted)]">No backups yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--ui-border)] text-[var(--ui-muted)]">
                    <th className="py-2 pr-3 font-medium">File</th>
                    <th className="py-2 pr-3 font-medium">Created</th>
                    <th className="py-2 pr-3 font-medium">Size</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr key={backup.filename} className="border-b border-[var(--ui-border)]/60">
                      <td className="py-2 pr-3 text-[var(--ui-body)]">{backup.filename}</td>
                      <td className="py-2 pr-3 text-[var(--ui-muted)]">{backup.created_at}</td>
                      <td className="py-2 pr-3 text-[var(--ui-muted)]">
                        {formatBytes(backup.size_bytes)}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={`/api/backup/${encodeURIComponent(backup.filename)}`}
                            download
                            className="rounded border border-[var(--ui-border)] px-2 py-1 text-xs text-[var(--ui-body)] hover:bg-[var(--ui-border)]"
                          >
                            Download
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRestoreTarget(backup.filename)}
                            disabled={backupLoading}
                          >
                            Restore
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setDeleteTarget(backup.filename)}
                            disabled={backupLoading}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 border-t border-[var(--ui-border)] pt-3">
            <h4 className="mb-1 text-sm font-semibold text-[var(--ui-title)]">Database integrity</h4>
            <p className="mb-2 text-xs text-[var(--ui-muted)]">
              Run a full integrity check on the SQLite database. This verifies all tables and indexes are intact.
            </p>
            <div className="mb-3 space-y-1 text-xs text-[var(--ui-body)]">
              <p>
                <span className="font-medium text-[var(--ui-title)]">Last check:</span>{" "}
                {lastIntegrityCheck ? new Date(lastIntegrityCheck).toLocaleString() : "Never"}
              </p>
              {integrityWarning && (
                <p className="text-[var(--ui-red)]">
                  <span className="font-medium">Warning:</span> {integrityWarning}
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              size="lg"
              onClick={async () => {
                try {
                  const res = await fetch("/api/settings/integrity-check", {
                    method: "POST",
                    headers: { Accept: "application/json" },
                  });
                  const data = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    result?: string;
                    details?: string[];
                  };
                  if (!res.ok) throw data;
                  setLastIntegrityCheck(new Date().toISOString());
                  if (data.result === "ok") {
                    setIntegrityWarning(null);
                    setError({
                      title: "Database is healthy",
                      message: "Integrity check passed — all tables and indexes are intact.",
                      actions: [],
                    });
                  } else {
                    const warning = (data.details ?? []).join("; ");
                    setIntegrityWarning(warning);
                    setError({
                      title: "Integrity issues found",
                      message: `The integrity check found problems: ${warning}`,
                      actions: ["Consider restoring from a recent backup."],
                    });
                  }
                } catch (err) {
                  setApiError(
                    "Integrity check failed",
                    "We could not run the database integrity check.",
                    err
                  );
                }
              }}
            >
              Run integrity check
            </Button>
          </div>
        </div>

        <ConfirmDialog
          open={!!restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onConfirm={() => {
            if (restoreTarget) void restoreBackup(restoreTarget);
          }}
          title="Restore backup?"
          description={`This replaces your current database with "${restoreTarget ?? ""}". A safety backup is created automatically before restoring.`}
          confirmLabel="Restore"
          confirmVariant="danger"
          busy={backupLoading}
        />
        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget) {
              void deleteBackup(deleteTarget);
              setDeleteTarget(null);
            }
          }}
          title="Delete backup?"
          description={`"${deleteTarget ?? ""}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          busy={backupLoading}
        />
        <ConfirmDialog
          open={disconnectOpen}
          onClose={() => setDisconnectOpen(false)}
          onConfirm={() => {
            setDisconnectOpen(false);
            logout();
            void loadEtsyConnectionInfo();
          }}
          title="Disconnect Etsy?"
          description="This will clear your Etsy tokens. You will need to reconnect to sync orders or publish listings."
          confirmLabel="Disconnect"
          confirmVariant="danger"
        />
        <ConfirmDialog
          open={purgeUsageConfirm}
          onClose={() => setPurgeUsageConfirm(false)}
          onConfirm={async () => {
            setPurgeUsageConfirm(false);
            try {
              const res = await fetch("/api/usage", {
                method: "DELETE",
                headers: { Accept: "application/json" },
              });
              const data = (await res.json().catch(() => ({}))) as { deleted?: number };
              if (!res.ok) throw data;
              setApiUsage([]);
              setSessionHours([]);
              setError({
                title: "API usage purged",
                message: `${data.deleted ?? 0} records deleted.`,
                actions: [],
              });
            } catch (err) {
              setApiError("Purge failed", "Could not purge API usage data.", err);
            }
          }}
          title="Purge API usage data?"
          description="All API call history will be permanently deleted. This cannot be undone."
          confirmLabel="Purge"
          confirmVariant="danger"
        />
        <ConfirmDialog
          open={loadSampleConfirm}
          onClose={() => setLoadSampleConfirm(false)}
          onConfirm={() => void loadSampleData()}
          title="Load Sample Data?"
          description="This will add sample items, customers, and orders. Your existing data will not be affected."
          confirmLabel="Load Sample Data"
          busy={sampleDataBusy}
        />
        <ConfirmDialog
          open={removeSampleConfirm}
          onClose={() => setRemoveSampleConfirm(false)}
          onConfirm={() => void removeSampleData()}
          title="Remove sample data?"
          description="All SAMPLE- prefixed records will be deleted. Your real data is not affected."
          confirmLabel="Remove Sample Data"
          confirmVariant="danger"
          busy={sampleDataBusy}
        />
      </section>
    </>
  );
}
