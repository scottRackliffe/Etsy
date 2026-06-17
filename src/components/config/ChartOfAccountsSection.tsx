"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type Account = {
  id: number;
  acct_number: string;
  account_name: string;
  account_type: string;
  normal_balance: string;
  description: string | null;
  is_active: number;
};

type GLRule = {
  id: number;
  transaction_type: string;
  description: string | null;
  debit_acct: string;
  credit_acct: string;
  debit_account_name?: string;
  credit_account_name?: string;
  source_table: string | null;
  source_column: string | null;
  is_active: number;
};

type EditingAccount = {
  id: number | null;
  acct_number: string;
  account_name: string;
  account_type: string;
  normal_balance: string;
  description: string;
};

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Contra-Revenue", "COGS", "Expense"];

const cellClass = "px-3 py-2 text-sm text-[var(--ui-body)]";
const headerClass = "px-3 py-2 text-left text-xs font-semibold text-[var(--ui-muted)]";

export function ChartOfAccountsSection() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rules, setRules] = useState<GLRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [acctRes, rulesRes] = await Promise.all([
        fetch("/api/chart-of-accounts"),
        fetch("/api/gl-transaction-rules"),
      ]);
      const acctData = await acctRes.json();
      const rulesData = await rulesRes.json();
      if (acctData.ok) setAccounts(acctData.items);
      if (rulesData.ok) setRules(rulesData.items);
    } catch {
      setError("Failed to load accounting data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const startAdd = () => {
    setEditing({ id: null, acct_number: "", account_name: "", account_type: "Asset", normal_balance: "debit", description: "" });
    setError("");
  };

  const startEdit = (a: Account) => {
    setEditing({ id: a.id, acct_number: a.acct_number, account_name: a.account_name, account_type: a.account_type, normal_balance: a.normal_balance, description: a.description || "" });
    setError("");
  };

  const saveAccount = async () => {
    if (!editing) return;
    if (!editing.acct_number.trim() || !editing.account_name.trim()) {
      setError("Account number and name are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url = editing.id ? `/api/chart-of-accounts/${editing.id}` : "/api/chart-of-accounts";
      const method = editing.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Save failed.");
      } else {
        setEditing(null);
        void loadData();
      }
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a: Account) => {
    try {
      await fetch(`/api/chart-of-accounts/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: a.is_active ? false : true }),
      });
      void loadData();
    } catch {
      setError("Update failed.");
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
        <h4 className="text-sm font-semibold text-[var(--ui-title)]">Accounting</h4>
        <p className="mt-2 text-sm text-[var(--ui-muted)]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-[var(--ui-title)]">Chart of Accounts</h4>
            <p className="text-xs text-[var(--ui-muted)]">
              GAAP account numbers used in the Accounting Export. Edit numbers to match your accounting software.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={startAdd}>Add Account</Button>
        </div>

        {error && <p className="mb-2 text-sm text-[var(--ui-red)]">{error}</p>}

        {editing && (
          <div className="mb-4 rounded border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-[var(--ui-muted)]">Acct #</label>
                <input
                  className="w-full rounded border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-sm text-[var(--ui-body)]"
                  value={editing.acct_number}
                  onChange={(e) => setEditing({ ...editing, acct_number: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ui-muted)]">Account Name</label>
                <input
                  className="w-full rounded border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-sm text-[var(--ui-body)]"
                  value={editing.account_name}
                  onChange={(e) => setEditing({ ...editing, account_name: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ui-muted)]">Type</label>
                <select
                  className="w-full rounded border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-sm text-[var(--ui-body)]"
                  value={editing.account_type}
                  onChange={(e) => setEditing({ ...editing, account_type: e.target.value })}
                >
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ui-muted)]">Normal Balance</label>
                <select
                  className="w-full rounded border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-sm text-[var(--ui-body)]"
                  value={editing.normal_balance}
                  onChange={(e) => setEditing({ ...editing, normal_balance: e.target.value })}
                >
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
              </div>
            </div>
            <div className="mt-2">
              <label className="mb-1 block text-xs text-[var(--ui-muted)]">Description</label>
              <input
                className="w-full rounded border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-2 py-1 text-sm text-[var(--ui-body)]"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" onClick={() => void saveAccount()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-border)]">
                <th className={headerClass}>Acct #</th>
                <th className={headerClass}>Account Name</th>
                <th className={headerClass}>Type</th>
                <th className={headerClass}>Normal Balance</th>
                <th className={headerClass}>Description</th>
                <th className={headerClass}>Status</th>
                <th className={headerClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className={`border-b border-[var(--ui-border)] ${!a.is_active ? "opacity-50" : ""}`}>
                  <td className={cellClass}>{a.acct_number}</td>
                  <td className={cellClass}>{a.account_name}</td>
                  <td className={cellClass}>{a.account_type}</td>
                  <td className={cellClass}>{a.normal_balance}</td>
                  <td className={`${cellClass} text-[var(--ui-muted)]`}>{a.description || "—"}</td>
                  <td className={cellClass}>
                    <span className={`text-xs font-medium ${a.is_active ? "text-[var(--ui-green)]" : "text-[var(--ui-muted)]"}`}>
                      {a.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className={cellClass}>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(a)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => void toggleActive(a)}>
                        {a.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4">
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-[var(--ui-title)]">GL Transaction Rules</h4>
          <p className="text-xs text-[var(--ui-muted)]">
            How each transaction type maps to debit and credit accounts in the Accounting Export.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-border)]">
                <th className={headerClass}>Transaction Type</th>
                <th className={headerClass}>Debit</th>
                <th className={headerClass}>Credit</th>
                <th className={headerClass}>Description</th>
                <th className={headerClass}>Source</th>
              </tr>
            </thead>
            <tbody>
              {rules.filter((r) => r.is_active).map((r) => (
                <tr key={r.id} className="border-b border-[var(--ui-border)]">
                  <td className={`${cellClass} font-medium`}>{r.transaction_type}</td>
                  <td className={cellClass}>
                    <span className="text-[var(--ui-muted)]">{r.debit_acct}</span>{" "}
                    {r.debit_account_name || ""}
                  </td>
                  <td className={cellClass}>
                    <span className="text-[var(--ui-muted)]">{r.credit_acct}</span>{" "}
                    {r.credit_account_name || ""}
                  </td>
                  <td className={`${cellClass} text-[var(--ui-muted)]`}>{r.description || "—"}</td>
                  <td className={`${cellClass} text-[var(--ui-muted)]`}>
                    {r.source_table ? `${r.source_table}.${r.source_column}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
