"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownWithAddNew } from "@/components/ui/DropdownWithAddNew";
import { Badge } from "@/components/ui/Badge";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/format-currency";
import { apiFetch } from "@/lib/api-fetch";
import type { ApiErrorShape } from "@/types";

type TaxPayment = {
  id: number;
  payment_date: string;
  amount: number;
  payee: string | null;
  reason: string | null;
  period_from: string | null;
  period_to: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
};

export function TaxPaymentWidget() {
  const { setApiError, setError, currencyCode } = useApp();
  const fmt = (n: number) => formatCurrency(n, currencyCode);

  const [payments, setPayments] = useState<TaxPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [reason, setReason] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  // Dropdown options
  const [payeeOptions, setPayeeOptions] = useState<string[]>([]);
  const [reasonOptions, setReasonOptions] = useState<string[]>([]);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<TaxPayment | null>(null);

  const loadPayments = useCallback(async () => {
    try {
      const response = await fetch("/api/tax-payments", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        items?: TaxPayment[];
      };
      if (!response.ok) throw data;
      setPayments(data.items ?? []);
    } catch {
      setPayments([]);
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
    } catch { /* use defaults */ }
  }, []);

  useEffect(() => {
    void loadPayments();
    void loadOptions();
  }, [loadPayments, loadOptions]);

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
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
        item?: TaxPayment;
      };
      if (!response.ok) throw data;
      if (data.item) {
        setPayments((current) => [data.item!, ...current]);
      }
      resetForm();
      setFormOpen(false);
      setError(null);
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
      const response = await apiFetch(`/api/tax-payments/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok && response.status !== 204) {
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
        throw data;
      }
      setPayments((current) => current.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      setError(null);
    } catch (err) {
      setApiError("Could not delete payment", "We could not delete the tax payment.", err);
    } finally {
      setBusyAction(null);
    }
  };

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const inputCls = "w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm";

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--ui-title)]">Tax payments</h3>
          <p className="text-sm text-[var(--ui-muted)]">
            {loading
              ? "Loading..."
              : `${payments.length} payment${payments.length !== 1 ? "s" : ""} recorded · Total remitted: ${fmt(totalPaid)}`}
          </p>
        </div>
        <Button
          variant="accent"
          size="sm"
          onClick={() => {
            resetForm();
            setFormOpen(!formOpen);
          }}
        >
          {formOpen ? "Cancel" : "Record payment"}
        </Button>
      </div>

      {/* ─── Add payment form ─── */}
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

      {/* ─── Payments list ─── */}
      {loading ? (
        <p className="text-xs text-[var(--ui-muted)]">Loading payments...</p>
      ) : payments.length === 0 ? (
        <p className="text-sm text-[var(--ui-muted)]">
          No tax payments recorded yet. Click &quot;Record payment&quot; to log your first tax remittance.
        </p>
      ) : (
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
                <tr
                  key={p.id}
                  className="border-b border-[var(--ui-border)]/50"
                >
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
                      : p.period_from ?? p.period_to ?? "-"}
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
                <td colSpan={4} className="py-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                  Total remitted
                </td>
                <td className="py-2 pr-3 text-right font-semibold text-[var(--ui-title)]">
                  {fmt(totalPaid)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

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
    </section>
  );
}
