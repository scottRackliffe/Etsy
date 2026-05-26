export const MERGE_CUSTOMER_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "notes",
  "address_1",
  "address_2",
  "city",
  "state",
  "postal_code",
  "country",
] as const;

export type MergeCustomerField = (typeof MERGE_CUSTOMER_FIELDS)[number];
