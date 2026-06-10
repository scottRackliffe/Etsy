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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { ShippingInfoSection } from "@/components/config/ShippingInfoSection";
import { useProgressOperation } from "@/hooks/useProgressOperation";
import type { ApiErrorShape, AiConfig } from "@/types";

type EtsyConnectionInfo = {
  redirect_uri: string | null;
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
};

type TaxSettings = {
  default_rate: string;
};

type DisplaySettings = {
  date_format: string;
  currency_code: string;
  page_size: string;
};

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
  const [sampleDataBusy, setSampleDataBusy] = useState(false);
  const [sampleDataLoaded, setSampleDataLoaded] = useState<boolean | null>(null);
  const [loadSampleConfirm, setLoadSampleConfirm] = useState(false);
  const [removeSampleConfirm, setRemoveSampleConfirm] = useState(false);
  const [shippingSettings, setShippingSettings] = useState<ShippingSettings>({
    default_carrier: "USPS",
    default_origin_zip: "",
    default_weight_oz: "",
  });
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({ default_rate: "" });
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>({
    date_format: "MM/DD/YYYY",
    currency_code: "USD",
    page_size: "25",
  });
  const [backupSchedule, setBackupSchedule] = useState("manual");
  const [autoSyncInterval, setAutoSyncInterval] = useState<AutoSyncInterval>("off");
  const [extraSettingsLoading, setExtraSettingsLoading] = useState(false);
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
        items?: Array<{ key: string; value: string }>;
      };
      if (!response.ok) throw data;
      const map = new Map((data.items ?? []).map((row) => [row.key, row.value]));
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
      setShippingSettings({
        default_carrier: map.get("shipping.default_carrier") ?? "USPS",
        default_origin_zip: map.get("shipping.default_origin_zip") ?? "",
        default_weight_oz: map.get("shipping.default_weight_oz") ?? "",
      });
      setTaxSettings({ default_rate: map.get("tax.default_rate") ?? "" });
      setDisplaySettings({
        date_format: map.get("ui.date_format") ?? "MM/DD/YYYY",
        currency_code: map.get("ui.currency_code") ?? "USD",
        page_size: map.get("ui.page_size") ?? "25",
      });
      setBackupSchedule(map.get("backup_schedule") ?? "manual");
      setAutoSyncInterval(parseAutoSyncInterval(map.get("sync.auto_interval")));
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
          },
          taxSettings: { default_rate: map.get("tax.default_rate") ?? "" },
          displaySettings: {
            date_format: map.get("ui.date_format") ?? "MM/DD/YYYY",
            currency_code: map.get("ui.currency_code") ?? "USD",
            page_size: map.get("ui.page_size") ?? "25",
          },
          backupSchedule: map.get("backup_schedule") ?? "manual",
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
      for (const key of BUSINESS_KEYS) {
        const response = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ value: businessProfile[key] }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        if (!response.ok) throw data;
      }
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

  const saveSettingsKeys = async (
    updates: Array<{ key: string; value: string }>,
    successTitle: string,
    successMessage: string
  ) => {
    setExtraSettingsLoading(true);
    try {
      for (const update of updates) {
        const response = await fetch(`/api/settings/${encodeURIComponent(update.key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ value: update.value }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        if (!response.ok) throw data;
      }
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
      ],
      "Shipping defaults saved",
      "Default carrier and package settings were updated."
    );

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
      ],
      "Display preferences saved",
      "Date format, currency, and page size were updated."
    );

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
        items_created?: number;
        customers_created?: number;
        orders_created?: number;
      };
      if (!response.ok) throw data;
      setSampleDataLoaded(true);
      setLoadSampleConfirm(false);
      setError({
        title: "Sample data loaded",
        message: `Added ${data.items_created ?? 0} items, ${data.customers_created ?? 0} customers, and ${data.orders_created ?? 0} orders.`,
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
          setError({
            title: "Backup restored",
            message: `Restored from ${filename}. A safety backup was saved as ${data.pre_restore_backup ?? "pre-restore backup"}.`,
            actions: ["Refresh the page to load restored data."],
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

  const saveAiSettings = async () => {
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
        { key: "etsy.publish.taxonomy_id", value: publishConfig.taxonomyId.trim() },
        { key: "etsy.publish.shipping_profile_id", value: publishConfig.shippingProfileId.trim() },
        { key: "etsy.publish.readiness_state_id", value: publishConfig.readinessStateId.trim() },
        { key: "etsy.publish.image_ids", value: publishConfig.imageIds.trim() },
        { key: "etsy.publish.who_made", value: publishConfig.whoMade.trim() || "i_did" },
        { key: "etsy.publish.when_made", value: publishConfig.whenMade.trim() || "before_2000" },
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
              Used on invoices, thank-you notes, and report headers.
            </p>
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
            <button
              type="button"
              onClick={saveBusinessProfile}
              disabled={businessLoading}
              className="mt-3 rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {businessLoading ? "Saving…" : "Save business profile"}
            </button>
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
                  <button
                    type="button"
                    onClick={saveAutoSyncSettings}
                    disabled={extraSettingsLoading}
                    className="rounded-lg border border-[var(--ui-border)] px-2 py-1.5 text-xs disabled:opacity-60"
                  >
                    Save auto-sync
                  </button>
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
              <button
                type="button"
                onClick={connect}
                className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white"
              >
                {shops.length ? "Reconnect Etsy" : "Connect Etsy"}
              </button>
              {shops.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setDisconnectOpen(true)}
                  className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-neutral)] px-3 py-2 text-sm text-[var(--ui-body)]"
                >
                  Disconnect
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void loadEtsyConnectionInfo()}
                disabled={etsyInfoLoading}
                className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
              >
                Refresh
              </button>
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
            <label className="mb-2 block text-xs text-[var(--ui-muted)]">
              Default carrier
              <select
                value={shippingSettings.default_carrier}
                onChange={(e) =>
                  setShippingSettings((c) => ({ ...c, default_carrier: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                {["USPS", "UPS", "FedEx", "DHL", "Other"].map((carrier) => (
                  <option key={carrier} value={carrier}>
                    {carrier}
                  </option>
                ))}
              </select>
            </label>
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
            <button
              type="button"
              onClick={saveShippingSettings}
              disabled={extraSettingsLoading}
              className="mt-3 rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save shipping defaults
            </button>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Tax settings</h4>
            <label className="block text-xs text-[var(--ui-muted)]">
              Default sales tax rate (decimal, e.g. 0.0825 = 8.25%)
              <input
                value={taxSettings.default_rate}
                onChange={(e) => setTaxSettings({ default_rate: e.target.value })}
                placeholder="0.0825"
                type="number"
                step="0.0001"
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={saveTaxSettings}
              disabled={extraSettingsLoading}
              className="mt-3 rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save tax settings
            </button>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">
              Display preferences
            </h4>
            <label className="mb-2 block text-xs text-[var(--ui-muted)]">
              Date format
              <select
                value={displaySettings.date_format}
                onChange={(e) => setDisplaySettings((c) => ({ ...c, date_format: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                {["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"].map((fmt) => (
                  <option key={fmt} value={fmt}>
                    {fmt}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-2 block text-xs text-[var(--ui-muted)]">
              Currency
              <select
                value={displaySettings.currency_code}
                onChange={(e) =>
                  setDisplaySettings((c) => ({ ...c, currency_code: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                {["USD", "CAD", "GBP", "EUR", "AUD"].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--ui-muted)]">
              Records per page
              <select
                value={displaySettings.page_size}
                onChange={(e) => setDisplaySettings((c) => ({ ...c, page_size: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              >
                {["10", "25", "50", "100"].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={saveDisplaySettings}
              disabled={extraSettingsLoading}
              className="mt-3 rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save display preferences
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold">AI settings</h4>
            <p className="mb-2 text-xs text-[var(--ui-muted)]">
              Required for <strong>Listing Coach</strong> and Generate in app listing content.
            </p>
            <input
              value={aiConfig?.model ?? ""}
              onChange={(e) =>
                setAiConfig((current) => ({
                  provider: current?.provider ?? "openai",
                  model: e.target.value,
                  baseUrl: current?.baseUrl ?? null,
                  timeoutMs: current?.timeoutMs ?? 30000,
                  retryCount: current?.retryCount ?? 1,
                  tokenBudget: current?.tokenBudget ?? 2000,
                  apiKeyConfigured: current?.apiKeyConfigured ?? false,
                }))
              }
              placeholder="Model"
              className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
            <div className="mt-2">
              <input
                value={aiApiKeyDraft}
                onChange={(e) => setAiApiKeyDraft(e.target.value)}
                placeholder={aiConfig?.apiKeyConfigured ? "••••••••  (saved — enter new key to replace)" : "API key"}
                type="password"
                autoComplete="off"
                className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
              {aiConfig?.apiKeyConfigured && !aiApiKeyDraft && (
                <p className="mt-1 text-xs text-[var(--ui-green)]">API key is configured.</p>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={saveAiSettings}
                disabled={saving}
                className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white"
              >
                Save AI settings
              </button>
              <button
                type="button"
                onClick={testAiSettings}
                disabled={saving}
                className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
              >
                Test connection
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Publish defaults</h4>
            <p className="mb-2 text-xs text-[var(--ui-muted)]">
              Etsy listing defaults applied when publishing approved drafts.
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="block text-xs text-[var(--ui-muted)]">
                Taxonomy ID
                <input
                  value={publishConfig.taxonomyId}
                  onChange={(e) => setPublishConfig((c) => ({ ...c, taxonomyId: e.target.value }))}
                  placeholder="e.g. 1074"
                  className="mt-0.5 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--ui-muted)]">
                Shipping profile ID
                <input
                  value={publishConfig.shippingProfileId}
                  onChange={(e) =>
                    setPublishConfig((c) => ({ ...c, shippingProfileId: e.target.value }))
                  }
                  placeholder="From Etsy shop settings"
                  className="mt-0.5 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--ui-muted)]">
                Who made
                <select
                  value={publishConfig.whoMade || "i_did"}
                  onChange={(e) => setPublishConfig((c) => ({ ...c, whoMade: e.target.value }))}
                  className="mt-0.5 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                >
                  <option value="i_did">I did</option>
                  <option value="someone_else">Someone else</option>
                  <option value="collective">A member of my shop</option>
                </select>
              </label>
              <label className="block text-xs text-[var(--ui-muted)]">
                When made
                <select
                  value={publishConfig.whenMade || "before_2000"}
                  onChange={(e) => setPublishConfig((c) => ({ ...c, whenMade: e.target.value }))}
                  className="mt-0.5 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                >
                  <option value="made_to_order">Made to order</option>
                  <option value="2020_2026">2020–2026</option>
                  <option value="2010_2019">2010–2019</option>
                  <option value="2004_2009">2004–2009</option>
                  <option value="before_2004">Before 2004</option>
                  <option value="2000_2003">2000–2003</option>
                  <option value="before_2000">Before 2000</option>
                  <option value="1990s">1990s</option>
                  <option value="1980s">1980s</option>
                  <option value="1970s">1970s</option>
                  <option value="1960s">1960s</option>
                  <option value="before_1960">Before 1960</option>
                </select>
              </label>
              <label className="block text-xs text-[var(--ui-muted)]">
                Max image dimension (px)
                <input
                  value={publishConfig.imageMaxDimension}
                  onChange={(e) =>
                    setPublishConfig((c) => ({ ...c, imageMaxDimension: e.target.value }))
                  }
                  placeholder="2000"
                  type="number"
                  className="mt-0.5 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--ui-muted)]">
                JPEG quality (1–100)
                <input
                  value={publishConfig.imageJpegQuality}
                  onChange={(e) =>
                    setPublishConfig((c) => ({ ...c, imageJpegQuality: e.target.value }))
                  }
                  placeholder="82"
                  type="number"
                  min="1"
                  max="100"
                  className="mt-0.5 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={savePublishSettings}
              disabled={saving}
              className="mt-3 rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save publish defaults
            </button>
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
            <button
              type="button"
              onClick={saveIconSettings}
              disabled={saving}
              className="mt-2 rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
            >
              Save icon settings
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
          <h4 className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Sample Data</h4>
          <p className="mb-3 text-xs text-[var(--ui-muted)]">
            Load example inventory, customers, and orders to explore the application.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLoadSampleConfirm(true)}
              disabled={sampleDataBusy || sampleDataLoaded === true}
              className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Load Sample Data
            </button>
            {sampleDataLoaded ? (
              <button
                type="button"
                onClick={() => setRemoveSampleConfirm(true)}
                disabled={sampleDataBusy}
                className="rounded-lg border border-[var(--ui-red)]/50 bg-[var(--ui-red)]/10 px-3 py-2 text-sm font-semibold text-[var(--ui-red)] disabled:opacity-60"
              >
                Remove Sample Data
              </button>
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
            <button
              type="button"
              onClick={createBackup}
              disabled={backupLoading}
              className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Backup now
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="text-xs text-[var(--ui-muted)]">
              Automatic backup
              <select
                value={backupSchedule}
                onChange={(e) => setBackupSchedule(e.target.value)}
                className="mt-0.5 block rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm text-[var(--ui-body)]"
              >
                <option value="manual">Manual only</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                void saveSettingsKeys(
                  [{ key: "backup_schedule", value: backupSchedule }],
                  "Backup schedule saved",
                  backupSchedule === "manual"
                    ? "Backups will run only when you choose Backup now."
                    : `Automatic ${backupSchedule} backups run while the app is open.`
                )
              }
              disabled={extraSettingsLoading}
              className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
            >
              Save schedule
            </button>
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
                  {backups.slice(0, 5).map((backup) => (
                    <tr key={backup.filename} className="border-b border-[var(--ui-border)]/60">
                      <td className="py-2 pr-3 text-[var(--ui-body)]">{backup.filename}</td>
                      <td className="py-2 pr-3 text-[var(--ui-muted)]">{backup.created_at}</td>
                      <td className="py-2 pr-3 text-[var(--ui-muted)]">
                        {formatBytes(backup.size_bytes)}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setRestoreTarget(backup.filename)}
                            disabled={backupLoading}
                            className="rounded border border-[var(--ui-border)] px-2 py-1 text-xs"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(backup.filename)}
                            disabled={backupLoading}
                            className="rounded border border-[var(--ui-red)]/40 px-2 py-1 text-xs text-[var(--ui-red)]"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          
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
