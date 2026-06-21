"use client";

import { useCallback, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function SplashPage() {
  const router = useRouter();

  const enter = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  useEffect(() => {
    router.prefetch("/dashboard");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        enter();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enter, router]);

  const year = new Date().getFullYear();

  return (
    <main
      onClick={enter}
      role="button"
      tabIndex={0}
      aria-label="Enter AiCE — click anywhere or press Enter to continue"
      className="flex min-h-screen cursor-pointer select-none flex-col items-center justify-between bg-[var(--ui-background)] px-6 py-10 text-center"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <Image
          src="/brand/aice-dark.png"
          alt="AiCE — The AI-Powered eCommerce Engine"
          width={520}
          height={156}
          priority
          className="h-auto w-[min(80vw,440px)] object-contain"
        />
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-[var(--ui-muted)]">
          The AI-Powered eCommerce Engine
        </p>
        <p className="mt-4 animate-pulse text-xs font-medium text-[var(--ui-accent)]">
          Click anywhere or press Enter to continue
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-2.5 pb-2 text-[11px] leading-relaxed text-[var(--ui-muted)]">
        <p>
          © {year} AiCE™. All rights reserved. AiCE™ — The AI-Powered eCommerce Engine is proprietary
          software licensed for use by the registered owner.
        </p>
        <p>
          The term &ldquo;Etsy&rdquo; is a trademark of Etsy, Inc. This application uses the Etsy API
          but is not endorsed, certified, or affiliated with Etsy, Inc. All other product names,
          logos, and brands are the property of their respective owners.
        </p>
        <p>
          This software is provided &ldquo;as is&rdquo;, without warranty of any kind, express or
          implied, including but not limited to the warranties of merchantability and fitness for a
          particular purpose. The owner is responsible for compliance with all applicable Etsy
          policies, tax obligations, and recordkeeping requirements.
        </p>
      </div>
    </main>
  );
}
