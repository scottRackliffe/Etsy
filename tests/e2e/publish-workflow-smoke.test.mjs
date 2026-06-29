import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

test("listing publish workflow routes exist", async () => {
  const requiredRoutes = [
    "src/app/api/inventory/[id]/publish-to-etsy/route.ts",
    "src/app/api/inventory/[id]/listing-readiness/route.ts",
    "src/app/api/inventory/[id]/listing-quality/route.ts",
    "src/app/api/inventory/[id]/listing-remediation-cycle/route.ts",
  ];

  await Promise.all(
    requiredRoutes.map(async (relativePath) => {
      await access(path.join(repoRoot, relativePath));
    })
  );
  assert.equal(requiredRoutes.length, 4);
});

test("retired publish routes are gone", async () => {
  const retiredRoutes = [
    "src/app/api/inventory/[id]/publish-preview/route.ts",
    "src/app/api/inventory/[id]/listing-approve/route.ts",
    "src/app/api/inventory/[id]/listing-reject/route.ts",
  ];

  await Promise.all(
    retiredRoutes.map(async (relativePath) => {
      await assert.rejects(access(path.join(repoRoot, relativePath)), { code: "ENOENT" });
    })
  );
});

test("report endpoints use structured report builder", async () => {
  const reportRoute = path.join(repoRoot, "src/app/api/reports/sales/route.ts");
  const source = await readFile(reportRoute, "utf8");
  assert.equal(source.includes("buildReport"), true);
  assert.equal(source.includes("resolveReportFormat"), true);
  assert.equal(source.includes("reportResponse"), true);
});
