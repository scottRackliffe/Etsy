export function pictureDisplayUrl(storedPath: string | null | undefined): string | null {
  if (!storedPath?.trim()) return null;
  const path = storedPath.trim();
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.replace(/^\/+/, "").replace(/^uploads\//, "");
  return `/api/uploads/${normalized.split("/").map(encodeURIComponent).join("/")}`;
}

export function getPictureSlotPath(
  item: Record<string, unknown>,
  slot: number
): string | null {
  const key = `picture_${slot}`;
  const value = item[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
