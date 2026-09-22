import { loadDashboardCommercialMetrics } from "../../../../app/services/analytics/dashboard-commercial-metrics.server";

const mockOrderAttributionFindMany = jest.fn();
const mockBundleAnalyticsCount = jest.fn();
const mockAdminGraphql = jest.fn();

jest.mock("../../../../app/db.server", () => ({
  __esModule: true,
  default: {
    orderAttribution: {
      findMany: (...args: unknown[]) => mockOrderAttributionFindMany(...args),
    },
    bundleAnalytics: {
      count: (...args: unknown[]) => mockBundleAnalyticsCount(...args),
    },
  },
}));

const admin = { graphql: (...args: unknown[]) => mockAdminGraphql(...args) } as any;

function moneyResponse(nodes: unknown[], currencyCode = "INR") {
  return {
    json: async () => ({ data: { shop: { currencyCode }, nodes } }),
  };
}

function orderNode({
  id,
  total = "1000.00",
  shopSubtotal = "800.00",
  presentmentSubtotal = "10.00",
  presentmentCurrency = "USD",
}: {
  id: string;
  total?: string;
  shopSubtotal?: string;
  presentmentSubtotal?: string;
  presentmentCurrency?: string;
}) {
  return {
    id,
    currentTotalPriceSet: {
      shopMoney: { amount: total, currencyCode: "INR" },
    },
    currentSubtotalPriceSet: {
      shopMoney: { amount: shopSubtotal, currencyCode: "INR" },
      presentmentMoney: {
        amount: presentmentSubtotal,
        currencyCode: presentmentCurrency,
      },
    },
  };
}

describe("loadDashboardCommercialMetrics", () => {
  beforeEach(() => {
    mockOrderAttributionFindMany.mockReset();
    mockBundleAnalyticsCount.mockReset();
    mockAdminGraphql.mockReset();
    mockBundleAnalyticsCount.mockResolvedValue(10);
  });

  it("normalizes presentment bundle revenue to shop currency and deduplicates purchases", async () => {
    mockOrderAttributionFindMany.mockResolvedValue([
      { orderId: "gid://shopify/Order/1", bundleId: "a", bundleRevenue: 200, currency: "USD" },
      { orderId: "gid://shopify/Order/1", bundleId: "a", bundleRevenue: 150, currency: "USD" },
      { orderId: "gid://shopify/Order/1", bundleId: "b", bundleRevenue: 100, currency: "USD" },
    ]);
    mockAdminGraphql.mockResolvedValue(moneyResponse([
      orderNode({ id: "gid://shopify/Order/1" }),
    ]));

    await expect(loadDashboardCommercialMetrics({
      admin,
      shopId: "shop.myshopify.com",
      now: new Date("2026-09-23T12:00:00.000Z"),
    })).resolves.toEqual({
      days: 30,
      currencyCode: "INR",
      totalBundleRevenue: 24_000,
      ordersWithBundles: 1,
      averageOrderValue: 100_000,
      viewToOrderRate: 10,
    });
  });

  it("keeps same-currency bundle revenue without applying a conversion", async () => {
    mockOrderAttributionFindMany.mockResolvedValue([
      { orderId: "gid://shopify/Order/1", bundleId: "a", bundleRevenue: 12_345, currency: "INR" },
    ]);
    mockAdminGraphql.mockResolvedValue(moneyResponse([
      orderNode({ id: "gid://shopify/Order/1" }),
    ]));

    const result = await loadDashboardCommercialMetrics({
      admin,
      shopId: "shop.myshopify.com",
    });

    expect(result.totalBundleRevenue).toBe(12_345);
  });

  it("returns unavailable conversion when there are no views", async () => {
    mockBundleAnalyticsCount.mockResolvedValue(0);
    mockOrderAttributionFindMany.mockResolvedValue([]);
    mockAdminGraphql.mockResolvedValue(moneyResponse([]));

    const result = await loadDashboardCommercialMetrics({
      admin,
      shopId: "shop.myshopify.com",
    });

    expect(result.viewToOrderRate).toBeNull();
  });

  it("chunks Shopify node requests at 250 IDs", async () => {
    const rows = Array.from({ length: 251 }, (_, index) => ({
      orderId: `gid://shopify/Order/${index}`,
      bundleId: "a",
      bundleRevenue: 100,
      currency: "INR",
    }));
    mockOrderAttributionFindMany.mockResolvedValue(rows);
    mockAdminGraphql.mockImplementation((_query: string, options: any) =>
      Promise.resolve(moneyResponse(
        options.variables.ids.map((id: string) => orderNode({ id })),
      )),
    );

    await loadDashboardCommercialMetrics({ admin, shopId: "shop.myshopify.com" });

    expect(mockAdminGraphql).toHaveBeenCalledTimes(2);
    expect(mockAdminGraphql.mock.calls[0][1].variables.ids).toHaveLength(250);
    expect(mockAdminGraphql.mock.calls[1][1].variables.ids).toHaveLength(1);
  });

  it("rejects incomplete Shopify money instead of returning partial totals", async () => {
    mockOrderAttributionFindMany.mockResolvedValue([
      { orderId: "gid://shopify/Order/1", bundleId: "a", bundleRevenue: 200, currency: "USD" },
    ]);
    mockAdminGraphql.mockResolvedValue(moneyResponse([]));

    await expect(loadDashboardCommercialMetrics({
      admin,
      shopId: "shop.myshopify.com",
    })).rejects.toThrow("Missing Shopify money data");
  });
});
