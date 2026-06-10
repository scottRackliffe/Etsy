import { ApiRouteError } from "@/lib/api-error";
import { validateImageBuffer } from "@/lib/picture-storage";

export type CoachPhotoFile = {
  buffer: Buffer;
  filename: string;
};

export type CoachMultipartPhotos = {
  itemPhotos: CoachPhotoFile[];
  conditionPhotos: CoachPhotoFile[];
  googlePhotos: CoachPhotoFile[];
};

const ITEM_PHOTO_KEYS = new Set(["item_photos[]", "item_photos"]);
const CONDITION_PHOTO_KEYS = new Set(["condition_photos[]", "condition_photos"]);
const GOOGLE_PHOTO_KEYS = new Set(["google_photos[]", "google_photos"]);

async function fileToCoachPhoto(file: File): Promise<CoachPhotoFile> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return { buffer, filename: file.name || "photo.jpg" };
}

function collectFiles(formData: FormData, keys: Set<string>): File[] {
  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (!keys.has(key)) continue;
    if (value instanceof File && value.size > 0) {
      files.push(value);
    }
  }
  return files;
}

export async function parseCoachMultipartPhotos(formData: FormData): Promise<CoachMultipartPhotos> {
  const itemFiles = collectFiles(formData, ITEM_PHOTO_KEYS);
  const conditionFiles = collectFiles(formData, CONDITION_PHOTO_KEYS);
  const googleFiles = collectFiles(formData, GOOGLE_PHOTO_KEYS);

  if (itemFiles.length === 0) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "At least one item photo is required",
      userMessage: "Add at least one item photo before continuing.",
      actions: ["Paste or choose item photos and retry."],
      fields: { item_photos: ["At least one item photo is required"] },
      canRetry: false,
    });
  }
  if (itemFiles.length > 20) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Too many item photos",
      userMessage: "You can add up to 20 item photos.",
      actions: ["Remove extra photos and retry."],
      fields: { item_photos: ["Maximum 20 item photos"] },
      canRetry: false,
    });
  }
  if (conditionFiles.length > 5) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Too many condition photos",
      userMessage: "You can add up to 5 condition photos.",
      actions: ["Remove extra condition photos and retry."],
      fields: { condition_photos: ["Maximum 5 condition photos"] },
      canRetry: false,
    });
  }
  if (googleFiles.length > 3) {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Too many Google result images",
      userMessage: "You can paste up to 3 Google result screenshots.",
      actions: ["Remove extra screenshots and retry."],
      fields: { google_photos: ["Maximum 3 Google screenshots"] },
      canRetry: false,
    });
  }

  const itemPhotos = await Promise.all(itemFiles.map(fileToCoachPhoto));
  const conditionPhotos = await Promise.all(conditionFiles.map(fileToCoachPhoto));
  const googlePhotos = await Promise.all(googleFiles.map(fileToCoachPhoto));

  for (const photo of [...itemPhotos, ...conditionPhotos, ...googlePhotos]) {
    const validation = await validateImageBuffer(photo.buffer, photo.filename);
    if (Array.isArray(validation)) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: validation[0]?.message ?? "Invalid image",
        userMessage: validation[0]?.message ?? "One of the images could not be processed.",
        actions: ["Check the file format and size, then retry."],
        canRetry: false,
      });
    }
  }

  return { itemPhotos, conditionPhotos, googlePhotos };
}

export function parseCoachJsonField<T>(
  formData: FormData,
  field: string,
  label: string
): T | undefined {
  const raw = formData.get(field);
  if (raw == null || raw === "") return undefined;
  if (typeof raw !== "string") {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: `Invalid ${field}`,
      userMessage: `${label} must be valid JSON.`,
      actions: ["Go back and retry the step."],
      canRetry: false,
    });
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiRouteError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: `Invalid ${field} JSON`,
      userMessage: `${label} could not be read.`,
      actions: ["Go back and retry the step."],
      canRetry: false,
    });
  }
}
