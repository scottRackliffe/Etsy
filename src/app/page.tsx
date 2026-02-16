"use client";

/**
 * Dashboard: connect Etsy, choose shop, view recent orders (receipts).
 * Uses /api/shop and /api/receipts for data; /api/auth/etsy and /api/auth/logout for auth.
 */
import { useEffect, useState } from "react";
import Image from "next/image";

type Shop = { shop_id: number; shop_name: string };
type InventoryItem = {
  id: number;
  item_number: string | null;
  description: string | null;
  condition_code: string | null;
  sale_revenue: number | null;
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
  updated_at: string | null;
  picture_1?: string | null;
  picture_2?: string | null;
  picture_3?: string | null;
  picture_4?: string | null;
  picture_5?: string | null;
  picture_6?: string | null;
  picture_7?: string | null;
  picture_8?: string | null;
  picture_9?: string | null;
  picture_10?: string | null;
};
type Receipt = {
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
type Customer = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address_1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};
type Order = {
  id: number;
  order_number: string | null;
  customer_id: number | null;
  order_date: string | null;
  order_status: string | null;
  payment_status: string | null;
  grand_total: number | null;
  source_channel: string | null;
  updated_at: string | null;
};
type CustomerAddress = {
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
};

type UiError = {
  title: string;
  message: string;
  actions: string[];
};

type ApiErrorShape = {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
    user_message?: string;
    actions?: string[];
  };
  fields?: Record<string, string[]>;
};
type ListingReadiness = {
  ready: boolean;
  missing_fields?: Record<string, string[]>;
  picture_count?: number;
};

type ListingMode = "manual" | "integrated_ai" | "portable_import";
type AiConfig = {
  provider: string;
  model: string;
  baseUrl?: string | null;
  timeoutMs: number;
  retryCount: number;
  tokenBudget: number;
  apiKeyConfigured: boolean;
};
type PublishConfig = {
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
type PublishPreview = {
  can_publish: boolean;
  warnings: string[];
  preview_hash: string;
  preview_generated_at: string;
  staged_flow: string[];
  payload_preview: unknown;
};
type AppTab =
  | "dashboard"
  | "sales"
  | "inventory"
  | "customers"
  | "reports"
  | "outstanding"
  | "tutorial"
  | "config";
type IconConfig = {
  screenHeaderPath: string;
  reportHeaderPath: string;
  screenHeaderSizePx: string;
  reportHeaderWidthPx: string;
};
type PublishHistory = {
  item?: {
    id: number;
    listing_draft_state: string | null;
    listing_approved_at: string | null;
    listing_published_at: string | null;
    is_listed: number | null;
    etsy_listing_id: string | null;
  };
  previews: Array<{
    preview_hash: string;
    created_at: string;
    payload_preview: unknown;
  }>;
  imports: Array<{
    id: number;
    export_id: string | null;
    source_label: string | null;
    created_at: string;
  }>;
  exports: Array<{
    export_id: string;
    created_at: string;
  }>;
};

export default function Home() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [listingReadiness, setListingReadiness] = useState<ListingReadiness | null>(null);
  const [listingMode, setListingMode] = useState<ListingMode>("manual");
  const [importPayload, setImportPayload] = useState("");
  const [exportPackage, setExportPackage] = useState<unknown | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [aiApiKeyDraft, setAiApiKeyDraft] = useState("");
  const [publishConfig, setPublishConfig] = useState<PublishConfig>({
    taxonomyId: "",
    shippingProfileId: "",
    readinessStateId: "",
    imageIds: "",
    whoMade: "i_did",
    whenMade: "before_2000",
    imageMaxDimension: "2000",
    imageTargetDpi: "300",
    imageJpegQuality: "82",
    allowPartialImageUpload: "false",
    imageUploadAttempts: "3",
  });
  const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [publishPreview, setPublishPreview] = useState<PublishPreview | null>(null);
  const [publishHistory, setPublishHistory] = useState<PublishHistory | null>(null);
  const [workflowStep, setWorkflowStep] = useState<0 | 1 | 2>(0);
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [reportType, setReportType] = useState("sales");
  const [reportCsvPreview, setReportCsvPreview] = useState("");
  const [newOrderNumber, setNewOrderNumber] = useState("");
  const [newOrderTotal, setNewOrderTotal] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [newInventoryItemNumber, setNewInventoryItemNumber] = useState("");
  const [newInventoryDescription, setNewInventoryDescription] = useState("");
  const [customerAddresses, setCustomerAddresses] = useState<CustomerAddress[]>([]);
  const [newAddressFirstLine, setNewAddressFirstLine] = useState("");
  const [newAddressCity, setNewAddressCity] = useState("");
  const [newAddressPostalCode, setNewAddressPostalCode] = useState("");
  const [newAddressCountry, setNewAddressCountry] = useState("US");
  const [pictureSlotDraft, setPictureSlotDraft] = useState("1");
  const [picturePathDraft, setPicturePathDraft] = useState("");
  const [pictureReorderDraft, setPictureReorderDraft] = useState("");
  const [iconConfig, setIconConfig] = useState<IconConfig>({
    screenHeaderPath: "/icons/screen-header.png",
    reportHeaderPath: "/icons/report-header.png",
    screenHeaderSizePx: "32",
    reportHeaderWidthPx: "220",
  });
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [urlError] = useState<UiError | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    const detail = params.get("detail");
    if (!code) return null;
    if (code === "oauth_denied") {
      return {
        title: "Etsy sign-in was canceled",
        message: detail
          ? decodeURIComponent(detail)
          : "Authorization was denied before completion.",
        actions: [
          "Click Connect Etsy and complete authorization.",
          "Verify you approved all requested scopes.",
        ],
      };
    }
    if (code === "invalid_callback") {
      return {
        title: "Sign-in verification failed",
        message: "The OAuth callback could not be validated.",
        actions: [
          "Retry Connect Etsy from the dashboard.",
          "If it repeats, verify ETSY_REDIRECT_URI configuration.",
        ],
      };
    }
    if (code === "token_exchange_failed") {
      return {
        title: "Sign-in could not be completed",
        message: "Token exchange with Etsy failed.",
        actions: ["Retry Connect Etsy.", "Check Etsy app credentials and redirect URI settings."],
      };
    }
    return {
      title: "Connection error",
      message: decodeURIComponent(code),
      actions: ["Try Connect Etsy again.", "Refresh the page if needed."],
    };
  });

  const setApiError = (title: string, fallbackMessage: string, payload: unknown) => {
    const data = payload as ApiErrorShape;
    const message = data?.error?.user_message ?? data?.error?.message ?? fallbackMessage;
    const actions = data?.error?.actions ?? ["Try again.", "If this continues, refresh the page."];
    setError({ title, message, actions });
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shop", { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & {
          shops?: Shop[];
          active_shop_id?: number | null;
        };
        if (r.status === 401) return { shops: [] as Shop[] };
        if (!r.ok) {
          throw data;
        }
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setError(null);
        setShops(data.shops ?? []);
        if (data.shops?.length) {
          const preferred = data.active_shop_id ?? data.shops[0].shop_id;
          const resolved =
            data.shops.find((shop) => shop.shop_id === preferred)?.shop_id ?? data.shops[0].shop_id;
          setSelectedShopId(resolved);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setApiError("Could not load shops", "We could not load your Etsy shops.", err);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedShopId == null || shops.length === 0) return;
    fetch("/api/settings/etsy.active_shop_id", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ value: String(selectedShopId) }),
    }).catch(() => {
      // Non-blocking persistence of active shop preference.
    });
  }, [selectedShopId, shops.length]);

  useEffect(() => {
    if (selectedShopId == null) return;
    queueMicrotask(() => setReceiptsLoading(true));
    fetch(`/api/receipts?shop_id=${selectedShopId}&limit=100`, {
      headers: { Accept: "application/json" },
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & {
          results?: Receipt[];
          items?: Receipt[];
          count?: number;
          total?: number;
          pagination?: { total?: number };
        };
        if (!r.ok) {
          throw data;
        }
        return data;
      })
      .then((data) => {
        const nextReceipts = data.results ?? data.items ?? [];
        const total =
          data.count ??
          data.total ??
          data.pagination?.total ??
          (Array.isArray(nextReceipts) ? nextReceipts.length : 0);
        setReceipts(nextReceipts);
        setCount(total);
        setError(null);
      })
      .catch((err) => {
        setReceipts([]);
        setApiError("Could not load orders", "We could not load receipts for this shop.", err);
      })
      .finally(() => setReceiptsLoading(false));
  }, [selectedShopId]);

  useEffect(() => {
    if (shops.length === 0) return;
    fetch("/api/inventory?limit=100", { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & {
          items?: InventoryItem[];
        };
        if (!r.ok) throw data;
        return data.items ?? [];
      })
      .then((items) => {
        setInventory(items);
        if (items.length > 0) {
          setSelectedItemId((current) => current ?? items[0].id);
        }
      })
      .catch((err) => {
        setApiError("Could not load inventory", "We could not load inventory items.", err);
      });
  }, [shops.length]);

  useEffect(() => {
    if (shops.length === 0) return;
    fetch("/api/orders?limit=100", { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & { items?: Order[] };
        if (!r.ok) throw data;
        return data.items ?? [];
      })
      .then((items) => {
        setOrders(items);
        if (items.length > 0) {
          setSelectedOrderId((current) => current ?? items[0].id);
        }
      })
      .catch((err) => setApiError("Could not load orders", "We could not load local orders.", err));
  }, [shops.length]);

  useEffect(() => {
    if (shops.length === 0) return;
    fetch("/api/customers?limit=100", { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & { items?: Customer[] };
        if (!r.ok) throw data;
        return data.items ?? [];
      })
      .then((items) => {
        setCustomers(items);
        if (items.length > 0) {
          setSelectedCustomerId((current) => current ?? items[0].id);
        }
      })
      .catch((err) =>
        setApiError("Could not load customers", "We could not load customer records.", err)
      );
  }, [shops.length]);

  useEffect(() => {
    if (!selectedItemId) return;
    setPublishPreview(null);
    setPublishHistory(null);
    setWorkflowStep(0);
    fetch(`/api/inventory/${selectedItemId}`, { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
        if (!r.ok) throw data;
        return data.item ?? null;
      })
      .then((item) => setSelectedItem(item))
      .catch((err) => {
        setApiError("Could not load selected item", "We could not load this inventory item.", err);
      });

    fetch(`/api/inventory/${selectedItemId}/listing-readiness`, {
      headers: { Accept: "application/json" },
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & ListingReadiness;
        if (!r.ok) throw data;
        return data;
      })
      .then((readiness) => setListingReadiness(readiness))
      .catch((err) => {
        setApiError(
          "Could not load listing readiness",
          "We could not evaluate listing readiness.",
          err
        );
      });

    fetch(`/api/inventory/${selectedItemId}/publish-history?limit=5`, {
      headers: { Accept: "application/json" },
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & PublishHistory;
        if (!r.ok) throw data;
        return data;
      })
      .then((history) => {
        setPublishHistory({
          item: history.item,
          previews: Array.isArray(history.previews) ? history.previews : [],
          imports: Array.isArray(history.imports) ? history.imports : [],
          exports: Array.isArray(history.exports) ? history.exports : [],
        });
      })
      .catch(() => {
        // Non-blocking: review panel remains usable without history.
      });
  }, [selectedItemId]);

  useEffect(() => {
    if (!selectedCustomerId || shops.length === 0) return;
    fetch(`/api/customers/${selectedCustomerId}/addresses`, {
      headers: { Accept: "application/json" },
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & { items?: CustomerAddress[] };
        if (!r.ok) throw data;
        return data.items ?? [];
      })
      .then((items) => setCustomerAddresses(items))
      .catch((err) =>
        setApiError("Could not load addresses", "We could not load customer addresses.", err)
      );
  }, [selectedCustomerId, shops.length]);

  useEffect(() => {
    if (!selectedItem) {
      setPictureReorderDraft("");
      return;
    }
    const next = Array.from({ length: 10 }, (_, index) => {
      const key = `picture_${index + 1}` as keyof InventoryItem;
      const value = selectedItem[key];
      return typeof value === "string" ? value : "";
    })
      .filter((value) => value.trim().length > 0)
      .join(", ");
    setPictureReorderDraft(next);
  }, [selectedItem]);

  useEffect(() => {
    if (shops.length === 0) return;
    fetch("/api/settings/ai", { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & { config?: AiConfig };
        if (!r.ok) throw data;
        return data.config ?? null;
      })
      .then((config) => setAiConfig(config))
      .catch(() => {
        // Keep silent: AI settings panel can still be used for first-time setup.
      });
  }, [shops.length]);

  useEffect(() => {
    if (shops.length === 0) return;
    const load = async () => {
      const getSettingValue = async (key: string) => {
        const response = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json().catch(() => ({}))) as { value?: string };
        if (!response.ok) return "";
        return data.value ?? "";
      };
      const [
        taxonomyId,
        shippingProfileId,
        readinessStateId,
        imageIds,
        whoMade,
        whenMade,
        imageMaxDimension,
        imageTargetDpi,
        imageJpegQuality,
        allowPartialImageUpload,
        imageUploadAttempts,
        screenHeaderPath,
        reportHeaderPath,
        screenHeaderSizePx,
        reportHeaderWidthPx,
      ] = await Promise.all([
        getSettingValue("etsy.publish.taxonomy_id"),
        getSettingValue("etsy.publish.shipping_profile_id"),
        getSettingValue("etsy.publish.readiness_state_id"),
        getSettingValue("etsy.publish.image_ids"),
        getSettingValue("etsy.publish.who_made"),
        getSettingValue("etsy.publish.when_made"),
        getSettingValue("etsy.publish.image_max_dimension"),
        getSettingValue("etsy.publish.image_target_dpi"),
        getSettingValue("etsy.publish.image_jpeg_quality"),
        getSettingValue("etsy.publish.allow_partial_image_upload"),
        getSettingValue("etsy.publish.image_upload_attempts"),
        getSettingValue("ui.icons.screen_header_path"),
        getSettingValue("ui.icons.report_header_path"),
        getSettingValue("ui.icons.screen_header_size_px"),
        getSettingValue("ui.icons.report_header_width_px"),
      ]);
      setPublishConfig({
        taxonomyId,
        shippingProfileId,
        readinessStateId,
        imageIds,
        whoMade: whoMade || "i_did",
        whenMade: whenMade || "before_2000",
        imageMaxDimension: imageMaxDimension || "2000",
        imageTargetDpi: imageTargetDpi || "300",
        imageJpegQuality: imageJpegQuality || "82",
        allowPartialImageUpload: allowPartialImageUpload || "false",
        imageUploadAttempts: imageUploadAttempts || "3",
      });
      setIconConfig({
        screenHeaderPath: screenHeaderPath || "/icons/screen-header.png",
        reportHeaderPath: reportHeaderPath || "/icons/report-header.png",
        screenHeaderSizePx: screenHeaderSizePx || "32",
        reportHeaderWidthPx: reportHeaderWidthPx || "220",
      });
    };
    load().catch(() => {
      // Non-blocking; user can still set values manually.
    });
  }, [shops.length]);

  const connect = () => {
    window.location.href = "/api/auth/etsy";
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setShops([]);
    setReceipts([]);
    setOrders([]);
    setCustomers([]);
    setCustomerAddresses([]);
    setSelectedShopId(null);
    setInventory([]);
    setSelectedItemId(null);
    setSelectedOrderId(null);
    setSelectedCustomerId(null);
    setSelectedItem(null);
    setListingReadiness(null);
    setPublishHistory(null);
    setAiConfig(null);
    setCount(0);
  };

  const formatDate = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const formatMoney = (value: string, code: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: code || "USD" }).format(
      parseFloat(value || "0")
    );

  const paidCount = receipts.filter((r) => r.was_paid).length;
  const shippedCount = receipts.filter((r) => r.was_shipped).length;
  const grossTotal = receipts.reduce((sum, r) => sum + parseFloat(r.total_price || "0"), 0);
  const grossCurrency = receipts[0]?.currency_code ?? "USD";
  const selectedOrder = orders.find((row) => row.id === selectedOrderId) ?? null;
  const selectedCustomer = customers.find((row) => row.id === selectedCustomerId) ?? null;
  const screenHeaderIconSize = Number.isFinite(Number(iconConfig.screenHeaderSizePx))
    ? Math.max(16, Math.min(256, Math.floor(Number(iconConfig.screenHeaderSizePx))))
    : 32;
  const reportHeaderIconWidth = Number.isFinite(Number(iconConfig.reportHeaderWidthPx))
    ? Math.max(80, Math.min(640, Math.floor(Number(iconConfig.reportHeaderWidthPx))))
    : 220;
  const selectedItemPictures = selectedItem
    ? Array.from({ length: 10 }, (_, index) => {
        const slot = index + 1;
        const key = `picture_${slot}` as keyof InventoryItem;
        const value = selectedItem[key];
        return typeof value === "string" && value.trim().length > 0
          ? { slot, path: value }
          : { slot, path: null };
      })
    : [];
  const canWorkListing = Boolean(selectedItem);
  const canPublish =
    selectedItem?.listing_draft_state === "approved" &&
    Boolean(selectedItem?.listing_approved_at) &&
    (publishPreview?.can_publish ?? false) &&
    (!selectedItem?.updated_at ||
      (selectedItem.listing_approved_at != null &&
        new Date(selectedItem.updated_at).getTime() <=
          new Date(selectedItem.listing_approved_at).getTime()));

  const statusBadgeClass = shops.length
    ? "border-[var(--ui-green)]/30 bg-[var(--ui-green)]/10 text-[var(--ui-green)]"
    : "border-[var(--ui-yellow)]/30 bg-[var(--ui-yellow)]/10 text-[var(--ui-yellow)]";

  const patchSelectedItem = async (payload: Record<string, unknown>) => {
    if (!selectedItemId) return;
    const response = await fetch(`/api/inventory/${selectedItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
      item?: InventoryItem;
    };
    if (!response.ok) throw data;
    if (data.item) {
      setSelectedItem(data.item);
      setInventory((current) =>
        current.map((row) => (row.id === data.item!.id ? data.item! : row))
      );
    }
  };

  const saveManualListing = async () => {
    if (!selectedItem) return;
    setBusyAction("save-manual");
    try {
      await patchSelectedItem({
        listing_title: selectedItem.listing_title ?? "",
        listing_description: selectedItem.listing_description ?? "",
        listing_tags: selectedItem.listing_tags ?? "",
        listing_category_path: selectedItem.listing_category_path ?? "",
        listing_title_strategy: selectedItem.listing_title_strategy ?? "",
        listing_product_story: selectedItem.listing_product_story ?? "",
        listing_condition_clarity: selectedItem.listing_condition_clarity ?? "",
        listing_attributes: selectedItem.listing_attributes ?? "",
        listing_pricing_shipping_notes: selectedItem.listing_pricing_shipping_notes ?? "",
        listing_quality_checklist: selectedItem.listing_quality_checklist ?? "",
        listing_draft_state: "draft",
        listing_draft_source: "manual",
      });
      setError(null);
    } catch (err) {
      setApiError("Could not save listing draft", "We could not save this draft.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const generateIntegrated = async () => {
    if (!selectedItemId) return;
    setBusyAction("generate-ai");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/generate-listing-content`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      await patchSelectedItem({});
      setError(null);
    } catch (err) {
      setApiError("Could not generate listing", "We could not generate listing content.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const exportForPortableAi = async () => {
    if (!selectedItemId) return;
    setBusyAction("export-ai");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/listing-export`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        package?: unknown;
      };
      if (!response.ok) throw data;
      setExportPackage(data.package ?? null);
      setError(null);
    } catch (err) {
      setApiError("Could not export package", "We could not export the AI handoff package.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const importPortableAiDraft = async () => {
    if (!selectedItemId) return;
    setBusyAction("import-ai");
    try {
      const parsed = JSON.parse(importPayload);
      const response = await fetch(`/api/inventory/${selectedItemId}/listing-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      await patchSelectedItem({});
      setError(null);
    } catch (err) {
      setApiError("Could not import package", "We could not import the AI draft package.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const approveDraft = async () => {
    if (!selectedItemId) return;
    setBusyAction("approve-draft");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/listing-approve`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      await patchSelectedItem({});
      setWorkflowStep(2);
      await loadPublishHistory();
      setError(null);
    } catch (err) {
      setApiError("Could not approve draft", "We could not approve this draft.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const publishApprovedDraft = async () => {
    if (!selectedItemId) return;
    setBusyAction("publish-draft");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/publish-to-etsy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ preview_hash: publishPreview?.preview_hash ?? "" }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      await patchSelectedItem({});
      await loadPublishHistory();
      setError(null);
    } catch (err) {
      setApiError("Could not publish listing", "We could not publish this listing.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const reviewPublishPayload = async () => {
    if (!selectedItemId) return;
    setBusyAction("review-publish");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/publish-preview`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & PublishPreview;
      if (!response.ok) throw data;
      setPublishPreview({
        can_publish: Boolean(data.can_publish),
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        preview_hash: typeof data.preview_hash === "string" ? data.preview_hash : "",
        preview_generated_at:
          typeof data.preview_generated_at === "string" ? data.preview_generated_at : "",
        staged_flow: Array.isArray(data.staged_flow) ? data.staged_flow : [],
        payload_preview: data.payload_preview ?? null,
      });
      setWorkflowStep(0);
      await loadPublishHistory();
      setError(null);
    } catch (err) {
      setApiError(
        "Could not build publish review",
        "We could not prepare the publish review.",
        err
      );
    } finally {
      setBusyAction(null);
    }
  };

  const rejectDraft = async () => {
    if (!selectedItemId) return;
    setBusyAction("reject-draft");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/listing-reject`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      await patchSelectedItem({});
      setPublishPreview(null);
      setWorkflowStep(0);
      await loadPublishHistory();
      setError(null);
    } catch (err) {
      setApiError("Could not reject draft", "We could not reject this draft.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const loadPublishHistory = async () => {
    if (!selectedItemId) return;
    const response = await fetch(`/api/inventory/${selectedItemId}/publish-history?limit=5`, {
      headers: { Accept: "application/json" },
    });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & PublishHistory;
    if (!response.ok) throw data;
    setPublishHistory({
      item: data.item,
      previews: Array.isArray(data.previews) ? data.previews : [],
      imports: Array.isArray(data.imports) ? data.imports : [],
      exports: Array.isArray(data.exports) ? data.exports : [],
    });
  };

  const continueWorkflow = () => {
    setWorkflowStep((step) => (step < 2 ? ((step + 1) as 0 | 1 | 2) : step));
  };

  const backWorkflow = () => {
    setWorkflowStep((step) => (step > 0 ? ((step - 1) as 0 | 1 | 2) : step));
  };

  const saveAiSettings = async () => {
    setAiSettingsSaving(true);
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
    } catch (err) {
      setApiError("Could not save AI settings", "We could not save AI settings.", err);
    } finally {
      setAiSettingsSaving(false);
    }
  };

  const testAiSettings = async () => {
    setAiSettingsSaving(true);
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
      setAiSettingsSaving(false);
    }
  };

  const savePublishSettings = async () => {
    setAiSettingsSaving(true);
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
        if (!response.ok) {
          throw data;
        }
      }
      setError({
        title: "Publish settings saved",
        message: "Etsy publish defaults were saved successfully.",
        actions: ["You can now publish approved listing drafts to Etsy."],
      });
    } catch (err) {
      setApiError(
        "Could not save publish settings",
        "We could not save Etsy publish settings.",
        err
      );
    } finally {
      setAiSettingsSaving(false);
    }
  };

  const saveIconSettings = async () => {
    setAiSettingsSaving(true);
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
    } catch (err) {
      setApiError("Could not save icon settings", "We could not save icon settings.", err);
    } finally {
      setAiSettingsSaving(false);
    }
  };

  const createOrderRecord = async () => {
    if (!newOrderNumber.trim()) {
      setError({
        title: "Order number required",
        message: "Provide an order number before creating an order.",
        actions: ["Enter an order number and try again."],
      });
      return;
    }
    setBusyAction("create-order");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          order_number: newOrderNumber.trim(),
          grand_total: Number(newOrderTotal || "0"),
          payment_status: "pending",
          order_status: "open",
          source_channel: "manual",
          order_date: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) {
        setOrders((current) => [data.order!, ...current.filter((row) => row.id !== data.order!.id)]);
        setSelectedOrderId(data.order.id);
      }
      setNewOrderNumber("");
      setNewOrderTotal("");
      setError(null);
    } catch (err) {
      setApiError("Could not create order", "We could not create the order.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const markSelectedOrderPaid = async () => {
    if (!selectedOrderId) return;
    setBusyAction("mark-paid");
    try {
      const response = await fetch(`/api/orders/${selectedOrderId}/mark-paid`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) {
        setOrders((current) => current.map((row) => (row.id === data.order!.id ? data.order! : row)));
      }
      setError(null);
    } catch (err) {
      setApiError("Could not mark order paid", "We could not mark the order as paid.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const markSelectedOrderShipped = async () => {
    if (!selectedOrderId) return;
    setBusyAction("mark-shipped");
    try {
      const response = await fetch(`/api/orders/${selectedOrderId}/mark-shipped`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { order?: Order };
      if (!response.ok) throw data;
      if (data.order) {
        setOrders((current) => current.map((row) => (row.id === data.order!.id ? data.order! : row)));
      }
      setError(null);
    } catch (err) {
      setApiError("Could not mark order shipped", "We could not mark the order as shipped.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const createCustomerRecord = async () => {
    if (!newCustomerEmail.trim()) {
      setError({
        title: "Customer email required",
        message: "Provide an email before creating a customer.",
        actions: ["Enter an email and try again."],
      });
      return;
    }
    setBusyAction("create-customer");
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          first_name: newCustomerFirstName.trim(),
          last_name: newCustomerLastName.trim(),
          email: newCustomerEmail.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { customer?: Customer };
      if (!response.ok) throw data;
      if (data.customer) {
        setCustomers((current) =>
          [data.customer!, ...current.filter((row) => row.id !== data.customer!.id)].sort((a, b) => b.id - a.id)
        );
        setSelectedCustomerId(data.customer.id);
      }
      setNewCustomerEmail("");
      setNewCustomerFirstName("");
      setNewCustomerLastName("");
      setError(null);
    } catch (err) {
      setApiError("Could not create customer", "We could not create the customer.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const updateSelectedCustomer = async (payload: Record<string, unknown>) => {
    if (!selectedCustomerId) return;
    setBusyAction("update-customer");
    try {
      const response = await fetch(`/api/customers/${selectedCustomerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { customer?: Customer };
      if (!response.ok) throw data;
      if (data.customer) {
        setCustomers((current) =>
          current.map((row) => (row.id === selectedCustomerId ? data.customer! : row))
        );
      }
      setError(null);
    } catch (err) {
      setApiError("Could not update customer", "We could not update this customer.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const createCustomerAddress = async () => {
    if (!selectedCustomerId || !newAddressFirstLine.trim()) return;
    setBusyAction("create-address");
    try {
      const response = await fetch(`/api/customers/${selectedCustomerId}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          first_line: newAddressFirstLine.trim(),
          city: newAddressCity.trim() || null,
          postal_code: newAddressPostalCode.trim() || null,
          country: newAddressCountry.trim() || "US",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        item?: CustomerAddress;
      };
      if (!response.ok) throw data;
      if (data.item) {
        setCustomerAddresses((current) => [data.item!, ...current]);
        await updateSelectedCustomer({
          address_1: data.item.first_line ?? null,
          city: data.item.city ?? null,
          postal_code: data.item.postal_code ?? null,
          state: data.item.state ?? null,
        });
      }
      setNewAddressFirstLine("");
      setNewAddressCity("");
      setNewAddressPostalCode("");
      setError(null);
    } catch (err) {
      setApiError("Could not add address", "We could not add the customer address.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const deleteAddress = async (addressId: number) => {
    setBusyAction("delete-address");
    try {
      const response = await fetch(`/api/addresses/${addressId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      setCustomerAddresses((current) => current.filter((row) => row.id !== addressId));
      setError(null);
    } catch (err) {
      setApiError("Could not delete address", "We could not delete that address.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const createInventoryRecord = async () => {
    if (!newInventoryItemNumber.trim()) {
      setError({
        title: "Item number required",
        message: "Provide an item number before creating inventory.",
        actions: ["Enter an item number and try again."],
      });
      return;
    }
    setBusyAction("create-inventory");
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          item_number: newInventoryItemNumber.trim(),
          description: newInventoryDescription.trim(),
          status: "draft",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
      if (!response.ok) throw data;
      if (data.item) {
        setInventory((current) => [data.item!, ...current.filter((row) => row.id !== data.item!.id)]);
        setSelectedItemId(data.item.id);
      }
      setNewInventoryItemNumber("");
      setNewInventoryDescription("");
      setError(null);
    } catch (err) {
      setApiError("Could not create inventory", "We could not create the inventory item.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const deleteSelectedInventory = async () => {
    if (!selectedItemId) return;
    setBusyAction("delete-inventory");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      setInventory((current) => {
        const remaining = current.filter((row) => row.id !== selectedItemId);
        setSelectedItemId(remaining[0]?.id ?? null);
        setSelectedItem(remaining[0] ?? null);
        return remaining;
      });
      setError(null);
    } catch (err) {
      setApiError("Could not delete inventory", "We could not delete the selected item.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const addPictureToSelected = async () => {
    if (!selectedItemId || !picturePathDraft.trim()) return;
    setBusyAction("add-picture");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/pictures`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ slot: Number(pictureSlotDraft), path: picturePathDraft.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
      if (!response.ok) throw data;
      if (data.item) {
        setSelectedItem(data.item);
        setInventory((current) => current.map((row) => (row.id === data.item!.id ? data.item! : row)));
      }
      setPicturePathDraft("");
      setError(null);
    } catch (err) {
      setApiError("Could not add picture", "We could not add this picture reference.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const removePictureFromSelected = async (slot: number) => {
    if (!selectedItemId) return;
    setBusyAction("remove-picture");
    try {
      const response = await fetch(`/api/inventory/${selectedItemId}/pictures/${slot}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
      if (!response.ok) throw data;
      if (data.item) {
        setSelectedItem(data.item);
        setInventory((current) => current.map((row) => (row.id === data.item!.id ? data.item! : row)));
      }
      setError(null);
    } catch (err) {
      setApiError("Could not remove picture", "We could not remove this picture slot.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const reorderPicturesForSelected = async () => {
    if (!selectedItemId) return;
    setBusyAction("reorder-pictures");
    try {
      const pictures = pictureReorderDraft
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .slice(0, 10);
      const response = await fetch(`/api/inventory/${selectedItemId}/pictures/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ pictures }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
      if (!response.ok) throw data;
      if (data.item) {
        setSelectedItem(data.item);
        setInventory((current) => current.map((row) => (row.id === data.item!.id ? data.item! : row)));
      }
      setError(null);
    } catch (err) {
      setApiError("Could not reorder pictures", "We could not reorder picture references.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const syncEtsyOrders = async () => {
    if (!selectedShopId) return;
    setBusyAction("sync-etsy");
    try {
      const response = await fetch("/api/sync/etsy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ shop_id: selectedShopId, limit: 100 }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;
      setError({
        title: "Etsy sync complete",
        message: "Latest Etsy receipts were synchronized.",
        actions: ["Open Dashboard or Sales to review synced orders."],
      });
    } catch (err) {
      setApiError("Could not sync Etsy orders", "We could not sync Etsy receipts.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const previewReportCsv = async () => {
    setBusyAction("preview-report");
    try {
      const response = await fetch(`/api/reports/${reportType}?format=csv`, {
        headers: { Accept: "text/csv" },
      });
      const text = await response.text();
      if (!response.ok) {
        throw { error: { user_message: "Report preview failed." } };
      }
      setReportCsvPreview(text);
      setError(null);
    } catch (err) {
      setApiError("Could not preview report", "We could not load report preview.", err);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(70rem_45rem_at_10%_-10%,rgba(47,128,237,0.20),transparent_60%),radial-gradient(70rem_45rem_at_120%_10%,rgba(0,204,102,0.12),transparent_60%),var(--ui-background)] text-[var(--ui-body)]">
      <header className="sticky top-0 z-20 border-b border-[var(--ui-border)]/80 bg-[color:var(--ui-panel-bg)]/90 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2">
              <Image
                src={iconConfig.screenHeaderPath || "/icons/screen-header.png"}
                alt="Screen header icon"
                width={screenHeaderIconSize}
                height={screenHeaderIconSize}
                className="h-auto w-auto"
              />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[var(--ui-title)]">
                Trudy&apos;s Etsy Sales
              </h1>
              <p className="text-xs text-[var(--ui-muted)]">Modern sales console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass}`}
            >
              {shops.length ? "Connected" : "Not connected"}
            </span>
            {shops.length > 0 ? (
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-neutral)] px-3 py-2 text-sm font-medium text-[var(--ui-body)] shadow-sm transition hover:bg-[var(--ui-neutral-hover)]"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={connect}
                className="rounded-lg bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--ui-accent-hover)]"
              >
                Connect Etsy
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        {urlError && (
          <div className="rounded-xl border border-[var(--ui-yellow)]/50 bg-[var(--ui-yellow)]/10 px-4 py-3">
            <p className="font-semibold text-[var(--ui-yellow)]">{urlError.title}</p>
            <p className="mt-1 text-[var(--ui-yellow)]">{urlError.message}</p>
            {urlError.actions.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--ui-yellow)]">
                {urlError.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-8 text-center">
            <p className="text-[var(--ui-muted)]">Checking connection...</p>
          </div>
        )}

        {!loading && shops.length === 0 && !error && (
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-10 text-center shadow-sm">
            <h2 className="mb-2 text-xl font-semibold text-[var(--ui-title)]">
              Welcome to your Etsy command center
            </h2>
            <p className="mb-6 text-[var(--ui-muted)]">
              Connect your Etsy account to view recent orders, shipping status, and totals in one
              clean workspace.
            </p>
            <button
              type="button"
              onClick={connect}
              className="rounded-lg bg-[var(--ui-accent)] px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-[var(--ui-accent-hover)]"
            >
              Connect with Etsy
            </button>
          </div>
        )}

        {error && shops.length === 0 && (
          <div className="rounded-xl border border-[var(--ui-red)]/50 bg-[var(--ui-red)]/10 px-4 py-3">
            <p className="font-semibold text-[var(--ui-red)]">{error.title}</p>
            <p className="mt-1 text-[var(--ui-red)]">{error.message}</p>
            {error.actions.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--ui-red)]">
                {error.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {shops.length > 0 && (
          <>
            <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3 shadow-sm">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Primary navigation tabs">
                {(
                  [
                    ["dashboard", "Dashboard"],
                    ["sales", "Sales"],
                    ["inventory", "Inventory"],
                    ["customers", "Customers"],
                    ["reports", "Reports"],
                    ["outstanding", "Outstanding"],
                    ["tutorial", "Tutorial & tips"],
                    ["config", "Config"],
                  ] as Array<[AppTab, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    role="tab"
                    aria-selected={activeTab === id}
                    aria-controls={`panel-${id}`}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      activeTab === id
                        ? "bg-[var(--ui-accent)] text-white"
                        : "border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] text-[var(--ui-body)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {activeTab === "sales" && (
              <section
                id="panel-sales"
                className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-[var(--ui-title)]">Sales / Orders</h3>
                  <button
                    type="button"
                    onClick={syncEtsyOrders}
                    disabled={busyAction != null || selectedShopId == null}
                    className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                  >
                    {busyAction === "sync-etsy" ? "Syncing..." : "Sync Etsy receipts"}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 lg:col-span-2">
                    <p className="mb-2 text-sm font-semibold">Local orders</p>
                    <div className="max-h-72 overflow-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-xs text-[var(--ui-muted)]">
                            <th className="py-1">Order</th>
                            <th className="py-1">Date</th>
                            <th className="py-1">Total</th>
                            <th className="py-1">Payment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((order) => (
                            <tr
                              key={order.id}
                              onClick={() => setSelectedOrderId(order.id)}
                              className={`cursor-pointer border-t border-[var(--ui-border)]/60 ${
                                selectedOrderId === order.id ? "bg-[var(--ui-list-hover)]/60" : ""
                              }`}
                            >
                              <td className="py-1 pr-2">{order.order_number ?? `Order ${order.id}`}</td>
                              <td className="py-1 pr-2">{order.order_date ?? "-"}</td>
                              <td className="py-1 pr-2">{order.grand_total ?? 0}</td>
                              <td className="py-1">{order.payment_status ?? "unknown"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="space-y-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
                    <p className="text-sm font-semibold">Create order</p>
                    <input
                      value={newOrderNumber}
                      onChange={(e) => setNewOrderNumber(e.target.value)}
                      aria-label="New order number"
                      placeholder="Order number"
                      className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <input
                      value={newOrderTotal}
                      onChange={(e) => setNewOrderTotal(e.target.value)}
                      aria-label="New order total"
                      placeholder="Total"
                      className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={createOrderRecord}
                      disabled={busyAction != null}
                      className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {busyAction === "create-order" ? "Creating..." : "Create order"}
                    </button>
                    <button
                      type="button"
                      onClick={markSelectedOrderPaid}
                      disabled={busyAction != null || !selectedOrder}
                      className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                    >
                      {busyAction === "mark-paid" ? "Updating..." : "Mark selected paid"}
                    </button>
                    <button
                      type="button"
                      onClick={markSelectedOrderShipped}
                      disabled={busyAction != null || !selectedOrder}
                      className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                    >
                      {busyAction === "mark-shipped" ? "Updating..." : "Mark selected shipped"}
                    </button>
                    {selectedOrder && (
                      <p className="text-xs text-[var(--ui-muted)]">
                        Selected: {selectedOrder.order_number ?? selectedOrder.id} | Payment:{" "}
                        {selectedOrder.payment_status ?? "unknown"} | Status:{" "}
                        {selectedOrder.order_status ?? "unknown"}
                      </p>
                    )}
                  </div>
                </div>
                {orders.length === 0 && (
                  <p className="mt-3 text-sm text-[var(--ui-muted)]">
                    No local orders yet. Create one or sync Etsy receipts.
                  </p>
                )}
              </section>
            )}

            {activeTab === "customers" && (
              <section
                id="panel-customers"
                className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm"
              >
                <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Customers</h3>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 lg:col-span-2">
                    <div className="max-h-72 overflow-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-xs text-[var(--ui-muted)]">
                            <th className="py-1">Name</th>
                            <th className="py-1">Email</th>
                            <th className="py-1">Phone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customers.map((customer) => (
                            <tr
                              key={customer.id}
                              onClick={() => setSelectedCustomerId(customer.id)}
                              className={`cursor-pointer border-t border-[var(--ui-border)]/60 ${
                                selectedCustomerId === customer.id ? "bg-[var(--ui-list-hover)]/60" : ""
                              }`}
                            >
                              <td className="py-1 pr-2">
                                {[customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
                                  `Customer ${customer.id}`}
                              </td>
                              <td className="py-1 pr-2">{customer.email ?? "-"}</td>
                              <td className="py-1">{customer.phone ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {selectedCustomer && (
                      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                        <input
                          defaultValue={selectedCustomer.first_name ?? ""}
                          onBlur={(e) => updateSelectedCustomer({ first_name: e.target.value })}
                          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                        />
                        <input
                          defaultValue={selectedCustomer.last_name ?? ""}
                          onBlur={(e) => updateSelectedCustomer({ last_name: e.target.value })}
                          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                        />
                        <input
                          defaultValue={selectedCustomer.phone ?? ""}
                          onBlur={(e) => updateSelectedCustomer({ phone: e.target.value })}
                          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                        />
                        <input
                          defaultValue={selectedCustomer.address_1 ?? ""}
                          onBlur={(e) => updateSelectedCustomer({ address_1: e.target.value })}
                          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                        />
                        <input
                          defaultValue={selectedCustomer.postal_code ?? ""}
                          onBlur={(e) => updateSelectedCustomer({ postal_code: e.target.value })}
                          className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                        />
                      </div>
                    )}
                    {selectedCustomer && (
                      <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                        <p className="mb-2 text-sm font-semibold">Addresses</p>
                        <div className="space-y-2">
                          {customerAddresses.map((address) => (
                            <div
                              key={address.id}
                              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--ui-border)] px-2 py-1.5 text-xs"
                            >
                              <span>
                                {address.first_line ?? "-"}, {address.city ?? "-"} {address.postal_code ?? "-"}{" "}
                                {address.country ?? "-"}
                              </span>
                              <button
                                type="button"
                                onClick={() => deleteAddress(address.id)}
                                disabled={busyAction != null}
                                className="rounded border border-[var(--ui-border)] px-2 py-1"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                          <input
                            value={newAddressFirstLine}
                            onChange={(e) => setNewAddressFirstLine(e.target.value)}
                            placeholder="Address line"
                            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs md:col-span-2"
                          />
                          <input
                            value={newAddressCity}
                            onChange={(e) => setNewAddressCity(e.target.value)}
                            placeholder="City"
                            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs"
                          />
                          <input
                            value={newAddressPostalCode}
                            onChange={(e) => setNewAddressPostalCode(e.target.value)}
                            placeholder="Postal"
                            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs"
                          />
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            value={newAddressCountry}
                            onChange={(e) => setNewAddressCountry(e.target.value)}
                            placeholder="Country"
                            className="w-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs"
                          />
                          <button
                            type="button"
                            onClick={createCustomerAddress}
                            disabled={busyAction != null || !newAddressFirstLine.trim()}
                            className="rounded-lg border border-[var(--ui-border)] px-2.5 py-1.5 text-xs disabled:opacity-60"
                          >
                            {busyAction === "create-address" ? "Adding..." : "Add address"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
                    <p className="text-sm font-semibold">Add customer</p>
                    <input
                      value={newCustomerFirstName}
                      onChange={(e) => setNewCustomerFirstName(e.target.value)}
                      placeholder="First name"
                      className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <input
                      value={newCustomerLastName}
                      onChange={(e) => setNewCustomerLastName(e.target.value)}
                      placeholder="Last name"
                      className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <input
                      value={newCustomerEmail}
                      onChange={(e) => setNewCustomerEmail(e.target.value)}
                      placeholder="Email"
                      className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={createCustomerRecord}
                      disabled={busyAction != null}
                      className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {busyAction === "create-customer" ? "Creating..." : "Create customer"}
                    </button>
                  </div>
                </div>
                {customers.length === 0 && (
                  <p className="mt-3 text-sm text-[var(--ui-muted)]">
                    No customers yet. Create one from the panel on the right.
                  </p>
                )}
              </section>
            )}

            {activeTab === "reports" && (
              <section
                id="panel-reports"
                className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm"
              >
                <div className="mb-3 flex items-center gap-3">
                  <Image
                    src={iconConfig.reportHeaderPath || "/icons/report-header.png"}
                    alt="Report header icon"
                    width={reportHeaderIconWidth}
                    height={Math.max(24, Math.floor(reportHeaderIconWidth * 0.22))}
                    className="h-auto max-h-16 w-auto rounded"
                  />
                  <h3 className="text-lg font-semibold text-[var(--ui-title)]">Reports</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    aria-label="Report type"
                    className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm"
                  >
                    {[
                      "thank-you-note",
                      "invoice",
                      "sales",
                      "costs",
                      "income-mtd",
                      "income-ytd",
                      "postal-by-vendor",
                      "outstanding-items",
                      "ar-aging",
                    ].map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={previewReportCsv}
                    disabled={busyAction != null}
                    className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                  >
                    {busyAction === "preview-report" ? "Loading..." : "Preview CSV"}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(`/api/reports/${reportType}?format=csv`, "_blank")}
                    className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                  >
                    Download CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(`/api/reports/${reportType}?format=pdf`, "_blank")}
                    className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                  >
                    Download PDF
                  </button>
                </div>
                <textarea
                  readOnly
                  value={reportCsvPreview}
                  aria-label="Report CSV preview"
                  className="mt-3 min-h-80 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 font-mono text-xs"
                />
                {reportCsvPreview.trim().length === 0 && (
                  <p className="mt-2 text-xs text-[var(--ui-muted)]">
                    Choose a report and click Preview CSV to inspect report output.
                  </p>
                )}
              </section>
            )}

            {activeTab === "outstanding" && (
              <section
                id="panel-outstanding"
                className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm"
              >
                <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Outstanding</h3>
                <div className="space-y-2 text-sm">
                  {orders
                    .filter((o) => (o.payment_status ?? "").toLowerCase() !== "paid")
                    .slice(0, 10)
                    .map((order) => (
                      <button
                        key={`outstanding-order-${order.id}`}
                        type="button"
                        onClick={() => {
                          setActiveTab("sales");
                          setSelectedOrderId(order.id);
                        }}
                        className="block w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-left"
                      >
                        Unpaid order: {order.order_number ?? order.id}
                      </button>
                    ))}
                  {orders
                    .filter(
                      (o) =>
                        (o.payment_status ?? "").toLowerCase() === "paid" &&
                        (o.order_status ?? "").toLowerCase() !== "shipped"
                    )
                    .slice(0, 10)
                    .map((order) => (
                      <button
                        key={`outstanding-ship-${order.id}`}
                        type="button"
                        onClick={() => {
                          setActiveTab("sales");
                          setSelectedOrderId(order.id);
                        }}
                        className="block w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-left"
                      >
                        Paid not shipped: {order.order_number ?? order.id}
                      </button>
                    ))}
                  {inventory
                    .filter((item) => !item.is_listed)
                    .slice(0, 10)
                    .map((item) => (
                      <button
                        key={`outstanding-item-${item.id}`}
                        type="button"
                        onClick={() => {
                          setActiveTab("inventory");
                          setSelectedItemId(item.id);
                        }}
                        className="block w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-left"
                      >
                        Inventory not listed: {item.item_number ?? item.id}
                      </button>
                    ))}
                  {customers
                    .filter((customer) => !customer.address_1 || !customer.postal_code)
                    .slice(0, 10)
                    .map((customer) => (
                      <button
                        key={`outstanding-customer-${customer.id}`}
                        type="button"
                        onClick={() => {
                          setActiveTab("customers");
                          setSelectedCustomerId(customer.id);
                        }}
                        className="block w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-left"
                      >
                        Customer missing address:{" "}
                        {[customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
                          `Customer ${customer.id}`}
                      </button>
                    ))}
                </div>
                {orders.length === 0 && inventory.length === 0 && customers.length === 0 && (
                  <p className="mt-2 text-sm text-[var(--ui-muted)]">No outstanding tasks right now.</p>
                )}
              </section>
            )}

            {activeTab === "tutorial" && (
              <section
                id="panel-tutorial"
                className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm"
              >
                <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Tutorial and tips</h3>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--ui-body)]">
                  <li>Connect Etsy and select your active shop.</li>
                  <li>Sync Etsy receipts from the Sales tab.</li>
                  <li>Create or update inventory records with pictures and condition details.</li>
                  <li>Use Listing authoring workshop to draft, review, approve, and publish.</li>
                  <li>Check Outstanding tab daily for unpaid orders and unlisted inventory.</li>
                  <li>Generate report exports from the Reports tab for operations and accounting.</li>
                </ol>
              </section>
            )}

            {activeTab === "config" && (
              <section
                id="panel-config"
                className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm"
              >
                <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Configuration</h3>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
                    <h4 className="mb-2 text-sm font-semibold">AI settings</h4>
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
                    <input
                      value={aiApiKeyDraft}
                      onChange={(e) => setAiApiKeyDraft(e.target.value)}
                      placeholder="API key"
                      className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={saveAiSettings}
                        disabled={aiSettingsSaving}
                        className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white"
                      >
                        Save AI settings
                      </button>
                      <button
                        type="button"
                        onClick={testAiSettings}
                        disabled={aiSettingsSaving}
                        className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                      >
                        Test connection
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
                    <h4 className="mb-2 text-sm font-semibold">Publish defaults</h4>
                    <input
                      value={publishConfig.taxonomyId}
                      onChange={(e) =>
                        setPublishConfig((current) => ({ ...current, taxonomyId: e.target.value }))
                      }
                      placeholder="taxonomy_id"
                      className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <input
                      value={publishConfig.shippingProfileId}
                      onChange={(e) =>
                        setPublishConfig((current) => ({
                          ...current,
                          shippingProfileId: e.target.value,
                        }))
                      }
                      placeholder="shipping_profile_id"
                      className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={savePublishSettings}
                      disabled={aiSettingsSaving}
                      className="mt-2 rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
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
                      onChange={(e) =>
                        setIconConfig((current) => ({ ...current, screenHeaderPath: e.target.value }))
                      }
                      placeholder="/icons/screen-header.png"
                      className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <input
                      value={iconConfig.screenHeaderSizePx}
                      onChange={(e) =>
                        setIconConfig((current) => ({ ...current, screenHeaderSizePx: e.target.value }))
                      }
                      placeholder="Screen icon size px (for example 32)"
                      className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <input
                      value={iconConfig.reportHeaderPath}
                      onChange={(e) =>
                        setIconConfig((current) => ({ ...current, reportHeaderPath: e.target.value }))
                      }
                      placeholder="/icons/report-header.png"
                      className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <input
                      value={iconConfig.reportHeaderWidthPx}
                      onChange={(e) =>
                        setIconConfig((current) => ({ ...current, reportHeaderWidthPx: e.target.value }))
                      }
                      placeholder="Report icon width px (for example 220)"
                      className="mt-2 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={saveIconSettings}
                      disabled={aiSettingsSaving}
                      className="mt-2 rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                    >
                      Save icon settings
                    </button>
                  </div>
                </div>
              </section>
            )}

            <section
              id="panel-dashboard"
              className={`rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm ${
                activeTab === "dashboard" ? "" : "hidden"
              }`}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--ui-title)]">Dashboard</h2>
                  <p className="text-sm text-[var(--ui-muted)]">
                    Live order snapshot for your selected Etsy shop.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-[var(--ui-muted)]">Shop</label>
                  <select
                    value={selectedShopId ?? ""}
                    onChange={(e) => setSelectedShopId(Number(e.target.value))}
                    className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm text-[var(--ui-body)] shadow-inner focus:border-[var(--ui-accent)] focus:outline-none"
                  >
                    {shops.map((s) => (
                      <option key={s.shop_id} value={s.shop_id}>
                        {s.shop_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Receipts</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--ui-title)]">{count}</p>
                </article>
                <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Paid</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--ui-green)]">{paidCount}</p>
                </article>
                <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Shipped</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--ui-accent)]">
                    {shippedCount}
                  </p>
                </article>
                <article className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">
                    Gross total
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--ui-title)]">
                    {new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: grossCurrency,
                    }).format(grossTotal)}
                  </p>
                </article>
              </div>
            </section>

            <section
              className={`overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] shadow-sm ${
                activeTab === "dashboard" ? "" : "hidden"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-border)] px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--ui-title)]">Recent orders</h3>
                  <p className="text-sm text-[var(--ui-muted)]">
                    {count} receipt(s) with paid/shipped status.
                  </p>
                </div>
                <span className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-xs text-[var(--ui-muted)]">
                  Updated live
                </span>
              </div>

              {receiptsLoading ? (
                <div className="space-y-2 p-5">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-12 animate-pulse rounded-lg bg-[var(--ui-list-light)]"
                    />
                  ))}
                </div>
              ) : receipts.length === 0 ? (
                <div className="p-10 text-center text-[var(--ui-muted)]">No orders yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--ui-border)] bg-[var(--ui-panel-bg)] text-xs uppercase tracking-wide text-[var(--ui-muted)]">
                        <th className="px-5 py-3 font-semibold">Date</th>
                        <th className="px-5 py-3 font-semibold">Order #</th>
                        <th className="px-5 py-3 font-semibold">Ship to</th>
                        <th className="px-5 py-3 font-semibold">Total</th>
                        <th className="px-5 py-3 font-semibold">Paid</th>
                        <th className="px-5 py-3 font-semibold">Shipped</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.map((r, i) => (
                        <tr
                          key={r.receipt_id}
                          className="border-b border-[var(--ui-border)]/70 transition hover:bg-[var(--ui-list-hover)]/60"
                          style={{
                            backgroundColor:
                              i % 2 === 0 ? "var(--ui-list-dark)" : "var(--ui-list-light)",
                          }}
                        >
                          <td className="px-5 py-3 text-[var(--ui-body)]">
                            {formatDate(r.creation_tsz)}
                          </td>
                          <td className="px-5 py-3 font-mono text-[var(--ui-title)]">
                            {r.receipt_id}
                          </td>
                          <td className="px-5 py-3">
                            <p className="font-medium text-[var(--ui-title)]">{r.name}</p>
                            <p className="text-xs text-[var(--ui-muted)]">
                              {r.first_line}, {r.city} {r.state} {r.zip} {r.country_iso}
                            </p>
                          </td>
                          <td className="px-5 py-3 text-[var(--ui-body)]">
                            {formatMoney(r.total_price, r.currency_code)}
                            {parseFloat(r.total_shipping_cost) > 0 && (
                              <span className="text-xs text-[var(--ui-muted)]">
                                {" "}
                                + {formatMoney(r.total_shipping_cost, r.currency_code)} ship
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                r.was_paid
                                  ? "bg-[var(--ui-green)]/15 text-[var(--ui-green)]"
                                  : "bg-[var(--ui-yellow)]/15 text-[var(--ui-yellow)]"
                              }`}
                            >
                              {r.was_paid ? "Paid" : "Unpaid"}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                r.was_shipped
                                  ? "bg-[var(--ui-green)]/15 text-[var(--ui-green)]"
                                  : "bg-[var(--ui-muted)]/20 text-[var(--ui-muted)]"
                              }`}
                            >
                              {r.was_shipped ? "Shipped" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section
              id="panel-inventory"
              className={`rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm ${
                activeTab === "inventory" ? "" : "hidden"
              }`}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--ui-title)]">
                    Listing authoring workshop
                  </h3>
                  <p className="text-sm text-[var(--ui-muted)]">
                    Manual guided form, integrated AI generation, and hybrid import/export.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-[var(--ui-muted)]">Inventory item</label>
                  <select
                    value={selectedItemId ?? ""}
                    onChange={(e) => setSelectedItemId(Number(e.target.value))}
                    className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2 text-sm text-[var(--ui-body)]"
                  >
                    {inventory.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.item_number ?? `Item ${item.id}`} -{" "}
                        {(item.description ?? "").slice(0, 40) || "No description"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 md:grid-cols-4">
                <input
                  value={newInventoryItemNumber}
                  onChange={(e) => setNewInventoryItemNumber(e.target.value)}
                  aria-label="New inventory item number"
                  placeholder="New item number"
                  className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                />
                <input
                  value={newInventoryDescription}
                  onChange={(e) => setNewInventoryDescription(e.target.value)}
                  aria-label="New inventory description"
                  placeholder="New item description"
                  className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={createInventoryRecord}
                    disabled={busyAction != null}
                    className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busyAction === "create-inventory" ? "Creating..." : "Add item"}
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelectedInventory}
                    disabled={busyAction != null || !selectedItemId}
                    className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                  >
                    {busyAction === "delete-inventory" ? "Deleting..." : "Delete selected"}
                  </button>
                </div>
              </div>

              <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
                <p className="mb-2 text-sm font-semibold">Pictures</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                  <input
                    value={pictureSlotDraft}
                    onChange={(e) => setPictureSlotDraft(e.target.value)}
                    aria-label="Picture slot"
                    placeholder="Slot (1-10)"
                    className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                  />
                  <input
                    value={picturePathDraft}
                    onChange={(e) => setPicturePathDraft(e.target.value)}
                    aria-label="Picture path"
                    placeholder="Picture path or URL"
                    className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
                  />
                  <button
                    type="button"
                    onClick={addPictureToSelected}
                    disabled={busyAction != null || !selectedItemId}
                    className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                  >
                    {busyAction === "add-picture" ? "Saving..." : "Set slot"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removePictureFromSelected(Number(pictureSlotDraft))}
                    disabled={busyAction != null || !selectedItemId}
                    className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                  >
                    {busyAction === "remove-picture" ? "Removing..." : "Clear slot"}
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    value={pictureReorderDraft}
                    onChange={(e) => setPictureReorderDraft(e.target.value)}
                    aria-label="Picture reorder values"
                    placeholder="Reorder: comma-separated paths for slots 1..10"
                    className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={reorderPicturesForSelected}
                    disabled={busyAction != null || !selectedItemId}
                    className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                  >
                    {busyAction === "reorder-pictures" ? "Reordering..." : "Reorder"}
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1 text-xs md:grid-cols-2">
                  {selectedItemPictures.map((entry) => (
                    <div
                      key={`pic-slot-${entry.slot}`}
                      className="rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-2 py-1"
                    >
                      Slot {entry.slot}: {entry.path ?? "(empty)"}
                    </div>
                  ))}
                </div>
              </div>

              {canWorkListing ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm">
                    <p>
                      Draft state: <strong>{selectedItem?.listing_draft_state ?? "draft"}</strong> |
                      Source: <strong>{selectedItem?.listing_draft_source ?? "manual"}</strong> |
                      Ready: <strong>{listingReadiness?.ready ? "yes" : "no"}</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setListingMode("manual")}
                      className={`rounded-lg px-3 py-2 text-sm font-medium ${
                        listingMode === "manual"
                          ? "bg-[var(--ui-accent)] text-white"
                          : "border border-[var(--ui-border)]"
                      }`}
                    >
                      Manual
                    </button>
                    <button
                      type="button"
                      onClick={() => setListingMode("integrated_ai")}
                      className={`rounded-lg px-3 py-2 text-sm font-medium ${
                        listingMode === "integrated_ai"
                          ? "bg-[var(--ui-accent)] text-white"
                          : "border border-[var(--ui-border)]"
                      }`}
                    >
                      Generate in app
                    </button>
                    <button
                      type="button"
                      onClick={() => setListingMode("portable_import")}
                      className={`rounded-lg px-3 py-2 text-sm font-medium ${
                        listingMode === "portable_import"
                          ? "bg-[var(--ui-accent)] text-white"
                          : "border border-[var(--ui-border)]"
                      }`}
                    >
                      Import AI draft
                    </button>
                  </div>

                  {listingMode === "manual" && selectedItem && (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <textarea
                        placeholder="Title strategy"
                        value={selectedItem.listing_title_strategy ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_title_strategy: e.target.value,
                          })
                        }
                        className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                      <textarea
                        placeholder="Product story/details"
                        value={selectedItem.listing_product_story ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_product_story: e.target.value,
                          })
                        }
                        className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                      <textarea
                        placeholder="Condition clarity + defect disclosure"
                        value={selectedItem.listing_condition_clarity ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_condition_clarity: e.target.value,
                          })
                        }
                        className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                      <textarea
                        placeholder="Attributes and category fit"
                        value={selectedItem.listing_attributes ?? ""}
                        onChange={(e) =>
                          setSelectedItem({ ...selectedItem, listing_attributes: e.target.value })
                        }
                        className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                      <textarea
                        placeholder="Pricing and shipping notes"
                        value={selectedItem.listing_pricing_shipping_notes ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_pricing_shipping_notes: e.target.value,
                          })
                        }
                        className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                      <textarea
                        placeholder="Final quality checklist"
                        value={selectedItem.listing_quality_checklist ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_quality_checklist: e.target.value,
                          })
                        }
                        className="min-h-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                      <input
                        placeholder="Listing title"
                        value={selectedItem.listing_title ?? ""}
                        onChange={(e) =>
                          setSelectedItem({ ...selectedItem, listing_title: e.target.value })
                        }
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                      <input
                        placeholder="Listing tags (comma separated)"
                        value={selectedItem.listing_tags ?? ""}
                        onChange={(e) =>
                          setSelectedItem({ ...selectedItem, listing_tags: e.target.value })
                        }
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm"
                      />
                      <input
                        placeholder="Listing category path"
                        value={selectedItem.listing_category_path ?? ""}
                        onChange={(e) =>
                          setSelectedItem({
                            ...selectedItem,
                            listing_category_path: e.target.value,
                          })
                        }
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm lg:col-span-2"
                      />
                      <textarea
                        placeholder="Listing description"
                        value={selectedItem.listing_description ?? ""}
                        onChange={(e) =>
                          setSelectedItem({ ...selectedItem, listing_description: e.target.value })
                        }
                        className="min-h-28 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm lg:col-span-2"
                      />
                      <div className="lg:col-span-2">
                        <button
                          type="button"
                          onClick={saveManualListing}
                          disabled={busyAction != null}
                          className="rounded-lg bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {busyAction === "save-manual" ? "Saving..." : "Save manual draft"}
                        </button>
                      </div>
                    </div>
                  )}

                  {listingMode === "integrated_ai" && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm">
                        <p>
                          Provider: <strong>{aiConfig?.provider ?? "openai"}</strong> | Model:{" "}
                          <strong>{aiConfig?.model ?? "gpt-4.1-mini"}</strong> | API key:{" "}
                          <strong>{aiConfig?.apiKeyConfigured ? "configured" : "missing"}</strong>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={generateIntegrated}
                        disabled={busyAction != null}
                        className="rounded-lg bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busyAction === "generate-ai" ? "Generating..." : "Generate listing in app"}
                      </button>
                    </div>
                  )}

                  {listingMode === "portable_import" && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={exportForPortableAi}
                          disabled={busyAction != null}
                          className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                        >
                          {busyAction === "export-ai" ? "Exporting..." : "Export package"}
                        </button>
                        <button
                          type="button"
                          onClick={importPortableAiDraft}
                          disabled={busyAction != null || importPayload.trim().length === 0}
                          className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {busyAction === "import-ai" ? "Importing..." : "Import AI draft"}
                        </button>
                      </div>
                      {exportPackage != null ? (
                        <textarea
                          readOnly
                          value={JSON.stringify(exportPackage, null, 2) ?? ""}
                          className="min-h-40 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 font-mono text-xs"
                        />
                      ) : null}
                      <textarea
                        placeholder="Paste AI output JSON here for import"
                        value={importPayload}
                        onChange={(e) => setImportPayload(e.target.value)}
                        className="min-h-40 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 font-mono text-xs"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={reviewPublishPayload}
                      disabled={busyAction != null}
                      className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                    >
                      {busyAction === "review-publish" ? "Reviewing..." : "Review"}
                    </button>
                    <button
                      type="button"
                      onClick={backWorkflow}
                      disabled={busyAction != null || workflowStep === 0}
                      className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={continueWorkflow}
                      disabled={busyAction != null || workflowStep === 2}
                      className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm disabled:opacity-60"
                    >
                      Continue
                    </button>
                    <button
                      type="button"
                      onClick={approveDraft}
                      disabled={busyAction != null}
                      className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                    >
                      {busyAction === "approve-draft" ? "Approving..." : "Approve draft"}
                    </button>
                    <button
                      type="button"
                      onClick={rejectDraft}
                      disabled={busyAction != null}
                      className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                    >
                      {busyAction === "reject-draft" ? "Rejecting..." : "Reject"}
                    </button>
                    <button
                      type="button"
                      onClick={publishApprovedDraft}
                      disabled={busyAction != null || !canPublish || workflowStep < 2}
                      className="rounded-lg bg-[var(--ui-green)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {busyAction === "publish-draft" ? "Publishing..." : "Publish to Etsy"}
                    </button>
                  </div>
                  {!canPublish && (
                    <p className="text-xs text-[var(--ui-yellow)]">
                      Publish is locked until review is completed and this exact draft is approved.
                    </p>
                  )}
                  {publishPreview && (
                    <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
                      <p className="text-sm">
                        Review status:{" "}
                        <strong>
                          {publishPreview.can_publish ? "ready to publish" : "action needed"}
                        </strong>
                      </p>
                      <p className="mt-1 text-xs text-[var(--ui-muted)]">
                        Preview hash: {publishPreview.preview_hash || "not available"} | Generated:{" "}
                        {publishPreview.preview_generated_at || "unknown"}
                      </p>
                      {publishPreview.warnings.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--ui-yellow)]">
                          {publishPreview.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      )}
                      {publishPreview.staged_flow.length > 0 && (
                        <div className="mt-2 text-xs text-[var(--ui-muted)]">
                          Flow: {publishPreview.staged_flow.join(" -> ")}
                        </div>
                      )}
                      <textarea
                        readOnly
                        value={JSON.stringify(publishPreview.payload_preview, null, 2)}
                        className="mt-2 min-h-40 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3 font-mono text-xs"
                      />
                    </div>
                  )}

                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Publish audit</p>
                      <button
                        type="button"
                        onClick={async () => {
                          setBusyAction("refresh-history");
                          try {
                            await loadPublishHistory();
                            setError(null);
                          } catch (err) {
                            setApiError(
                              "Could not refresh publish audit",
                              "We could not refresh publish audit history.",
                              err
                            );
                          } finally {
                            setBusyAction(null);
                          }
                        }}
                        disabled={busyAction != null}
                        className="rounded-lg border border-[var(--ui-border)] px-3 py-1.5 text-xs"
                      >
                        {busyAction === "refresh-history" ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                    {!publishHistory ? (
                      <p className="mt-2 text-xs text-[var(--ui-muted)]">
                        No audit data loaded yet.
                      </p>
                    ) : (
                      <>
                        <p className="mt-2 text-xs text-[var(--ui-muted)]">
                          Listed: {publishHistory.item?.is_listed ? "yes" : "no"} | Etsy listing id:{" "}
                          {publishHistory.item?.etsy_listing_id || "not set"} | Approved:{" "}
                          {publishHistory.item?.listing_approved_at || "not approved"} | Published:{" "}
                          {publishHistory.item?.listing_published_at || "not published"}
                        </p>
                        <div className="mt-2 text-xs text-[var(--ui-muted)]">
                          Latest previews:{" "}
                          {publishHistory.previews
                            .slice(0, 3)
                            .map((entry) => `${entry.created_at} (${entry.preview_hash.slice(0, 12)})`)
                            .join(" | ") || "none"}
                        </div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          Imports: {publishHistory.imports.length} | Exports: {publishHistory.exports.length}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
                    <h4 className="mb-2 text-sm font-semibold">Integrated AI settings</h4>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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
                        placeholder="Model (for example gpt-4.1-mini)"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={aiApiKeyDraft}
                        onChange={(e) => setAiApiKeyDraft(e.target.value)}
                        placeholder="New API key (leave blank to keep current)"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={aiConfig?.baseUrl ?? ""}
                        onChange={(e) =>
                          setAiConfig((current) => ({
                            provider: current?.provider ?? "openai",
                            model: current?.model ?? "gpt-4.1-mini",
                            baseUrl: e.target.value,
                            timeoutMs: current?.timeoutMs ?? 30000,
                            retryCount: current?.retryCount ?? 1,
                            tokenBudget: current?.tokenBudget ?? 2000,
                            apiKeyConfigured: current?.apiKeyConfigured ?? false,
                          }))
                        }
                        placeholder="Base URL (optional)"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={String(aiConfig?.timeoutMs ?? 30000)}
                        onChange={(e) =>
                          setAiConfig((current) => ({
                            provider: current?.provider ?? "openai",
                            model: current?.model ?? "gpt-4.1-mini",
                            baseUrl: current?.baseUrl ?? null,
                            timeoutMs: Number(e.target.value) || 30000,
                            retryCount: current?.retryCount ?? 1,
                            tokenBudget: current?.tokenBudget ?? 2000,
                            apiKeyConfigured: current?.apiKeyConfigured ?? false,
                          }))
                        }
                        placeholder="Timeout ms"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={saveAiSettings}
                        disabled={aiSettingsSaving}
                        className="rounded-lg bg-[var(--ui-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Save AI settings
                      </button>
                      <button
                        type="button"
                        onClick={testAiSettings}
                        disabled={aiSettingsSaving}
                        className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                      >
                        Test connection
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
                    <h4 className="mb-2 text-sm font-semibold">Etsy publish defaults</h4>
                    <p className="mb-3 text-xs text-[var(--ui-muted)]">
                      Required by Etsy publish flow. Images upload one-by-one with retry and
                      optional downscaling/compression.
                    </p>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <input
                        value={publishConfig.taxonomyId}
                        onChange={(e) =>
                          setPublishConfig((current) => ({
                            ...current,
                            taxonomyId: e.target.value,
                          }))
                        }
                        placeholder="taxonomy_id"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={publishConfig.shippingProfileId}
                        onChange={(e) =>
                          setPublishConfig((current) => ({
                            ...current,
                            shippingProfileId: e.target.value,
                          }))
                        }
                        placeholder="shipping_profile_id"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={publishConfig.readinessStateId}
                        onChange={(e) =>
                          setPublishConfig((current) => ({
                            ...current,
                            readinessStateId: e.target.value,
                          }))
                        }
                        placeholder="readiness_state_id"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={publishConfig.imageIds}
                        onChange={(e) =>
                          setPublishConfig((current) => ({
                            ...current,
                            imageIds: e.target.value,
                          }))
                        }
                        placeholder="image_ids (comma-separated)"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={publishConfig.whoMade}
                        onChange={(e) =>
                          setPublishConfig((current) => ({
                            ...current,
                            whoMade: e.target.value,
                          }))
                        }
                        placeholder="who_made (example: i_did)"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={publishConfig.whenMade}
                        onChange={(e) =>
                          setPublishConfig((current) => ({
                            ...current,
                            whenMade: e.target.value,
                          }))
                        }
                        placeholder="when_made (example: before_2000)"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={publishConfig.imageMaxDimension}
                        onChange={(e) =>
                          setPublishConfig((current) => ({
                            ...current,
                            imageMaxDimension: e.target.value,
                          }))
                        }
                        placeholder="image_max_dimension (default 2000)"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={publishConfig.imageTargetDpi}
                        onChange={(e) =>
                          setPublishConfig((current) => ({
                            ...current,
                            imageTargetDpi: e.target.value,
                          }))
                        }
                        placeholder="image_target_dpi (default 300)"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={publishConfig.imageJpegQuality}
                        onChange={(e) =>
                          setPublishConfig((current) => ({
                            ...current,
                            imageJpegQuality: e.target.value,
                          }))
                        }
                        placeholder="image_jpeg_quality (default 82)"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={publishConfig.imageUploadAttempts}
                        onChange={(e) =>
                          setPublishConfig((current) => ({
                            ...current,
                            imageUploadAttempts: e.target.value,
                          }))
                        }
                        placeholder="image_upload_attempts (default 3)"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
                      />
                      <input
                        value={publishConfig.allowPartialImageUpload}
                        onChange={(e) =>
                          setPublishConfig((current) => ({
                            ...current,
                            allowPartialImageUpload: e.target.value,
                          }))
                        }
                        placeholder="allow_partial_image_upload (true/false)"
                        className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm md:col-span-2"
                      />
                    </div>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={savePublishSettings}
                        disabled={aiSettingsSaving}
                        className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-sm"
                      >
                        Save publish defaults
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--ui-muted)]">
                  Create inventory items first to use listing authoring features.
                </p>
              )}
            </section>

            {error && (
              <div className="rounded-xl border border-[var(--ui-red)]/50 bg-[var(--ui-red)]/10 px-4 py-3">
                <p className="font-semibold text-[var(--ui-red)]">{error.title}</p>
                <p className="mt-1 text-[var(--ui-red)]">{error.message}</p>
                {error.actions.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--ui-red)]">
                    {error.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="text-xs text-[var(--ui-muted)]">
              UI quality baseline: clean hierarchy, fast scanning, clear status, and
              minimal-friction actions.
            </div>
          </>
        )}
      </main>
    </div>
  );
}
