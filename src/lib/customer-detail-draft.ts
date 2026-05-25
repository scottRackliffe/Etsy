import type { Customer } from "@/types";

export type CustomerDetailDraft = {
  first_name: string;
  last_name: string;
  phone: string;
  address_1: string;
  postal_code: string;
};

export function customerToDetailDraft(customer: Customer): CustomerDetailDraft {
  return {
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    phone: customer.phone ?? "",
    address_1: customer.address_1 ?? "",
    postal_code: customer.postal_code ?? "",
  };
}
