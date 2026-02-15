"use client";

/**
 * Dashboard: connect Etsy, choose shop, view recent orders (receipts).
 * Uses /api/shop and /api/receipts for data; /api/auth/etsy and /api/auth/logout for auth.
 */
import { useEffect, useState } from "react";

type Shop = { shop_id: number; shop_name: string };
type Receipt = {
  receipt_id: number;
  order_id: number;
  name: string;
  first_line: string;
  second_line: string | null;
  city: string;
  state: string | null;
  zip: string;
  country_iso: string;
  total_price: string;
  total_shipping_cost: string;
  currency_code: string;
  was_paid: boolean;
  was_shipped: boolean;
  creation_tsz: number;
  message_from_buyer: string | null;
};

export default function Home() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const e = params.get("error");
    if (e) setUrlError(decodeURIComponent(e));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shop")
      .then((r) => {
        if (r.status === 401) return { shops: [] };
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setShops(data.shops ?? []);
        if (data.shops?.length) setSelectedShopId(data.shops[0].shop_id);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedShopId == null) return;
    setReceiptsLoading(true);
    fetch(`/api/receipts?shop_id=${selectedShopId}&limit=100`)
      .then((r) => r.json())
      .then((data) => {
        setReceipts(data.results ?? []);
        setCount(data.count ?? 0);
      })
      .catch(() => setReceipts([]))
      .finally(() => setReceiptsLoading(false));
  }, [selectedShopId]);

  const connect = () => {
    window.location.href = "/api/auth/etsy";
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setShops([]);
    setReceipts([]);
    setSelectedShopId(null);
    setCount(0);
  };

  const formatDate = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const formatMoney = (value: string, code: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: code || "USD" }).format(
      parseFloat(value || "0")
    );

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-xl font-semibold text-stone-800">Trudy&apos;s Etsy Sales</h1>
          <div className="flex items-center gap-3">
            {shops.length > 0 ? (
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={connect}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                Connect Etsy
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {urlError && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            Etsy returned an error: {urlError}
          </div>
        )}

        {loading && (
          <p className="text-stone-500">Checking connection…</p>
        )}

        {!loading && shops.length === 0 && !error && (
          <div className="rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
            <p className="mb-4 text-stone-600">Connect your Etsy account to view and manage sales.</p>
            <button
              type="button"
              onClick={connect}
              className="rounded-lg bg-orange-600 px-6 py-3 font-medium text-white hover:bg-orange-700"
            >
              Connect with Etsy
            </button>
          </div>
        )}

        {error && shops.length === 0 && (
          <p className="text-red-600">Error: {error}</p>
        )}

        {shops.length > 0 && (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <label className="text-sm font-medium text-stone-600">Shop:</label>
              <select
                value={selectedShopId ?? ""}
                onChange={(e) => setSelectedShopId(Number(e.target.value))}
                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-800"
              >
                {shops.map((s) => (
                  <option key={s.shop_id} value={s.shop_id}>
                    {s.shop_name}
                  </option>
                ))}
              </select>
            </div>

            <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-200 px-4 py-3">
                <h2 className="text-lg font-semibold text-stone-800">Recent orders</h2>
                <p className="text-sm text-stone-500">
                  {count} receipt(s) — paid / shipped status below
                </p>
              </div>
              {receiptsLoading ? (
                <div className="p-8 text-center text-stone-500">Loading orders…</div>
              ) : receipts.length === 0 ? (
                <div className="p-8 text-center text-stone-500">No orders yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-stone-600">
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Order #</th>
                        <th className="px-4 py-3 font-medium">Ship to</th>
                        <th className="px-4 py-3 font-medium">Total</th>
                        <th className="px-4 py-3 font-medium">Paid</th>
                        <th className="px-4 py-3 font-medium">Shipped</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.map((r) => (
                        <tr key={r.receipt_id} className="border-b border-stone-100 hover:bg-stone-50">
                          <td className="px-4 py-3">{formatDate(r.creation_tsz)}</td>
                          <td className="px-4 py-3 font-mono">{r.receipt_id}</td>
                          <td className="px-4 py-3">
                            <span className="font-medium">{r.name}</span>
                            <br />
                            <span className="text-stone-500">
                              {r.first_line}, {r.city} {r.state} {r.zip} {r.country_iso}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {formatMoney(r.total_price, r.currency_code)}
                            {parseFloat(r.total_shipping_cost) > 0 && (
                              <span className="text-stone-500">
                                {" "}+ {formatMoney(r.total_shipping_cost, r.currency_code)} ship
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {r.was_paid ? (
                              <span className="text-emerald-600">Yes</span>
                            ) : (
                              <span className="text-amber-600">No</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {r.was_shipped ? (
                              <span className="text-emerald-600">Yes</span>
                            ) : (
                              <span className="text-stone-400">No</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
