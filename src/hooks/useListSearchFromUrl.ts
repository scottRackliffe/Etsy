"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Prefills list search from `?search=` (global search "See all") and removes the param from the URL. */
export function useListSearchFromUrl(setSearch: (value: string) => void, onApplied?: () => void) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const raw = searchParams.get("search");
    if (!raw?.trim()) return;
    setSearch(raw.trim());
    onApplied?.();
    router.replace(pathname);
  }, [searchParams, pathname, router, setSearch, onApplied]);
}
