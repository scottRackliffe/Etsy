import { Badge } from "@/components/ui/Badge";

export function RepeatCustomerBadge({ orderCount }: { orderCount?: number | null }) {
  if (orderCount == null || orderCount < 2) return null;
  return <Badge label="Repeat" variant="info" />;
}
