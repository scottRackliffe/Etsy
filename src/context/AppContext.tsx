"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { addNotificationEntry } from "@/lib/notifications";
import type { Shop, InventoryItem, Receipt, Customer, CustomerAddress, Order, UiError, ApiErrorShape, AiConfig, ListingReadiness, PublishPreview } from "@/types";

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

type IconConfig = {
  screenHeaderPath: string;
  reportHeaderPath: string;
  screenHeaderSizePx: string;
  reportHeaderWidthPx: string;
};

type AppState = {
  shops: Shop[];
  selectedShopId: number | null;
  receipts: Receipt[];
  orders: Order[];
  customers: Customer[];
  inventory: InventoryItem[];
  selectedItemId: number | null;
  selectedItem: InventoryItem | null;
  selectedOrderId: number | null;
  selectedCustomerId: number | null;
  customerAddresses: CustomerAddress[];
  listingReadiness: ListingReadiness | null;
  publishPreview: PublishPreview | null;
  publishHistory: PublishHistory | null;
  aiConfig: AiConfig | null;
  publishConfig: PublishConfig;
  iconConfig: IconConfig;
  count: number;
  loading: boolean;
  receiptsLoading: boolean;
  error: UiError | null;
  urlError: UiError | null;
  busyAction: string | null;
};

type AppActions = {
  setShops: React.Dispatch<React.SetStateAction<Shop[]>>;
  setSelectedShopId: React.Dispatch<React.SetStateAction<number | null>>;
  setReceipts: React.Dispatch<React.SetStateAction<Receipt[]>>;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setSelectedItemId: React.Dispatch<React.SetStateAction<number | null>>;
  setSelectedItem: React.Dispatch<React.SetStateAction<InventoryItem | null>>;
  setSelectedOrderId: React.Dispatch<React.SetStateAction<number | null>>;
  setSelectedCustomerId: React.Dispatch<React.SetStateAction<number | null>>;
  setCustomerAddresses: React.Dispatch<React.SetStateAction<CustomerAddress[]>>;
  setListingReadiness: React.Dispatch<React.SetStateAction<ListingReadiness | null>>;
  setPublishPreview: React.Dispatch<React.SetStateAction<PublishPreview | null>>;
  setPublishHistory: React.Dispatch<React.SetStateAction<PublishHistory | null>>;
  setAiConfig: React.Dispatch<React.SetStateAction<AiConfig | null>>;
  setPublishConfig: React.Dispatch<React.SetStateAction<PublishConfig>>;
  setIconConfig: React.Dispatch<React.SetStateAction<IconConfig>>;
  setCount: React.Dispatch<React.SetStateAction<number>>;
  setError: React.Dispatch<React.SetStateAction<UiError | null>>;
  setBusyAction: React.Dispatch<React.SetStateAction<string | null>>;
  setApiError: (title: string, fallbackMessage: string, payload: unknown) => void;
  connect: () => void;
  logout: () => Promise<void>;
};

type AppContextType = AppState & AppActions;

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

function parseUrlError(): UiError | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("error");
  const detail = params.get("detail");
  if (!code) return null;
  if (code === "oauth_denied") {
    return {
      title: "Etsy sign-in was canceled",
      message: detail ? decodeURIComponent(detail) : "Authorization was denied before completion.",
      actions: ["Click Connect Etsy and complete authorization.", "Verify you approved all requested scopes."],
    };
  }
  if (code === "invalid_callback") {
    return {
      title: "Sign-in verification failed",
      message: "The OAuth callback could not be validated.",
      actions: ["Retry Connect Etsy from the dashboard.", "If it repeats, verify ETSY_REDIRECT_URI configuration."],
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
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerAddresses, setCustomerAddresses] = useState<CustomerAddress[]>([]);
  const [listingReadiness, setListingReadiness] = useState<ListingReadiness | null>(null);
  const [publishPreview, setPublishPreview] = useState<PublishPreview | null>(null);
  const [publishHistory, setPublishHistory] = useState<PublishHistory | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [publishConfig, setPublishConfig] = useState<PublishConfig>({
    taxonomyId: "", shippingProfileId: "", readinessStateId: "", imageIds: "",
    whoMade: "i_did", whenMade: "before_2000", imageMaxDimension: "2000",
    imageTargetDpi: "300", imageJpegQuality: "82", allowPartialImageUpload: "false",
    imageUploadAttempts: "3",
  });
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
  const [urlError] = useState<UiError | null>(parseUrlError);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const setErrorWithNotify: React.Dispatch<React.SetStateAction<UiError | null>> = useCallback(
    (value) => {
      setError((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        if (next) {
          const isSuccess = /complete|saved|created|loaded|removed|success/i.test(next.title);
          addNotificationEntry({
            type: isSuccess ? "success" : "info",
            message: next.message ? `${next.title}: ${next.message}` : next.title,
          });
        }
        return next;
      });
    },
    []
  );

  const setApiError = useCallback((title: string, fallbackMessage: string, payload: unknown) => {
    const data = payload as ApiErrorShape;
    const message = data?.error?.user_message ?? data?.error?.message ?? fallbackMessage;
    const actions = data?.error?.actions ?? ["Try again.", "If this continues, refresh the page."];
    setError({ title, message, actions });
    addNotificationEntry({ type: "error", message: `${title}: ${message}` });
  }, []);

  const connect = useCallback(() => {
    window.location.href = "/api/auth/etsy";
  }, []);

  const logout = useCallback(async () => {
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
  }, []);

  // Load shops on mount
  useEffect(() => {
    let cancelled = false;
    fetch("/api/shop", { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & {
          shops?: Shop[];
          active_shop_id?: number | null;
        };
        if (r.status === 401) return { shops: [] as Shop[] };
        if (!r.ok) throw data;
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setError(null);
        setShops(data.shops ?? []);
        if (data.shops?.length) {
          const preferred = data.active_shop_id ?? data.shops[0].shop_id;
          const resolved = data.shops.find((shop) => shop.shop_id === preferred)?.shop_id ?? data.shops[0].shop_id;
          setSelectedShopId(resolved);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setApiError("Could not load shops", "We could not load your Etsy shops.", err);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [setApiError]);

  // Persist active shop
  useEffect(() => {
    if (selectedShopId == null || shops.length === 0) return;
    fetch("/api/settings/etsy.active_shop_id", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ value: String(selectedShopId) }),
    }).catch(() => {});
  }, [selectedShopId, shops.length]);

  // Load receipts when shop selected
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
        if (!r.ok) throw data;
        return data;
      })
      .then((data) => {
        const nextReceipts = data.results ?? data.items ?? [];
        const total = data.count ?? data.total ?? data.pagination?.total ?? nextReceipts.length;
        setReceipts(nextReceipts);
        setCount(total);
        setError(null);
      })
      .catch((err) => {
        setReceipts([]);
        setApiError("Could not load orders", "We could not load receipts for this shop.", err);
      })
      .finally(() => setReceiptsLoading(false));
  }, [selectedShopId, setApiError]);

  // Load inventory
  useEffect(() => {
    if (shops.length === 0) return;
    fetch("/api/inventory?limit=100", { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & { items?: InventoryItem[] };
        if (!r.ok) throw data;
        return data.items ?? [];
      })
      .then((items) => {
        setInventory(items);
        if (items.length > 0) setSelectedItemId((current) => current ?? items[0].id);
      })
      .catch((err) => setApiError("Could not load inventory", "We could not load inventory items.", err));
  }, [shops.length, setApiError]);

  // Load orders
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
        if (items.length > 0) setSelectedOrderId((current) => current ?? items[0].id);
      })
      .catch((err) => setApiError("Could not load orders", "We could not load local orders.", err));
  }, [shops.length, setApiError]);

  // Load customers
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
        if (items.length > 0) setSelectedCustomerId((current) => current ?? items[0].id);
      })
      .catch((err) => setApiError("Could not load customers", "We could not load customer records.", err));
  }, [shops.length, setApiError]);

  // Load selected item details
  useEffect(() => {
    if (!selectedItemId) return;
    setPublishPreview(null);
    setPublishHistory(null);
    fetch(`/api/inventory/${selectedItemId}`, { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & { item?: InventoryItem };
        if (!r.ok) throw data;
        return data.item ?? null;
      })
      .then((item) => setSelectedItem(item))
      .catch((err) => setApiError("Could not load selected item", "We could not load this inventory item.", err));

    fetch(`/api/inventory/${selectedItemId}/listing-readiness`, { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & ListingReadiness;
        if (!r.ok) throw data;
        return data;
      })
      .then((readiness) => setListingReadiness(readiness))
      .catch((err) => setApiError("Could not load listing readiness", "We could not evaluate listing readiness.", err));

    fetch(`/api/inventory/${selectedItemId}/publish-history?limit=5`, { headers: { Accept: "application/json" } })
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
      .catch(() => {});
  }, [selectedItemId, setApiError]);

  // Load customer addresses
  useEffect(() => {
    if (!selectedCustomerId || shops.length === 0) return;
    fetch(`/api/customers/${selectedCustomerId}/addresses`, { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & { items?: CustomerAddress[] };
        if (!r.ok) throw data;
        return data.items ?? [];
      })
      .then((items) => setCustomerAddresses(items))
      .catch((err) => setApiError("Could not load addresses", "We could not load customer addresses.", err));
  }, [selectedCustomerId, shops.length, setApiError]);

  // Load AI config
  useEffect(() => {
    if (shops.length === 0) return;
    fetch("/api/settings/ai", { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as ApiErrorShape & { config?: AiConfig };
        if (!r.ok) throw data;
        return data.config ?? null;
      })
      .then((config) => setAiConfig(config))
      .catch(() => {});
  }, [shops.length]);

  // Load publish and icon settings
  useEffect(() => {
    if (shops.length === 0) return;
    const load = async () => {
      const getSettingValue = async (key: string) => {
        const response = await fetch(`/api/settings/${encodeURIComponent(key)}`, { headers: { Accept: "application/json" } });
        const data = (await response.json().catch(() => ({}))) as { value?: string };
        if (!response.ok) return "";
        return data.value ?? "";
      };
      const [
        taxonomyId, shippingProfileId, readinessStateId, imageIds,
        whoMade, whenMade, imageMaxDimension, imageTargetDpi,
        imageJpegQuality, allowPartialImageUpload, imageUploadAttempts,
        screenHeaderPath, reportHeaderPath, screenHeaderSizePx, reportHeaderWidthPx,
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
        taxonomyId, shippingProfileId, readinessStateId, imageIds,
        whoMade: whoMade || "i_did", whenMade: whenMade || "before_2000",
        imageMaxDimension: imageMaxDimension || "2000", imageTargetDpi: imageTargetDpi || "300",
        imageJpegQuality: imageJpegQuality || "82", allowPartialImageUpload: allowPartialImageUpload || "false",
        imageUploadAttempts: imageUploadAttempts || "3",
      });
      setIconConfig({
        screenHeaderPath: screenHeaderPath || "/icons/screen-header.png",
        reportHeaderPath: reportHeaderPath || "/icons/report-header.png",
        screenHeaderSizePx: screenHeaderSizePx || "32",
        reportHeaderWidthPx: reportHeaderWidthPx || "220",
      });
    };
    load().catch(() => {});
  }, [shops.length]);

  const value: AppContextType = {
    shops, selectedShopId, receipts, orders, customers, inventory,
    selectedItemId, selectedItem, selectedOrderId, selectedCustomerId,
    customerAddresses, listingReadiness, publishPreview, publishHistory,
    aiConfig, publishConfig, iconConfig, count, loading, receiptsLoading,
    error, urlError, busyAction,
    setShops, setSelectedShopId, setReceipts, setOrders, setCustomers,
    setInventory, setSelectedItemId, setSelectedItem, setSelectedOrderId,
    setSelectedCustomerId, setCustomerAddresses, setListingReadiness,
    setPublishPreview, setPublishHistory, setAiConfig, setPublishConfig,
    setIconConfig, setCount, setError: setErrorWithNotify, setBusyAction, setApiError,
    connect, logout,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
