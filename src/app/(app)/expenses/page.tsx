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
import { VendorPicker } from "@/components/ui/VendorPicker";
import { SemsScreen, type SemsScreenController } from "@/components/sems/SemsScreen";
import { SemsEditor } from "@/components/sems/SemsEditor";
import { useSemsEditorGuard } from "@/components/sems/useSemsEditorGuard";
import { useApp } from "@/context/AppContext";
import { useDirtyTracking } from "@/hooks/useDirtyTracking";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePagination } from "@/hooks/usePagination";
import { apiFetch } from "@/lib/api-fetch";
import type { ApiErrorShape, BillPayment, BusinessExpense, PaginationInfo } from "@/types";

/* ─────────────────────────── Types ─────────────────────────── */

type ExpenseOptions = {
  categories: string[];
  subcategories: string[];
  payment_methods: string[];
  tax_categories: string[];
  paid_by: string[];
};

type ExpenseSummary = {
  by_category: Array<{ category: string; count: number; total: number }>;
  by_month: Array<{ month: string; total: number }>;
  by_status: Array<{ payment_status: string; count: number; total: number }>;
  totals: { count: number; gross_total: number; adjusted_total: number; deductible_total: number };
  recurring_count: number;
};

type ExpenseForm = {
  expense_date: string;
  due_date: string;
  amount: string;
  currency_code: string;
  payment_method: string;
  paid_by: string;
  category: string;
  subcategory: string;
  vendor_id: number | null;
  gl_account: string;
  is_cogs: boolean;
  is_asset: boolean;
  depreciation_years: string;
  tax_category: string;
  business_use_pct: string;
  tax_deductible: boolean;
  invoice_number: string;
  fiscal_quarter: string;
  period_from: string;
  period_to: string;
  is_recurring: boolean;
  recurring_frequency: string;
  recurring_next_date: string;
  contract_end_date: string;
  notes: string;
};

type OcrPrefill = {
  form: Partial<ExpenseForm>;
  vendorHint: string | null;
};

/* ─────────────────────────── Constants / helpers ─────────────────────────── */

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_FORM: ExpenseForm = {
  expense_date: TODAY,
  due_date: "",
  amount: "",
  currency_code: "USD",
  payment_method: "",
  paid_by: "",
  category: "",
  subcategory: "",
  vendor_id: null,
  gl_account: "",
  is_cogs: false,
  is_asset: false,
  depreciation_years: "",
  tax_category: "",
  business_use_pct: "100",
  tax_deductible: true,
  invoice_number: "",
  fiscal_quarter: "",
  period_from: "",
  period_to: "",
  is_recurring: false,
  recurring_frequency: "",
  recurring_next_date: "",
  contract_end_date: "",
  notes: "",
};

const inputCls =
  "w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm";

const fmt = (n: number | undefined | null) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

function expenseToForm(e: BusinessExpense): ExpenseForm {
  return {
    expense_date: e.expense_date ?? "",
    due_date: e.due_date ?? "",
    amount: e.amount != null ? String(e.amount) : "",
    currency_code: e.currency_code ?? "USD",
    payment_method: e.payment_method ?? "",
    paid_by: e.paid_by ?? "",
    category: e.category ?? "",
    subcategory: e.subcategory ?? "",
    vendor_id: e.vendor_id ?? null,
    gl_account: e.gl_account ?? "",
    is_cogs: Boolean(e.is_cogs),
    is_asset: Boolean(e.is_asset),
    depreciation_years: e.depreciation_years != null ? String(e.depreciation_years) : "",
    tax_category: e.tax_category ?? "",
    business_use_pct: String(e.business_use_pct ?? 100),
    tax_deductible: Boolean(e.tax_deductible ?? 1),
    invoice_number: e.invoice_number ?? "",
    fiscal_quarter: e.fiscal_quarter ?? "",
    period_from: e.period_from ?? "",
    period_to: e.period_to ?? "",
    is_recurring: Boolean(e.is_recurring),
    recurring_frequency: e.recurring_frequency ?? "",
    recurring_next_date: e.recurring_next_date ?? "",
    contract_end_date: e.contract_end_date ?? "",
    notes: e.notes ?? "",
  };
}

function formToBody(form: ExpenseForm) {
  return {
    expense_date: form.expense_date.trim(),
    due_date: form.due_date.trim() || null,
    amount: parseFloat(form.amount) || 0,
    currency_code: form.currency_code.trim() || "USD",
    payment_method: form.payment_method.trim() || null,
    paid_by: form.paid_by.trim() || null,
    category: form.category.trim(),
    subcategory: form.subcategory.trim() || null,
    vendor_id: form.vendor_id ?? null,
    gl_account: form.gl_account.trim() || null,
    is_cogs: form.is_cogs ? 1 : 0,
    is_asset: form.is_asset ? 1 : 0,
    depreciation_years:
      form.is_asset && form.depreciation_years
        ? parseInt(form.depreciation_years, 10)
        : null,
    tax_category: form.tax_category.trim() || null,
    business_use_pct: parseFloat(form.business_use_pct) || 100,
    tax_deductible: form.tax_deductible ? 1 : 0,
    invoice_number: form.invoice_number.trim() || null,
    fiscal_quarter: form.fiscal_quarter.trim() || null,
    period_from: form.period_from.trim() || null,
    period_to: form.period_to.trim() || null,
    is_recurring: form.is_recurring ? 1 : 0,
    recurring_frequency: form.recurring_frequency.trim() || null,
    recurring_next_date: form.recurring_next_date.trim() || null,
    contract_end_date: form.contract_end_date.trim() || null,
    notes: form.notes.trim() || null,
  };
}

/* ─────────────────────────── Expense editor (Region 2 + Region 3) ─────────────────────────── */

function ExpenseEditor({
  record,
  ocrPrefill,
  options,
  onSaved,
  onOptionsChanged,
  requestClose,
  done,
}: {
  record: BusinessExpense | null;
  ocrPrefill?: OcrPrefill | null;
  options: ExpenseOptions;
  onSaved: (expense: BusinessExpense, isNew: boolean) => void;
  onOptionsChanged: () => void;
  requestClose: () => void;
  done: () => void;
}) {
  const { setApiError, setError } = useApp();
  const isNew = record === null;

  /* ── Header dirty form ── */
  const initial = useMemo<ExpenseForm>(() => {
    if (record) return expenseToForm(record);
    return { ...EMPTY_FORM, ...ocrPrefill?.form };
  }, [record, ocrPrefill]);

  const { current, setCurrent, savedState, isDirty, markClean } =
    useDirtyTracking<ExpenseForm>(initial);
  const form = current ?? EMPTY_FORM;

  const set = useCallback(
    <K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) =>
      setCurrent((prev) => ({ ...(prev ?? EMPTY_FORM), [key]: value })),
    [setCurrent]
  );

  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ExpenseForm, string>>>({});

  /* ── Bill payments state (Region 3 / immediate-commit) ── */
  const [billPayments, setBillPayments] = useState<BillPayment[]>([]);
  const [payFormOpen, setPayFormOpen] = useState(false);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [deletePaymentId, setDeletePaymentId] = useState<number | null>(null);
  const [deletePaymentBusy, setDeletePaymentBusy] = useState(false);
  const payFormRef = useRef<HTMLDivElement>(null);

  /* OcrVendorHint for VendorPicker */
  const [ocrVendorHint, setOcrVendorHint] = useState<string | null>(
    ocrPrefill?.vendorHint ?? null
  );

  /* ── Live reference to the record (post-payment updates) ── */
  const [liveExpense, setLiveExpense] = useState<BusinessExpense | null>(record);

  /* Keep liveExpense in sync when record prop changes */
  useEffect(() => {
    setLiveExpense(record);
  }, [record]);

  /* ── Load bill payments when editing ── */
  useEffect(() => {
    if (!record) return;
    void (async () => {
      try {
        const res = await fetch(`/api/expenses/${record.id}/payments`, {
          headers: { Accept: "application/json" },
        });
        const data = (await res.json().catch(() => ({}))) as { items?: BillPayment[] };
        setBillPayments(data.items ?? []);
      } catch {
        setBillPayments([]);
      }
    })();
  }, [record]);

  /* ── Save ── */
  const save = useCallback(async (): Promise<boolean> => {
    const value = current ?? EMPTY_FORM;
    const errors: Partial<Record<keyof ExpenseForm, string>> = {};
    if (!value.expense_date.trim()) errors.expense_date = "Date is required.";
    if (!value.amount.trim() || isNaN(parseFloat(value.amount))) errors.amount = "A valid amount is required.";
    if (!value.category.trim()) errors.category = "Category is required.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return false;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const body = formToBody(value);
      const res = await apiFetch(
        isNew ? "/api/expenses" : `/api/expenses/${record!.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = (await res.json().catch(() => ({}))) as ApiErrorShape & BusinessExpense;
      if (!res.ok) throw data;
      markClean(value);
      onSaved(data as BusinessExpense, isNew);
      setError(null);
      onOptionsChanged();
      return true;
    } catch (err) {
      setApiError(
        isNew ? "Could not create expense" : "Could not update expense",
        isNew ? "We could not create the expense." : "We could not update the expense.",
        err
      );
      return false;
    } finally {
      setBusy(false);
    }
  }, [current, isNew, record, markClean, onSaved, onOptionsChanged, setApiError, setError]);

  const discard = useCallback(() => {
    setCurrent(savedState);
    setFieldErrors({});
  }, [savedState, setCurrent]);

  useSemsEditorGuard({ isDirty, onSave: save, onDiscard: discard });

  const handleSaveClick = useCallback(() => {
    void (async () => {
      const ok = await save();
      if (ok) done();
    })();
  }, [save, done]);

  /* ── Bill payment helpers ── */
  const recordPayment = useCallback(async () => {
    if (!record) return;
    const amt = parseFloat(payAmount);
    if (!payDate || isNaN(amt) || amt <= 0) {
      setError({
        title: "Invalid payment",
        message: "Enter a valid date and a positive amount.",
        actions: [],
      });
      return;
    }
    setPayBusy(true);
    try {
      const res = await apiFetch(`/api/expenses/${record.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          payment_date: payDate,
          amount: amt,
          payment_method: payMethod.trim() || null,
          reference_number: payRef.trim() || null,
          notes: null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiErrorShape & {
        item?: BillPayment;
        expense?: BusinessExpense;
      };
      if (!res.ok) throw data;
      if (data.item) setBillPayments((prev) => [data.item!, ...prev]);
      if (data.expense) setLiveExpense(data.expense);
      setPayFormOpen(false);
      setPayDate(new Date().toISOString().slice(0, 10));
      setPayAmount("");
      setPayMethod("");
      setPayRef("");
      setError(null);
    } catch (err) {
      setApiError("Could not record payment", "We could not record the payment.", err);
    } finally {
      setPayBusy(false);
    }
  }, [record, payDate, payAmount, payMethod, payRef, setApiError, setError]);

  const removePayment = useCallback(
    async (paymentId: number) => {
      if (!record) return;
      setDeletePaymentBusy(true);
      try {
        const res = await apiFetch(
          `/api/expenses/${record.id}/payments?paymentId=${paymentId}`,
          { method: "DELETE", headers: { Accept: "application/json" } }
        );
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape & {
          expense?: BusinessExpense;
        };
        if (!res.ok) throw data;
        setBillPayments((prev) => prev.filter((p) => p.id !== paymentId));
        if (data.expense) setLiveExpense(data.expense);
        setDeletePaymentId(null);
        setError(null);
      } catch (err) {
        setApiError("Could not remove payment", "We could not remove the payment.", err);
      } finally {
        setDeletePaymentBusy(false);
      }
    },
    [record, setApiError, setError]
  );

  /* ── Summary badges ── */
  const payStatus = liveExpense?.payment_status ?? "unpaid";
  const statusVariant = payStatus === "paid" ? "success" : payStatus === "partial" ? "warning" : "error";
  const badges = (
    <>
      {form.is_recurring ? <Badge label="Recurring" variant="info" /> : null}
      {form.is_cogs ? <Badge label="COGS" variant="neutral" /> : null}
      {form.is_asset ? <Badge label="Asset" variant="neutral" /> : null}
      {!isNew ? (
        <Badge
          label={payStatus.charAt(0).toUpperCase() + payStatus.slice(1)}
          variant={statusVariant}
        />
      ) : null}
    </>
  );

  const summary = !isNew ? (
    <p className="text-sm text-[var(--ui-muted)]">
      {record?.category} — {fmt(record?.amount)}
      {record?.vendor_name ? ` · ${record.vendor_name}` : ""}
    </p>
  ) : null;

  /* ── Region 3: bill payments ── */
  const paidTotal = billPayments.reduce((s, p) => s + p.amount, 0);
  const balance =
    liveExpense != null ? (liveExpense.amount ?? 0) - paidTotal : 0;

  const context = !isNew ? (
    <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--ui-title)]">
          Payments
          {billPayments.length > 0 ? (
            <span className="ml-2 text-xs font-normal text-[var(--ui-muted)]">
              {fmt(paidTotal)} of {fmt(liveExpense?.amount)} paid
            </span>
          ) : null}
        </p>
        {payStatus !== "paid" ? (
          <Button
            variant="accent"
            size="sm"
            onClick={() => {
              setPayFormOpen(true);
              setPayAmount(balance > 0 ? balance.toFixed(2) : "");
              setPayDate(new Date().toISOString().slice(0, 10));
              setTimeout(
                () => payFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
                100
              );
            }}
            disabled={payBusy}
          >
            Record payment
          </Button>
        ) : null}
      </div>

      {payFormOpen ? (
        <div
          ref={payFormRef}
          className="mb-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3"
        >
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <FormField label="Payment date" required>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className={inputCls}
              />
            </FormField>
            <FormField label="Amount" required>
              <input
                type="number"
                step="0.01"
                min="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </FormField>
            <FormField label="Payment method">
              <DropdownWithAddNew
                value={payMethod}
                onChange={setPayMethod}
                options={options.payment_methods}
                placeholder="Select method..."
                className={inputCls}
              />
            </FormField>
            <FormField label="Reference / check #">
              <input
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Check #, confirmation..."
                className={inputCls}
              />
            </FormField>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="accent"
              size="sm"
              onClick={() => void recordPayment()}
              busy={payBusy}
              disabled={!payDate || !payAmount}
            >
              Save payment
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPayFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {billPayments.length === 0 ? (
        <p className="text-xs text-[var(--ui-muted)]">No payments recorded.</p>
      ) : (
        <div className="max-h-40 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--ui-border)] text-left text-[var(--ui-muted)]">
                <th className="pb-1 pr-2">Date</th>
                <th className="pb-1 pr-2 text-right">Amount</th>
                <th className="pb-1 pr-2">Method</th>
                <th className="pb-1 pr-2">Ref</th>
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody>
              {billPayments.map((bp) => (
                <tr key={bp.id} className="border-b border-[var(--ui-border)]/50">
                  <td className="py-1 pr-2 text-[var(--ui-body)]">{bp.payment_date}</td>
                  <td className="py-1 pr-2 text-right font-medium text-[var(--ui-body)]">
                    {fmt(bp.amount)}
                  </td>
                  <td className="py-1 pr-2 text-[var(--ui-muted)]">
                    {bp.payment_method ?? "—"}
                  </td>
                  <td className="py-1 pr-2 text-[var(--ui-muted)]">
                    {bp.reference_number ?? "—"}
                  </td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      onClick={() => setDeletePaymentId(bp.id)}
                      className="text-[var(--ui-red)] hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deletePaymentId != null}
        onClose={() => setDeletePaymentId(null)}
        onConfirm={() => {
          if (deletePaymentId != null) void removePayment(deletePaymentId);
        }}
        title="Remove payment?"
        description="This payment record will be permanently removed. The bill status will be recalculated."
        confirmLabel="Remove"
        confirmVariant="danger"
        busy={deletePaymentBusy}
      />
    </div>
  ) : null;

  /* ── Editor body ── */
  return (
    <SemsEditor
      title={isNew ? "New expense" : `Edit — ${record?.category ?? "Expense"}`}
      badges={badges}
      summary={summary}
      isDirty={isDirty}
      busy={busy}
      saveLabel={isNew ? "Add expense" : "Save changes"}
      saveDisabled={!form.category.trim() || !form.expense_date.trim() || !form.amount.trim()}
      onSave={handleSaveClick}
      onCancel={requestClose}
      context={context}
    >
      {/* ── Transaction ── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField label="Date" required error={fieldErrors.expense_date}>
          <input
            type="date"
            value={form.expense_date}
            onChange={(e) => set("expense_date", e.target.value)}
            className={inputCls}
          />
        </FormField>
        <FormField label="Due date">
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => set("due_date", e.target.value)}
            className={inputCls}
          />
        </FormField>
        <FormField label="Amount" required error={fieldErrors.amount}>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder="0.00"
            className={inputCls}
          />
        </FormField>
        <FormField label="Currency">
          <input
            value={form.currency_code}
            onChange={(e) => set("currency_code", e.target.value.toUpperCase())}
            maxLength={3}
            className={inputCls}
          />
        </FormField>
        <FormField label="Payment method">
          <DropdownWithAddNew
            value={form.payment_method}
            onChange={(v) => set("payment_method", v)}
            options={options.payment_methods}
            placeholder="Select method..."
            className={inputCls}
          />
        </FormField>
        <FormField label="Paid by">
          <DropdownWithAddNew
            value={form.paid_by}
            onChange={(v) => set("paid_by", v)}
            options={options.paid_by}
            placeholder="Select..."
            className={inputCls}
          />
        </FormField>
      </div>

      {/* ── Categorization ── */}
      <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Categorization</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <FormField label="Category" required error={fieldErrors.category}>
            <DropdownWithAddNew
              value={form.category}
              onChange={(v) => set("category", v)}
              options={options.categories}
              placeholder="Select category..."
              className={inputCls}
            />
          </FormField>
          <FormField label="Subcategory">
            <DropdownWithAddNew
              value={form.subcategory}
              onChange={(v) => set("subcategory", v)}
              options={options.subcategories}
              placeholder="More specific..."
              className={inputCls}
            />
          </FormField>
          <FormField label="Vendor / Supplier">
            <VendorPicker
              vendorId={form.vendor_id}
              onChange={(id) => {
                set("vendor_id", id);
                if (id) setOcrVendorHint(null);
              }}
              placeholder="Select vendor..."
              ocrHint={ocrVendorHint}
              onHintConsumed={() => setOcrVendorHint(null)}
              allowEmpty={false}
              className={inputCls}
            />
          </FormField>
          <FormField label="GL account override">
            <input
              value={form.gl_account}
              onChange={(e) => set("gl_account", e.target.value)}
              placeholder="e.g. 6200"
              className={inputCls}
            />
          </FormField>
        </div>
        <div className="mt-2 flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_cogs}
              onChange={(e) => set("is_cogs", e.target.checked)}
              className="accent-[var(--ui-accent)]"
            />
            Cost of Goods Sold
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_asset}
              onChange={(e) => set("is_asset", e.target.checked)}
              className="accent-[var(--ui-accent)]"
            />
            Capital asset
          </label>
        </div>
        {form.is_asset ? (
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <FormField label="Depreciation years">
              <input
                type="number"
                min="1"
                max="40"
                value={form.depreciation_years}
                onChange={(e) => set("depreciation_years", e.target.value)}
                placeholder="e.g. 5"
                className={inputCls}
              />
            </FormField>
          </div>
        ) : null}
      </div>

      {/* ── Tax ── */}
      <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Tax</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <FormField label="Tax category">
            <DropdownWithAddNew
              value={form.tax_category}
              onChange={(v) => set("tax_category", v)}
              options={options.tax_categories}
              placeholder="Select..."
              className={inputCls}
            />
          </FormField>
          <FormField label="Business use %">
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.business_use_pct}
              onChange={(e) => set("business_use_pct", e.target.value)}
              className={inputCls}
            />
          </FormField>
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.tax_deductible}
            onChange={(e) => set("tax_deductible", e.target.checked)}
            className="accent-[var(--ui-accent)]"
          />
          Tax deductible
        </label>
      </div>

      {/* ── Documentation ── */}
      <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Documentation</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <FormField label="Invoice number">
            <input
              value={form.invoice_number}
              onChange={(e) => set("invoice_number", e.target.value)}
              placeholder="Invoice #"
              className={inputCls}
            />
          </FormField>
          <FormField label="Fiscal quarter">
            <input
              value={form.fiscal_quarter}
              onChange={(e) => set("fiscal_quarter", e.target.value)}
              placeholder="e.g. Q2 2026"
              className={inputCls}
            />
          </FormField>
          <FormField label="Period from">
            <input
              type="date"
              value={form.period_from}
              onChange={(e) => set("period_from", e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="Period to">
            <input
              type="date"
              value={form.period_to}
              onChange={(e) => set("period_to", e.target.value)}
              className={inputCls}
            />
          </FormField>
        </div>
      </div>

      {/* ── Recurring ── */}
      <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--ui-title)]">
          <input
            type="checkbox"
            checked={form.is_recurring}
            onChange={(e) => set("is_recurring", e.target.checked)}
            className="accent-[var(--ui-accent)]"
          />
          Recurring expense
        </label>
        {form.is_recurring ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <FormField label="Frequency">
              <select
                value={form.recurring_frequency}
                onChange={(e) => set("recurring_frequency", e.target.value)}
                className={inputCls}
              >
                <option value="">Select...</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </FormField>
            <FormField label="Next due date">
              <input
                type="date"
                value={form.recurring_next_date}
                onChange={(e) => set("recurring_next_date", e.target.value)}
                className={inputCls}
              />
            </FormField>
            <FormField label="Contract end date">
              <input
                type="date"
                value={form.contract_end_date}
                onChange={(e) => set("contract_end_date", e.target.value)}
                className={inputCls}
              />
            </FormField>
          </div>
        ) : null}
      </div>

      {/* ── Notes ── */}
      <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <FormField label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Notes about this expense..."
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

/* ─────────────────────────── Page inner (Region 1 + list chrome) ─────────────────────────── */

function ExpensesPageInner() {
  const { setApiError, setError, pageSize: configPageSize } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [expenseSearch, setExpenseSearch] = useState("");
  const debouncedSearch = useDebouncedValue(expenseSearch, 300);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "expense_date", dir: "desc" });
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } = usePagination(configPageSize);

  const [options, setOptions] = useState<ExpenseOptions>({
    categories: [],
    subcategories: [],
    payment_methods: [],
    tax_categories: [],
    paid_by: [],
  });
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [upcoming, setUpcoming] = useState<BusinessExpense[]>([]);

  const [ocrPrefill, setOcrPrefill] = useState<OcrPrefill | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<BusinessExpense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const controllerRef = useRef<SemsScreenController<BusinessExpense> | null>(null);

  /* ── Load options ── */
  const reloadOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/expenses/categories", {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as Partial<ExpenseOptions>;
      setOptions((prev) => ({
        categories: data.categories ?? prev.categories,
        subcategories: data.subcategories ?? prev.subcategories,
        payment_methods: data.payment_methods ?? prev.payment_methods,
        tax_categories: data.tax_categories ?? prev.tax_categories,
        paid_by: data.paid_by ?? prev.paid_by,
      }));
    } catch {
      /* use existing */
    }
  }, []);

  useEffect(() => {
    void reloadOptions();
  }, [reloadOptions]);

  /* ── Load summary ── */
  const reloadSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/expenses/summary", {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => null)) as ExpenseSummary | null;
      setSummary(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void reloadSummary();
  }, [reloadSummary]);

  /* ── Load upcoming recurring ── */
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/expenses/upcoming", {
          headers: { Accept: "application/json" },
        });
        const data = (await res.json().catch(() => ({}))) as { items?: BusinessExpense[] };
        setUpcoming(data.items ?? []);
      } catch {
        setUpcoming([]);
      }
    })();
  }, []);

  /* ── Load expense list ── */
  const reloadExpenses = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (categoryFilter) params.set("category", categoryFilter);
    if (paymentStatusFilter) params.set("payment_status", paymentStatusFilter);
    if (sort) {
      params.set("sortBy", sort.key);
      params.set("sortDir", sort.dir);
    }
    const res = await fetch(`/api/expenses?${params}`, {
      headers: { Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as ApiErrorShape & {
      items?: BusinessExpense[];
      pagination?: PaginationInfo;
    };
    if (!res.ok) throw data;
    if (data.items) setExpenses(data.items);
    if (data.pagination) setTotal(data.pagination.total);
  }, [debouncedSearch, pageSize, offset, categoryFilter, paymentStatusFilter, sort, setTotal]);

  useEffect(() => {
    void reloadExpenses().catch((err) =>
      setApiError("Could not load expenses", "We could not load expenses.", err)
    );
  }, [reloadExpenses, setApiError]);

  /* ── OCR scan ── */
  const handleScan = useCallback(
    async (file: File) => {
      setScanning(true);
      try {
        const formData = new FormData();
        formData.append("invoice_photo", file);
        const res = await fetch("/api/expenses/scan", { method: "POST", body: formData });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          ocr?: Record<string, unknown>;
          error?: { userMessage?: string };
        };
        if (!res.ok || !data.ok) {
          setError({
            title: "Scan failed",
            message: data.error?.userMessage ?? "Could not read the invoice.",
            actions: ["Try a clearer photo."],
          });
          return;
        }
        const ocr = data.ocr as Record<string, unknown>;
        /* Full OCR mapping — apply ALL returned fields including those previously ignored */
        const prefillForm: Partial<ExpenseForm> = {};
        if (ocr.expense_date) prefillForm.expense_date = String(ocr.expense_date);
        if (ocr.amount != null) prefillForm.amount = String(ocr.amount);
        if (ocr.category) prefillForm.category = String(ocr.category);
        if (ocr.subcategory) prefillForm.subcategory = String(ocr.subcategory);
        if (ocr.payment_method) prefillForm.payment_method = String(ocr.payment_method);
        if (ocr.invoice_number) prefillForm.invoice_number = String(ocr.invoice_number);
        if (typeof ocr.tax_deductible === "boolean") prefillForm.tax_deductible = ocr.tax_deductible;
        if (ocr.is_recurring === true) prefillForm.is_recurring = true;
        if (ocr.recurring_frequency) prefillForm.recurring_frequency = String(ocr.recurring_frequency);
        if (ocr.notes) prefillForm.notes = String(ocr.notes);

        setOcrPrefill({
          form: prefillForm,
          vendorHint: ocr.vendor_name ? String(ocr.vendor_name) : null,
        });
        controllerRef.current?.openRecord(null);
      } catch (err) {
        setApiError("Scan error", "Could not scan the invoice.", err);
      } finally {
        setScanning(false);
      }
    },
    [setApiError, setError]
  );

  /* ── Delete ── */
  const deleteExpense = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await apiFetch(`/api/expenses/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setDeleteTarget(null);
      controllerRef.current?.closeToList();
      await reloadExpenses();
      void reloadSummary();
      setError(null);
    } catch (err) {
      setApiError("Could not delete expense", "We could not delete the expense.", err);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, reloadExpenses, reloadSummary, setApiError, setError]);

  /* ── Deep link: ?expenseId= ── */
  useEffect(() => {
    const raw = searchParams.get("expenseId");
    if (!raw) return;
    const id = Number(raw);
    router.replace(pathname);
    if (!Number.isFinite(id)) return;
    void (async () => {
      const existing = expenses.find((e) => e.id === id);
      if (existing) {
        controllerRef.current?.openRecord(existing);
        return;
      }
      try {
        const res = await fetch(`/api/expenses/${id}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          item?: BusinessExpense;
        };
        if (res.ok && data.item) {
          setExpenses((prev) =>
            prev.some((e) => e.id === id) ? prev : [data.item!, ...prev]
          );
          controllerRef.current?.openRecord(data.item);
        }
      } catch {
        /* item not found */
      }
    })();
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Columns ── */
  const categoryChips = useMemo(() => {
    const top = (summary?.by_category ?? []).slice(0, 6);
    return top.map((c) => ({
      value: c.category,
      label: `${c.category} (${c.count})`,
    }));
  }, [summary]);

  const columns = useMemo<Column<BusinessExpense>[]>(
    () => [
      {
        key: "expense_date",
        header: "Date",
        sortable: true,
        render: (e: BusinessExpense) => e.expense_date ?? "—",
      },
      {
        key: "category",
        header: "Category",
        sortable: true,
        render: (e: BusinessExpense) => (
          <span className="inline-flex items-center gap-1">
            {e.category}
            {e.is_recurring ? <Badge label="Recurring" variant="info" /> : null}
          </span>
        ),
      },
      {
        key: "vendor_name",
        header: "Vendor",
        sortable: true,
        render: (e: BusinessExpense) => e.vendor_name ?? "—",
      },
      {
        key: "amount",
        header: "Amount",
        sortable: true,
        render: (e: BusinessExpense) => fmt(e.amount),
      },
      {
        key: "payment_status",
        header: "Status",
        sortable: true,
        render: (e: BusinessExpense) => {
          const s = e.payment_status ?? "unpaid";
          const v = s === "paid" ? "success" : s === "partial" ? "warning" : "error";
          return <Badge label={s.charAt(0).toUpperCase() + s.slice(1)} variant={v} />;
        },
      },
    ],
    []
  );

  /* ── Filters slot (shown in list mode only by SemsScreen) ── */
  const filters = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={expenseSearch}
          onChange={(e) => {
            setPage(0);
            setExpenseSearch(e.target.value);
          }}
          placeholder="Search vendor, category, notes, invoice..."
          className="min-w-[10rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
        />
        {/* Scan invoice — distinct OCR create path */}
        <label className="cursor-pointer rounded-lg bg-[var(--ui-green)] px-3 py-2 text-sm font-semibold text-black hover:opacity-90">
          {scanning ? "Scanning…" : "Scan invoice"}
          <input
            ref={scanRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={scanning}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleScan(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <FilterChipRow
        label="Status"
        value={paymentStatusFilter}
        onChange={(value) => {
          setPage(0);
          setPaymentStatusFilter(value);
        }}
        options={[
          { value: "unpaid", label: "Unpaid" },
          { value: "partial", label: "Partial" },
          { value: "paid", label: "Paid" },
        ]}
      />
      {categoryChips.length > 0 ? (
        <FilterChipRow
          label="Category"
          value={categoryFilter}
          onChange={(value) => {
            setPage(0);
            setCategoryFilter(value);
          }}
          options={categoryChips}
        />
      ) : null}
    </div>
  );

  const emptyState = (
    <EmptyState
      message={
        expenseSearch.trim() || categoryFilter || paymentStatusFilter
          ? "No bills match your filters."
          : "No bills yet. Add your first expense to start tracking accounts payable."
      }
      primaryAction={
        expenseSearch.trim() || categoryFilter || paymentStatusFilter
          ? {
              label: "Clear filters",
              onClick: () => {
                setExpenseSearch("");
                setCategoryFilter(null);
                setPaymentStatusFilter(null);
                setPage(0);
              },
            }
          : undefined
      }
    />
  );

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Expenses</h3>

      {/* ── Summary cards (page-level chrome, always visible) ── */}
      {summary && summary.totals.count > 0 ? (
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-2">
            <p className="text-xs text-[var(--ui-muted)]">Total bills</p>
            <p className="text-lg font-bold text-[var(--ui-title)]">
              {fmt(summary.totals.gross_total)}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-2">
            <p className="text-xs text-[var(--ui-muted)]">Unpaid</p>
            <p className="text-lg font-bold text-[var(--ui-red)]">
              {fmt(
                (summary.by_status.find((s) => s.payment_status === "unpaid")?.total ?? 0) +
                  (summary.by_status.find((s) => s.payment_status === "partial")?.total ?? 0)
              )}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-2">
            <p className="text-xs text-[var(--ui-muted)]">Tax deductible</p>
            <p className="text-lg font-bold text-[var(--ui-green)]">
              {fmt(summary.totals.deductible_total)}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-2">
            <p className="text-xs text-[var(--ui-muted)]">Top category</p>
            <p className="text-lg font-bold text-[var(--ui-title)]">
              {summary.by_category[0]?.category ?? "—"}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-2">
            <p className="text-xs text-[var(--ui-muted)]">Recurring</p>
            <p className="text-lg font-bold text-[var(--ui-title)]">
              {summary.recurring_count}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Upcoming recurring widget (page-level chrome) ── */}
      {upcoming.length > 0 ? (
        <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Upcoming recurring
          </p>
          <ul className="space-y-1 text-xs">
            {upcoming.slice(0, 5).map((u) => (
              <li key={u.id} className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => controllerRef.current?.openRecord(u)}
                  className="text-left text-[var(--ui-body)] hover:text-[var(--ui-accent)]"
                >
                  {u.category}
                  {u.vendor_name ? ` — ${u.vendor_name}` : ""}
                </button>
                <span className="text-[var(--ui-muted)]">{u.recurring_next_date}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── SEMS scaffold ── */}
      <SemsScreen<BusinessExpense>
        entityLabel="Expense"
        entityLabelPlural="Expenses"
        columns={columns}
        data={expenses}
        getRowTitle={(e) =>
          `${e.category} — ${fmt(e.amount)}${e.vendor_name ? ` (${e.vendor_name})` : ""}`
        }
        sort={sort}
        onSortChange={(next) => {
          setPage(0);
          setSort(next ?? { key: "expense_date", dir: "desc" });
        }}
        filters={filters}
        pagination={{
          page,
          pageSize,
          total: listTotal,
          onPageChange: setPage,
        }}
        emptyState={emptyState}
        onDeleteRow={(e) => setDeleteTarget(e)}
        controllerRef={controllerRef}
        addNewLabel="Add new expense"
        onOpenChange={() => {
          /* clear ocrPrefill when closing back to list */
        }}
        renderEditor={({ record, requestClose, done }) => (
          <ExpenseEditor
            key={record?.id ?? "new"}
            record={record}
            ocrPrefill={record === null ? ocrPrefill : null}
            options={options}
            requestClose={requestClose}
            done={done}
            onSaved={(expense, isNew) => {
              if (isNew) {
                setOcrPrefill(null);
                setExpenses((cur) => [expense, ...cur]);
              } else {
                setExpenses((cur) =>
                  cur.map((e) => (e.id === expense.id ? expense : e))
                );
              }
              void reloadExpenses();
              void reloadSummary();
            }}
            onOptionsChanged={() => void reloadOptions()}
          />
        )}
      />

      {/* ── Delete expense dialog ── */}
      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deleteExpense()}
        title="Delete bill?"
        description="This bill and all its payment records will be permanently deleted. This action cannot be undone."
        affectedLabel={
          deleteTarget
            ? `${deleteTarget.category} — ${fmt(deleteTarget.amount)}`
            : undefined
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={deleteBusy}
      />
    </section>
  );
}

export default function ExpensesPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 text-sm text-[var(--ui-muted)]">
          Loading expenses…
        </section>
      }
    >
      <ExpensesPageInner />
    </Suspense>
  );
}
