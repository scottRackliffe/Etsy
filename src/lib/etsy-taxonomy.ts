/**
 * Etsy Taxonomy sync — fetches the category tree and per-category properties
 * from the Etsy Open API v3 and stores them locally in SQLite for fast lookup.
 */
import { getDb } from "@/lib/sqlite";
import {
  fetchTaxonomyNodes,
  fetchTaxonomyProperties,
  type EtsyTaxonomyNode,
  type EtsyTaxonomyProperty,
} from "@/lib/etsy";
import { getSetting, setSetting } from "@/lib/settings-store";

// ---------------------------------------------------------------------------
// Flatten the recursive taxonomy tree into rows
// ---------------------------------------------------------------------------

type FlatNode = {
  id: number;
  parent_id: number | null;
  name: string;
  full_path: string;
  level: number;
};

function flattenNodes(
  nodes: EtsyTaxonomyNode[],
  parentPath: string = ""
): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    const fullPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
    result.push({
      id: node.id,
      parent_id: node.parent_id ?? null,
      name: node.name,
      full_path: fullPath,
      level: node.level,
    });
    if (node.children?.length) {
      result.push(...flattenNodes(node.children, fullPath));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Sync taxonomy nodes (full replace)
// ---------------------------------------------------------------------------

export type TaxonomySyncResult = {
  nodesInserted: number;
  durationMs: number;
};

export async function syncTaxonomyNodes(): Promise<TaxonomySyncResult> {
  const start = Date.now();
  const response = await fetchTaxonomyNodes();
  const flat = flattenNodes(response.results);

  const db = getDb();
  const tx = db.transaction(() => {
    db.exec("DELETE FROM etsy_taxonomy_nodes");
    const insert = db.prepare(
      `INSERT INTO etsy_taxonomy_nodes (id, parent_id, name, full_path, level)
       VALUES (@id, @parent_id, @name, @full_path, @level)`
    );
    for (const row of flat) {
      insert.run(row);
    }
  });
  tx();

  setSetting("etsy_taxonomy.last_sync_at", new Date().toISOString());
  setSetting("etsy_taxonomy.node_count", String(flat.length));

  return { nodesInserted: flat.length, durationMs: Date.now() - start };
}

// ---------------------------------------------------------------------------
// Sync properties for a single taxonomy node (on-demand, cached)
// ---------------------------------------------------------------------------

export type PropertySyncResult = {
  propertiesInserted: number;
  taxonomyId: number;
};

export async function syncTaxonomyProperties(
  taxonomyId: number
): Promise<PropertySyncResult> {
  const response = await fetchTaxonomyProperties(taxonomyId);
  const db = getDb();

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM etsy_taxonomy_properties WHERE taxonomy_id = ?").run(
      taxonomyId
    );
    const insert = db.prepare(
      `INSERT INTO etsy_taxonomy_properties
         (taxonomy_id, property_id, name, display_name, is_required,
          supports_attributes, supports_variations, possible_values_json, scales_json)
       VALUES (@taxonomy_id, @property_id, @name, @display_name, @is_required,
               @supports_attributes, @supports_variations, @possible_values_json, @scales_json)`
    );
    for (const prop of response.results) {
      insert.run({
        taxonomy_id: taxonomyId,
        property_id: prop.property_id,
        name: prop.name,
        display_name: prop.display_name ?? prop.name,
        is_required: prop.is_required ? 1 : 0,
        supports_attributes: prop.supports_attributes ? 1 : 0,
        supports_variations: prop.supports_variations ? 1 : 0,
        possible_values_json: JSON.stringify(prop.possible_values ?? []),
        scales_json: JSON.stringify(prop.scales ?? []),
      });
    }
  });
  tx();

  return { propertiesInserted: response.results.length, taxonomyId };
}

// ---------------------------------------------------------------------------
// Read helpers — used by API routes and UI
// ---------------------------------------------------------------------------

export type TaxonomyNodeRow = {
  id: number;
  parent_id: number | null;
  name: string;
  full_path: string | null;
  level: number;
};

export type TaxonomyPropertyRow = {
  id: number;
  taxonomy_id: number;
  property_id: number;
  name: string;
  display_name: string | null;
  is_required: number;
  supports_attributes: number;
  supports_variations: number;
  possible_values_json: string;
  scales_json: string;
};

export function listTaxonomyNodes(parentId?: number | null): TaxonomyNodeRow[] {
  const db = getDb();
  if (parentId === undefined || parentId === null) {
    return db
      .prepare(
        "SELECT * FROM etsy_taxonomy_nodes WHERE parent_id IS NULL ORDER BY name"
      )
      .all() as TaxonomyNodeRow[];
  }
  return db
    .prepare(
      "SELECT * FROM etsy_taxonomy_nodes WHERE parent_id = ? ORDER BY name"
    )
    .all(parentId) as TaxonomyNodeRow[];
}

export function searchTaxonomyNodes(query: string): TaxonomyNodeRow[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM etsy_taxonomy_nodes WHERE full_path LIKE ? ORDER BY full_path LIMIT 50"
    )
    .all(`%${query}%`) as TaxonomyNodeRow[];
}

export function getTaxonomyNode(id: number): TaxonomyNodeRow | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM etsy_taxonomy_nodes WHERE id = ?")
    .get(id) as TaxonomyNodeRow | undefined;
}

export function getTaxonomyProperties(
  taxonomyId: number
): TaxonomyPropertyRow[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM etsy_taxonomy_properties WHERE taxonomy_id = ? ORDER BY name"
    )
    .all(taxonomyId) as TaxonomyPropertyRow[];
}

export function getTaxonomySyncStatus(): {
  lastSyncAt: string | null;
  nodeCount: number;
} {
  return {
    lastSyncAt: getSetting("etsy_taxonomy.last_sync_at") ?? null,
    nodeCount: parseInt(getSetting("etsy_taxonomy.node_count") ?? "0", 10),
  };
}
