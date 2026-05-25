export type BatchApiResult = {
  succeeded?: number;
  failed?: Array<{ id: number; reason: string }>;
  total?: number;
};

export function summarizeBatchResult(
  result: BatchApiResult,
  entityLabel: string,
  actionPastTense: string
): { title: string; message: string; variant: "success" | "warning" | "error" } {
  const succeeded = result.succeeded ?? 0;
  const failed = result.failed ?? [];
  const total = result.total ?? succeeded + failed.length;

  if (succeeded === total && failed.length === 0) {
    return {
      variant: "success",
      title: `Batch ${actionPastTense} complete`,
      message: `${succeeded} ${entityLabel}${succeeded === 1 ? "" : "s"} ${actionPastTense}.`,
    };
  }
  if (succeeded === 0 && failed.length > 0) {
    const reasons = failed
      .slice(0, 3)
      .map((f) => `#${f.id}: ${f.reason}`)
      .join("; ");
    return {
      variant: "error",
      title: `Could not ${actionPastTense} any ${entityLabel}s`,
      message: `All ${total} failed. ${reasons}${failed.length > 3 ? "…" : ""}`,
    };
  }
  const reasons = failed
    .slice(0, 2)
    .map((f) => `#${f.id}: ${f.reason}`)
    .join("; ");
  return {
    variant: "warning",
    title: `Partial batch ${actionPastTense}`,
    message: `${succeeded} of ${total} ${entityLabel}s ${actionPastTense}. ${failed.length} skipped. ${reasons}${failed.length > 2 ? "…" : ""}`,
  };
}
