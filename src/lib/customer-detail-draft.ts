import type { Customer } from "@/types";

export type CustomerDetailDraft = {
  first_name: string;
  last_name: string;
  phone: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};

export function customerToDetailDraft(customer: Customer): CustomerDetailDraft {
  return {
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    phone: customer.phone ?? "",
    address_1: customer.address_1 ?? "",
    address_2: customer.address_2 ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    postal_code: customer.postal_code ?? "",
    country: customer.country ?? "",
  };
}
