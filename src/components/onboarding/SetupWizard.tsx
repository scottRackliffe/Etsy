"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { ApiErrorShape } from "@/types";

const STEP_NAMES = ["Welcome", "Your Business", "Connect Etsy", "Get Started"];

const BUSINESS_KEYS = [
  "business_name",
  "business_address_line_1",
  "business_address_line_2",
  "business_city",
  "business_state_province",
  "business_postal_code",
  "business_country",
] as const;

type BusinessDraft = Record<(typeof BUSINESS_KEYS)[number], string>;

async function saveSetting(key: string, value: string): Promise<void> {
  const response = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
    throw data;
  }
}

async function markSetupComplete(): Promise<void> {
  await saveSetting("setup.completed", "true");
}

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const { shops, connect, setError, setApiError } = useApp();
  const [step, setStep] = useState(0);
  const [business, setBusiness] = useState<BusinessDraft>({
    business_name: "",
    business_address_line_1: "",
    business_address_line_2: "",
    business_city: "",
    business_state_province: "",
    business_postal_code: "",
    business_country: "US",
  });
  const [sampleConfirmOpen, setSampleConfirmOpen] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);

  useFocusTrap(dialogRef, true);

  const connectedShop = shops[0] ?? null;

  const loadBusiness = useCallback(async () => {
    try {
      const response = await fetch("/api/settings?limit=500", { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as {
        items?: Array<{ key: string; value: string }>;
      };
      if (!response.ok) return;
      const map = new Map((data.items ?? []).map((row) => [row.key, row.value]));
      setBusiness({
        business_name: map.get("business_name") ?? "",
        business_address_line_1: map.get("business_address_line_1") ?? "",
        business_address_line_2: map.get("business_address_line_2") ?? "",
        business_city: map.get("business_city") ?? "",
        business_state_province: map.get("business_state_province") ?? "",
        business_postal_code: map.get("business_postal_code") ?? "",
        business_country: map.get("business_country") ?? "US",
      });
    } catch {
      /* optional pre-fill */
    }
  }, []);

  useEffect(() => {
    if (step === 1) void loadBusiness();
  }, [step, loadBusiness]);

  const finish = async (navigateTo?: string, triggerSync?: boolean) => {
    try {
      await markSetupComplete();
      onDone();
      if (navigateTo) {
        const url = triggerSync ? `${navigateTo}?sync=etsy` : navigateTo;
        router.push(url);
      }
    } catch (err) {
      setApiError("Could not save setup", "We could not save setup progress.", err);
    }
  };

  const skip = () => void finish();

  const saveBusinessAndNext = async () => {
    try {
      for (const key of BUSINESS_KEYS) {
        const value = business[key].trim();
        if (value) await saveSetting(key, value);
      }
      setStep(2);
    } catch (err) {
      setApiError("Could not save business profile", "We could not save your business details.", err);
    }
  };

  const loadSampleData = async () => {
    setSampleBusy(true);
    try {
      const response = await fetch("/api/seed/sample-data", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as ApiErrorShape;
      if (response.status === 409) {
        setSampleConfirmOpen(false);
        setError({
          title: "Sample data already loaded",
          message: "Remove existing sample data from Config before loading again.",
          actions: ["Open Config → Sample data to remove demo records."],
        });
        return;
      }
      if (!response.ok) throw data;
      setSampleConfirmOpen(false);
      await finish("/dashboard");
      setError({
        title: "Sample data loaded",
        message: "Demo inventory, customers, and orders are ready to explore.",
        actions: ["Remove sample data anytime from Config."],
      });
    } catch (err) {
      setApiError("Could not load sample data", "We could not load sample data.", err);
    } finally {
      setSampleBusy(false);
    }
  };

  const dots = (
    <div className="mb-6 flex justify-center gap-2">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          role="presentation"
          aria-label={`Step ${i + 1} of 4: ${STEP_NAMES[i]}`}
          aria-current={i === step ? "step" : undefined}
          className={`h-2 w-2 rounded-full ${
            i <= step ? "bg-[var(--ui-accent)]" : "border border-[var(--ui-border)] bg-transparent"
          }`}
        />
      ))}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--ui-background)]/90 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Setup wizard"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-6 shadow-2xl"
      >
        {dots}

        {step === 0 ? (
          <>
            <h2 className="text-xl font-semibold text-[var(--ui-title)]">Welcome to Etsy Sales Manager</h2>
            <p className="mt-2 text-sm text-[var(--ui-body)]">
              Your personal tool for managing inventory, orders, customers, and Etsy listings for your vintage and
              antique business.
            </p>
            <p className="mt-2 text-sm text-[var(--ui-muted)]">
              Let&apos;s get you set up in just a few steps. This will take about 2 minutes.
            </p>
            <div className="mt-6 flex justify-end">
              <Button variant="accent" onClick={() => setStep(1)}>
                Let&apos;s Go →
              </Button>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h2 className="text-xl font-semibold text-[var(--ui-title)]">Your Business</h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Tell us about your shop. You can change these anytime in Config.
            </p>
            <div className="mt-4 space-y-2">
              <label className="block text-xs text-[var(--ui-muted)]">
                Business name
                <input
                  value={business.business_name}
                  onChange={(e) => setBusiness((b) => ({ ...b, business_name: e.target.value }))}
                  placeholder="e.g., Trudy's Classic Treasures"
                  className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm text-[var(--ui-body)]"
                />
              </label>
              <label className="block text-xs text-[var(--ui-muted)]">
                Address line 1
                <input
                  value={business.business_address_line_1}
                  onChange={(e) => setBusiness((b) => ({ ...b, business_address_line_1: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm text-[var(--ui-body)]"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-[var(--ui-muted)]">
                  City
                  <input
                    value={business.business_city}
                    onChange={(e) => setBusiness((b) => ({ ...b, business_city: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm text-[var(--ui-body)]"
                  />
                </label>
                <label className="block text-xs text-[var(--ui-muted)]">
                  State / province
                  <input
                    value={business.business_state_province}
                    onChange={(e) => setBusiness((b) => ({ ...b, business_state_province: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm text-[var(--ui-body)]"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-[var(--ui-muted)]">
                  Postal code
                  <input
                    value={business.business_postal_code}
                    onChange={(e) => setBusiness((b) => ({ ...b, business_postal_code: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm text-[var(--ui-body)]"
                  />
                </label>
                <label className="block text-xs text-[var(--ui-muted)]">
                  Country
                  <input
                    value={business.business_country}
                    onChange={(e) => setBusiness((b) => ({ ...b, business_country: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm text-[var(--ui-body)]"
                  />
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="secondary" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button variant="accent" onClick={() => void saveBusinessAndNext()}>
                Next
              </Button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2 className="text-xl font-semibold text-[var(--ui-title)]">Connect Your Etsy Shop</h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Link your Etsy account to sync orders, customers, and listings automatically.
            </p>
            <div className="mt-6 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 text-center">
              {connectedShop ? (
                <p className="text-sm font-medium text-[var(--ui-green)]">
                  ✓ Connected to {connectedShop.shop_name}
                </p>
              ) : (
                <Button variant="accent" onClick={() => connect()}>
                  Connect to Etsy
                </Button>
              )}
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="accent" onClick={() => setStep(3)}>
                Next
              </Button>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h2 className="text-xl font-semibold text-[var(--ui-title)]">You&apos;re All Set!</h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">Here&apos;s what you can do next:</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void finish("/inventory")}
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-left hover:border-[var(--ui-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
              >
                <p className="font-medium text-[var(--ui-title)]">Add Your First Item</p>
                <p className="text-xs text-[var(--ui-muted)]">Start building your inventory</p>
              </button>
              <button
                type="button"
                onClick={() => void finish("/sales", connectedShop != null)}
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-left hover:border-[var(--ui-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
              >
                <p className="font-medium text-[var(--ui-title)]">
                  {connectedShop ? "Sync Etsy Orders" : "Explore Sales"}
                </p>
                <p className="text-xs text-[var(--ui-muted)]">
                  {connectedShop ? "Import your recent Etsy sales" : "Manually add your first order"}
                </p>
              </button>
              <button
                type="button"
                onClick={() => void finish("/tutorial")}
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-left hover:border-[var(--ui-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
              >
                <p className="font-medium text-[var(--ui-title)]">Explore Tutorials</p>
                <p className="text-xs text-[var(--ui-muted)]">Learn tips and best practices</p>
              </button>
              <button
                type="button"
                onClick={() => setSampleConfirmOpen(true)}
                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-left hover:border-[var(--ui-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
              >
                <p className="font-medium text-[var(--ui-title)]">Load sample data</p>
                <p className="text-xs text-[var(--ui-muted)]">Explore with demo records</p>
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <Button variant="accent" onClick={() => void finish("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => void skip()}
          className="mt-4 w-full text-center text-xs text-[var(--ui-muted)] hover:text-[var(--ui-body)]"
        >
          Skip for now
        </button>
      </div>

      <ConfirmDialog
        open={sampleConfirmOpen}
        onClose={() => setSampleConfirmOpen(false)}
        onConfirm={() => void loadSampleData()}
        title="Load sample data?"
        description="This will add sample items, customers, and orders. Your existing data will not be affected."
        confirmLabel="Load Sample Data"
        busy={sampleBusy}
      />
    </div>
  );
}
