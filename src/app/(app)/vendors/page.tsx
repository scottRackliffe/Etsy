"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { type Column, type SortState } from "@/components/ui/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { Badge } from "@/components/ui/Badge";
import { DropdownWithAddNew } from "@/components/ui/DropdownWithAddNew";
import { SemsScreen, type SemsScreenController } from "@/components/sems/SemsScreen";
import { SemsEditor } from "@/components/sems/SemsEditor";
import { useSemsEditorGuard } from "@/components/sems/useSemsEditorGuard";
import { useApp } from "@/context/AppContext";
import { useDirtyTracking } from "@/hooks/useDirtyTracking";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePagination } from "@/hooks/usePagination";
import { useZipLookup } from "@/hooks/useZipLookup";
import { apiFetch } from "@/lib/api-fetch";
import type { ApiErrorShape, PaginationInfo, Vendor } from "@/types";

type VendorPurchase = {
  id: number;
  inventory_id: number;
  vendor_name: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  shipping_price: number | null;
  item_number: string | null;
  item_description: string | null;
};

type VendorForm = {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  website: string;
  account_number: string;
  payment_terms: string;
  tax_id: string;
  is_preferred: boolean;
  vendor_category: string;
  default_shipping_method: string;
  notes: string;
};

const EMPTY_FORM: VendorForm = {
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  address_1: "",
  address_2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "US",
  website: "",
  account_number: "",
  payment_terms: "",
  tax_id: "",
  is_preferred: false,
  vendor_category: "",
  default_shipping_method: "",
  notes: "",
};

function vendorToForm(v: Vendor): VendorForm {
  return {
    name: v.name ?? "",
    contact_person: v.contact_person ?? "",
    email: v.email ?? "",
    phone: v.phone ?? "",
    address_1: v.address_1 ?? "",
    address_2: v.address_2 ?? "",
    city: v.city ?? "",
    state: v.state ?? "",
    postal_code: v.postal_code ?? "",
    country: v.country ?? "US",
    website: v.website ?? "",
    account_number: v.account_number ?? "",
    payment_terms: v.payment_terms ?? "",
    tax_id: v.tax_id ?? "",
    is_preferred: Boolean(v.is_preferred),
    vendor_category: v.vendor_category ?? "",
    default_shipping_method: v.default_shipping_method ?? "",
    notes: v.notes ?? "",
  };
}

function formToBody(form: VendorForm): Record<string, unknown> {
  return {
    name: form.name.trim(),
    contact_person: form.contact_person.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    address_1: form.address_1.trim() || null,
    address_2: form.address_2.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    postal_code: form.postal_code.trim() || null,
    country: form.country.trim() || "US",
    website: form.website.trim() || null,
    account_number: form.account_number.trim() || null,
    payment_terms: form.payment_terms.trim() || null,
    tax_id: form.tax_id.trim() || null,
    is_preferred: form.is_preferred ? 1 : 0,
    vendor_category: form.vendor_category.trim() || null,
    default_shipping_method: form.default_shipping_method.trim() || null,
    notes: form.notes.trim() || null,
  };
}

const inputCls =
  "w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm";
const fmtCurrency = (n: number | undefined | null) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

type DropdownOptions = {
  categories: string[];
  paymentTerms: string[];
  shippingMethods: string[];
};

/* ─────────────────────────── Editor (Region 2 + Region 3) ─────────────────────────── */

function VendorEditor({
  record,
  options,
  onSaved,
  onDeactivateRequest,
  onReactivated,
  requestClose,
  done,
  reloadDropdownOptions,
}: {
  record: Vendor | null;
  options: DropdownOptions;
  onSaved: (vendor: Vendor, isNew: boolean) => void;
  onDeactivateRequest: (vendor: Vendor) => void;
  onReactivated: (vendor: Vendor) => void;
  requestClose: () => void;
  done: () => void;
  reloadDropdownOptions: () => void;
}) {
  const { setApiError, setError } = useApp();
  const initial = useMemo(() => (record ? vendorToForm(record) : EMPTY_FORM), [record]);
  const { current, setCurrent, savedState, isDirty, markClean } = useDirtyTracking<VendorForm>(initial);
  const form = current ?? EMPTY_FORM;

  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [active, setActive] = useState(record ? Boolean(record.is_active) : true);

  // ZIP lookup
  const zipLookup = useZipLookup();
  const prevZipRef = useRef(form.postal_code);
  const [zipWarning, setZipWarning] = useState<string | null>(null);

  // Purchase history
  const [purchases, setPurchases] = useState<VendorPurchase[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  useEffect(() => {
    if (!record) {
      setPurchases([]);
      return;
    }
    let cancelled = false;
    setPurchasesLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/vendors/${record.id}/purchases?limit=50`, {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
          items?: VendorPurchase[];
        };
        if (!cancelled) setPurchases(response.ok ? data.items ?? [] : []);
      } catch {
        if (!cancelled) setPurchases([]);
      } finally {
        if (!cancelled) setPurchasesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [record]);

  const set = useCallback(
    <K extends keyof VendorForm>(key: K, value: VendorForm[K]) => {
      setCurrent((prev) => ({ ...(prev ?? EMPTY_FORM), [key]: value }));
    },
    [setCurrent]
  );

  const save = useCallback(async (): Promise<boolean> => {
    const value = current ?? EMPTY_FORM;
    if (!value.name.trim()) {
      setNameError("Vendor name is required.");
      return false;
    }
    setNameError(null);
    setBusy(true);
    try {
      const isNew = record == null;
      const response = await apiFetch(isNew ? "/api/vendors" : `/api/vendors/${record!.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(formToBody(value)),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { vendor?: Vendor };
      if (!response.ok) throw data;
      markClean(value);
      reloadDropdownOptions();
      if (data.vendor) onSaved(data.vendor, isNew);
      setError(null);
      return true;
    } catch (err) {
      setApiError("Could not save vendor", "We could not save the vendor.", err);
      return false;
    } finally {
      setBusy(false);
    }
  }, [current, record, markClean, onSaved, reloadDropdownOptions, setApiError, setError]);

  const discard = useCallback(() => {
    setCurrent(savedState);
    setNameError(null);
    setZipWarning(null);
  }, [savedState, setCurrent]);

  useSemsEditorGuard({ isDirty, onSave: save, onDiscard: discard });

  const handleSaveClick = useCallback(() => {
    void (async () => {
      const ok = await save();
      if (ok) done();
    })();
  }, [save, done]);

  const reactivate = useCallback(async () => {
    if (!record) return;
    setBusy(true);
    try {
      const response = await apiFetch(`/api/vendors/${record.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ is_active: 1 }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { vendor?: Vendor };
      if (!response.ok) throw data;
      setActive(true);
      if (data.vendor) onReactivated(data.vendor);
      setError(null);
    } catch (err) {
      setApiError("Could not reactivate vendor", "We could not reactivate the vendor.", err);
    } finally {
      setBusy(false);
    }
  }, [record, onReactivated, setApiError, setError]);

  const badges = (
    <>
      {form.is_preferred ? <Badge label="Preferred" variant="info" /> : null}
      {record && !active ? <Badge label="Inactive" variant="neutral" /> : null}
    </>
  );

  const summary = record ? (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="rounded-lg bg-[var(--ui-card-bg)] px-2 py-1 text-[var(--ui-muted)]">
        Purchases: <strong className="text-[var(--ui-body)]">{record.purchase_count ?? 0}</strong>
      </span>
      <span className="rounded-lg bg-[var(--ui-card-bg)] px-2 py-1 text-[var(--ui-muted)]">
        Total spend: <strong className="text-[var(--ui-body)]">{fmtCurrency(record.total_spend)}</strong>
      </span>
      {record.last_purchase_date ? (
        <span className="rounded-lg bg-[var(--ui-card-bg)] px-2 py-1 text-[var(--ui-muted)]">
          Last purchase: <strong className="text-[var(--ui-body)]">{record.last_purchase_date}</strong>
        </span>
      ) : null}
      <div className="ml-auto">
        {active ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDeactivateRequest(record)}
            disabled={busy}
          >
            Deactivate
          </Button>
        ) : (
          <Button variant="accent" size="sm" onClick={() => void reactivate()} busy={busy}>
            Reactivate
          </Button>
        )}
      </div>
    </div>
  ) : null;

  const context =
    record != null ? (
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Purchase history</p>
        {purchasesLoading ? (
          <p className="text-xs text-[var(--ui-muted)]">Loading purchases...</p>
        ) : purchases.length === 0 ? (
          <p className="text-xs text-[var(--ui-muted)]">No purchases recorded for this vendor.</p>
        ) : (
          <div className="max-h-52 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--ui-border)] text-left text-[var(--ui-muted)]">
                  <th className="pb-1 pr-2">Date</th>
                  <th className="pb-1 pr-2">Item</th>
                  <th className="pb-1 pr-2 text-right">Cost</th>
                  <th className="pb-1 text-right">Shipping</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--ui-border)]/50">
                    <td className="py-1 pr-2 text-[var(--ui-muted)]">{p.purchase_date ?? "-"}</td>
                    <td className="py-1 pr-2">
                      {p.item_number ?? p.item_description ?? `Inventory #${p.inventory_id}`}
                    </td>
                    <td className="py-1 pr-2 text-right">{fmtCurrency(p.purchase_price)}</td>
                    <td className="py-1 text-right">{fmtCurrency(p.shipping_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    ) : null;

  return (
    <SemsEditor
      title={record ? record.name : "New vendor"}
      badges={badges}
      summary={summary}
      isDirty={isDirty}
      busy={busy}
      saveLabel={record ? "Save changes" : "Create vendor"}
      saveDisabled={!form.name.trim()}
      onSave={handleSaveClick}
      onCancel={requestClose}
      context={context}
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <FormField label="Vendor name" required error={nameError ?? undefined}>
          <input
            value={form.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (nameError) setNameError(null);
            }}
            className={inputCls}
          />
        </FormField>
        <FormField label="Contact person">
          <input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} className={inputCls} />
        </FormField>
        <FormField label="Email">
          <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" className={inputCls} />
        </FormField>
        <FormField label="Phone">
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
        </FormField>
        <FormField label="Address line 1">
          <input value={form.address_1} onChange={(e) => set("address_1", e.target.value)} placeholder="Street address" className={inputCls} />
        </FormField>
        <FormField label="Address line 2">
          <input value={form.address_2} onChange={(e) => set("address_2", e.target.value)} placeholder="Apt, suite, unit, etc." className={inputCls} />
        </FormField>
        <FormField label="Country">
          <input
            value={form.country}
            onChange={(e) => set("country", e.target.value.toUpperCase())}
            placeholder="US"
            maxLength={2}
            className={inputCls}
          />
        </FormField>
        <FormField label="Postal code" error={zipWarning ?? undefined}>
          <input
            value={form.postal_code}
            onChange={(e) => {
              set("postal_code", e.target.value);
              if (zipWarning) setZipWarning(null);
            }}
            onBlur={async () => {
              const zip = form.postal_code.trim();
              if (zip.length < 3) {
                setZipWarning(null);
                return;
              }
              const zipChanged = zip !== prevZipRef.current.trim();
              prevZipRef.current = zip;
              if (!zipChanged && form.city && form.state) return;
              const result = await zipLookup(zip, form.country || "US");
              if (!result.valid) {
                setZipWarning(`"${zip}" doesn't appear to be a valid postal code for ${form.country || "US"}.`);
              } else {
                setZipWarning(null);
              }
              if (result.city && (zipChanged || !form.city)) set("city", result.city);
              if (result.state && (zipChanged || !form.state)) set("state", result.state);
            }}
            placeholder="Postal code"
            className={inputCls}
          />
        </FormField>
        <FormField label="City">
          <input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="City" className={inputCls} />
        </FormField>
        <FormField label="State">
          <input
            value={form.state}
            onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))}
            placeholder="ST"
            maxLength={2}
            className={inputCls}
          />
        </FormField>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Business details</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <FormField label="Website">
            <input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://..." className={inputCls} />
          </FormField>
          <FormField label="Account number">
            <input value={form.account_number} onChange={(e) => set("account_number", e.target.value)} placeholder="Your acct # with this vendor" className={inputCls} />
          </FormField>
          <FormField label="Category">
            <DropdownWithAddNew
              value={form.vendor_category}
              onChange={(v) => set("vendor_category", v)}
              options={options.categories}
              placeholder="Select category..."
              className={inputCls}
            />
          </FormField>
          <FormField label="Payment terms">
            <DropdownWithAddNew
              value={form.payment_terms}
              onChange={(v) => set("payment_terms", v)}
              options={options.paymentTerms}
              placeholder="Select terms..."
              className={inputCls}
            />
          </FormField>
          <FormField label="Default shipping method">
            <DropdownWithAddNew
              value={form.default_shipping_method}
              onChange={(v) => set("default_shipping_method", v)}
              options={options.shippingMethods}
              placeholder="Select method..."
              className={inputCls}
            />
          </FormField>
          <FormField label="Tax ID / EIN">
            <input value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="For 1099 reporting" className={inputCls} />
          </FormField>
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_preferred}
            onChange={(e) => set("is_preferred", e.target.checked)}
            className="accent-[var(--ui-accent)]"
          />
          Preferred vendor
        </label>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <FormField label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Notes about this vendor..."
            rows={3}
            maxLength={2000}
            spellCheck
            className={`${inputCls} w-full`}
          />
        </FormField>
      </div>
    </SemsEditor>
  );
}

/* ─────────────────────────── Screen (Region 1) ─────────────────────────── */

function VendorsPageInner() {
  const { setApiError, setError, pageSize: configPageSize } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const debouncedSearch = useDebouncedValue(vendorSearch, 300);
  const [activeFilter, setActiveFilter] = useState<string | null>("1");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } = usePagination(configPageSize);

  const [options, setOptions] = useState<DropdownOptions>({
    categories: [],
    paymentTerms: [],
    shippingMethods: [],
  });

  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const controllerRef = useRef<SemsScreenController<Vendor> | null>(null);

  const reloadDropdownOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/vendors/categories", { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as {
        categories?: string[];
        payment_terms?: string[];
        shipping_methods?: string[];
      };
      setOptions({
        categories: data.categories ?? [],
        paymentTerms: data.payment_terms ?? [],
        shippingMethods: data.shipping_methods ?? [],
      });
    } catch {
      /* keep current options */
    }
  }, []);

  useEffect(() => {
    void reloadDropdownOptions();
  }, [reloadDropdownOptions]);

  const reloadVendors = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (activeFilter === "1") params.set("is_active", "1");
    if (activeFilter === "0") params.set("is_active", "0");
    if (sort) {
      params.set("sort_by", sort.key);
      params.set("sort_dir", sort.dir);
    }
    const response = await fetch(`/api/vendors?${params}`, { headers: { Accept: "application/json" } });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
      items?: Vendor[];
      pagination?: PaginationInfo;
    };
    if (!response.ok) throw data;
    if (data.items) setVendors(data.items);
    if (data.pagination) setTotal(data.pagination.total);
  }, [debouncedSearch, pageSize, offset, activeFilter, sort, setTotal]);

  useEffect(() => {
    void reloadVendors().catch((err) =>
      setApiError("Could not load vendors", "We could not load vendors.", err)
    );
  }, [reloadVendors, setApiError]);

  // Deep link: ?vendorId=<id> → open in editor
  useEffect(() => {
    const raw = searchParams.get("vendorId");
    if (!raw) return;
    const id = Number(raw);
    router.replace(pathname);
    if (!Number.isFinite(id)) return;
    void (async () => {
      const existing = vendors.find((v) => v.id === id);
      if (existing) {
        controllerRef.current?.openRecord(existing);
        return;
      }
      try {
        const response = await fetch(`/api/vendors/${id}`, { headers: { Accept: "application/json" } });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { vendor?: Vendor };
        if (!response.ok || !data.vendor) {
          setError({
            title: "Vendor not found",
            message: "That vendor may have been deleted.",
            actions: ["Choose another vendor from the list."],
          });
          return;
        }
        setVendors((current) => (current.some((v) => v.id === id) ? current : [data.vendor!, ...current]));
        controllerRef.current?.openRecord(data.vendor);
      } catch (err) {
        setApiError("Could not open vendor", "We could not load the linked vendor.", err);
      }
    })();
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useMemo<Column<Vendor>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        sortable: true,
        render: (v: Vendor) => (
          <span className="inline-flex items-center gap-1.5">
            {v.name}
            {v.is_preferred ? <Badge label="Preferred" variant="info" /> : null}
            {!v.is_active ? <Badge label="Inactive" variant="neutral" /> : null}
          </span>
        ),
      },
      { key: "vendor_category", header: "Category", render: (v: Vendor) => v.vendor_category ?? "-" },
      { key: "contact_person", header: "Contact", sortable: true, render: (v: Vendor) => v.contact_person ?? "-" },
      {
        key: "location",
        header: "Location",
        sortable: true,
        sortKey: "city",
        render: (v: Vendor) => [v.city, v.state].filter(Boolean).join(", ") || "-",
      },
    ],
    []
  );

  const upsertVendorInList = useCallback((vendor: Vendor) => {
    setVendors((current) =>
      current.some((v) => v.id === vendor.id) ? current.map((v) => (v.id === vendor.id ? vendor : v)) : [vendor, ...current]
    );
  }, []);

  const deactivate = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const response = await apiFetch(`/api/vendors/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setDeleteTarget(null);
      controllerRef.current?.closeToList();
      await reloadVendors();
      setError(null);
    } catch (err) {
      setApiError("Could not deactivate vendor", "We could not deactivate the vendor.", err);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, reloadVendors, setApiError, setError]);

  const filters = (
    <div className="space-y-2">
      <input
        value={vendorSearch}
        onChange={(e) => {
          setPage(0);
          setVendorSearch(e.target.value);
        }}
        placeholder="Search name, contact, email, phone, city..."
        className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
      />
      <FilterChipRow
        label="Status"
        value={activeFilter}
        onChange={(value) => {
          setPage(0);
          setActiveFilter(value);
        }}
        options={[
          { value: "1", label: "Active only" },
          { value: "0", label: "Inactive" },
        ]}
      />
    </div>
  );

  const emptyState = (
    <EmptyState
      message={
        vendorSearch.trim() || activeFilter !== "1"
          ? "No vendors match your filters."
          : "No vendors yet. Add your first vendor to track who you buy inventory from."
      }
      primaryAction={
        vendorSearch.trim() || activeFilter !== "1"
          ? {
              label: "Clear filters",
              onClick: () => {
                setVendorSearch("");
                setActiveFilter("1");
                setPage(0);
              },
            }
          : undefined
      }
    />
  );

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Vendors</h3>

      <SemsScreen<Vendor>
        entityLabel="Vendor"
        entityLabelPlural="Vendors"
        columns={columns}
        data={vendors}
        getRowTitle={(v) => v.name}
        sort={sort}
        onSortChange={(next) => {
          setPage(0);
          setSort(next ?? { key: "name", dir: "asc" });
        }}
        filters={filters}
        pagination={{ page, pageSize, total: listTotal, onPageChange: setPage }}
        emptyState={emptyState}
        onDeleteRow={(v) => setDeleteTarget(v)}
        controllerRef={controllerRef}
        addNewLabel="Add new vendor"
        renderEditor={({ record, requestClose, done }) => (
          <VendorEditor
            key={record?.id ?? "new"}
            record={record}
            options={options}
            requestClose={requestClose}
            done={done}
            reloadDropdownOptions={() => void reloadDropdownOptions()}
            onSaved={(vendor) => {
              upsertVendorInList(vendor);
              void reloadVendors();
            }}
            onReactivated={(vendor) => {
              upsertVendorInList(vendor);
              void reloadVendors();
            }}
            onDeactivateRequest={(vendor) => setDeleteTarget(vendor)}
          />
        )}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deactivate()}
        title="Deactivate vendor?"
        description="This vendor will be marked inactive. They will still appear in historical purchase records and reports."
        affectedLabel={deleteTarget?.name}
        confirmLabel="Deactivate"
        confirmVariant="danger"
        busy={deleteBusy}
      />
    </section>
  );
}

export default function VendorsPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 text-sm text-[var(--ui-muted)]">
          Loading vendors...
        </section>
      }
    >
      <VendorsPageInner />
    </Suspense>
  );
}
