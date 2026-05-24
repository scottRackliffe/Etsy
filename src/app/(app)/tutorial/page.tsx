"use client";

export default function TutorialPage() {
  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-[var(--ui-title)]">Tutorial and tips</h3>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--ui-body)]">
        <li>Connect Etsy and select your active shop.</li>
        <li>Sync Etsy receipts from the Sales tab.</li>
        <li>Create or update inventory records with pictures and condition details.</li>
        <li>Use Listing authoring workshop to draft, review, approve, and publish.</li>
        <li>Check Outstanding tab daily for unpaid orders and unlisted inventory.</li>
        <li>Generate report exports from the Reports tab for operations and accounting.</li>
      </ol>
    </section>
  );
}
