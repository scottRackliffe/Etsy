"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type SortState } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { CustomerOrderHistory } from "@/components/customers/CustomerOrderHistory";
import { RepeatCustomerBadge } from "@/components/customers/RepeatCustomerBadge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePagination } from "@/hooks/usePagination";
import { DuplicateWarning } from "@/components/ui/DuplicateWarning";
import type { ApiErrorShape, Customer, CustomerAddress, PaginationInfo } from "@/types";

type CustomerNote = {
  id: number;
  customer_id: number;
  note_text: string;
  note_type: string;
  created_at: string;
};

const NOTE_TYPES = [
  { value: "general", label: "General" },
  { value: "shipping_preference", label: "Shipping preference" },
  { value: "communication", label: "Communication" },
  { value: "follow_up", label: "Follow up" },
  { value: "complaint", label: "Complaint" },
];

function CustomersPageInner() {
  const {
    customers, setCustomers, selectedCustomerId, setSelectedCustomerId,
    customerAddresses, setCustomerAddresses,
    busyAction, setBusyAction, setApiError, setError,
    shops,
    selectedShopId,
  } = useApp();

  const router = useRouter();
  const pathname = usePathname();
  const createEmailRef = useRef<HTMLInputElement>(null);
  const [scrollToCustomerId, setScrollToCustomerId] = useState<number | null>(null);

  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [customerDuplicates, setCustomerDuplicates] = useState<
    Array<{ id: number; first_name: string | null; last_name: string | null; email: string | null }>
  >([]);
  const [newAddressFirstLine, setNewAddressFirstLine] = useState("");
  const [newAddressCity, setNewAddressCity] = useState("");
  const [newAddressPostalCode, setNewAddressPostalCode] = useState("");
  const [newAddressCountry, setNewAddressCountry] = useState("US");
  const [deleteAddressTarget, setDeleteAddressTarget] = useState<CustomerAddress | null>(null);
  const [customerNotes, setCustomerNotes] = useState<CustomerNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteType, setNewNoteType] = useState("general");
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<CustomerNote | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const debouncedCustomerSearch = useDebouncedValue(customerSearch, 300);

  const checkCustomerDuplicate = async () => {
    const first = newCustomerFirstName.trim();
    const last = newCustomerLastName.trim();
    const email = newCustomerEmail.trim();
    if ((!first || !last) && !email) {
      setCustomerDuplicates([]);
      return;
    }
    try {
      const params = new URLSearchParams();
      if (first) params.set("first_name", first);
      if (last) params.set("last_name", last);
      if (email) params.set("email", email);
      const response = await fetch(`/api/customers/check-duplicate?${params}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        duplicates?: Array<{
          id: number;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
        }>;
      };
      if (response.ok) setCustomerDuplicates(data.duplicates ?? []);
    } catch {
      setCustomerDuplicates([]);
    }
  };
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } = usePagination(25);
  const [activeFilter, setActiveFilter] = useState<string | null>("1");
  const [sort, setSort] = useState<SortState>({ key: "last_name", dir: "asc" });

  const reloadCustomers = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (debouncedCustomerSearch.trim()) params.set("search", debouncedCustomerSearch.trim());
    if (activeFilter === "1") params.set("is_active", "1");
    if (activeFilter === "0") params.set("is_active", "0");
    if (sort) {
      params.set("sort_by", sort.key);
      params.set("sort_dir", sort.dir);
    }
    const response = await fetch(`/api/customers?${params}`, { headers: { Accept: "application/json" } });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
      items?: Customer[];
      pagination?: PaginationInfo;
    };
    if (!response.ok) throw data;
    if (data.items) setCustomers(data.items);
    if (data.pagination) setTotal(data.pagination.total);
  }, [debouncedCustomerSearch, pageSize, offset, activeFilter, sort, setCustomers, setTotal]);

  useEffect(() => {
    void reloadCustomers().catch((err) =>
      setApiError("Could not load customers", "We could not load customers.", err)
    );
  }, [reloadCustomers, setApiError]);

  const selectedIdList = useMemo(() => [...selectedIds], [selectedIds]);
  const allVisibleSelected = customers.length > 0 && customers.every((c) => selectedIds.has(c.id));
  const someVisibleSelected = customers.some((c) => selectedIds.has(c.id));

  const customerColumns = useMemo(
    () => [
      {
        key: "select",
        header: "",
        className: "w-8",
        render: (customer: Customer) => (
          <div onClick={(e) => e.stopPropagation()} role="presentation">
            <input
              type="checkbox"
              checked={selectedIds.has(customer.id)}
              onChange={() => toggleCustomerRow(customer.id)}
              aria-label={`Select customer ${customer.id}`}
            />
          </div>
        ),
      },
      {
        key: "name",
        header: "Name",
        sortable: true,
        sortKey: "last_name",
        render: (customer: Customer) => (
          <span className="inline-flex items-center gap-1.5">
            {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || `Customer ${customer.id}`}
            <RepeatCustomerBadge orderCount={customer.order_count} />
          </span>
        ),
      },
      { key: "email", header: "Email", sortable: true },
      { key: "phone", header: "Phone", sortable: true },
    ],
    [selectedIds]
  );

  const searchParams = useSearchParams();

  useEffect(() => {
    const raw = searchParams.get("customerId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;

    const applyDeepLink = async () => {
      if (customers.some((row) => row.id === id)) {
        setSelectedCustomerId(id);
        setScrollToCustomerId(id);
        router.replace(pathname);
        return;
      }
      try {
        const response = await fetch(`/api/customers/${id}`, { headers: { Accept: "application/json" } });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { customer?: Customer };
        if (!response.ok || !data.customer) {
          setError({
            title: "Customer not found",
            message: "That customer may have been deleted.",
            actions: ["Choose another customer from the list."],
          });
          router.replace(pathname);
          return;
        }
        setCustomers((current) =>
          current.some((row) => row.id === id) ? current : [data.customer!, ...current]
        );
        setSelectedCustomerId(id);
        setScrollToCustomerId(id);
        router.replace(pathname);
      } catch (err) {
        setApiError("Could not open customer", "We could not load the linked customer.", err);
      }
    };

    void applyDeepLink();
  }, [searchParams, customers, setSelectedCustomerId, setCustomers, router, pathname, setError, setApiError]);

  const selectedCustomer = customers.find((row) => row.id === selectedCustomerId) ?? null;

  const loadCustomerNotes = useCallback(async (customerId: number) => {
    setNotesLoading(true);
    try {
      const response = await fetch(`/api/customers/${customerId}/notes?limit=50`, {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { items?: CustomerNote[] };
      if (!response.ok) throw data;
      setCustomerNotes(data.items ?? []);
    } catch (err) {
      setApiError("Could not load notes", "We could not load customer notes.", err);
      setCustomerNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, [setApiError]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerNotes([]);
      return;
    }
    void loadCustomerNotes(selectedCustomerId);
  }, [selectedCustomerId, loadCustomerNotes]);

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
      setCustomerDuplicates([]);
      setError(null);
    } catch (err) {
      setApiError("Could not create customer", "We could not create the customer.", err);
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
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: CustomerAddress };
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

  const addCustomerNote = async () => {
    if (!selectedCustomerId || !newNoteText.trim()) return;
    setBusyAction("add-note");
    try {
      const response = await fetch(`/api/customers/${selectedCustomerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ note_text: newNoteText.trim(), note_type: newNoteType }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { note?: CustomerNote };
      if (!response.ok) throw data;
      if (data.note) {
        setCustomerNotes((current) => [data.note!, ...current]);
      }
      setNewNoteText("");
      setError(null);
    } catch (err) {
      setApiError("Could not save note", "We could not save the customer note.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const deleteCustomerNote = async () => {
    if (!deleteNoteTarget) return;
    setBusyAction("delete-note");
    try {
      const response = await fetch(`/api/customer-notes/${deleteNoteTarget.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok && response.status !== 204) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setCustomerNotes((current) => current.filter((row) => row.id !== deleteNoteTarget.id));
      setDeleteNoteTarget(null);
      setError(null);
    } catch (err) {
      setApiError("Could not delete note", "We could not delete that note.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const toggleCustomerRow = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisibleCustomers = () => {
    if (allVisibleSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(customers.map((c) => c.id)));
  };

  const batchDeleteCustomers = async () => {
    if (selectedIds.size === 0) return;
    setBusyAction("batch-delete-customers");
    try {
      const response = await fetch("/api/customers/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "delete", ids: selectedIdList }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        succeeded?: number;
        failed?: Array<{ id: number; reason: string }>;
      };
      if (!response.ok) throw data;
      setCustomers((current) => current.filter((row) => !selectedIds.has(row.id)));
      if (selectedCustomerId && selectedIds.has(selectedCustomerId)) {
        const remaining = customers.filter((row) => !selectedIds.has(row.id));
        setSelectedCustomerId(remaining[0]?.id ?? null);
      }
      setBatchDeleteOpen(false);
      setSelectedIds(new Set());
      setError({
        title: "Batch delete complete",
        message: `${data.succeeded ?? 0} customer(s) deleted.${(data.failed?.length ?? 0) > 0 ? ` ${data.failed!.length} skipped (have orders).` : ""}`,
        actions: ["Customers with orders cannot be deleted."],
      });
    } catch (err) {
      setApiError("Batch delete failed", "We could not delete selected customers.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const syncFromEtsy = async () => {
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
      await reloadCustomers();
      setError({
        title: "Etsy sync complete",
        message: "Customers and orders were updated from Etsy.",
        actions: ["Refresh the Customers tab to review new records."],
      });
    } catch (err) {
      setApiError("Could not sync from Etsy", "We could not sync Etsy receipts.", err);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Customers</h3>
      {selectedIds.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2">
          <span className="text-sm text-[var(--ui-body)]">{selectedIds.size} selected</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBatchDeleteOpen(true)}
              disabled={busyAction != null}
              className="rounded-lg border border-[var(--ui-red)]/40 px-3 py-1.5 text-sm text-[var(--ui-red)] disabled:opacity-60"
            >
              Delete
            </button>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="text-sm text-[var(--ui-accent)]">
              Clear
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              value={customerSearch}
              onChange={(e) => {
                setPage(0);
                setCustomerSearch(e.target.value);
              }}
              placeholder="Search name, email, phone…"
              className="min-w-[10rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
          </div>
          <FilterChipRow
            label="Active"
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
            columns={customerColumns}
            data={customers}
            selectedId={selectedCustomerId}
            onRowClick={(customer) => setSelectedCustomerId(customer.id)}
            sort={sort}
            onSortChange={(next) => {
              setPage(0);
              setSort(next ?? { key: "last_name", dir: "asc" });
            }}
            emptyMessage="No customers on this page."
            scrollToId={scrollToCustomerId}
            keyboardNav
          />
          <PaginationBar page={page} pageSize={pageSize} total={listTotal} onPageChange={setPage} />
          {selectedCustomer && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--ui-title)]">
                {[selectedCustomer.first_name, selectedCustomer.last_name].filter(Boolean).join(" ") ||
                  `Customer ${selectedCustomer.id}`}
              </p>
              <RepeatCustomerBadge orderCount={selectedCustomer.order_count} />
            </div>
          )}
          {selectedCustomer && (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                defaultValue={selectedCustomer.first_name ?? ""}
                onBlur={(e) => updateSelectedCustomer({ first_name: e.target.value })}
                placeholder="First name"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
              <input
                defaultValue={selectedCustomer.last_name ?? ""}
                onBlur={(e) => updateSelectedCustomer({ last_name: e.target.value })}
                placeholder="Last name"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
              <input
                defaultValue={selectedCustomer.phone ?? ""}
                onBlur={(e) => updateSelectedCustomer({ phone: e.target.value })}
                placeholder="Phone"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
              <input
                defaultValue={selectedCustomer.address_1 ?? ""}
                onBlur={(e) => updateSelectedCustomer({ address_1: e.target.value })}
                placeholder="Address"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
              <input
                defaultValue={selectedCustomer.postal_code ?? ""}
                onBlur={(e) => updateSelectedCustomer({ postal_code: e.target.value })}
                placeholder="Postal code"
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
              />
            </div>
          )}
          {selectedCustomer && (
            <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
              <p className="mb-2 text-sm font-semibold">Addresses</p>
              <div className="space-y-2">
                {customerAddresses.map((address) => (
                  <div key={address.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--ui-border)] px-2 py-1.5 text-xs">
                    <span>
                      {address.first_line ?? "-"}, {address.city ?? "-"} {address.postal_code ?? "-"} {address.country ?? "-"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeleteAddressTarget(address)}
                      disabled={busyAction != null}
                      className="rounded border border-[var(--ui-border)] px-2 py-1"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                <input value={newAddressFirstLine} onChange={(e) => setNewAddressFirstLine(e.target.value)} placeholder="Address line" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs md:col-span-2" />
                <input value={newAddressCity} onChange={(e) => setNewAddressCity(e.target.value)} placeholder="City" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs" />
                <input value={newAddressPostalCode} onChange={(e) => setNewAddressPostalCode(e.target.value)} placeholder="Postal" className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input value={newAddressCountry} onChange={(e) => setNewAddressCountry(e.target.value)} placeholder="Country" className="w-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs" />
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
          <CustomerOrderHistory
            customerId={selectedCustomerId}
            onError={(title, message, err) => setApiError(title, message, err)}
          />
          {selectedCustomer && (
            <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
              <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Interaction notes</p>
              {notesLoading ? (
                <p className="text-xs text-[var(--ui-muted)]">Loading notes…</p>
              ) : customerNotes.length === 0 ? (
                <p className="text-xs text-[var(--ui-muted)]">No notes yet for this customer.</p>
              ) : (
                <ul className="mb-3 max-h-40 space-y-2 overflow-auto">
                  {customerNotes.map((note) => (
                    <li key={note.id} className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1.5 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[var(--ui-body)]">{note.note_text}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--ui-muted)]">
                            {note.note_type.replace(/_/g, " ")} · {new Date(note.created_at).toLocaleString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeleteNoteTarget(note)}
                          disabled={busyAction != null}
                          className="shrink-0 rounded border border-[var(--ui-border)] px-2 py-0.5"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                <textarea
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Add a note about this customer…"
                  rows={2}
                  maxLength={2000}
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
                />
                <select
                  value={newNoteType}
                  onChange={(e) => setNewNoteType(e.target.value)}
                  className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
                >
                  {NOTE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={addCustomerNote}
                disabled={busyAction != null || !newNoteText.trim()}
                className="mt-2 rounded-lg bg-[var(--ui-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {busyAction === "add-note" ? "Saving…" : "Add note"}
              </button>
            </div>
          )}
        </div>
        <div className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
          <p className="text-sm font-semibold">Add customer</p>
          <input value={newCustomerFirstName} onChange={(e) => setNewCustomerFirstName(e.target.value)} placeholder="First name" className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <input value={newCustomerLastName} onChange={(e) => setNewCustomerLastName(e.target.value)} onBlur={() => void checkCustomerDuplicate()} placeholder="Last name" className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <input ref={createEmailRef} value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} onBlur={() => void checkCustomerDuplicate()} placeholder="Email" className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          {customerDuplicates.length > 0 ? (
            <DuplicateWarning
              message="A similar customer may already exist."
              links={customerDuplicates.map((row) => ({
                href: `/customers?customerId=${row.id}`,
                label:
                  [row.first_name, row.last_name].filter(Boolean).join(" ") ||
                  row.email ||
                  `Customer ${row.id}`,
              }))}
              onDismiss={() => setCustomerDuplicates([])}
            />
          ) : null}
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
      {listTotal === 0 ? (
        <EmptyState
          message={customerSearch.trim() || activeFilter !== "1" ? "No customers match your filters." : "No customers yet. They'll appear when you create orders or sync from Etsy."}
          primaryAction={
            customerSearch.trim() || activeFilter !== "1"
              ? {
                  label: "Clear filters",
                  onClick: () => {
                    setCustomerSearch("");
                    setActiveFilter("1");
                    setPage(0);
                  },
                }
              : shops.length > 0
                ? { label: "Sync from Etsy", onClick: () => void syncFromEtsy() }
                : { label: "Connect Etsy first", onClick: () => router.push("/config#etsy-connection"), variant: "secondary" }
          }
          secondaryAction={{ label: "Add customer", onClick: () => createEmailRef.current?.focus() }}
        />
      ) : null}

      <ConfirmDialog
        open={batchDeleteOpen}
        onClose={() => setBatchDeleteOpen(false)}
        onConfirm={() => void batchDeleteCustomers()}
        title={`Delete ${selectedIds.size} customers?`}
        description="Customers with existing orders cannot be deleted and will be skipped."
        confirmLabel="Delete customers"
        confirmVariant="danger"
        busy={busyAction === "batch-delete-customers"}
      />
      <ConfirmDialog
        open={deleteAddressTarget != null}
        onClose={() => setDeleteAddressTarget(null)}
        onConfirm={() => {
          if (deleteAddressTarget) void deleteAddress(deleteAddressTarget.id);
          setDeleteAddressTarget(null);
        }}
        title="Delete address?"
        description="This will remove the address from the customer record."
        affectedLabel={
          deleteAddressTarget
            ? [deleteAddressTarget.first_line, deleteAddressTarget.city].filter(Boolean).join(", ")
            : undefined
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={busyAction === "delete-address"}
      />
      <ConfirmDialog
        open={deleteNoteTarget != null}
        onClose={() => setDeleteNoteTarget(null)}
        onConfirm={() => void deleteCustomerNote()}
        title="Delete note?"
        description="This note will be permanently removed from the customer record."
        affectedLabel={deleteNoteTarget?.note_text.slice(0, 80)}
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={busyAction === "delete-note"}
      />
    </section>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 text-sm text-[var(--ui-muted)]">Loading customers...</section>}>
      <CustomersPageInner />
    </Suspense>
  );
}
