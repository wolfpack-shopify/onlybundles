import { cleanupShopData } from "../../../app/services/shop-data-cleanup.server";

function makeDatabase() {
  const transaction = {
    bundle: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    session: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    designSettings: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    queuedJob: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    complianceRecord: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    webhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    businessEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
    shop: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    orderAttribution: { deleteMany: jest.fn().mockResolvedValue({ count: 5 }) },
    bundleEngagement: { deleteMany: jest.fn().mockResolvedValue({ count: 6 }) },
  };
  const database = {
    $transaction: jest.fn(async (operation) => operation(transaction)),
  };
  return { database, transaction };
}

describe("cleanupShopData", () => {
  it("atomically removes operational data while retaining uninstall analytics", async () => {
    const { database, transaction } = makeDatabase();

    const result = await cleanupShopData(
      "merchant.myshopify.com",
      {
        currentWebhookEventId: "current-event",
        purgeAnalytics: false,
      },
      database,
    );

    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(database.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 5_000, timeout: 30_000 },
    );
    expect(transaction.webhookEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        shopDomain: "merchant.myshopify.com",
        id: { not: "current-event" },
      },
    });
    expect(transaction.orderAttribution.deleteMany).not.toHaveBeenCalled();
    expect(transaction.bundleEngagement.deleteMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      bundles: 2,
      shops: 1,
      orderAttributions: 0,
      bundleEngagements: 0,
    });
  });

  it("purges analytics and the current event for shop redact", async () => {
    const { database, transaction } = makeDatabase();

    const result = await cleanupShopData(
      "merchant.myshopify.com",
      {
        currentWebhookEventId: "current-event",
        purgeAnalytics: true,
      },
      database,
    );

    expect(transaction.webhookEvent.deleteMany).toHaveBeenCalledWith({
      where: { shopDomain: "merchant.myshopify.com" },
    });
    expect(transaction.orderAttribution.deleteMany).toHaveBeenCalledWith({
      where: { shopId: "merchant.myshopify.com" },
    });
    expect(transaction.bundleEngagement.deleteMany).toHaveBeenCalledWith({
      where: { shopId: "merchant.myshopify.com" },
    });
    expect(result).toMatchObject({
      orderAttributions: 5,
      bundleEngagements: 6,
    });
  });

  it("propagates a transaction failure instead of reporting partial cleanup", async () => {
    const { database, transaction } = makeDatabase();
    transaction.designSettings.deleteMany.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(cleanupShopData(
      "merchant.myshopify.com",
      { purgeAnalytics: false },
      database,
    )).rejects.toThrow("database unavailable");
  });
});
