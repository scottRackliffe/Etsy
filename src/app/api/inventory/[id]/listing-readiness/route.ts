/**
 * GET /api/inventory/[id]/listing-readiness
 * Returns the listing phase, the context-aware button, the required-data
 * checklist, and the data-remediation list (ADR-081 §1/§3/§4).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAllPictureReferences,
  getInventoryById,
  validateItemForListingRequest,
  type InventoryRecord,
} from "@/lib/inventory";
import {
  buttonForPhase,
  recomputeAndStoreListingPhase,
  computeListingPhase,
  hasGeneratedListing,
  hasListingDrift,
} from "@/lib/listing-phase";
import { ApiRouteError, errorResponse, fromUnknownError } from "@/lib/api-error";
import { requireEtsyAccessToken } from "@/lib/auth-session";

function parseInventoryId(idParam: string): number | null {
  const parsed = Number(idParam);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

type RemediationItem = {
  field: string;
  label: string;
  present: boolean;
  required: boolean;
  shortcoming: string;
  resolution_link: string;
};

function buildDataRemediation(item: InventoryRecord, id: number): RemediationItem[] {
  const row = item as unknown as Record<string, unknown>;
  const link = (anchor: string) => `/inventory?itemId=${id}#${anchor}`;
  const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const num = (v: unknown) => v != null && !Number.isNaN(Number(v)) && Number(v) > 0;
  const hasPicture = getAllPictureReferences(item).length > 0;
  const hasConditionIssue = Number(row.has_condition_issue) === 1;

  const items: RemediationItem[] = [
    {
      field: "item_number",
      label: "Item number",
      present: text(item.item_number),
      required: true,
      shortcoming: "An item number is required before a listing can be generated.",
      resolution_link: link("field-item_number"),
    },
    {
      field: "description",
      label: "Description",
      present: text(item.description),
      required: true,
      shortcoming: "A description is required before a listing can be generated.",
      resolution_link: link("field-description"),
    },
    {
      field: "condition_code",
      label: "Condition",
      present: text(item.condition_code),
      required: true,
      shortcoming: "Set the item condition before generating a listing.",
      resolution_link: link("field-condition_code"),
    },
    {
      field: "pictures",
      label: "At least one photo",
      present: hasPicture,
      required: true,
      shortcoming: "Add at least one photo before generating a listing.",
      resolution_link: link("pictures"),
    },
    {
      field: "sale_revenue",
      label: "Price (AI will recommend)",
      present: num(item.sale_revenue),
      required: false,
      shortcoming:
        "No price set — the AI will recommend a price from research. You can accept or edit it after generating.",
      resolution_link: link("field-sale_revenue"),
    },
    {
      field: "dimensions",
      label: "Measurements",
      present: num(item.item_length) || num(item.item_width) || num(item.item_height),
      required: false,
      shortcoming: "Measurements help buyers and improve listing quality (recommended).",
      resolution_link: link("field-dimensions"),
    },
    {
      field: "materials",
      label: "Materials",
      present: text(item.materials),
      required: false,
      shortcoming: "Listing materials improve search and attributes (recommended).",
      resolution_link: link("field-materials"),
    },
  ];

  if (hasConditionIssue) {
    items.push({
      field: "condition_notes",
      label: "Condition notes",
      present: text(item.condition_notes),
      required: false,
      shortcoming:
        "This item has a noted condition issue — describe each flaw with measurable detail (recommended).",
      resolution_link: link("field-condition_notes"),
    });
  }

  return items;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    requireEtsyAccessToken(cookieStore);

    const params = await context.params;
    const inventoryId = parseInventoryId(params.id);
    if (!inventoryId) {
      throw new ApiRouteError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid inventory id",
        userMessage: "The selected item id is invalid.",
        actions: ["Refresh and select the item again."],
        fields: { id: ["Must be a positive integer"] },
        canRetry: false,
      });
    }

    const item = getInventoryById(inventoryId);
    if (!item) {
      throw new ApiRouteError({
        status: 404,
        code: "NOT_FOUND",
        message: "Inventory item not found",
        userMessage: "The selected item was not found.",
        actions: ["Refresh inventory and select another item."],
        canRetry: false,
      });
    }

    const validation = validateItemForListingRequest(item);
    const pictureReferences = getAllPictureReferences(item);
    // Recompute + persist the phase so the inventory list filter stays current.
    const listingPhase = recomputeAndStoreListingPhase(inventoryId) ?? computeListingPhase(item);
    const button = buttonForPhase(listingPhase);
    // WS-CR5: distinguish "drifted" (was generated, inputs/photos changed → back to
    // ready_to_generate) from a first-time generation, so the UI can explain the reset.
    const drifted =
      listingPhase === "ready_to_generate" && hasGeneratedListing(item) && hasListingDrift(item);
    const dataRemediation = buildDataRemediation(item, inventoryId);

    return NextResponse.json(
      {
        ok: true,
        item_id: inventoryId,
        ready: validation.ok,
        listing_phase: listingPhase,
        drifted,
        button,
        missing_fields: validation.fields,
        required: dataRemediation
          .filter((r) => r.required)
          .map((r) => ({ field: r.field, present: r.present })),
        data_remediation: dataRemediation,
        checks: {
          item_number: Boolean(item.item_number?.trim()),
          description: Boolean(item.description?.trim()),
          condition_code: Boolean(item.condition_code?.trim()),
          pictures: pictureReferences.length > 0,
          sale_revenue: item.sale_revenue != null && Number(item.sale_revenue) > 0,
        },
        picture_count: pictureReferences.length,
      },
      { status: 200 }
    );
  } catch (error) {
    return errorResponse(
      fromUnknownError(error, {
        code: "INTERNAL_ERROR",
        message: "Failed to evaluate listing readiness",
        userMessage: "We could not evaluate listing readiness.",
        actions: [
          "Refresh and try again.",
          "If this continues, verify item data and API connection.",
        ],
      })
    );
  }
}
