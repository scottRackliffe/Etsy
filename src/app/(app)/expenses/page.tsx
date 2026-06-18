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
import { VendorPicker } from "@/components/ui/VendorPicker";
import { useApp } from "@/context/AppContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePagination } from "@/hooks/usePagination";
import { apiFetch } from "@/lib/api-fetch";
import type { ApiErrorShape, BillPayment, BusinessExpense, PaginationInfo } from "@/types";

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

function ExpensesPageInner() {
  const { setApiError, setError, pageSize: configPageSize } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [expenseSearch, setExpenseSearch] = useState("");
  const debouncedSearch = useDebouncedValue(expenseSearch, 300);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "expense_date", dir: "desc" });
  const { page, pageSize, offset, total: listTotal, setPage, setTotal } = usePagination(configPageSize);

  // Options from API
  const [options, setOptions] = useState<ExpenseOptions>({
    categories: [], subcategories: [], payment_methods: [], tax_categories: [], paid_by: [],
  });
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);

  // Create form state
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newAmount, setNewAmount] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newVendorId, setNewVendorId] = useState<number | null>(null);
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Detail editing state
  const [editDate, setEditDate] = useState("");
  const [editDatePaid, setEditDatePaid] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editVendorId, setEditVendorId] = useState<number | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editSubcategory, setEditSubcategory] = useState("");
  const [editTaxDeductible, setEditTaxDeductible] = useState(true);
  const [editTaxCategory, setEditTaxCategory] = useState("");
  const [editBusinessUsePct, setEditBusinessUsePct] = useState("100");
  const [editIsCogs, setEditIsCogs] = useState(false);
  const [editIsAsset, setEditIsAsset] = useState(false);
  const [editInvoiceNumber, setEditInvoiceNumber] = useState("");
  const [editPaidBy, setEditPaidBy] = useState("");
  const [editIsRecurring, setEditIsRecurring] = useState(false);
  const [editRecurringFrequency, setEditRecurringFrequency] = useState("");
  const [editRecurringNextDate, setEditRecurringNextDate] = useState("");
  const [editContractEndDate, setEditContractEndDate] = useState("");
  const [editGlAccount, setEditGlAccount] = useState("");
  const [editFiscalQuarter, setEditFiscalQuarter] = useState("");
  const [editDepreciationYears, setEditDepreciationYears] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPeriodFrom, setEditPeriodFrom] = useState("");
  const [editPeriodTo, setEditPeriodTo] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Bill payments
  const [billPayments, setBillPayments] = useState<BillPayment[]>([]);
  const [payFormOpen, setPayFormOpen] = useState(false);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [deletePaymentId, setDeletePaymentId] = useState<number | null>(null);

  // Upcoming recurring
  const [upcoming, setUpcoming] = useState<BusinessExpense[]>([]);

  // Confirm dialog
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Scan state
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [ocrVendorHint, setOcrVendorHint] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/expenses/categories", { headers: { Accept: "application/json" } });
        const data = (await response.json().catch(() => ({}))) as Partial<ExpenseOptions>;
        setOptions({
          categories: data.categories ?? [],
          subcategories: data.subcategories ?? [],
          payment_methods: data.payment_methods ?? [],
          tax_categories: data.tax_categories ?? [],
          paid_by: data.paid_by ?? [],
        });
      } catch { /* use empty defaults */ }
    })();
  }, []);

  const reloadOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/expenses/categories", { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as Partial<ExpenseOptions>;
      if (data.categories) setOptions((prev) => ({ ...prev, ...data }));
    } catch { /* ignore */ }
  }, []);


  const reloadSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/expenses/summary", { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => null)) as ExpenseSummary | null;
      setSummary(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void reloadSummary(); }, [reloadSummary]);

  const selectedExpense = expenses.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedExpense) {
      setEditDate(selectedExpense.expense_date ?? "");
      setEditDatePaid(selectedExpense.date_paid ?? "");
      setEditAmount(String(selectedExpense.amount ?? ""));
      setEditCurrency(selectedExpense.currency_code ?? "USD");
      setEditPaymentMethod(selectedExpense.payment_method ?? "");
      setEditVendorId(selectedExpense.vendor_id ?? null);
      setEditCategory(selectedExpense.category ?? "");
      setEditSubcategory(selectedExpense.subcategory ?? "");
      setEditTaxDeductible(Boolean(selectedExpense.tax_deductible));
      setEditTaxCategory(selectedExpense.tax_category ?? "");
      setEditBusinessUsePct(String(selectedExpense.business_use_pct ?? 100));
      setEditIsCogs(Boolean(selectedExpense.is_cogs));
      setEditIsAsset(Boolean(selectedExpense.is_asset));
      setEditDepreciationYears(selectedExpense.depreciation_years != null ? String(selectedExpense.depreciation_years) : "");
      setEditInvoiceNumber(selectedExpense.invoice_number ?? "");
      setEditPaidBy(selectedExpense.paid_by ?? "");
      setEditIsRecurring(Boolean(selectedExpense.is_recurring));
      setEditRecurringFrequency(selectedExpense.recurring_frequency ?? "");
      setEditRecurringNextDate(selectedExpense.recurring_next_date ?? "");
      setEditContractEndDate(selectedExpense.contract_end_date ?? "");
      setEditGlAccount(selectedExpense.gl_account ?? "");
      setEditFiscalQuarter(selectedExpense.fiscal_quarter ?? "");
      setEditDueDate(selectedExpense.due_date ?? "");
      setEditPeriodFrom(selectedExpense.period_from ?? "");
      setEditPeriodTo(selectedExpense.period_to ?? "");
      setEditNotes(selectedExpense.notes ?? "");
      setPayFormOpen(false);
      void loadBillPayments(selectedExpense.id);
    } else {
      setBillPayments([]);
    }
  }, [selectedExpense?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBillPayments = async (expId: number) => {
    try {
      const response = await fetch(`/api/expenses/${expId}/payments`, { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as { items?: BillPayment[] };
      setBillPayments(data.items ?? []);
    } catch { setBillPayments([]); }
  };

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/expenses/upcoming", { headers: { Accept: "application/json" } });
        const data = (await response.json().catch(() => ({}))) as { items?: BusinessExpense[] };
        setUpcoming(data.items ?? []);
      } catch { setUpcoming([]); }
    })();
  }, []);

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
    const response = await fetch(`/api/expenses?${params}`, { headers: { Accept: "application/json" } });
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
      items?: BusinessExpense[];
      pagination?: PaginationInfo;
    };
    if (!response.ok) throw data;
    if (data.items) {
      setExpenses(data.items);
      if (selectedId != null && !data.items.some((e) => e.id === selectedId)) {
        setSelectedId(data.items[0]?.id ?? null);
      }
    }
    if (data.pagination) setTotal(data.pagination.total);
  }, [debouncedSearch, pageSize, offset, categoryFilter, paymentStatusFilter, sort, setTotal, selectedId]);

  useEffect(() => {
    void reloadExpenses().catch((err) =>
      setApiError("Could not load expenses", "We could not load expenses.", err)
    );
  }, [reloadExpenses, setApiError]);

  // Deep link with fetch fallback
  useEffect(() => {
    const raw = searchParams.get("expenseId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    router.replace(pathname);
    if (expenses.some((e) => e.id === id)) {
      setSelectedId(id);
    } else {
      void (async () => {
        try {
          const response = await fetch(`/api/expenses/${id}`, { headers: { Accept: "application/json" } });
          const data = (await response.json().catch(() => ({}))) as { ok?: boolean; item?: BusinessExpense };
          if (response.ok && data.item) {
            setExpenses((prev) => prev.some((e) => e.id === id) ? prev : [data.item!, ...prev]);
            setSelectedId(id);
          }
        } catch { /* item not found */ }
      })();
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const createExpenseRecord = async () => {
    if (!newDate.trim() || !newAmount.trim() || !newCategory.trim()) {
      setError({
        title: "Required fields missing",
        message: "Date, amount, and category are required.",
        actions: ["Fill in the required fields and try again."],
      });
      return;
    }
    setBusyAction("create");
    try {
      const response = await apiFetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          expense_date: newDate.trim(),
          amount: parseFloat(newAmount),
          category: newCategory.trim(),
          vendor_id: newVendorId ?? undefined,
          payment_method: newPaymentMethod.trim() || null,
          notes: newNotes.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & BusinessExpense;
      if (!response.ok) throw data;
      await reloadExpenses();
      void reloadSummary();
      void reloadOptions();
      setSelectedId(data.id);
      resetCreateForm();
      setError(null);
    } catch (err) {
      setApiError("Could not create expense", "We could not create the expense.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const resetCreateForm = () => {
    setNewDate(new Date().toISOString().slice(0, 10));
    setNewAmount("");
    setNewCategory("");
    setNewVendorId(null);
    setNewPaymentMethod("");
    setNewNotes("");
    setOcrVendorHint(null);
  };

  const updateExpense = async () => {
    if (!selectedId) return;
    setBusyAction("update");
    try {
      const response = await apiFetch(`/api/expenses/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          expense_date: editDate.trim(),
          date_paid: editDatePaid.trim() || null,
          amount: parseFloat(editAmount) || 0,
          currency_code: editCurrency.trim() || "USD",
          payment_method: editPaymentMethod.trim() || null,
          vendor_id: editVendorId ?? null,
          category: editCategory.trim(),
          subcategory: editSubcategory.trim() || null,
          tax_deductible: editTaxDeductible ? 1 : 0,
          tax_category: editTaxCategory.trim() || null,
          business_use_pct: parseFloat(editBusinessUsePct) || 100,
          is_cogs: editIsCogs ? 1 : 0,
          is_asset: editIsAsset ? 1 : 0,
          depreciation_years: editIsAsset && editDepreciationYears ? parseInt(editDepreciationYears, 10) : null,
          fiscal_quarter: editFiscalQuarter.trim() || null,
          due_date: editDueDate.trim() || null,
          period_from: editPeriodFrom.trim() || null,
          period_to: editPeriodTo.trim() || null,
          invoice_number: editInvoiceNumber.trim() || null,
          paid_by: editPaidBy.trim() || null,
          is_recurring: editIsRecurring ? 1 : 0,
          recurring_frequency: editRecurringFrequency.trim() || null,
          recurring_next_date: editRecurringNextDate.trim() || null,
          contract_end_date: editContractEndDate.trim() || null,
          gl_account: editGlAccount.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & BusinessExpense;
      if (!response.ok) throw data;
      setExpenses((current) =>
        current.map((e) => (e.id === selectedId ? { ...e, ...data } : e))
      );
      setError(null);
      void reloadOptions();
      void reloadSummary();
    } catch (err) {
      setApiError("Could not update expense", "We could not update the expense.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const deleteExpenseRecord = async () => {
    if (!selectedId) return;
    setBusyAction("delete");
    try {
      const response = await apiFetch(`/api/expenses/${selectedId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setSelectedId(null);
      await reloadExpenses();
      void reloadSummary();
      setDeleteOpen(false);
      setError(null);
    } catch (err) {
      setApiError("Could not delete expense", "We could not delete the expense.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const handleScan = async (file: File) => {
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append("invoice_photo", file);
      const response = await fetch("/api/expenses/scan", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; ocr?: Record<string, unknown>; error?: { userMessage?: string } };
      if (!response.ok || !data.ok) {
        setError({
          title: "Scan failed",
          message: data.error?.userMessage ?? "Could not read the invoice.",
          actions: ["Try a clearer photo."],
        });
        return;
      }
      const ocr = data.ocr as Record<string, unknown>;
      if (ocr.expense_date) setNewDate(String(ocr.expense_date));
      if (ocr.amount != null) setNewAmount(String(ocr.amount));
      if (ocr.category) setNewCategory(String(ocr.category));
      if (ocr.vendor_name) {
        setOcrVendorHint(String(ocr.vendor_name));
      }
      if (ocr.payment_method) setNewPaymentMethod(String(ocr.payment_method));
      if (ocr.invoice_number) setNewNotes((prev) => prev ? `${prev}\nInvoice: ${ocr.invoice_number}` : `Invoice: ${ocr.invoice_number}`);
      if (ocr.notes) setNewNotes((prev) => prev ? `${prev}\n${ocr.notes}` : String(ocr.notes));
    } catch (err) {
      setApiError("Scan error", "Could not scan the invoice.", err);
    } finally {
      setScanning(false);
    }
  };

  const recordPayment = async () => {
    if (!selectedId) return;
    const amt = parseFloat(payAmount);
    if (!payDate || isNaN(amt) || amt <= 0) {
      setError({ title: "Invalid payment", message: "Enter a valid date and a positive amount.", actions: [] });
      return;
    }
    setBusyAction("pay");
    try {
      const response = await apiFetch(`/api/expenses/${selectedId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          payment_date: payDate,
          amount: amt,
          payment_method: payMethod.trim() || null,
          reference_number: payRef.trim() || null,
          notes: payNotes.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { item?: BillPayment; expense?: BusinessExpense };
      if (!response.ok) throw data;
      if (data.item) setBillPayments((prev) => [data.item!, ...prev]);
      if (data.expense) setExpenses((curr) => curr.map((e) => (e.id === selectedId ? { ...e, ...data.expense! } : e)));
      setPayFormOpen(false);
      setPayDate(new Date().toISOString().slice(0, 10));
      setPayAmount("");
      setPayMethod("");
      setPayRef("");
      setPayNotes("");
      setError(null);
      void reloadSummary();
    } catch (err) {
      setApiError("Could not record payment", "We could not record the payment.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const removeBillPayment = async (paymentId: number) => {
    if (!selectedId) return;
    setBusyAction("delete-payment");
    try {
      const response = await apiFetch(`/api/expenses/${selectedId}/payments?paymentId=${paymentId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & { expense?: BusinessExpense };
      if (!response.ok) throw data;
      setBillPayments((prev) => prev.filter((p) => p.id !== paymentId));
      if (data.expense) setExpenses((curr) => curr.map((e) => (e.id === selectedId ? { ...e, ...data.expense! } : e)));
      setDeletePaymentId(null);
      void reloadSummary();
    } catch (err) {
      setApiError("Could not remove payment", "We could not remove the payment.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const editDirty =
    selectedExpense != null &&
    (editDate !== (selectedExpense.expense_date ?? "") ||
      editDatePaid !== (selectedExpense.date_paid ?? "") ||
      editAmount !== String(selectedExpense.amount ?? "") ||
      editCurrency !== (selectedExpense.currency_code ?? "USD") ||
      editPaymentMethod !== (selectedExpense.payment_method ?? "") ||
      editVendorId !== (selectedExpense.vendor_id ?? null) ||
      editCategory !== (selectedExpense.category ?? "") ||
      editSubcategory !== (selectedExpense.subcategory ?? "") ||
      editTaxDeductible !== Boolean(selectedExpense.tax_deductible) ||
      editTaxCategory !== (selectedExpense.tax_category ?? "") ||
      editBusinessUsePct !== String(selectedExpense.business_use_pct ?? 100) ||
      editIsCogs !== Boolean(selectedExpense.is_cogs) ||
      editIsAsset !== Boolean(selectedExpense.is_asset) ||
      editDepreciationYears !== (selectedExpense.depreciation_years != null ? String(selectedExpense.depreciation_years) : "") ||
      editFiscalQuarter !== (selectedExpense.fiscal_quarter ?? "") ||
      editDueDate !== (selectedExpense.due_date ?? "") ||
      editPeriodFrom !== (selectedExpense.period_from ?? "") ||
      editPeriodTo !== (selectedExpense.period_to ?? "") ||
      editInvoiceNumber !== (selectedExpense.invoice_number ?? "") ||
      editPaidBy !== (selectedExpense.paid_by ?? "") ||
      editIsRecurring !== Boolean(selectedExpense.is_recurring) ||
      editRecurringFrequency !== (selectedExpense.recurring_frequency ?? "") ||
      editRecurringNextDate !== (selectedExpense.recurring_next_date ?? "") ||
      editContractEndDate !== (selectedExpense.contract_end_date ?? "") ||
      editGlAccount !== (selectedExpense.gl_account ?? "") ||
      editNotes !== (selectedExpense.notes ?? ""));

  const expenseColumns = useMemo(
    () => [
      {
        key: "expense_date",
        header: "Date",
        sortable: true,
        render: (e: BusinessExpense) => e.expense_date ?? "-",
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
        render: (e: BusinessExpense) => e.vendor_name ?? "-",
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
          const variant = s === "paid" ? "success" : s === "partial" ? "warning" : "error";
          return <Badge label={s.charAt(0).toUpperCase() + s.slice(1)} variant={variant} />;
        },
      },
    ],
    []
  );

  const fmt = (n: number | undefined | null) =>
    (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

  const inputCls = "w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm";

  const categoryChips = useMemo(() => {
    const top = (summary?.by_category ?? []).slice(0, 6);
    return top.map((c) => ({ value: c.category, label: `${c.category} (${c.count})` }));
  }, [summary]);

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">AP Lite</h3>

      {/* Summary cards */}
      {summary && summary.totals.count > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-2">
            <p className="text-xs text-[var(--ui-muted)]">Total bills</p>
            <p className="text-lg font-bold text-[var(--ui-title)]">{fmt(summary.totals.gross_total)}</p>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-2">
            <p className="text-xs text-[var(--ui-muted)]">Unpaid</p>
            <p className="text-lg font-bold text-[var(--ui-red)]">
              {fmt((summary.by_status.find((s) => s.payment_status === "unpaid")?.total ?? 0) + (summary.by_status.find((s) => s.payment_status === "partial")?.total ?? 0))}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-2">
            <p className="text-xs text-[var(--ui-muted)]">Tax deductible</p>
            <p className="text-lg font-bold text-[var(--ui-green)]">{fmt(summary.totals.deductible_total)}</p>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-2">
            <p className="text-xs text-[var(--ui-muted)]">Top category</p>
            <p className="text-lg font-bold text-[var(--ui-title)]">{summary.by_category[0]?.category ?? "-"}</p>
          </div>
          <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-2">
            <p className="text-xs text-[var(--ui-muted)]">Recurring</p>
            <p className="text-lg font-bold text-[var(--ui-title)]">{summary.recurring_count}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left panel: list + detail */}
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              value={expenseSearch}
              onChange={(e) => { setPage(0); setExpenseSearch(e.target.value); }}
              placeholder="Search vendor, category, notes, invoice..."
              className="min-w-[10rem] flex-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm"
            />
          </div>
          <FilterChipRow
            label="Status"
            value={paymentStatusFilter}
            onChange={(value) => { setPage(0); setPaymentStatusFilter(value); }}
            options={[
              { value: "unpaid", label: "Unpaid" },
              { value: "partial", label: "Partial" },
              { value: "paid", label: "Paid" },
            ]}
          />
          {categoryChips.length > 0 && (
            <FilterChipRow
              label="Category"
              value={categoryFilter}
              onChange={(value) => { setPage(0); setCategoryFilter(value); }}
              options={categoryChips}
            />
          )}
          <DataTable
            columns={expenseColumns}
            data={expenses}
            selectedId={selectedId}
            onRowClick={(e) => setSelectedId(e.id)}
            sort={sort}
            onSortChange={(next) => { setPage(0); setSort(next ?? { key: "expense_date", dir: "desc" }); }}
            emptyMessage="No expenses on this page."
            keyboardNav
          />
          <PaginationBar page={page} pageSize={pageSize} total={listTotal} onPageChange={setPage} />

          {/* Detail panel */}
          {selectedExpense && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[var(--ui-title)]">
                  {selectedExpense.category} — {fmt(selectedExpense.amount)}
                </p>
                {selectedExpense.is_recurring ? <Badge label="Recurring" variant="info" /> : null}
                {selectedExpense.is_cogs ? <Badge label="COGS" variant="neutral" /> : null}
                {selectedExpense.is_asset ? <Badge label="Asset" variant="neutral" /> : null}
                {(() => {
                  const s = selectedExpense.payment_status ?? "unpaid";
                  const v = s === "paid" ? "success" : s === "partial" ? "warning" : "error";
                  return <Badge label={s.charAt(0).toUpperCase() + s.slice(1)} variant={v} />;
                })()}
                <div className="ml-auto flex items-center gap-2">
                  {(selectedExpense.payment_status ?? "unpaid") !== "paid" && (
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() => {
                        setPayFormOpen(true);
                        const balance = selectedExpense.amount - billPayments.reduce((s, p) => s + p.amount, 0);
                        setPayAmount(balance > 0 ? balance.toFixed(2) : "");
                        setPayDate(new Date().toISOString().slice(0, 10));
                      }}
                      disabled={busyAction != null}
                    >
                      Record payment
                    </Button>
                  )}
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => void updateExpense()}
                    busy={busyAction === "update"}
                    disabled={!editDirty || !editCategory.trim() || !editDate.trim()}
                    data-save-button
                  >
                    Save changes
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                    disabled={busyAction != null}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {/* Transaction info */}
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                <FormField label="Date" required>
                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Due date">
                  <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Amount" required>
                  <input type="number" step="0.01" min="0" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Currency">
                  <input value={editCurrency} onChange={(e) => setEditCurrency(e.target.value.toUpperCase())} maxLength={3} className={inputCls} />
                </FormField>
                <FormField label="Payment method">
                  <DropdownWithAddNew
                    value={editPaymentMethod}
                    onChange={setEditPaymentMethod}
                    options={options.payment_methods}
                    placeholder="Select method..."
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Paid by">
                  <DropdownWithAddNew
                    value={editPaidBy}
                    onChange={setEditPaidBy}
                    options={options.paid_by}
                    placeholder="Select..."
                    className={inputCls}
                  />
                </FormField>
              </div>

              {/* Categorization */}
              <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Categorization</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <FormField label="Category" required>
                    <DropdownWithAddNew
                      value={editCategory}
                      onChange={setEditCategory}
                      options={options.categories}
                      placeholder="Select category..."
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="Subcategory">
                    <DropdownWithAddNew
                      value={editSubcategory}
                      onChange={setEditSubcategory}
                      options={options.subcategories}
                      placeholder="More specific..."
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="Vendor / Supplier">
                    <VendorPicker
                      vendorId={editVendorId}
                      onChange={(id) => setEditVendorId(id)}
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="GL account override">
                    <input value={editGlAccount} onChange={(e) => setEditGlAccount(e.target.value)} placeholder="e.g. 6200" className={inputCls} />
                  </FormField>
                </div>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={editIsCogs} onChange={(e) => setEditIsCogs(e.target.checked)} className="accent-[var(--ui-accent)]" />
                    Cost of Goods Sold
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={editIsAsset} onChange={(e) => setEditIsAsset(e.target.checked)} className="accent-[var(--ui-accent)]" />
                    Capital asset
                  </label>
                </div>
                {editIsAsset && (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <FormField label="Depreciation years">
                      <input type="number" min="1" max="40" value={editDepreciationYears} onChange={(e) => setEditDepreciationYears(e.target.value)} placeholder="e.g. 5" className={inputCls} />
                    </FormField>
                  </div>
                )}
              </div>

              {/* Tax info */}
              <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Tax</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <FormField label="Tax category">
                    <DropdownWithAddNew
                      value={editTaxCategory}
                      onChange={setEditTaxCategory}
                      options={options.tax_categories}
                      placeholder="Select..."
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="Business use %">
                    <input type="number" min="0" max="100" step="1" value={editBusinessUsePct} onChange={(e) => setEditBusinessUsePct(e.target.value)} className={inputCls} />
                  </FormField>
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editTaxDeductible} onChange={(e) => setEditTaxDeductible(e.target.checked)} className="accent-[var(--ui-accent)]" />
                  Tax deductible
                </label>
              </div>

              {/* Documentation */}
              <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">Documentation</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <FormField label="Invoice number">
                    <input value={editInvoiceNumber} onChange={(e) => setEditInvoiceNumber(e.target.value)} placeholder="Invoice #" className={inputCls} />
                  </FormField>
                  <FormField label="Fiscal quarter">
                    <input value={editFiscalQuarter} onChange={(e) => setEditFiscalQuarter(e.target.value)} placeholder="e.g. Q2 2026" className={inputCls} />
                  </FormField>
                  <FormField label="Period from">
                    <input type="date" value={editPeriodFrom} onChange={(e) => setEditPeriodFrom(e.target.value)} className={inputCls} />
                  </FormField>
                  <FormField label="Period to">
                    <input type="date" value={editPeriodTo} onChange={(e) => setEditPeriodTo(e.target.value)} className={inputCls} />
                  </FormField>
                </div>
              </div>

              {/* Recurring */}
              <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--ui-title)] cursor-pointer">
                  <input type="checkbox" checked={editIsRecurring} onChange={(e) => setEditIsRecurring(e.target.checked)} className="accent-[var(--ui-accent)]" />
                  Recurring expense
                </label>
                {editIsRecurring && (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <FormField label="Frequency">
                      <select value={editRecurringFrequency} onChange={(e) => setEditRecurringFrequency(e.target.value)} className={inputCls}>
                        <option value="">Select...</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annual">Annual</option>
                      </select>
                    </FormField>
                    <FormField label="Next due date">
                      <input type="date" value={editRecurringNextDate} onChange={(e) => setEditRecurringNextDate(e.target.value)} className={inputCls} />
                    </FormField>
                    <FormField label="Contract end date">
                      <input type="date" value={editContractEndDate} onChange={(e) => setEditContractEndDate(e.target.value)} className={inputCls} />
                    </FormField>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                <FormField label="Notes">
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes about this expense..."
                    rows={3}
                    maxLength={2000}
                    spellCheck
                    className={`${inputCls} w-full`}
                  />
                </FormField>
              </div>

              {/* Bill payments */}
              <div className="mt-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
                <p className="mb-2 text-sm font-semibold text-[var(--ui-title)]">
                  Payments
                  {billPayments.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-[var(--ui-muted)]">
                      {fmt(billPayments.reduce((s, p) => s + p.amount, 0))} of {fmt(selectedExpense.amount)} paid
                    </span>
                  )}
                </p>

                {payFormOpen && (
                  <div className="mb-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <FormField label="Payment date" required>
                        <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputCls} />
                      </FormField>
                      <FormField label="Amount" required>
                        <input type="number" step="0.01" min="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" className={inputCls} />
                      </FormField>
                      <FormField label="Payment method">
                        <DropdownWithAddNew value={payMethod} onChange={setPayMethod} options={options.payment_methods} placeholder="Select method..." className={inputCls} />
                      </FormField>
                      <FormField label="Reference / check #">
                        <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Check #, confirmation..." className={inputCls} />
                      </FormField>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button variant="accent" size="sm" onClick={() => void recordPayment()} busy={busyAction === "pay"} disabled={!payDate || !payAmount}>
                        Save payment
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setPayFormOpen(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

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
                            <td className="py-1 pr-2 text-right font-medium text-[var(--ui-body)]">{fmt(bp.amount)}</td>
                            <td className="py-1 pr-2 text-[var(--ui-muted)]">{bp.payment_method ?? "-"}</td>
                            <td className="py-1 pr-2 text-[var(--ui-muted)]">{bp.reference_number ?? "-"}</td>
                            <td className="py-1 text-right">
                              <button
                                type="button"
                                onClick={() => setDeletePaymentId(bp.id)}
                                className="text-[var(--ui-red)] hover:underline disabled:opacity-50"
                                disabled={busyAction != null}
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
              </div>
            </>
          )}
        </div>

        {/* Right panel: add expense */}
        <div className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Add expense</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => scanRef.current?.click()}
              busy={scanning}
            >
              Scan invoice
            </Button>
            <input
              ref={scanRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleScan(file);
                e.target.value = "";
              }}
            />
          </div>
          <FormField label="Date" required>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputCls} />
          </FormField>
          <FormField label="Amount" required>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="0.00"
              className={inputCls}
            />
          </FormField>
          <FormField label="Category" required>
            <DropdownWithAddNew
              value={newCategory}
              onChange={setNewCategory}
              options={options.categories}
              placeholder="Select category..."
              className={inputCls}
            />
          </FormField>
          <FormField label="Vendor / Supplier">
            <VendorPicker
              vendorId={newVendorId}
              onChange={(id) => { setNewVendorId(id); if (id) setOcrVendorHint(null); }}
              placeholder="Select vendor..."
              ocrHint={ocrVendorHint}
              onHintConsumed={() => setOcrVendorHint(null)}
              allowEmpty={false}
              className={inputCls}
            />
          </FormField>
          <FormField label="Payment method">
            <DropdownWithAddNew
              value={newPaymentMethod}
              onChange={setNewPaymentMethod}
              options={options.payment_methods}
              placeholder="Select method..."
              className={inputCls}
            />
          </FormField>
          <FormField label="Notes">
            <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Notes..." rows={2} className={`${inputCls} w-full`} />
          </FormField>
          <div className="flex items-center gap-2">
            <Button
              variant="accent"
              size="lg"
              onClick={() => void createExpenseRecord()}
              busy={busyAction === "create"}
              disabled={!newDate.trim() || !newAmount.trim() || !newCategory.trim()}
            >
              Add bill
            </Button>
            {(newAmount || newCategory || newVendorId || newNotes) && (
              <Button variant="secondary" onClick={resetCreateForm}>Cancel</Button>
            )}
          </div>

          {/* Upcoming recurring */}
          {upcoming.length > 0 && (
            <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Upcoming recurring</p>
              <ul className="space-y-1 text-xs">
                {upcoming.slice(0, 5).map((u) => (
                  <li key={u.id} className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setSelectedId(u.id)}
                      className="text-left text-[var(--ui-body)] hover:text-[var(--ui-accent)]"
                    >
                      {u.category}{u.vendor_name ? ` — ${u.vendor_name}` : ""}
                    </button>
                    <span className="text-[var(--ui-muted)]">{u.recurring_next_date}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {listTotal === 0 && (
        <EmptyState
          message={
            expenseSearch.trim() || categoryFilter
              ? "No bills match your filters."
              : "No bills yet. Add your first bill or expense to start tracking accounts payable."
          }
          primaryAction={
            expenseSearch.trim() || categoryFilter
              ? {
                  label: "Clear filters",
                  onClick: () => {
                    setExpenseSearch("");
                    setCategoryFilter(null);
                    setPage(0);
                  },
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        open={deletePaymentId != null}
        onClose={() => setDeletePaymentId(null)}
        onConfirm={() => { if (deletePaymentId != null) void removeBillPayment(deletePaymentId); }}
        title="Remove payment?"
        description="This payment record will be permanently removed. The bill status will be recalculated."
        confirmLabel="Remove"
        confirmVariant="danger"
        busy={busyAction === "delete-payment"}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void deleteExpenseRecord()}
        title="Delete bill?"
        description="This bill and all its payment records will be permanently deleted. This action cannot be undone."
        affectedLabel={selectedExpense ? `${selectedExpense.category} — ${fmt(selectedExpense.amount)}` : undefined}
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={busyAction === "delete"}
      />
    </section>
  );
}

export default function ExpensesPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 text-sm text-[var(--ui-muted)]">
          Loading expenses...
        </section>
      }
    >
      <ExpensesPageInner />
    </Suspense>
  );
}
