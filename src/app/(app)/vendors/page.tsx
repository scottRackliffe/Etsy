"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { DataTable, type SortState } from "@/components/ui/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Badge } from "@/components/ui/Badge";
import { DropdownWithAddNew } from "@/components/ui/DropdownWithAddNew";
import { useApp } from "@/context/AppContext";
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

function VendorsPageInner() {
  const { setApiError, setError, pageSize: configPageSize } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [vendorSearch, setVendorSearch] = useState("");
  const debouncedSearch = useDebouncedValue(vendorSearch, 300);
  const [activeFilter, setActiveFilter] = useState<string | null>("1");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } = usePagination(configPageSize);

  // Create form state (minimal — just essentials)
  const [newName, setNewName] = useState("");
  const [newContactPerson, setNewContactPerson] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Detail editing state
  const [editName, setEditName] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress1, setEditAddress1] = useState("");
  const [editAddress2, setEditAddress2] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editPostalCode, setEditPostalCode] = useState("");
  const [editCountry, setEditCountry] = useState("US");
  const [editWebsite, setEditWebsite] = useState("");
  const [editAccountNumber, setEditAccountNumber] = useState("");
  const [editPaymentTerms, setEditPaymentTerms] = useState("");
  const [editTaxId, setEditTaxId] = useState("");
  const [editIsPreferred, setEditIsPreferred] = useState(false);
  const [editVendorCategory, setEditVendorCategory] = useState("");
  const [editDefaultShipping, setEditDefaultShipping] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // ZIP lookup
  const zipLookup = useZipLookup();
  const prevEditZipRef = useRef("");
  const [editZipWarning, setEditZipWarning] = useState<string | null>(null);

  // Purchase history for selected vendor
  const [purchases, setPurchases] = useState<VendorPurchase[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  // Confirm dialog
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Dropdown options (loaded from API)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [paymentTermsOptions, setPaymentTermsOptions] = useState<string[]>([]);
  const [shippingMethodOptions, setShippingMethodOptions] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/vendors/categories", {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json().catch(() => ({}))) as {
          categories?: string[];
          payment_terms?: string[];
          shipping_methods?: string[];
        };
        if (data.categories) setCategoryOptions(data.categories);
        if (data.payment_terms) setPaymentTermsOptions(data.payment_terms);
        if (data.shipping_methods) setShippingMethodOptions(data.shipping_methods);
      } catch { /* use empty defaults */ }
    })();
  }, []);

  const reloadDropdownOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/vendors/categories", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        categories?: string[];
        payment_terms?: string[];
        shipping_methods?: string[];
      };
      if (data.categories) setCategoryOptions(data.categories);
      if (data.payment_terms) setPaymentTermsOptions(data.payment_terms);
      if (data.shipping_methods) setShippingMethodOptions(data.shipping_methods);
    } catch { /* ignore */ }
  }, []);

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId) ?? null;

  // Sync edit fields when selected vendor changes
  useEffect(() => {
    if (selectedVendor) {
      setEditName(selectedVendor.name ?? "");
      setEditContactPerson(selectedVendor.contact_person ?? "");
      setEditEmail(selectedVendor.email ?? "");
      setEditPhone(selectedVendor.phone ?? "");
      setEditAddress1(selectedVendor.address_1 ?? "");
      setEditAddress2(selectedVendor.address_2 ?? "");
      setEditCity(selectedVendor.city ?? "");
      setEditState(selectedVendor.state ?? "");
      setEditPostalCode(selectedVendor.postal_code ?? "");
      setEditCountry(selectedVendor.country ?? "US");
      setEditWebsite(selectedVendor.website ?? "");
      setEditAccountNumber(selectedVendor.account_number ?? "");
      setEditPaymentTerms(selectedVendor.payment_terms ?? "");
      setEditTaxId(selectedVendor.tax_id ?? "");
      setEditIsPreferred(Boolean(selectedVendor.is_preferred));
      setEditVendorCategory(selectedVendor.vendor_category ?? "");
      setEditDefaultShipping(selectedVendor.default_shipping_method ?? "");
      setEditNotes(selectedVendor.notes ?? "");
      setEditZipWarning(null);
      prevEditZipRef.current = selectedVendor.postal_code ?? "";
    }
  }, [selectedVendor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadVendors = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (activeFilter === "1") params.set("is_active", "1");
    if (activeFilter === "0") params.set("is_active", "0");
    if (sort) {
      params.set("sort_by", sort.key);
      params.set("sort_dir", sort.dir);
    }
    const response = await fetch(`/api/vendors?${params}`, {
      headers: { Accept: "application/json" },
    });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
      items?: Vendor[];
      pagination?: PaginationInfo;
    };
    if (!response.ok) throw data;
    if (data.items) {
      setVendors(data.items);
      if (selectedVendorId != null && !data.items.some((v) => v.id === selectedVendorId)) {
        setSelectedVendorId(data.items[0]?.id ?? null);
      }
    }
    if (data.pagination) setTotal(data.pagination.total);
  }, [debouncedSearch, pageSize, offset, activeFilter, sort, setTotal, selectedVendorId]);

  useEffect(() => {
    void reloadVendors().catch((err) =>
      setApiError("Could not load vendors", "We could not load vendors.", err)
    );
  }, [reloadVendors, setApiError]);

  // Deep link: ?vendorId=<id>
  useEffect(() => {
    const raw = searchParams.get("vendorId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    if (vendors.some((v) => v.id === id)) {
      setSelectedVendorId(id);
    } else {
      void (async () => {
        try {
          const response = await fetch(`/api/vendors/${id}`, {
            headers: { Accept: "application/json" },
          });
          const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
            vendor?: Vendor;
          };
          if (!response.ok || !data.vendor) {
            setError({
              title: "Vendor not found",
              message: "That vendor may have been deleted.",
              actions: ["Choose another vendor from the list."],
            });
          } else {
            setVendors((current) =>
              current.some((v) => v.id === id) ? current : [data.vendor!, ...current]
            );
            setSelectedVendorId(id);
          }
        } catch (err) {
          setApiError("Could not open vendor", "We could not load the linked vendor.", err);
        }
      })();
    }
    router.replace(pathname);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load purchases for selected vendor
  const loadPurchases = useCallback(async (vendorId: number) => {
    setPurchasesLoading(true);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/purchases?limit=50`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        items?: VendorPurchase[];
      };
      if (!response.ok) throw data;
      setPurchases(data.items ?? []);
    } catch {
      setPurchases([]);
    } finally {
      setPurchasesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedVendorId) {
      setPurchases([]);
      return;
    }
    void loadPurchases(selectedVendorId);
  }, [selectedVendorId, loadPurchases]);

  const createVendorRecord = async () => {
    if (!newName.trim()) {
      setError({
        title: "Vendor name required",
        message: "Provide a name before creating a vendor.",
        actions: ["Enter a name and try again."],
      });
      return;
    }
    setBusyAction("create-vendor");
    try {
      const response = await apiFetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          contact_person: newContactPerson.trim() || null,
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        vendor?: Vendor;
      };
      if (!response.ok) throw data;
      if (data.vendor) {
        setVendors((current) => [data.vendor!, ...current]);
        setSelectedVendorId(data.vendor.id);
      }
      resetCreateForm();
      setError(null);
    } catch (err) {
      setApiError("Could not create vendor", "We could not create the vendor.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const resetCreateForm = () => {
    setNewName("");
    setNewContactPerson("");
    setNewEmail("");
    setNewPhone("");
  };

  const updateVendor = async () => {
    if (!selectedVendorId) return;
    setBusyAction("update-vendor");
    try {
      const response = await apiFetch(`/api/vendors/${selectedVendorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          contact_person: editContactPerson.trim() || null,
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
          address_1: editAddress1.trim() || null,
          address_2: editAddress2.trim() || null,
          city: editCity.trim() || null,
          state: editState.trim() || null,
          postal_code: editPostalCode.trim() || null,
          country: editCountry.trim() || "US",
          website: editWebsite.trim() || null,
          account_number: editAccountNumber.trim() || null,
          payment_terms: editPaymentTerms.trim() || null,
          tax_id: editTaxId.trim() || null,
          is_preferred: editIsPreferred ? 1 : 0,
          vendor_category: editVendorCategory.trim() || null,
          default_shipping_method: editDefaultShipping.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        vendor?: Vendor;
      };
      if (!response.ok) throw data;
      if (data.vendor) {
        setVendors((current) =>
          current.map((v) => (v.id === selectedVendorId ? data.vendor! : v))
        );
      }
      setError(null);
      void reloadDropdownOptions();
    } catch (err) {
      setApiError("Could not update vendor", "We could not update the vendor.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const deactivateVendor = async () => {
    if (!selectedVendorId) return;
    setBusyAction("delete-vendor");
    try {
      const response = await apiFetch(`/api/vendors/${selectedVendorId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setSelectedVendorId(null);
      await reloadVendors();
      setDeleteOpen(false);
      setError(null);
    } catch (err) {
      setApiError(
        "Could not deactivate vendor",
        "We could not deactivate the vendor.",
        err
      );
    } finally {
      setBusyAction(null);
    }
  };

  const reactivateVendor = async () => {
    if (!selectedVendorId) return;
    setBusyAction("reactivate-vendor");
    try {
      const response = await apiFetch(`/api/vendors/${selectedVendorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ is_active: 1 }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      await reloadVendors();
      setError(null);
    } catch (err) {
      setApiError(
        "Could not reactivate vendor",
        "We could not reactivate the vendor.",
        err
      );
    } finally {
      setBusyAction(null);
    }
  };

  const vendorColumns = useMemo(
    () => [
      {
        key: "name",
        header: "Name",
        sortable: true,
        render: (v: Vendor) => (
          <span className="inline-flex items-center gap-1.5">
            {v.name}
            {v.is_preferred ? (
              <Badge label="Preferred" variant="info" />
            ) : null}
            {!v.is_active ? (
              <Badge label="Inactive" variant="neutral" />
            ) : null}
          </span>
        ),
      },
      {
        key: "vendor_category",
        header: "Category",
        render: (v: Vendor) => v.vendor_category ?? "-",
      },
      {
        key: "contact_person",
        header: "Contact",
        sortable: true,
        render: (v: Vendor) => v.contact_person ?? "-",
      },
      {
        key: "location",
        header: "Location",
        sortable: true,
        sortKey: "city",
        render: (v: Vendor) =>
          [v.city, v.state].filter(Boolean).join(", ") || "-",
      },
    ],
    []
  );

  const editDirty =
    selectedVendor != null &&
    (editName !== (selectedVendor.name ?? "") ||
      editContactPerson !== (selectedVendor.contact_person ?? "") ||
      editEmail !== (selectedVendor.email ?? "") ||
      editPhone !== (selectedVendor.phone ?? "") ||
      editAddress1 !== (selectedVendor.address_1 ?? "") ||
      editAddress2 !== (selectedVendor.address_2 ?? "") ||
      editCity !== (selectedVendor.city ?? "") ||
      editState !== (selectedVendor.state ?? "") ||
      editPostalCode !== (selectedVendor.postal_code ?? "") ||
      editCountry !== (selectedVendor.country ?? "US") ||
      editWebsite !== (selectedVendor.website ?? "") ||
      editAccountNumber !== (selectedVendor.account_number ?? "") ||
      editPaymentTerms !== (selectedVendor.payment_terms ?? "") ||
      editTaxId !== (selectedVendor.tax_id ?? "") ||
      editIsPreferred !== Boolean(selectedVendor.is_preferred) ||
      editVendorCategory !== (selectedVendor.vendor_category ?? "") ||
      editDefaultShipping !== (selectedVendor.default_shipping_method ?? "") ||
      editNotes !== (selectedVendor.notes ?? ""));

  const fmt = (n: number | undefined | null) =>
    (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

  const inputCls = "w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm";
  const compactInputCls = "rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm";

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Vendors</h3>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ─── Left panel: list + detail ─── */}
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              value={vendorSearch}
              onChange={(e) => {
                setPage(0);
                setVendorSearch(e.target.value);
              }}
              placeholder="Search name, contact, email, phone, city..."
              className="min-w-[10rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
          </div>
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
          <DataTable
            columns={vendorColumns}
            data={vendors}
            selectedId={selectedVendorId}
            onRowClick={(v) => setSelectedVendorId(v.id)}
            sort={sort}
            onSortChange={(next) => {
              setPage(0);
              setSort(next ?? { key: "name", dir: "asc" });
            }}
            emptyMessage="No vendors on this page."
            keyboardNav
          />
          <PaginationBar page={page} pageSize={pageSize} total={listTotal} onPageChange={setPage} />

          {/* ─── Detail panel (below list, like CustomerDetailEditor) ─── */}
          {selectedVendor && (
            <>
              {/* Header row: name + actions */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[var(--ui-title)]">
                  {selectedVendor.name}
                </p>
                {selectedVendor.is_preferred ? <Badge label="Preferred" variant="info" /> : null}
                {!selectedVendor.is_active ? <Badge label="Inactive" variant="neutral" /> : null}
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => void updateVendor()}
                    busy={busyAction === "update-vendor"}
                    disabled={!editDirty || !editName.trim()}
                    data-save-button
                  >
                    Save changes
                  </Button>
                  {selectedVendor.is_active ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteOpen(true)}
                      disabled={busyAction != null}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() => void reactivateVendor()}
                      busy={busyAction === "reactivate-vendor"}
                      disabled={busyAction != null && busyAction !== "reactivate-vendor"}
                    >
                      Reactivate
                    </Button>
                  )}
                </div>
              </div>

              {/* Summary badges */}
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <span className="rounded-lg bg-[var(--ui-card-bg)] px-2 py-1 text-[var(--ui-muted)]">
                  Purchases: <strong className="text-[var(--ui-body)]">{selectedVendor.purchase_count ?? 0}</strong>
                </span>
                <span className="rounded-lg bg-[var(--ui-card-bg)] px-2 py-1 text-[var(--ui-muted)]">
                  Total spend: <strong className="text-[var(--ui-body)]">{fmt(selectedVendor.total_spend)}</strong>
                </span>
                {selectedVendor.last_purchase_date && (
                  <span className="rounded-lg bg-[var(--ui-card-bg)] px-2 py-1 text-[var(--ui-muted)]">
                    Last purchase: <strong className="text-[var(--ui-body)]">{selectedVendor.last_purchase_date}</strong>
                  </span>
                )}
              </div>

              {/* ─── Edit fields (2-col grid like CustomerDetailEditor) ─── */}
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                <FormField label="Vendor name" required>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Contact person">
                  <input value={editContactPerson} onChange={(e) => setEditContactPerson(e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Email">
                  <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" className={inputCls} />
                </FormField>
                <FormField label="Phone">
                  <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Address line 1">
                  <input value={editAddress1} onChange={(e) => setEditAddress1(e.target.value)} placeholder="Street address" className={inputCls} />
                </FormField>
                <FormField label="Address line 2">
                  <input value={editAddress2} onChange={(e) => setEditAddress2(e.target.value)} placeholder="Apt, suite, unit, etc." className={inputCls} />
                </FormField>
                <FormField label="Country">
                  <input
                    value={editCountry}
                    onChange={(e) => setEditCountry(e.target.value.toUpperCase())}
                    placeholder="US"
                    maxLength={2}
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Postal code" error={editZipWarning ?? undefined}>
                  <input
                    value={editPostalCode}
                    onChange={(e) => { setEditPostalCode(e.target.value); if (editZipWarning) setEditZipWarning(null); }}
                    onBlur={async () => {
                      const zip = editPostalCode.trim();
                      if (zip.length < 3) { setEditZipWarning(null); return; }
                      const zipChanged = zip !== prevEditZipRef.current.trim();
                      prevEditZipRef.current = zip;
                      if (!zipChanged && editCity && editState) return;
                      const result = await zipLookup(zip, editCountry || "US");
                      if (!result.valid) {
                        setEditZipWarning(`"${zip}" doesn't appear to be a valid postal code for ${editCountry || "US"}.`);
                      } else {
                        setEditZipWarning(null);
                      }
                      if (result.city && (zipChanged || !editCity)) setEditCity(result.city);
                      if (result.state && (zipChanged || !editState)) setEditState(result.state);
                    }}
                    placeholder="Postal code"
                    className={inputCls}
                  />
                </FormField>
                <FormField label="City">
                  <input value={editCity} onChange={(e) => setEditCity(e.target.value)} placeholder="City" className={inputCls} />
                </FormField>
                <FormField label="State">
                  <input
                    value={editState}
                    onChange={(e) => setEditState(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="ST"
                    maxLength={2}
                    className={inputCls}
                  />
                </FormField>
              </div>

              {/* ─── Business details (separate card, like ship-to addresses) ─── */}
              <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Business details</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <FormField label="Website">
                    <input value={editWebsite} onChange={(e) => setEditWebsite(e.target.value)} placeholder="https://..." className={inputCls} />
                  </FormField>
                  <FormField label="Account number">
                    <input value={editAccountNumber} onChange={(e) => setEditAccountNumber(e.target.value)} placeholder="Your acct # with this vendor" className={inputCls} />
                  </FormField>
                  <FormField label="Category">
                    <DropdownWithAddNew
                      value={editVendorCategory}
                      onChange={setEditVendorCategory}
                      options={categoryOptions}
                      placeholder="Select category..."
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="Payment terms">
                    <DropdownWithAddNew
                      value={editPaymentTerms}
                      onChange={setEditPaymentTerms}
                      options={paymentTermsOptions}
                      placeholder="Select terms..."
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="Default shipping method">
                    <DropdownWithAddNew
                      value={editDefaultShipping}
                      onChange={setEditDefaultShipping}
                      options={shippingMethodOptions}
                      placeholder="Select method..."
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="Tax ID / EIN">
                    <input value={editTaxId} onChange={(e) => setEditTaxId(e.target.value)} placeholder="For 1099 reporting" className={inputCls} />
                  </FormField>
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsPreferred}
                    onChange={(e) => setEditIsPreferred(e.target.checked)}
                    className="accent-[var(--ui-accent)]"
                  />
                  Preferred vendor
                </label>
              </div>

              {/* ─── Notes (separate card, like pinned note) ─── */}
              <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                <FormField label="Notes">
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes about this vendor..."
                    rows={3}
                    maxLength={2000}
                    spellCheck
                    className={`${inputCls} w-full`}
                  />
                </FormField>
              </div>

              {/* ─── Purchase history (separate card, like order history) ─── */}
              <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
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
                            <td className="py-1 pr-2 text-[var(--ui-muted)]">
                              {p.purchase_date ?? "-"}
                            </td>
                            <td className="py-1 pr-2">
                              {p.item_number ?? p.item_description ?? `Inventory #${p.inventory_id}`}
                            </td>
                            <td className="py-1 pr-2 text-right">{fmt(p.purchase_price)}</td>
                            <td className="py-1 text-right">{fmt(p.shipping_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ─── Right panel: add vendor (minimal, like Add customer) ─── */}
        <div className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
          <p className="text-sm font-semibold">Add vendor</p>
          <FormField label="Vendor name" required>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Business name"
              className={inputCls}
            />
          </FormField>
          <FormField label="Contact person">
            <input
              value={newContactPerson}
              onChange={(e) => setNewContactPerson(e.target.value)}
              placeholder="Contact name"
              className={inputCls}
            />
          </FormField>
          <FormField label="Email">
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className={inputCls}
            />
          </FormField>
          <FormField label="Phone">
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Phone"
              className={inputCls}
            />
          </FormField>
          <div className="flex items-center gap-2">
            <Button
              variant="accent"
              size="lg"
              onClick={() => void createVendorRecord()}
              busy={busyAction === "create-vendor"}
              disabled={!newName.trim()}
            >
              Create vendor
            </Button>
            {(newName || newContactPerson || newEmail || newPhone) && (
              <Button variant="secondary" onClick={resetCreateForm}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {listTotal === 0 && (
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
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void deactivateVendor()}
        title="Deactivate vendor?"
        description="This vendor will be marked inactive. They will still appear in historical purchase records and reports."
        affectedLabel={selectedVendor?.name}
        confirmLabel="Deactivate"
        confirmVariant="danger"
        busy={busyAction === "delete-vendor"}
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
