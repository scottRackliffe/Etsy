import fs from "node:fs/promises";
import path from "node:path";

const GUIDANCE_DOCS = {
  template: "documents/etsy-listing-template-and-requirements.md",
  listingTips: "system/tips/How_to_Win_on_Etsy.md",
  photoTips: "system/tips/Etsy_Photo_Guide.md",
} as const;

export type ListingGuidance = {
  template: string;
  listingTips: string;
  photoTips: string;
};

async function readGuidanceFile(relativePath: string): Promise<string> {
  const absolutePath = path.join(process.cwd(), relativePath);
  return fs.readFile(absolutePath, "utf8");
}

export async function loadListingGuidance(): Promise<ListingGuidance> {
  const [template, listingTips, photoTips] = await Promise.all([
    readGuidanceFile(GUIDANCE_DOCS.template),
    readGuidanceFile(GUIDANCE_DOCS.listingTips),
    readGuidanceFile(GUIDANCE_DOCS.photoTips),
  ]);

  return { template, listingTips, photoTips };
}
