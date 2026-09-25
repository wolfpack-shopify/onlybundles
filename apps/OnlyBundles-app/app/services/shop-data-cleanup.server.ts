import db from "../db.server";

interface DeleteResult {
  count: number;
}

interface DeleteManyModel {
  deleteMany: (args: unknown) => Promise<DeleteResult>;
}

interface ShopDataCleanupClient {
  bundle: DeleteManyModel;
  session: DeleteManyModel;
  designSettings: DeleteManyModel;
  queuedJob: DeleteManyModel;
  complianceRecord: DeleteManyModel;
  webhookEvent: DeleteManyModel;
  businessEvent: DeleteManyModel;
  shop: DeleteManyModel;
  orderAttribution: DeleteManyModel;
  bundleEngagement: DeleteManyModel;
}

interface TransactionClient {
  $transaction: <T>(
    operation: (client: ShopDataCleanupClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ) => Promise<T>;
}

export interface ShopDataCleanupOptions {
  currentWebhookEventId?: string;
  purgeAnalytics: boolean;
}

export interface ShopDataCleanupSummary {
  bundles: number;
  sessions: number;
  designSettings: number;
  queuedJobs: number;
  complianceRecords: number;
  webhookEvents: number;
  businessEvents: number;
  shops: number;
  orderAttributions: number;
  bundleEngagements: number;
}

export async function cleanupShopData(
  shopDomain: string,
  options: ShopDataCleanupOptions,
  database: TransactionClient = db as unknown as TransactionClient,
): Promise<ShopDataCleanupSummary> {
  return database.$transaction(async (transaction) => {
    const orderAttributions = options.purgeAnalytics
      ? await transaction.orderAttribution.deleteMany({ where: { shopId: shopDomain } })
      : { count: 0 };
    const bundleEngagements = options.purgeAnalytics
      ? await transaction.bundleEngagement.deleteMany({ where: { shopId: shopDomain } })
      : { count: 0 };
    const bundles = await transaction.bundle.deleteMany({
      where: { shopId: shopDomain },
    });
    const sessions = await transaction.session.deleteMany({
      where: { shop: shopDomain },
    });
    const designSettings = await transaction.designSettings.deleteMany({
      where: { shopId: shopDomain },
    });
    const queuedJobs = await transaction.queuedJob.deleteMany({
      where: { shopId: shopDomain },
    });
    const complianceRecords = await transaction.complianceRecord.deleteMany({
      where: { shop: shopDomain },
    });
    const webhookEvents = await transaction.webhookEvent.deleteMany({
      where: {
        shopDomain,
        ...(!options.purgeAnalytics && options.currentWebhookEventId
          ? { id: { not: options.currentWebhookEventId } }
          : {}),
      },
    });
    const businessEvents = await transaction.businessEvent.deleteMany({
      where: { shopDomain },
    });
    const shops = await transaction.shop.deleteMany({
      where: { shopDomain },
    });

    return {
      bundles: bundles.count,
      sessions: sessions.count,
      designSettings: designSettings.count,
      queuedJobs: queuedJobs.count,
      complianceRecords: complianceRecords.count,
      webhookEvents: webhookEvents.count,
      businessEvents: businessEvents.count,
      shops: shops.count,
      orderAttributions: orderAttributions.count,
      bundleEngagements: bundleEngagements.count,
    };
  }, { maxWait: 5_000, timeout: 30_000 });
}
