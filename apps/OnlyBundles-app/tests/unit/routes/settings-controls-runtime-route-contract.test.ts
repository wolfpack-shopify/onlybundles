/* eslint-disable import/first */
jest.mock("../../../app/lib/logger", () => ({
  AppLogger: { error: jest.fn() },
}));

jest.mock("../../../app/db.server", () => ({
  prisma: {
    bundle: { findMany: jest.fn() },
  },
}));

var mockAuthenticateAppProxy = jest.fn();
jest.mock("../../../app/shopify.server", () => ({
  authenticate: { public: { appProxy: mockAuthenticateAppProxy } },
}));

import { prisma } from "../../../app/db.server";
import { loader } from "../../../app/routes/api/api.bundle-links";

const findManyBundles = prisma.bundle.findMany as jest.MockedFunction<typeof prisma.bundle.findMany>;

function request() {
  return new Request("https://example.test/api/bundle-links");
}

describe("storefront bundle-links endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticateAppProxy.mockResolvedValue({ session: { shop: "verified.myshopify.com" } });
    findManyBundles.mockResolvedValue([]);
  });

  it("returns active bundle-parent links for collection quick-add routing", async () => {
    findManyBundles.mockResolvedValue([
      { bundleType: "full_page", publicNumber: 9, shopifyProductHandle: "fpb-parent" },
      { bundleType: "product_page", publicNumber: null, shopifyProductHandle: "ppb-parent" },
    ] as never);

    const response = await loader({
      request: request(),
      params: {},
      context: {},
    } as never);
    const body = await response.json() as any;

    expect(body).toEqual({ schemaVersion: 1, links: [
      { bundleType: "full_page", productHandle: "fpb-parent", targetUrl: "/apps/product-bundles/wpb/9" },
      { bundleType: "product_page", productHandle: "ppb-parent", targetUrl: "/products/ppb-parent" },
    ] });
  });

  it("uses the configured storefront proxy root for FPB quick-add links", async () => {
    const previousRoot = process.env.STOREFRONT_PROXY_ROOT;
    process.env.STOREFRONT_PROXY_ROOT = "/apps/product-bundles-sit";
    findManyBundles.mockResolvedValue([
      { bundleType: "full_page", publicNumber: 9, shopifyProductHandle: "fpb-parent" },
    ] as never);

    try {
      const response = await loader({
        request: request(),
        params: {},
        context: {},
      } as never);
      const body = await response.json() as any;

      expect(body.links).toEqual([
        { bundleType: "full_page", productHandle: "fpb-parent", targetUrl: "/apps/product-bundles-sit/wpb/9" },
      ]);
    } finally {
      if (previousRoot === undefined) delete process.env.STOREFRONT_PROXY_ROOT;
      else process.env.STOREFRONT_PROXY_ROOT = previousRoot;
    }
  });

  it("returns a non-success status when persistence cannot be read", async () => {
    findManyBundles.mockRejectedValue(new Error("database unavailable"));

    const response = await loader({
      request: request(),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Bundle links are temporarily unavailable" });
  });

  it("rejects a verified proxy request without an offline session", async () => {
    mockAuthenticateAppProxy.mockResolvedValue({ session: undefined });

    const response = await loader({ request: request(), params: {}, context: {} } as never);

    expect(response.status).toBe(401);
    expect(findManyBundles).not.toHaveBeenCalled();
  });

  it("propagates Shopify's authentication failure before tenant reads", async () => {
    const authenticationFailure = new Response("Unauthorized", { status: 401 });
    mockAuthenticateAppProxy.mockRejectedValue(authenticationFailure);

    await expect(loader({ request: request(), params: {}, context: {} } as never))
      .rejects.toBe(authenticationFailure);
    expect(findManyBundles).not.toHaveBeenCalled();
  });
});
