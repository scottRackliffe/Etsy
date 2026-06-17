"use client";

import { useCallback, useEffect, useState } from "react";
import { FormField } from "@/components/ui/FormField";

type PropertyValue = {
  value_id: number | null;
  name: string;
  scale_id: number | null;
  equal_to: number[];
};

type PropertyScale = {
  scale_id: number;
  display_name: string;
  description: string;
};

type TaxonomyProperty = {
  property_id: number;
  name: string;
  display_name: string | null;
  is_required: number;
  supports_attributes: number;
  supports_variations: number;
  possible_values: PropertyValue[];
  scales: PropertyScale[];
};

type AttributeValues = Record<string, string>;

type Props = {
  taxonomyId: number | null;
  values: AttributeValues;
  onChange: (values: AttributeValues) => void;
  disabled?: boolean;
};

export default function TaxonomyAttributesPanel({
  taxonomyId,
  values,
  onChange,
  disabled,
}: Props) {
  const [properties, setProperties] = useState<TaxonomyProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string>("");

  const fetchProperties = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/etsy-taxonomy/nodes/${id}/properties`);
      const data = (await res.json()) as {
        ok?: boolean;
        items?: TaxonomyProperty[];
        node?: { name: string; full_path: string };
        error?: { user_message?: string };
      };
      if (!res.ok) {
        setError(data.error?.user_message ?? "Could not load category attributes.");
        setProperties([]);
        return;
      }
      const attrProps = (data.items ?? []).filter((p) => p.supports_attributes);
      setProperties(attrProps);
      setCategoryName(data.node?.full_path ?? data.node?.name ?? "");
    } catch {
      setError("Could not load category attributes.");
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!taxonomyId) {
      setProperties([]);
      setCategoryName("");
      return;
    }
    void fetchProperties(taxonomyId);
  }, [taxonomyId, fetchProperties]);

  const handleChange = (propertyId: number, newValue: string) => {
    const key = String(propertyId);
    onChange({ ...values, [key]: newValue });
  };

  if (!taxonomyId) return null;

  if (loading) {
    return (
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="text-xs text-[var(--ui-muted)]">Loading attributes for category...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="text-xs text-[var(--ui-red)]">{error}</p>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3">
        <p className="text-xs text-[var(--ui-muted)]">
          No attributes available for this category.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          Etsy Category Attributes
        </p>
        {categoryName && (
          <p className="text-xs text-[var(--ui-muted)] truncate max-w-[60%]" title={categoryName}>
            {categoryName}
          </p>
        )}
      </div>
      <p className="text-xs text-[var(--ui-muted)]">
        Fill in relevant attributes to improve search visibility. Skip any that don&apos;t apply.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {properties.map((prop) => {
          const key = String(prop.property_id);
          const currentValue = values[key] ?? "";
          const label = prop.display_name ?? prop.name;
          const hasValues = prop.possible_values.length > 0;

          return (
            <FormField
              key={prop.property_id}
              label={label}
              required={prop.is_required === 1}
            >
              {hasValues ? (
                <select
                  value={currentValue}
                  onChange={(e) => handleChange(prop.property_id, e.target.value)}
                  disabled={disabled}
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
                >
                  <option value="">—</option>
                  {prop.possible_values.map((pv) => (
                    <option key={pv.value_id ?? pv.name} value={pv.name}>
                      {pv.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={currentValue}
                  onChange={(e) => handleChange(prop.property_id, e.target.value)}
                  disabled={disabled}
                  placeholder={`Enter ${label.toLowerCase()}...`}
                  className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-2 text-sm"
                />
              )}
            </FormField>
          );
        })}
      </div>
    </div>
  );
}
