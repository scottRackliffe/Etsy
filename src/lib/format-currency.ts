const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currencyCode: string): Intl.NumberFormat {
  const cached = formatterCache.get(currencyCode);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  });
  formatterCache.set(currencyCode, formatter);
  return formatter;
}

export function formatCurrency(
  value: number | string,
  currencyCode = "USD"
): string {
  const num = typeof value === "string" ? parseFloat(value) || 0 : value;
  return getFormatter(currencyCode || "USD").format(num);
}
