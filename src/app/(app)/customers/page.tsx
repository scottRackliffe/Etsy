"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { type Column, type DataTableSelection, type SortState } from "@/components/ui/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { Badge } from "@/components/ui/Badge";
import { BatchActionsBar } from "@/components/ui/BatchActionsBar";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { DuplicateWarning } from "@/components/ui/DuplicateWarning";
import { SemsScreen, type SemsScreenController } from "@/components/sems/SemsScreen";
import { SemsEditor } from "@/components/sems/SemsEditor";
import { useSemsEditorGuard } from "@/components/sems/useSemsEditorGuard";
import { CustomerOrderHistory } from "@/components/customers/CustomerOrderHistory";
import { CustomerMergeModal } from "@/components/customers/CustomerMergeModal";
import { CustomerDuplicatesModal } from "@/components/customers/CustomerDuplicatesModal";
import { RepeatCustomerBadge } from "@/components/customers/RepeatCustomerBadge";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { useApp } from "@/context/AppContext";
import { useConnection } from "@/context/ConnectionContext";
import { pickChangedFields, useUndoRedo } from "@/context/UndoRedoContext";
import { useTrackRecentlyViewed } from "@/context/RecentlyViewedContext";
import { useDirtyTracking } from "@/hooks/useDirtyTracking";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePagination } from "@/hooks/usePagination";
import { useZipLookup } from "@/hooks/useZipLookup";
import { useToast } from "@/hooks/useToast";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { useBatchOperation } from "@/hooks/useBatchOperation";
import { useEtsySync } from "@/hooks/useEtsySync";
import { useListSearchFromUrl } from "@/hooks/useListSearchFromUrl";
import { formatPhone } from "@/hooks/usePhoneFormat";
import { apiFetch, MutationQueueFullError } from "@/lib/api-fetch";
import { customerRecentlyViewedLabel } from "@/lib/recently-viewed";
import type { ApiErrorShape, Customer, CustomerAddress, PaginationInfo } from "@/types";

/* ─────────────────────────── Types / constants ─────────────────────────── */

type CustomerNote = {
  id: number;
  customer_id: number;
  note_text: string;
  note_type: string;
  created_at: string;
};

type CustomerForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  notes: string;
};

const EMPTY_FORM: CustomerForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address_1: "",
  address_2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "US",
  notes: "",
};

const NOTE_TYPES = [
  { value: "general", label: "General" },
  { value: "shipping_preference", label: "Shipping preference" },
  { value: "communication", label: "Communication" },
  { value: "follow_up", label: "Follow up" },
  { value: "complaint", label: "Complaint" },
];

const NOTE_TYPE_VARIANT: Record<string, "neutral" | "info" | "warning" | "error"> = {
  general: "neutral",
  shipping_preference: "info",
  communication: "info",
  follow_up: "warning",
  complaint: "error",
};

const inputCls =
  "w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm";

function customerToForm(c: Customer): CustomerForm {
  return {
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    address_1: c.address_1 ?? "",
    address_2: c.address_2 ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    postal_code: c.postal_code ?? "",
    country: c.country ?? "US",
    notes: c.notes ?? "",
  };
}

type DuplicateEntry = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  match_type: "name" | "email" | "both";
};

/* ─────────────────────────── Editor (Region 2 + Region 3) ─────────────────────────── */

function CustomerEditor({
  record,
  prefillFrom,
  prefillAddresses,
  onSaved,
  requestClose,
  done,
  onCopyAsNew,
}: {
  record: Customer | null;
  prefillFrom?: Customer | null;
  prefillAddresses?: CustomerAddress[];
  onSaved: (customer: Customer, isNew: boolean) => void;
  requestClose: () => void;
  done: () => void;
  onCopyAsNew?: (customer: Customer, addresses: CustomerAddress[]) => void;
}) {
  const { setApiError, setError } = useApp();
  const { patchWithUndo } = useUndoRedo();
  const isNew = record === null;

  const initial = useMemo<CustomerForm>(() => {
    if (record) return customerToForm(record);
    if (prefillFrom) {
      return {
        ...EMPTY_FORM,
        email: prefillFrom.email ?? "",
        phone: prefillFrom.phone ?? "",
        address_1: prefillFrom.address_1 ?? "",
        address_2: prefillFrom.address_2 ?? "",
        city: prefillFrom.city ?? "",
        state: prefillFrom.state ?? "",
        postal_code: prefillFrom.postal_code ?? "",
        country: prefillFrom.country ?? "US",
      };
    }
    return EMPTY_FORM;
  }, [record, prefillFrom]);

  const { current, setCurrent, savedState, isDirty, markClean } =
    useDirtyTracking<CustomerForm>(initial);
  const form = current ?? EMPTY_FORM;

  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CustomerForm, string>>>({});

  /* ZIP lookup */
  const zipLookup = useZipLookup();
  const prevZipRef = useRef(form.postal_code);
  const [zipWarning, setZipWarning] = useState<string | null>(null);

  /* Duplicate check (create mode only) */
  const [duplicates, setDuplicates] = useState<DuplicateEntry[]>([]);

  /* Ship-to addresses */
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [newAddrLine1, setNewAddrLine1] = useState("");
  const [newAddrLine2, setNewAddrLine2] = useState("");
  const [newAddrCity, setNewAddrCity] = useState("");
  const [newAddrState, setNewAddrState] = useState("");
  const [newAddrPostal, setNewAddrPostal] = useState("");
  const [newAddrCountry, setNewAddrCountry] = useState("US");
  const [shipToZipWarning, setShipToZipWarning] = useState<string | null>(null);
  const prevShipToPostalRef = useRef("");
  const [deleteAddressTarget, setDeleteAddressTarget] = useState<CustomerAddress | null>(null);
  const [addrBusy, setAddrBusy] = useState(false);

  /* Interaction notes */
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteType, setNewNoteType] = useState("general");
  const [noteTypeFilter, setNoteTypeFilter] = useState<string | null>(null);
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<CustomerNote | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);

  /* Load addresses + notes when record changes */
  useEffect(() => {
    if (!record) {
      setAddresses([]);
      setNotes([]);
      return;
    }
    let cancelled = false;
    setAddressesLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/customers/${record.id}/addresses?limit=50`, {
          headers: { Accept: "application/json" },
        });
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape & {
          items?: CustomerAddress[];
        };
        if (!cancelled) setAddresses(res.ok ? (data.items ?? []) : []);
      } catch {
        if (!cancelled) setAddresses([]);
      } finally {
        if (!cancelled) setAddressesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [record]);

  useEffect(() => {
    if (!record) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    setNotesLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/customers/${record.id}/notes?limit=50`, {
          headers: { Accept: "application/json" },
        });
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape & {
          items?: CustomerNote[];
        };
        if (!cancelled) setNotes(res.ok ? (data.items ?? []) : []);
      } catch {
        if (!cancelled) setNotes([]);
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [record]);

  const set = useCallback(
    <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) => {
      setCurrent((prev) => ({ ...(prev ?? EMPTY_FORM), [key]: value }));
      setFieldErrors((e) => {
        if (!e[key]) return e;
        const next = { ...e };
        delete next[key];
        return next;
      });
    },
    [setCurrent]
  );

  /* Duplicate check */
  const checkDuplicate = useCallback(async () => {
    if (!isNew) return;
    const first = form.first_name.trim();
    const last = form.last_name.trim();
    const email = form.email.trim();
    if ((!first || !last) && !email) {
      setDuplicates([]);
      return;
    }
    try {
      const params = new URLSearchParams();
      if (first) params.set("first_name", first);
      if (last) params.set("last_name", last);
      if (email) params.set("email", email);
      const res = await fetch(`/api/customers/check-duplicate?${params}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        duplicates?: Array<{ id: number; first_name: string | null; last_name: string | null; email: string | null }>;
      };
      if (res.ok) {
        setDuplicates(
          (data.duplicates ?? []).map((row) => {
            const nameMatch =
              first && last &&
              row.first_name?.trim().toLowerCase() === first.toLowerCase() &&
              row.last_name?.trim().toLowerCase() === last.toLowerCase();
            const emailMatch = email && row.email?.trim().toLowerCase() === email.toLowerCase();
            const match_type: "name" | "email" | "both" =
              nameMatch && emailMatch ? "both" : emailMatch ? "email" : "name";
            return { ...row, match_type };
          })
        );
      }
    } catch {
      setDuplicates([]);
    }
  }, [isNew, form.first_name, form.last_name, form.email]);

  /* Save (create or edit) */
  const save = useCallback(async (): Promise<boolean> => {
    const value = current ?? EMPTY_FORM;
    const errs: Partial<Record<keyof CustomerForm, string>> = {};
    if (!value.first_name.trim()) errs.first_name = "First name is required.";
    if (!value.last_name.trim()) errs.last_name = "Last name is required.";
    if (isNew && !value.email.trim()) errs.email = "Email is required.";
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return false;

    setBusy(true);
    try {
      if (isNew) {
        const res = await apiFetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            first_name: value.first_name.trim(),
            last_name: value.last_name.trim(),
            email: value.email.trim(),
            phone: value.phone.trim() || null,
            address_1: value.address_1.trim() || null,
            address_2: value.address_2.trim() || null,
            city: value.city.trim() || null,
            state: value.state.trim() || null,
            postal_code: value.postal_code.trim() || null,
            country: value.country.trim() || "US",
            notes: value.notes.trim() || null,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape & { customer?: Customer };
        if (!res.ok) throw data;
        if (data.customer && prefillAddresses?.length) {
          for (const addr of prefillAddresses) {
            try {
              await apiFetch(`/api/customers/${data.customer.id}/addresses`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                  first_line: addr.first_line,
                  second_line: addr.second_line,
                  city: addr.city,
                  state: addr.state,
                  postal_code: addr.postal_code,
                  country: addr.country,
                  label: addr.label,
                  is_default: addr.is_default,
                }),
              });
            } catch {
              /* best effort */
            }
          }
        }
        markClean(value);
        if (data.customer) onSaved(data.customer, true);
      } else {
        const payload: Record<string, unknown> = {
          first_name: value.first_name.trim() || null,
          last_name: value.last_name.trim() || null,
          phone: value.phone.trim() || null,
          address_1: value.address_1.trim() || null,
          address_2: value.address_2.trim() || null,
          city: value.city.trim() || null,
          state: value.state.trim() || null,
          postal_code: value.postal_code.trim() || null,
          country: value.country.trim() || "US",
          notes: value.notes.trim() || null,
        };
        const { previousState, newState } = pickChangedFields(
          record as unknown as Record<string, unknown>,
          payload
        );
        if (Object.keys(newState).length === 0) {
          markClean(value);
          return true;
        }
        const result = await patchWithUndo({
          action: "Updated customer details",
          entity: "customers",
          id: record!.id,
          updatedAt: record!.updated_at,
          previousState,
          newState,
          pickRecord: (d) => (d.customer as Customer | undefined) ?? null,
          onPatched: (updated) => {
            onSaved(updated, false);
          },
        });
        if (result.status === "stale") {
          setApiError(
            "Record changed elsewhere",
            "This customer was modified in another tab. Close the editor and reopen the record to get the latest version.",
            null
          );
          return false;
        }
        if (result.status === "error") throw new Error(result.message);
        markClean(value);
      }
      setError(null);
      return true;
    } catch (err) {
      if (err instanceof MutationQueueFullError) {
        setApiError("Too many pending changes", err.message, err);
        return false;
      }
      setApiError(
        isNew ? "Could not create customer" : "Could not update customer",
        isNew ? "We could not create the customer." : "We could not update this customer.",
        err
      );
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    current,
    isNew,
    record,
    prefillAddresses,
    markClean,
    onSaved,
    patchWithUndo,
    setApiError,
    setError,
  ]);

  const discard = useCallback(() => {
    setCurrent(savedState);
    setFieldErrors({});
    setZipWarning(null);
    setDuplicates([]);
  }, [savedState, setCurrent]);

  useSemsEditorGuard({ isDirty, onSave: save, onDiscard: discard });

  const handleSaveClick = useCallback(() => {
    void (async () => {
      const ok = await save();
      if (ok) done();
    })();
  }, [save, done]);

  /* Address handlers (immediate-commit) */
  const addAddress = useCallback(async () => {
    if (!record || !newAddrLine1.trim()) return;
    setAddrBusy(true);
    try {
      const res = await apiFetch(`/api/customers/${record.id}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          first_line: newAddrLine1.trim(),
          second_line: newAddrLine2.trim() || null,
          city: newAddrCity.trim() || null,
          state: newAddrState.trim() || null,
          postal_code: newAddrPostal.trim() || null,
          country: newAddrCountry.trim() || "US",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiErrorShape & { item?: CustomerAddress };
      if (!res.ok) throw data;
      if (data.item) setAddresses((cur) => [data.item!, ...cur]);
      setNewAddrLine1("");
      setNewAddrLine2("");
      setNewAddrCity("");
      setNewAddrState("");
      setNewAddrPostal("");
      setError(null);
    } catch (err) {
      setApiError("Could not add address", "We could not add the address.", err);
    } finally {
      setAddrBusy(false);
    }
  }, [record, newAddrLine1, newAddrLine2, newAddrCity, newAddrState, newAddrPostal, newAddrCountry, setApiError, setError]);

  const deleteAddress = useCallback(async (address: CustomerAddress) => {
    setAddrBusy(true);
    try {
      const res = await apiFetch(`/api/addresses/${address.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setAddresses((cur) => cur.filter((a) => a.id !== address.id));
      setDeleteAddressTarget(null);
      setError(null);
    } catch (err) {
      setApiError("Could not delete address", "We could not delete that address.", err);
    } finally {
      setAddrBusy(false);
    }
  }, [setApiError, setError]);

  const setDefaultAddress = useCallback(async (address: CustomerAddress) => {
    try {
      const res = await apiFetch(`/api/addresses/${address.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (res.ok) {
        setAddresses((cur) => cur.map((a) => ({ ...a, is_default: a.id === address.id ? 1 : 0 })));
      }
    } catch {
      /* ignore */
    }
  }, []);

  /* Note handlers (immediate-commit) */
  const addNote = useCallback(async () => {
    if (!record || !newNoteText.trim()) return;
    setNoteBusy(true);
    try {
      const res = await apiFetch(`/api/customers/${record.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ note_text: newNoteText.trim(), note_type: newNoteType }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiErrorShape & { note?: CustomerNote };
      if (!res.ok) throw data;
      if (data.note) setNotes((cur) => [data.note!, ...cur]);
      setNewNoteText("");
      setError(null);
    } catch (err) {
      setApiError("Could not save note", "We could not save the customer note.", err);
    } finally {
      setNoteBusy(false);
    }
  }, [record, newNoteText, newNoteType, setApiError, setError]);

  const deleteNote = useCallback(async (note: CustomerNote) => {
    setNoteBusy(true);
    try {
      const res = await apiFetch(`/api/customer-notes/${note.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setNotes((cur) => cur.filter((n) => n.id !== note.id));
      setDeleteNoteTarget(null);
      setError(null);
    } catch (err) {
      setApiError("Could not delete note", "We could not delete that note.", err);
    } finally {
      setNoteBusy(false);
    }
  }, [setApiError, setError]);

  /* Badges */
  const customerName = record
    ? [record.first_name, record.last_name].filter(Boolean).join(" ") || `Customer ${record.id}`
    : "New customer";

  const badges = record ? (
    <>
      <RepeatCustomerBadge orderCount={record.order_count} />
      {record.is_active === 0 ? <Badge label="Inactive" variant="neutral" /> : null}
    </>
  ) : prefillFrom ? (
    <Badge label="Copying from existing" variant="info" />
  ) : null;

  /* Summary row (edit mode) */
  const summary = record ? (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {record.email ? (
        <span className="rounded-lg bg-[var(--ui-card-bg)] px-2 py-1 text-[var(--ui-muted)]">
          {record.email}
        </span>
      ) : null}
      {record.order_count ? (
        <span className="rounded-lg bg-[var(--ui-card-bg)] px-2 py-1 text-[var(--ui-muted)]">
          Orders: <strong className="text-[var(--ui-body)]">{record.order_count}</strong>
        </span>
      ) : null}
      {onCopyAsNew ? (
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCopyAsNew(record, addresses)}
            title="Copy address and contact info to create a related customer (e.g. spouse)"
          >
            Copy as new
          </Button>
        </div>
      ) : null}
    </div>
  ) : null;

  /* Region 3 — context panels (edit mode only) */
  const context = record ? (
    <div className="space-y-3">
      {/* Ship-to addresses */}
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Ship-to addresses</p>
        {addressesLoading ? (
          <p className="text-xs text-[var(--ui-muted)]">Loading addresses…</p>
        ) : (
          <div className="space-y-2">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-xs ${
                  addr.is_default ? "border-[var(--ui-accent)]" : "border-[var(--ui-border)]"
                }`}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="default-ship-to"
                    checked={Boolean(addr.is_default)}
                    onChange={() => void setDefaultAddress(addr)}
                    className="accent-[var(--ui-accent)]"
                  />
                  <span className="truncate">
                    {addr.first_line ?? "-"}
                    {addr.second_line ? `, ${addr.second_line}` : ""}
                    {", "}
                    {addr.city ?? "-"}
                    {addr.state ? `, ${addr.state}` : ""} {addr.postal_code ?? "-"}{" "}
                    {addr.country ?? "-"}
                  </span>
                  {addr.is_default ? (
                    <span className="shrink-0 rounded bg-[var(--ui-accent)]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ui-accent)]">
                      Default
                    </span>
                  ) : null}
                </label>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteAddressTarget(addr)}
                  disabled={addrBusy}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            value={newAddrLine1}
            onChange={(e) => setNewAddrLine1(e.target.value)}
            placeholder="Address line 1"
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs"
          />
          <input
            value={newAddrLine2}
            onChange={(e) => setNewAddrLine2(e.target.value)}
            placeholder="Address line 2 (apt, suite, etc.)"
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs"
          />
        </div>
        <div className="mt-2 grid grid-cols-[auto_auto_1fr_auto] gap-2">
          <input
            value={newAddrCountry}
            onChange={(e) => setNewAddrCountry(e.target.value.toUpperCase())}
            placeholder="US"
            maxLength={2}
            className="w-14 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs"
          />
          <input
            value={newAddrPostal}
            onChange={(e) => {
              setNewAddrPostal(e.target.value);
              if (shipToZipWarning) setShipToZipWarning(null);
            }}
            onBlur={async () => {
              const zip = newAddrPostal.trim();
              if (zip.length < 3) {
                setShipToZipWarning(null);
                return;
              }
              const zipChanged = zip !== prevShipToPostalRef.current.trim();
              prevShipToPostalRef.current = zip;
              if (!zipChanged && newAddrCity && newAddrState) return;
              const result = await zipLookup(zip, newAddrCountry || "US");
              if (!result.valid) {
                setShipToZipWarning(`"${zip}" doesn't appear to be a valid postal code.`);
              } else {
                setShipToZipWarning(null);
              }
              if (result.city && (zipChanged || !newAddrCity)) setNewAddrCity(result.city);
              if (result.state && (zipChanged || !newAddrState)) setNewAddrState(result.state);
            }}
            placeholder="ZIP"
            className="w-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs"
          />
          <input
            value={newAddrCity}
            onChange={(e) => setNewAddrCity(e.target.value)}
            placeholder="City"
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs"
          />
          <input
            value={newAddrState}
            onChange={(e) => setNewAddrState(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="ST"
            maxLength={2}
            className="w-14 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-xs"
          />
        </div>
        {shipToZipWarning ? (
          <p className="mt-1 text-xs text-[var(--ui-red)]" role="alert">
            {shipToZipWarning}
          </p>
        ) : null}
        <div className="mt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void addAddress()}
            busy={addrBusy}
            disabled={!newAddrLine1.trim()}
          >
            Add address
          </Button>
        </div>
      </div>

      {/* Interaction notes */}
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Interaction notes</p>
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
          <textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            placeholder="Add a note about this customer…"
            rows={3}
            maxLength={2000}
            spellCheck
            className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
          />
          <select
            value={newNoteType}
            onChange={(e) => setNewNoteType(e.target.value)}
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
          >
            {NOTE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="accent"
          size="sm"
          onClick={() => void addNote()}
          busy={noteBusy}
          disabled={!newNoteText.trim()}
          className="mb-3"
        >
          Add note
        </Button>
        <FilterChipRow
          label="Type"
          value={noteTypeFilter}
          onChange={setNoteTypeFilter}
          options={NOTE_TYPES}
        />
        {notesLoading ? (
          <p className="text-xs text-[var(--ui-muted)]">Loading notes…</p>
        ) : notes.length === 0 ? (
          <p className="text-xs text-[var(--ui-muted)]">No notes yet for this customer.</p>
        ) : (
          <ul className="mt-2 max-h-40 space-y-2 overflow-auto">
            {notes
              .filter((n) => !noteTypeFilter || n.note_type === noteTypeFilter)
              .map((note) => (
                <li
                  key={note.id}
                  className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[var(--ui-body)]">{note.note_text}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--ui-muted)]">
                        <Badge
                          label={note.note_type.replace(/_/g, " ")}
                          variant={NOTE_TYPE_VARIANT[note.note_type] ?? "neutral"}
                        />
                        <span>{new Date(note.created_at).toLocaleString()}</span>
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteNoteTarget(note)}
                      disabled={noteBusy}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Order history */}
      <CustomerOrderHistory
        customerId={record.id}
        onError={(title, message, err) => setApiError(title, message, err)}
      />

      {/* Activity timeline */}
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          Recent activity
        </p>
        <ActivityTimeline entityType="customer" entityId={record.id} />
      </div>

      {/* Address delete confirm */}
      <ConfirmDialog
        open={deleteAddressTarget != null}
        onClose={() => setDeleteAddressTarget(null)}
        onConfirm={() => {
          if (deleteAddressTarget) void deleteAddress(deleteAddressTarget);
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
        busy={addrBusy}
      />

      {/* Note delete confirm */}
      <ConfirmDialog
        open={deleteNoteTarget != null}
        onClose={() => setDeleteNoteTarget(null)}
        onConfirm={() => {
          if (deleteNoteTarget) void deleteNote(deleteNoteTarget);
        }}
        title="Delete note?"
        description="This note will be permanently removed from the customer record."
        affectedLabel={deleteNoteTarget?.note_text.slice(0, 80)}
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={noteBusy}
      />
    </div>
  ) : null;

  return (
    <SemsEditor
      title={customerName}
      badges={badges}
      summary={summary}
      isDirty={isDirty}
      busy={busy}
      saveLabel={isNew ? "Create customer" : "Save changes"}
      saveDisabled={
        isNew
          ? !form.first_name.trim() || !form.last_name.trim() || !form.email.trim()
          : !form.first_name.trim() || !form.last_name.trim()
      }
      onSave={handleSaveClick}
      onCancel={requestClose}
      context={context}
    >
      {/* Email — shown in create form; read-only label in edit form */}
      {isNew ? (
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <FormField label="First name" required error={fieldErrors.first_name}>
            <input
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
              placeholder="First name"
              className={inputCls}
            />
          </FormField>
          <FormField label="Last name" required error={fieldErrors.last_name}>
            <input
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              onBlur={() => void checkDuplicate()}
              placeholder="Last name"
              className={inputCls}
            />
          </FormField>
          <FormField label="Email" required error={fieldErrors.email}>
            <input
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              onBlur={() => void checkDuplicate()}
              type="email"
              placeholder="Email address"
              className={inputCls}
            />
          </FormField>
          <FormField label="Phone">
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              onBlur={() => {
                const formatted = formatPhone(form.phone, form.country || "US");
                if (formatted !== form.phone) set("phone", formatted);
              }}
              placeholder="Phone"
              className={inputCls}
            />
          </FormField>
          {duplicates.length > 0 ? (
            <div className="md:col-span-2">
              <DuplicateWarning
                message="A similar customer may already exist."
                links={duplicates.map((row) => ({
                  href: `/customers?customerId=${row.id}`,
                  label:
                    row.match_type === "email"
                      ? `Email already exists: ${row.email}`
                      : row.match_type === "both"
                        ? `Similar name: ${[row.first_name, row.last_name].filter(Boolean).join(" ")} (${row.email})`
                        : `Similar name: ${[row.first_name, row.last_name].filter(Boolean).join(" ") || `Customer ${row.id}`}`,
                }))}
                onDismiss={() => setDuplicates([])}
              />
            </div>
          ) : null}
          {prefillFrom ? (
            <div className="md:col-span-2">
              <p className="rounded-lg bg-[var(--ui-accent)]/10 px-2 py-1.5 text-xs text-[var(--ui-accent)]">
                Copying address and contact from{" "}
                {[prefillFrom.first_name, prefillFrom.last_name].filter(Boolean).join(" ")}.
                Update the name and email before saving.
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <FormField label="First name" required error={fieldErrors.first_name}>
            <input
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
              placeholder="First name"
              className={inputCls}
            />
          </FormField>
          <FormField label="Last name" required error={fieldErrors.last_name}>
            <input
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              placeholder="Last name"
              className={inputCls}
            />
          </FormField>
          <FormField label="Phone">
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              onBlur={() => {
                const formatted = formatPhone(form.phone, form.country || "US");
                if (formatted !== form.phone) set("phone", formatted);
              }}
              placeholder="Phone"
              className={inputCls}
            />
          </FormField>
        </div>
      )}

      {/* Billing address */}
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Billing address</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <FormField label="Address line 1" required error={fieldErrors.address_1}>
            <input
              value={form.address_1}
              onChange={(e) => set("address_1", e.target.value)}
              placeholder="Street address"
              className={inputCls}
            />
          </FormField>
          <FormField label="Address line 2">
            <input
              value={form.address_2}
              onChange={(e) => set("address_2", e.target.value)}
              placeholder="Apt, suite, unit, etc."
              className={inputCls}
            />
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
                  setZipWarning(
                    `"${zip}" doesn't appear to be a valid postal code for ${form.country || "US"}.`
                  );
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
            <input
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="City"
              className={inputCls}
            />
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
      </div>

      {/* Pinned note (folded into main draft) */}
      <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <FormField
          label="Pinned note"
          helpText="A quick note visible at the top of this customer's record."
        >
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Add a pinned note for this customer…"
            rows={2}
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

function CustomersPageInner() {
  const { setApiError, setError, shops, selectedShopId, pageSize: configPageSize } = useApp();
  const { state: connectionState } = useConnection();
  const isOffline = connectionState !== "online";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const debouncedSearch = useDebouncedValue(customerSearch, 300);
  const [activeFilter, setActiveFilter] = useState<string | null>("1");
  const [sort, setSort] = useState<SortState>({ key: "last_name", dir: "asc" });
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } = usePagination(configPageSize);
  useListSearchFromUrl(setCustomerSearch, () => setPage(0));

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [duplicatesModalOpen, setDuplicatesModalOpen] = useState(false);
  const [mergePrimaryId, setMergePrimaryId] = useState<number | null>(null);
  const [mergeSecondaryId, setMergeSecondaryId] = useState<number | null>(null);

  /* Copy-as-new state */
  const [copySource, setCopySource] = useState<Customer | null>(null);
  const [copySourceAddresses, setCopySourceAddresses] = useState<CustomerAddress[]>([]);

  /* Open-record tracking for recently viewed */
  const [openedRecord, setOpenedRecord] = useState<Customer | null>(null);
  useTrackRecentlyViewed(
    "customer",
    openedRecord?.id ?? null,
    openedRecord ? customerRecentlyViewedLabel(openedRecord) : null
  );

  const controllerRef = useRef<SemsScreenController<Customer> | null>(null);

  /* Batch */
  const batch = useBatchSelection(customers, listTotal);
  const {
    runBatch,
    busy: batchBusy,
    progressOpen,
    progressTitle,
    progressTotal,
    progressCurrent,
  } = useBatchOperation();

  const batchFilter = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      is_active: activeFilter === "1" ? 1 : activeFilter === "0" ? 0 : undefined,
    }),
    [debouncedSearch, activeFilter]
  );

  const buildBatchBody = useCallback(
    (action: string) =>
      batch.selectAllMatching
        ? { action, filter: batchFilter }
        : { action, ids: batch.selectedIdList },
    [batch.selectAllMatching, batch.selectedIdList, batchFilter]
  );

  const batchSelection: DataTableSelection = useMemo(
    () => ({
      selectedIds: batch.selectedIds,
      onToggleRow: batch.toggleRow,
      onToggleAllVisible: batch.toggleAllVisible,
      allVisibleSelected: batch.allVisibleSelected,
      indeterminate: batch.headerIndeterminate,
    }),
    [batch]
  );

  /* Etsy sync */
  const { modal: syncModal, runSync } = useEtsySync();

  /* Load customers */
  const reloadCustomers = useCallback(async () => {
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
    const res = await fetch(`/api/customers?${params}`, {
      headers: { Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as ApiErrorShape & {
      items?: Customer[];
      pagination?: PaginationInfo;
    };
    if (!res.ok) throw data;
    if (data.items) setCustomers(data.items);
    if (data.pagination) setTotal(data.pagination.total);
  }, [debouncedSearch, pageSize, offset, activeFilter, sort, setTotal]);

  useEffect(() => {
    void reloadCustomers().catch((err) =>
      setApiError("Could not load customers", "We could not load customers.", err)
    );
  }, [reloadCustomers, setApiError]);

  const upsertCustomerInList = useCallback((customer: Customer) => {
    setCustomers((cur) =>
      cur.some((c) => c.id === customer.id)
        ? cur.map((c) => (c.id === customer.id ? customer : c))
        : [customer, ...cur]
    );
  }, []);

  /* Delete single customer */
  const deleteCustomer = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await apiFetch(`/api/customers/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setDeleteTarget(null);
      controllerRef.current?.closeToList();
      setCustomers((cur) => cur.filter((c) => c.id !== deleteTarget.id));
      setError(null);
    } catch (err) {
      setApiError(
        "Could not delete customer",
        "We could not delete this customer. Customers with existing orders cannot be deleted.",
        err
      );
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, setApiError, setError]);

  /* Batch delete */
  const batchDeleteCustomers = useCallback(async () => {
    if (batch.selectionCount === 0) return;
    try {
      const { ok, feedback } = await runBatch(
        "/api/customers/batch",
        buildBatchBody("delete"),
        { entity: "customer", actionPast: "deleted", count: batch.selectionCount }
      );
      if (!ok) throw new Error(feedback.message);
      if (batch.selectAllMatching) await reloadCustomers();
      else {
        setCustomers((cur) => cur.filter((c) => !batch.selectedIds.has(c.id)));
      }
      setBatchDeleteOpen(false);
      batch.clearSelection();
      setError({ title: feedback.title, message: feedback.message, actions: [] });
    } catch (err) {
      setApiError("Batch delete failed", "We could not delete selected customers.", err);
    }
  }, [batch, runBatch, buildBatchBody, reloadCustomers, setApiError, setError]);

  /* Etsy sync */
  const syncFromEtsy = useCallback(() => {
    if (!selectedShopId) return;
    void runSync(selectedShopId, {
      onSuccess: async (result) => {
        await reloadCustomers();
        const synced = result.synced ?? 0;
        toast.showToast(
          synced > 0
            ? `Synced ${synced} order${synced !== 1 ? "s" : ""} — customers updated.`
            : "Etsy sync complete — no new orders to import.",
          synced > 0 ? "success" : "info"
        );
      },
      onError: (err) => {
        setApiError("Could not sync from Etsy", "We could not sync Etsy receipts.", err);
      },
    });
  }, [selectedShopId, runSync, reloadCustomers, toast, setApiError]);

  /* Merge */
  const openMergeModal = useCallback((primaryId?: number | null, secondaryId?: number | null) => {
    setMergePrimaryId(primaryId ?? null);
    setMergeSecondaryId(secondaryId ?? null);
    setMergeModalOpen(true);
  }, []);

  const handleCustomerMerged = useCallback(
    async (primaryId: number) => {
      await reloadCustomers();
      setError({
        title: "Customers merged",
        message: "Orders and addresses were moved to the primary customer.",
        actions: [],
      });
      const merged = customers.find((c) => c.id === primaryId);
      if (merged) controllerRef.current?.openRecord(merged);
    },
    [reloadCustomers, customers, setError]
  );

  /* Deep link: ?customerId=<id> → open in editor */
  useEffect(() => {
    const raw = searchParams.get("customerId");
    if (!raw) return;
    const id = Number(raw);
    router.replace(pathname);
    if (!Number.isFinite(id)) return;
    void (async () => {
      const existing = customers.find((c) => c.id === id);
      if (existing) {
        controllerRef.current?.openRecord(existing);
        return;
      }
      try {
        const res = await fetch(`/api/customers/${id}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape & { customer?: Customer };
        if (!res.ok || !data.customer) {
          setError({
            title: "Customer not found",
            message: "That customer may have been deleted.",
            actions: ["Choose another customer from the list."],
          });
          return;
        }
        setCustomers((cur) => (cur.some((c) => c.id === id) ? cur : [data.customer!, ...cur]));
        controllerRef.current?.openRecord(data.customer);
      } catch (err) {
        setApiError("Could not open customer", "We could not load the linked customer.", err);
      }
    })();
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Columns */
  const columns = useMemo<Column<Customer>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        sortable: true,
        sortKey: "last_name",
        render: (c: Customer) => (
          <span className="inline-flex items-center gap-1.5">
            {[c.first_name, c.last_name].filter(Boolean).join(" ") || `Customer ${c.id}`}
            <RepeatCustomerBadge orderCount={c.order_count} />
          </span>
        ),
      },
      { key: "email", header: "Email", sortable: true },
      { key: "phone", header: "Phone", sortable: true },
    ],
    []
  );

  const filters = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={customerSearch}
          onChange={(e) => {
            setPage(0);
            setCustomerSearch(e.target.value);
          }}
          placeholder="Search name, email, phone…"
          className="min-w-[10rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
        <Button variant="accent" size="sm" onClick={() => openMergeModal()}>
          Merge customers
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setDuplicatesModalOpen(true)}>
          Find duplicates
        </Button>
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
    </div>
  );

  const emptyState = (
    <EmptyState
      message={
        customerSearch.trim() || activeFilter !== "1"
          ? "No customers match your filters."
          : "No customers yet. Customers are created automatically when you sync Etsy orders or add manual orders."
      }
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
            ? { label: "Sync from Etsy", onClick: () => syncFromEtsy() }
            : {
                label: "Connect Etsy first",
                onClick: () => router.push("/settings#etsy-connection"),
                variant: "secondary",
              }
      }
      secondaryAction={{
        label: "Add customer",
        onClick: () => controllerRef.current?.openRecord(null),
      }}
    />
  );

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Customers</h3>

      {batch.selectionCount > 0 ? (
        <div className="mb-3">
          <BatchActionsBar
            selectionLabel={
              batch.selectAllMatching
                ? `All ${batch.selectionCount} matching selected`
                : `${batch.selectionCount} selected`
            }
            onClear={batch.clearSelection}
            selectAllMatching={
              batch.canSelectAllMatching && !batch.selectAllMatching
                ? {
                    total: listTotal,
                    onSelect: batch.selectAllMatchingRows,
                    tooLarge: batch.selectAllMatchingTooLarge,
                  }
                : undefined
            }
          >
            <Button
              variant="danger"
              size="sm"
              busy={batchBusy}
              disabled={isOffline}
              title={isOffline ? "Unavailable while offline" : undefined}
              onClick={() => setBatchDeleteOpen(true)}
            >
              Delete
            </Button>
          </BatchActionsBar>
        </div>
      ) : null}

      <SemsScreen<Customer>
        entityLabel="Customer"
        entityLabelPlural="Customers"
        columns={columns}
        data={customers}
        getRowTitle={(c) =>
          [c.first_name, c.last_name].filter(Boolean).join(" ") || `Customer ${c.id}`
        }
        sort={sort}
        onSortChange={(next) => {
          setPage(0);
          setSort(next ?? { key: "last_name", dir: "asc" });
        }}
        filters={filters}
        pagination={{ page, pageSize, total: listTotal, onPageChange: setPage }}
        emptyState={emptyState}
        onDeleteRow={(c) => setDeleteTarget(c)}
        batchSelection={batchSelection}
        controllerRef={controllerRef}
        addNewLabel="Add new customer"
        onOpenChange={(record) => setOpenedRecord(record as Customer | null)}
        renderEditor={({ record, requestClose, done }) => (
          <CustomerEditor
            key={record?.id ?? "new"}
            record={record}
            prefillFrom={record === null ? copySource : null}
            prefillAddresses={record === null ? copySourceAddresses : []}
            requestClose={requestClose}
            done={done}
            onSaved={(customer, isNewRecord) => {
              upsertCustomerInList(customer);
              void reloadCustomers();
              if (isNewRecord) {
                setCopySource(null);
                setCopySourceAddresses([]);
              }
            }}
            onCopyAsNew={(customer, addresses) => {
              setCopySource(customer);
              setCopySourceAddresses(addresses);
              controllerRef.current?.openRecord(null);
            }}
          />
        )}
      />

      <ProgressModal
        open={progressOpen}
        title={progressTitle}
        statusText={progressTitle}
        mode="determinate"
        current={progressCurrent}
        total={progressTotal}
      />
      <ProgressModal {...syncModal} />

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deleteCustomer()}
        title="Delete customer?"
        description="This customer will be permanently removed. Customers with existing orders cannot be deleted."
        affectedLabel={
          deleteTarget
            ? [deleteTarget.first_name, deleteTarget.last_name].filter(Boolean).join(" ")
            : undefined
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={deleteBusy}
      />

      <ConfirmDialog
        open={batchDeleteOpen}
        onClose={() => setBatchDeleteOpen(false)}
        onConfirm={() => void batchDeleteCustomers()}
        title={`Delete ${batch.selectionCount} customers?`}
        description="Customers with existing orders cannot be deleted and will be skipped."
        confirmLabel="Delete customers"
        confirmVariant="danger"
        busy={batchBusy}
      />

      <CustomerMergeModal
        open={mergeModalOpen}
        onClose={() => {
          setMergeModalOpen(false);
          setMergePrimaryId(null);
          setMergeSecondaryId(null);
        }}
        initialPrimaryId={mergePrimaryId}
        initialSecondaryId={mergeSecondaryId}
        onMerged={(primaryId) => void handleCustomerMerged(primaryId)}
        onError={(title, message, err) => setApiError(title, message, err)}
      />

      <CustomerDuplicatesModal
        open={duplicatesModalOpen}
        onClose={() => setDuplicatesModalOpen(false)}
        onMergeGroup={(primaryId, secondaryId) => openMergeModal(primaryId, secondaryId)}
        onError={(title, message, err) => setApiError(title, message, err)}
      />
    </section>
  );
}

export default function CustomersPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 text-sm text-[var(--ui-muted)]">
          Loading customers...
        </section>
      }
    >
      <CustomersPageInner />
    </Suspense>
  );
}
