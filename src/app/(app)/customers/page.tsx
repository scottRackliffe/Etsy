"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import type { ApiErrorShape, Customer, CustomerAddress } from "@/types";

export default function CustomersPage() {
  const {
    customers, setCustomers, selectedCustomerId, setSelectedCustomerId,
    customerAddresses, setCustomerAddresses,
    busyAction, setBusyAction, setApiError, setError,
  } = useApp();

  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newAddressFirstLine, setNewAddressFirstLine] = useState("");
  const [newAddressCity, setNewAddressCity] = useState("");
  const [newAddressPostalCode, setNewAddressPostalCode] = useState("");
  const [newAddressCountry, setNewAddressCountry] = useState("US");

  const selectedCustomer = customers.find((row) => row.id === selectedCustomerId) ?? null;

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

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Customers</h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 lg:col-span-2">
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-[var(--ui-muted)]">
                  <th className="py-1">Name</th>
                  <th className="py-1">Email</th>
                  <th className="py-1">Phone</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => setSelectedCustomerId(customer.id)}
                    className={`cursor-pointer border-t border-[var(--ui-border)]/60 ${
                      selectedCustomerId === customer.id ? "bg-[var(--ui-list-hover)]/60" : ""
                    }`}
                  >
                    <td className="py-1 pr-2">
                      {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || `Customer ${customer.id}`}
                    </td>
                    <td className="py-1 pr-2">{customer.email ?? "-"}</td>
                    <td className="py-1">{customer.phone ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                      onClick={() => deleteAddress(address.id)}
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
        </div>
        <div className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3">
          <p className="text-sm font-semibold">Add customer</p>
          <input value={newCustomerFirstName} onChange={(e) => setNewCustomerFirstName(e.target.value)} placeholder="First name" className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <input value={newCustomerLastName} onChange={(e) => setNewCustomerLastName(e.target.value)} placeholder="Last name" className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
          <input value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} placeholder="Email" className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 text-sm" />
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
      {customers.length === 0 && (
        <p className="mt-3 text-sm text-[var(--ui-muted)]">
          No customers yet. Create one from the panel on the right.
        </p>
      )}
    </section>
  );
}
