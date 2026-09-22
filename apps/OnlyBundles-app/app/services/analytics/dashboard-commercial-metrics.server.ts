import db from "../../db.server";

const SHOPIFY_NODE_BATCH_SIZE = 250;

const DASHBOARD_ORDER_MONEY_QUERY = `#graphql
  query DashboardCommercialOrders($ids: [ID!]!) {
    shop {
      currencyCode
    }
    nodes(ids: $ids) {
      ... on Order {
        id
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        currentSubtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
          presentmentMoney {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options: { variables: { ids: string[] } },
  ) => Promise<{ json: () => Promise<DashboardOrderMoneyPayload> }>;
};

type AttributionRow = {
  orderId: string;
  bundleId: string | null;
  bundleRevenue: number;
  currency: string;
};

type Money = {
  amount: string;
  currencyCode: string;
};

type OrderMoneyNode = {
  id: string;
  currentTotalPriceSet: { shopMoney: Money };
  currentSubtotalPriceSet: {
    shopMoney: Money;
    presentmentMoney: Money;
  };
};

type DashboardOrderMoneyPayload = {
  errors?: Array<{ message?: string }>;
  data?: {
    shop?: { currencyCode?: string };
    nodes?: Array<OrderMoneyNode | null>;
  };
};

export type DashboardCommercialMetrics = {
  days: 30;
  currencyCode: string;
  totalBundleRevenue: number;
  ordersWithBundles: number;
  averageOrderValue: number | null;
  viewToOrderRate: number | null;
};

function amountToCents(amount: string): number {
  const value = Number(amount);
  if (!Number.isFinite(value)) throw new Error("Invalid Shopify money amount");
  return Math.round(value * 100);
}

function uniqueBundlePurchases(rows: AttributionRow[]): AttributionRow[] {
  const unique = new Map<string, AttributionRow>();
  for (const row of rows) {
    if (!row.bundleId) continue;
    const key = `${row.orderId}\u0000${row.bundleId}`;
    const current = unique.get(key);
    if (!current || row.bundleRevenue > current.bundleRevenue) {
      unique.set(key, row);
    }
  }
  return [...unique.values()];
}

function convertBundleRevenueToShopCurrency(
  row: AttributionRow,
  order: OrderMoneyNode,
  shopCurrencyCode: string,
): number {
  if (row.currency === shopCurrencyCode) return row.bundleRevenue;

  const shopSubtotal = order.currentSubtotalPriceSet.shopMoney;
  const presentmentSubtotal = order.currentSubtotalPriceSet.presentmentMoney;
  if (
    shopSubtotal.currencyCode !== shopCurrencyCode ||
    presentmentSubtotal.currencyCode !== row.currency
  ) {
    throw new Error("Shopify money currency mismatch");
  }

  const shopSubtotalCents = amountToCents(shopSubtotal.amount);
  const presentmentSubtotalCents = amountToCents(presentmentSubtotal.amount);
  if (presentmentSubtotalCents <= 0) {
    throw new Error("Shopify presentment subtotal is unavailable");
  }

  return Math.round(
    (row.bundleRevenue * shopSubtotalCents) / presentmentSubtotalCents,
  );
}

export async function loadDashboardCommercialMetrics({
  admin,
  shopId,
  now = new Date(),
}: {
  admin: AdminGraphqlClient;
  shopId: string;
  now?: Date;
}): Promise<DashboardCommercialMetrics> {
  const until = new Date(now);
  until.setUTCHours(23, 59, 59, 999);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 29);
  since.setUTCHours(0, 0, 0, 0);
  const createdAt = { gte: since, lte: until };

  const [rows, views] = await Promise.all([
    db.orderAttribution.findMany({
      where: { shopId, bundleId: { not: null }, createdAt },
      select: {
        orderId: true,
        bundleId: true,
        bundleRevenue: true,
        currency: true,
      },
    }),
    db.bundleAnalytics.count({
      where: { shopId, event: "view", createdAt },
    }),
  ]);

  const bundlePurchases = uniqueBundlePurchases(rows);
  const orderIds = [...new Set(bundlePurchases.map((row) => row.orderId))];
  const batches = orderIds.length
    ? Array.from(
        { length: Math.ceil(orderIds.length / SHOPIFY_NODE_BATCH_SIZE) },
        (_, index) =>
          orderIds.slice(
            index * SHOPIFY_NODE_BATCH_SIZE,
            (index + 1) * SHOPIFY_NODE_BATCH_SIZE,
          ),
      )
    : [[]];

  let shopCurrencyCode: string | null = null;
  const orderMoneyById = new Map<string, OrderMoneyNode>();
  for (const ids of batches) {
    const response = await admin.graphql(DASHBOARD_ORDER_MONEY_QUERY, {
      variables: { ids },
    });
    const payload = await response.json();
    if (payload.errors?.length || !payload.data?.shop?.currencyCode) {
      throw new Error("Unable to load Shopify order money");
    }
    shopCurrencyCode ??= payload.data.shop.currencyCode;
    if (shopCurrencyCode !== payload.data.shop.currencyCode) {
      throw new Error("Shopify shop currency changed during metric loading");
    }
    for (const node of payload.data.nodes ?? []) {
      if (node?.id) orderMoneyById.set(node.id, node);
    }
  }

  let totalBundleRevenue = 0;
  const orderRevenueById = new Map<string, number>();
  for (const row of bundlePurchases) {
    const order = orderMoneyById.get(row.orderId);
    if (!order || !shopCurrencyCode) {
      throw new Error(`Missing Shopify money data for ${row.orderId}`);
    }
    const total = order.currentTotalPriceSet?.shopMoney;
    if (!total || total.currencyCode !== shopCurrencyCode) {
      throw new Error(`Missing Shopify money data for ${row.orderId}`);
    }
    orderRevenueById.set(row.orderId, amountToCents(total.amount));
    totalBundleRevenue += convertBundleRevenueToShopCurrency(
      row,
      order,
      shopCurrencyCode,
    );
  }

  const totalOrderRevenue = [...orderRevenueById.values()].reduce(
    (sum, revenue) => sum + revenue,
    0,
  );
  const ordersWithBundles = orderRevenueById.size;

  return {
    days: 30,
    currencyCode: shopCurrencyCode as string,
    totalBundleRevenue,
    ordersWithBundles,
    averageOrderValue:
      ordersWithBundles > 0
        ? Math.round(totalOrderRevenue / ordersWithBundles)
        : null,
    viewToOrderRate:
      views > 0
        ? Number(((ordersWithBundles / views) * 100).toFixed(2))
        : null,
  };
}
