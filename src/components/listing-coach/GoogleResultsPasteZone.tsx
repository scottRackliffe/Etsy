"use client";

import { PhotoPasteZone } from "@/components/listing-coach/PhotoPasteZone";
import type { CoachPhoto } from "@/components/listing-coach/types";

type GoogleResultsPasteZoneProps = {
  photos: CoachPhoto[];
  onChange: (photos: CoachPhoto[]) => void;
};

export function GoogleResultsPasteZone({ photos, onChange }: GoogleResultsPasteZoneProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--ui-body)]">
        In Photos, right-click your best item photo → <strong>Search with Google</strong>.
        Screenshot or copy the results, then paste here (⌘V).
      </p>
      <PhotoPasteZone
        photos={photos}
        onChange={onChange}
        maxPhotos={3}
        title="Google results"
        pasteHint="Click here, then press ⌘V to paste Google result screenshots"
        emptyHint="Up to 3 screenshots · optional but helps with pricing"
      />
    </div>
  );
}
