import {
  handlePrepareStorefrontPreview,
  handleSyncStorefrontNow,
} from "../../../app/routes/app/shared/storefront-sync-action.server";
import { syncBundleStorefrontNow } from "../../../app/services/bundles/storefront-sync.server";
import { verifyBundlePreviewToken } from "../../../app/lib/bundle-preview-token.server";
import db from "../../../app/db.server";

jest.mock("../../../app/db.server", () => ({
  __esModule: true,
  default: { bundle: { findUnique: jest.fn() } },
}));

jest.mock("../../../app/services/bundles/storefront-sync.server", () => ({
  syncBundleStorefrontNow: jest.fn().mockResolvedValue({
    skipped: false,
    synced: true,
    stats: { bundleType: "full_page" },
  }),
}));

const mockSyncBundleStorefrontNow =
  syncBundleStorefrontNow as jest.MockedFunction<typeof syncBundleStorefrontNow>;
const mockDb = db as jest.Mocked<typeof db>;

const admin = { graphql: jest.fn() } as any;
const session = { shop: "test.myshopify.com" } as any;

describe("storefront sync action handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncBundleStorefrontNow.mockResolvedValue({
      skipped: false,
      synced: true,
      stats: { bundleType: "full_page" },
    } as any);
    (mockDb.bundle.findUnique as jest.Mock).mockResolvedValue({
      id: "bundle-1",
      publicNumber: 1,
      bundleType: "full_page",
      status: "draft",
    });
  });

  it("prepares FPB preview without syncing and returns the signed proxy URL", async () => {
    const response = await handlePrepareStorefrontPreview(
      admin,
      session,
      "bundle-1",
      "full_page",
    );
    const body = await response.json() as any;
    const previewUrl = new URL(body.shareablePreviewUrl);

    expect(mockSyncBundleStorefrontNow).not.toHaveBeenCalled();
    expect(previewUrl.pathname).toBe("/apps/product-bundles/wpb/1");
    expect(verifyBundlePreviewToken({
      token: previewUrl.searchParams.get("wpb_preview"),
      shop: session.shop,
      bundleId: "bundle-1",
    })).toBe(true);
    expect(mockDb.bundle.findUnique).toHaveBeenCalledWith({
      where: { id: "bundle-1", shopId: "test.myshopify.com" },
      select: { id: true, publicNumber: true, bundleType: true, status: true },
    });
  });

  it("syncs immediately and returns a compact EB-style response", async () => {
    const response = await handleSyncStorefrontNow(
      admin,
      session,
      "bundle-1",
      "full_page",
      "sync_bundle",
    );
    const body = await response.json();

    expect(mockSyncBundleStorefrontNow).toHaveBeenCalledWith({
      admin,
      shopDomain: "test.myshopify.com",
      bundleId: "bundle-1",
      bundleType: "full_page",
      reason: "sync_bundle",
    });
    expect(body).toEqual({
      success: true,
      statusCode: 200,
      synced: true,
      message: "Updated Successfully!",
    });
    expect(body).not.toHaveProperty("storefrontSync");
    expect(body).not.toHaveProperty("attemptId");
    expect(body).not.toHaveProperty("stats");
  });

  it("prepares PPB preview without syncing and returns a bound authorization token", async () => {
    const response = await handlePrepareStorefrontPreview(
      admin,
      session,
      "bundle-1",
      "product_page",
    );
    const body = await response.json() as any;

    expect(mockSyncBundleStorefrontNow).not.toHaveBeenCalled();
    expect(body).toEqual({
      success: true,
      statusCode: 200,
      ready: true,
      message: "success",
      previewToken: expect.any(String),
    });
    expect(verifyBundlePreviewToken({
      token: body.previewToken,
      shop: "test.myshopify.com",
      bundleId: "bundle-1",
    })).toBe(true);
    expect(body).not.toHaveProperty("storefrontSync");
    expect(body).not.toHaveProperty("queued");
    expect(body).not.toHaveProperty("stats");
  });

  it("rejects an FPB preview when the canonical public number is missing", async () => {
    (mockDb.bundle.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "bundle-1",
      publicNumber: null,
      bundleType: "full_page",
      status: "draft",
    });

    const response = await handlePrepareStorefrontPreview(
      admin,
      session,
      "bundle-1",
      "full_page",
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      statusCode: 500,
      error: "Bundle public number is missing",
    });
    expect(body).not.toHaveProperty("storefrontSync");
    expect(mockSyncBundleStorefrontNow).not.toHaveBeenCalled();
  });
});
