import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Cart Transform input query", () => {
  const query = readFileSync(
    join(process.cwd(), "extensions/bundle-cart-transform-rs/src/run.graphql"),
    "utf8",
  );
  const normalizedQuery = query.replace(/\s+/g, " ");

  it.each([
    ["runtimePolicies", "bundle_runtime_memberships"],
  ])("queries app-owned %s metafield with the app namespace", (_label, key) => {
    expect(normalizedQuery).toContain(`metafield(namespace: "$app", key: "${key}")`);
  });

  it("queries cart-transform owner settings with the app namespace", () => {
    expect(query).toMatch(
      /runtimeConfiguration:\s*metafield\(namespace:\s*"\$app",\s*key:\s*"runtime_configuration"\)/,
    );
    expect(normalizedQuery).not.toContain('key: "bundle_cart_line_messaging"');
    expect(normalizedQuery).not.toContain('key: "runtime_token_secret"');
  });

  it("stays within Shopify's maximum input-query complexity", () => {
    const metafieldCost = (normalizedQuery.match(/\bmetafield\(/g) ?? []).length * 3;
    const attributeCost = (normalizedQuery.match(/\battribute\(/g) ?? []).length;
    const requiredLeafCost = 8;

    expect(metafieldCost + attributeCost + requiredLeafCost).toBeLessThanOrEqual(30);
    expect(normalizedQuery).toContain("sellingPlanAllocation { __typename }");
    expect(normalizedQuery).toContain("localization { country { isoCode } }");
  });

  it("reads buyer selection identifiers and optional presentation independently of policy", () => {
    expect(normalizedQuery).toContain('selection: attribute(key: "_wpb_selection")');
    expect(normalizedQuery).toContain('attribute(key: "_bundle_display_properties")');
    expect(normalizedQuery).not.toContain('key: "bundle_details"');
    expect(normalizedQuery).not.toContain('key: "_wolfpack_line_auth"');
    expect(normalizedQuery).not.toContain('key: "_wolfpack_bundle_runtime"');
  });
});
