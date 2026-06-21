"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";
import { FormField } from "@/components/ui/FormField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownWithAddNew } from "@/components/ui/DropdownWithAddNew";
import { Badge } from "@/components/ui/Badge";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/format-currency";
import { apiFetch } from "@/lib/api-fetch";
import type { ApiErrorShape } from "@/types";
import type { TaxPaymentRecord } from "@/lib/tax-payments";

type TaxSummary = {
  tax_collected: number;
  total_remitted: number;
  balance_due: number;
  last_payment_date: string | null;
  current_year_paid: number;
  payments_count: number;
};

export function TaxPaymentWidget({ embedded = false }: { embedded?: boolean }) {
  const { setApiError, setError, currencyCode } = useApp();
  const fmt = (n: number) => formatCurrency(n, currencyCode);

  const [payments, setPayments] = useState<TaxPaymentRecord[]>([]);
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [reason, setReason] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [payeeOptions, setPayeeOptions] = useState<string[]>([]);
  const [reasonOptions, setReasonOptions] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<TaxPaymentRecord | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [paymentsRes, summaryRes] = await Promise.all([
        fetch("/api/tax-payments", { headers: { Accept: "application/json" } }),
        fetch("/api/tax-payments/summary", { headers: { Accept: "application/json" } }),
      ]);
      const paymentsData = (await paymentsRes.json().catch(() => ({}))) as ApiErrorShape & {
        items?: TaxPaymentRecord[];
      };
      const summaryData = (await summaryRes.json().catch(() => ({}))) as Partial<TaxSummary>;

      if (paymentsRes.ok) {
        setPayments(paymentsData.items ?? []);
      } else {
        setPayments([]);
      }

      if (summaryRes.ok) {
        setSummary({
          tax_collected: summaryData.tax_collected ?? 0,
          total_remitted: summaryData.total_remitted ?? 0,
          balance_due: summaryData.balance_due ?? 0,
          last_payment_date: summaryData.last_payment_date ?? null,
          current_year_paid: summaryData.current_year_paid ?? 0,
          payments_count: summaryData.payments_count ?? 0,
        });
      } else {
        setSummary(null);
      }
    } catch {
      setPayments([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/tax-payments/options", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        payees?: string[];
        reasons?: string[];
      };
      if (data.payees) setPayeeOptions(data.payees);
      if (data.reasons) setReasonOptions(data.reasons);
    } catch {
      /* use defaults */
    }
  }, []);

  useEffect(() => {
    void loadData();
    void loadOptions();
  }, [loadData, loadOptions]);

  const resetForm = () => {
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAmount("");
    setPayee("");
    setReason("");
    setPeriodFrom("");
    setPeriodTo("");
    setReferenceNumber("");
    setNotes("");
  };

  const createPayment = async () => {
    const parsedAmount = parseFloat(amount);
    if (!paymentDate || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError({
        title: "Invalid payment",
        message: "Enter a valid date and a positive amount.",
        actions: ["Fix the highlighted fields and try again."],
      });
      return;
    }
    setBusyAction("create");
    try {
      const expResponse = await apiFetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          expense_date: paymentDate,
          amount: parsedAmount,
          category: "Tax Remittance",
          subcategory: reason.trim() || null,
          vendor_name: payee.trim() || null,
          tax_deductible: 0,
          period_from: periodFrom || null,
          period_to: periodTo || null,
          notes: referenceNumber.trim()
            ? `Ref: ${referenceNumber.trim()}${notes.trim() ? `\n${notes.trim()}` : ""}`
            : notes.trim() || null,
        }),
      });
      const expData = (await expResponse.json().catch(() => ({}))) as ApiErrorShape & { id?: number };
      if (!expResponse.ok) throw expData;

      if (expData.id) {
        await apiFetch(`/api/expenses/${expData.id}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            payment_date: paymentDate,
            amount: parsedAmount,
            reference_number: referenceNumber.trim() || null,
          }),
        });
      }

      const response = await apiFetch("/api/tax-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          payment_date: paymentDate,
          amount: parsedAmount,
          payee: payee.trim() || null,
          reason: reason.trim() || null,
          period_from: periodFrom || null,
          period_to: periodTo || null,
          reference_number: referenceNumber.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (!response.ok) throw data;

      resetForm();
      setFormOpen(false);
      setError(null);
      void loadData();
      void loadOptions();
    } catch (err) {
      setApiError("Could not record payment", "We could not save the tax payment.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const deletePayment = async () => {
    if (!deleteTarget) return;
    setBusyAction("delete");
    try {
      if (deleteTarget.source === "expense" && deleteTarget.expense_id != null) {
        const response = await apiFetch(
          `/api/expenses/${deleteTarget.expense_id}/payments?paymentId=${deleteTarget.source_id}`,
          { method: "DELETE", headers: { Accept: "application/json" } }
        );
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
          throw data;
        }
      } else {
        const response = await apiFetch(`/api/tax-payments/${deleteTarget.source_id}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        });
        if (!response.ok && response.status !== 204) {
          const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
          throw data;
        }
      }

      setDeleteTarget(null);
      setError(null);
      void loadData();
    } catch (err) {
      setApiError("Could not delete payment", "We could not delete the tax payment.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const formatDisplayDate = (value: string | null) => {
    if (!value) return "—";
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const inputCls = "w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm";
  const balanceColor =
    summary == null
      ? "text-[var(--ui-muted)]"
      : summary.balance_due > 0
        ? "text-[var(--ui-yellow)]"
        : summary.balance_due < 0
          ? "text-[var(--ui-red)]"
          : "text-[var(--ui-green)]";

  const wrapperClass = embedded
    ? "h-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4"
    : "rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm";

  const metricCardClass = embedded
    ? ""
    : "rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4";
  const labelClass = embedded
    ? "text-xs text-[var(--ui-muted)]"
    : "text-xs uppercase tracking-wide text-[var(--ui-muted)]";
  const valueClass = embedded
    ? "mt-1 text-lg font-semibold"
    : "mt-2 text-xl font-semibold";

  const summaryCards = summary ? (
    <div className={`grid grid-cols-2 gap-3 ${embedded ? "sm:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-4"} ${embedded ? "" : "mb-4"}`}>
      <div className={metricCardClass}>
        <p className={labelClass}>Tax collected</p>
        <p className={`${valueClass} text-[var(--ui-title)]`}>{fmt(summary.tax_collected)}</p>
        {!embedded ? <p className="mt-1 text-xs text-[var(--ui-muted)]">from active orders</p> : null}
      </div>
      <div className={metricCardClass}>
        <p className={labelClass}>Total remitted</p>
        <p className={`${valueClass} text-[var(--ui-title)]`}>{fmt(summary.total_remitted)}</p>
        <p className="mt-1 text-xs text-[var(--ui-muted)]">
          {embedded ? fmt(summary.current_year_paid) + " YTD" : `${fmt(summary.current_year_paid)} this year`}
        </p>
      </div>
      <div className={metricCardClass}>
        <p className={labelClass}>Balance due</p>
        <p className={`${valueClass} ${balanceColor}`}>{fmt(summary.balance_due)}</p>
        {!embedded ? <p className="mt-1 text-xs text-[var(--ui-muted)]">collected minus remitted</p> : null}
      </div>
      <div className={metricCardClass}>
        <p className={labelClass}>Last payment</p>
        <p className={`${valueClass} text-[var(--ui-title)]`}>
          {formatDisplayDate(summary.last_payment_date)}
        </p>
        {!embedded && (
          <p className="mt-1 text-xs text-[var(--ui-muted)]">
            {summary.last_payment_date ? "most recent remittance" : "none recorded yet"}
          </p>
        )}
      </div>
    </div>
  ) : null;

  const inner = (
    <>
      <WidgetHeader
        title="Tax payments"
        subtitle={
          embedded
            ? undefined
            : loading
              ? "Loading…"
              : `${summary?.payments_count ?? payments.length} payment${(summary?.payments_count ?? payments.length) !== 1 ? "s" : ""} recorded`
        }
        action={
          <button
            type="button"
            onClick={() => {
              resetForm();
              setFormOpen(!formOpen);
            }}
            className="text-xs font-medium text-[var(--ui-accent)] hover:underline"
          >
            {formOpen ? "Cancel" : "Record payment"}
          </button>
        }
      />

      {summaryCards}

      {formOpen && (
        <div className="mb-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
          <p className="mb-3 text-sm font-semibold text-[var(--ui-title)]">New tax payment</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField label="Payment date" required>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={inputCls}
              />
            </FormField>
            <FormField label="Amount" required>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </FormField>
            <FormField label="Payee">
              <DropdownWithAddNew
                value={payee}
                onChange={setPayee}
                options={payeeOptions}
                placeholder="Who did you pay?"
                className={inputCls}
              />
            </FormField>
            <FormField label="Reason">
              <DropdownWithAddNew
                value={reason}
                onChange={setReason}
                options={reasonOptions}
                placeholder="Filing type..."
                className={inputCls}
              />
            </FormField>
            <FormField label="Period from">
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className={inputCls}
              />
            </FormField>
            <FormField label="Period to">
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className={inputCls}
              />
            </FormField>
            <FormField label="Reference / check #">
              <input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Check #, confirmation #, etc."
                className={inputCls}
              />
            </FormField>
            <FormField label="Notes">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                className={inputCls}
              />
            </FormField>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="accent"
              size="sm"
              onClick={() => void createPayment()}
              busy={busyAction === "create"}
              disabled={!paymentDate || !amount || parseFloat(amount) <= 0}
            >
              Save payment
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!embedded && loading ? (
        <p className="text-xs text-[var(--ui-muted)]">Loading payments...</p>
      ) : !embedded && payments.length === 0 ? (
        <p className="text-sm text-[var(--ui-muted)]">
          No tax payments recorded yet. Click &quot;Record payment&quot; to log your first tax remittance.
        </p>
      ) : !embedded ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-border)] text-left text-xs uppercase tracking-wide text-[var(--ui-muted)]">
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Payee</th>
                <th className="pb-2 pr-3">Reason</th>
                <th className="pb-2 pr-3">Period</th>
                <th className="pb-2 pr-3 text-right">Amount</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-[var(--ui-border)]/50">
                  <td className="py-2 pr-3 text-[var(--ui-body)]">{p.payment_date}</td>
                  <td className="py-2 pr-3 text-[var(--ui-body)]">{p.payee ?? "-"}</td>
                  <td className="py-2 pr-3">
                    {p.reason ? (
                      <Badge label={p.reason} variant="neutral" />
                    ) : (
                      <span className="text-[var(--ui-muted)]">-</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-[var(--ui-muted)]">
                    {p.period_from && p.period_to
                      ? `${p.period_from} – ${p.period_to}`
                      : (p.period_from ?? p.period_to ?? "-")}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium text-[var(--ui-body)]">
                    {fmt(p.amount)}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteTarget(p)}
                      disabled={busyAction != null}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--ui-border)]">
                <td
                  colSpan={4}
                  className="py-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]"
                >
                  Total remitted
                </td>
                <td className="py-2 pr-3 text-right font-semibold text-[var(--ui-title)]">
                  {fmt(summary?.total_remitted ?? payments.reduce((sum, p) => sum + p.amount, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deletePayment()}
        title="Delete tax payment?"
        description="This tax payment record will be permanently removed."
        affectedLabel={
          deleteTarget
            ? `${deleteTarget.payment_date} — ${fmt(deleteTarget.amount)}`
            : undefined
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={busyAction === "delete"}
      />
    </>
  );

  if (embedded) {
    return <div className={wrapperClass}>{inner}</div>;
  }

  return <section className={wrapperClass}>{inner}</section>;
}
