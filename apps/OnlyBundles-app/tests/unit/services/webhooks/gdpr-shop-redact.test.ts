const mockCleanupShopData = jest.fn();

jest.mock("../../../../app/services/shop-data-cleanup.server", () => ({
  cleanupShopData: mockCleanupShopData,
}));

jest.mock("../../../../app/db.server", () => ({
  __esModule: true,
  default: {},
}));

jest.mock("../../../../app/lib/logger", () => ({
  AppLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("handleShopRedact", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCleanupShopData.mockResolvedValue({});
  });

  it("purges every shop-scoped record, including analytics and the current webhook event", async () => {
    const { handleShopRedact } = await import(
      "../../../../app/services/webhooks/handlers/gdpr.server"
    );

    const result = await handleShopRedact(
      "merchant.myshopify.com",
      { shop_id: 123 },
      "current-event",
    );

    expect(mockCleanupShopData).toHaveBeenCalledWith(
      "merchant.myshopify.com",
      { purgeAnalytics: true },
    );
    expect(result).toEqual({ success: true, message: "Shop data redacted" });
  });
});
