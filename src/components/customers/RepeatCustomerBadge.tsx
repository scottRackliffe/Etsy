"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";

const DEFAULT_THRESHOLD = 2;
let cachedThreshold: number | null = null;

export function RepeatCustomerBadge({ orderCount }: { orderCount?: number | null }) {
  const [threshold, setThreshold] = useState(cachedThreshold ?? DEFAULT_THRESHOLD);

  useEffect(() => {
    if (cachedThreshold != null) return;
    (async () => {
      try {
        const res = await fetch("/api/settings/repeat_customer_threshold", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { value?: string };
        const val = parseInt(data.value ?? "", 10);
        if (Number.isFinite(val) && val >= 1) {
          cachedThreshold = val;
          setThreshold(val);
        }
      } catch { /* use default */ }
    })();
  }, []);

  if (orderCount == null || orderCount < threshold) return null;
  return <Badge label={`Repeat (${orderCount})`} variant="info" />;
}
