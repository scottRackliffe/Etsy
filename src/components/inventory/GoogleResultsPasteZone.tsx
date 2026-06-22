"use client";

import { PhotoPasteZone } from "@/components/inventory/PhotoPasteZone";
import type { CoachPhoto } from "@/components/inventory/photo-paste-types";

type GoogleResultsPasteZoneProps = {
  photos: CoachPhoto[];
  onChange: (photos: CoachPhoto[]) => void;
  text: string;
  onTextChange: (text: string) => void;
};

export function GoogleResultsPasteZone({
  photos,
  onChange,
  text,
  onTextChange,
}: GoogleResultsPasteZoneProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--ui-body)]">
        In Photos, right-click your best item photo → <strong>Search with Google</strong>.
        You can paste screenshots <em>or</em> copy-paste the text results below — or both.
      </p>
      <PhotoPasteZone
        photos={photos}
        onChange={onChange}
        maxPhotos={3}
        title="Google result screenshots"
        pasteHint="Click here, then press ⌘V to paste Google result screenshots"
        emptyHint="Up to 3 screenshots · optional but helps with pricing"
      />
      <div>
        <h4 className="mb-1 text-sm font-semibold text-[var(--ui-title)]">
          Google result text
        </h4>
        <p className="mb-2 text-xs text-[var(--ui-muted)]">
          Copy text from Google search results and paste here. Item names, prices, sellers — anything that helps identify or price the item.
        </p>
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Paste Google search results text here (product names, prices, comparable listings…)"
          spellCheck={false}
          className="min-h-[120px] w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3 text-sm text-[var(--ui-body)] placeholder:text-[var(--ui-muted)] focus:border-[var(--ui-accent)] focus:outline-none"
        />
      </div>
    </div>
  );
}
