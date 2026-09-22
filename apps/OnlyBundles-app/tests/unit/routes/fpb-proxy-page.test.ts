import { createBundlePreviewToken } from "../../../app/lib/bundle-preview-token.server";
import { loader } from "../../../app/routes/root/wpb.$bundleId";
import { authenticate } from "../../../app/shopify.server";

jest.mock("../../../app/lib/logger", () => ({
  AppLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../../app/shopify.server", () => ({
  authenticate: { public: { appProxy: jest.fn() } },
}));
jest.mock("../../../app/db.server", () => ({
  __esModule: true,
  default: { bundle: { findFirst: jest.fn() } },
}));

const getDb = () => require("../../../app/db.server").default;
const mockAppProxy = authenticate.public.appProxy as jest.MockedFunction<any>;
const bundle = {
  id: "bundle-1", publicNumber: 1, status: "active",
  shopifyProductId: "gid://shopify/Product/100", bundleType: "full_page",
  runtimePolicyRevision: "revision-3", offerPolicy: null,
};
const bundleConfig = {
  schemaVersion: 4, id: "bundle-1", publicNumber: 1,
  bundleType: "full_page", runtimePolicyRevision: "revision-3",
  bundleDesignTemplate: "FBP_SIDE_FOOTER", bundleDesignPresetId: "STANDARD",
  name: "Build a Box", steps: [],
};
const fpbRuntime = {
  schemaVersion: 1,
  loadingScreen: { gifUrl: null, backgroundColor: "#ffffff" },
  languages: { en: {
    bundleType: "full_page", languageMode: "SINGLE", activeLocale: "en",
    sharedCartLabels: {}, textOverrides: {},
  } },
};

function request(bundleId = "1", query = "") {
  return new Request(`https://test-shop.myshopify.com/apps/product-bundles/wpb/${bundleId}${query}`);
}

function storefrontResponse(config: unknown = bundleConfig, runtime: unknown = fpbRuntime) {
  return { json: async () => ({ data: {
    product: { variants: { nodes: [
      { bundleConfig: config === undefined ? null : { value: JSON.stringify(config) } },
    ] } },
    shop: { fpbRuntime: runtime === undefined ? null : { value: JSON.stringify(runtime) } },
  } }) };
}

describe("FPB app proxy page", () => {
  let storefront: { graphql: jest.Mock };
  let liquid: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SHOPIFY_API_SECRET = "test_api_secret";
    getDb().bundle.findFirst.mockResolvedValue(bundle);
    storefront = { graphql: jest.fn().mockResolvedValue(storefrontResponse()) };
    liquid = jest.fn((body: string, init?: ResponseInit) => new Response(body, init));
    mockAppProxy.mockResolvedValue({
      session: { shop: "test-shop.myshopify.com" }, storefront, liquid,
    });
  });

  it("renders an active bundle from Shopify-hosted snapshots with public cache headers", async () => {
    const response = await loader({ request: request(), params: { bundleId: "1" }, context: {} } as any) as Response;
    const text = await response.text();

    expect(getDb().bundle.findFirst).toHaveBeenCalledWith({
      where: { publicNumber: 1, shopId: "test-shop.myshopify.com", bundleType: "full_page" },
      select: expect.objectContaining({ id: true, shopifyProductId: true, offerPolicy: expect.any(Object) }),
    });
    expect(storefront.graphql).toHaveBeenCalledWith(
      expect.not.stringContaining("jsonValue"),
      { variables: { productId: "gid://shopify/Product/100" } },
    );
    expect(storefront.graphql.mock.calls[0][0]).toContain("bundle_ui_config");
    expect(storefront.graphql.mock.calls[0][0]).toContain("value");
    expect(liquid).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60, s-maxage=60, stale-while-revalidate=300");
    expect(response.headers.get("Server-Timing")).toContain("storefront");
    expect(text).toContain('data-bundle-config-source="shopify_storefront"');
    expect(text).toContain("data-fpb-runtime=");
    expect(text).toContain("Build a Box");
  });

  it("renders a draft only with its bound preview token and private caching", async () => {
    getDb().bundle.findFirst.mockResolvedValue({ ...bundle, status: "draft" });
    const unsigned = await loader({ request: request(), params: { bundleId: "1" }, context: {} } as any) as Response;
    expect(unsigned.status).toBe(404);
    expect(storefront.graphql).not.toHaveBeenCalled();

    const token = createBundlePreviewToken({
      shop: "test-shop.myshopify.com", bundleId: "bundle-1", apiSecret: "test_api_secret",
    });
    const signed = await loader({
      request: request("1", `?wpb_preview=${encodeURIComponent(token)}`),
      params: { bundleId: "1" }, context: {},
    } as any) as Response;
    expect(signed.status).toBe(200);
    expect(signed.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each([
    ["missing config", null, fpbRuntime],
    ["malformed config", { schemaVersion: 3 }, fpbRuntime],
    ["mismatched bundle", { ...bundleConfig, id: "bundle-2" }, fpbRuntime],
    ["mismatched revision", { ...bundleConfig, runtimePolicyRevision: "revision-2" }, fpbRuntime],
    ["missing template", { ...bundleConfig, bundleDesignTemplate: null }, fpbRuntime],
    ["missing preset", { ...bundleConfig, bundleDesignPresetId: null }, fpbRuntime],
    ["unsupported preset", { ...bundleConfig, bundleDesignPresetId: "LEGACY" }, fpbRuntime],
    ["missing runtime", bundleConfig, null],
  ])("returns 503 for %s", async (_label, config, runtime) => {
    storefront.graphql.mockResolvedValueOnce(storefrontResponse(config, runtime));
    const response = await loader({ request: request(), params: { bundleId: "1" }, context: {} } as any) as Response;
    expect(response.status).toBe(503);
    expect(liquid).not.toHaveBeenCalled();
  });

  it("keeps a specific-link offer hidden without a matching token", async () => {
    getDb().bundle.findFirst.mockResolvedValue({ ...bundle, offerPolicy: {
      id: "policy-1", specificLinkRequired: true, scheduleMode: "always",
      startsAt: null, endsAt: null, countryTargetingEnabled: false,
      countryTargetingMode: "include", countryCodes: [], ruleVersion: 3,
      conditions: [],
    } });
    const response = await loader({ request: request(), params: { bundleId: "1" }, context: {} } as any) as Response;
    expect(response.status).toBe(404);
    expect(storefront.graphql).not.toHaveBeenCalled();
  });

  it("rejects an invalid app-proxy request before querying the database", async () => {
    mockAppProxy.mockRejectedValueOnce(new Response("Invalid bundle link", { status: 400 }));
    await expect(loader({ request: request(), params: { bundleId: "1" }, context: {} } as any))
      .rejects.toBeInstanceOf(Response);
    expect(getDb().bundle.findFirst).not.toHaveBeenCalled();
  });
});
