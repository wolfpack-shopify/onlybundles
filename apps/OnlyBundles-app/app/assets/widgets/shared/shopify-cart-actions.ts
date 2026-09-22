export type ExistingCartLine = {
  id: string | number;
  quantity: number;
  properties?: Record<string, unknown>;
  selling_plan?: string | number | null;
  sellingPlanId?: string | number | null;
};

type ShopifyCartActionResult = {
  userErrors?: Array<{ message?: string }>;
  warnings?: Array<{ message?: string }>;
  [key: string]: unknown;
};

type ShopifyActionsWindow = Window & {
  Shopify?: {
    actions?: {
      updateCart?: (input: unknown, options?: unknown) => Promise<ShopifyCartActionResult>;
      openCart?: () => Promise<unknown> | unknown;
    };
  };
};

function productVariantGid(value: string | number) {
  const id = String(value).trim();
  return id.startsWith("gid://shopify/ProductVariant/")
    ? id
    : `gid://shopify/ProductVariant/${id}`;
}

function sellingPlanGid(value: string | number | null | undefined) {
  if (value === null || value === undefined || String(value).trim() === "") return undefined;
  const id = String(value).trim();
  return id.startsWith("gid://shopify/SellingPlan/")
    ? id
    : `gid://shopify/SellingPlan/${id}`;
}

export async function updateShopifyCart(
  lines: ExistingCartLine[],
  runtimeWindow: ShopifyActionsWindow = window as ShopifyActionsWindow,
) {
  const updateCart = runtimeWindow.Shopify?.actions?.updateCart;
  if (typeof updateCart !== "function") {
    throw new Error("Shopify storefront cart actions are unavailable.");
  }
  const result = await updateCart({
    lines: lines.map((line) => ({
      merchandiseId: productVariantGid(line.id),
      quantity: Number(line.quantity),
      attributes: Object.entries(line.properties ?? {}).flatMap(([key, value]) => (
        value === null || value === undefined ? [] : [{ key, value: String(value) }]
      )),
      ...(sellingPlanGid(line.sellingPlanId ?? line.selling_plan)
        ? { sellingPlanId: sellingPlanGid(line.sellingPlanId ?? line.selling_plan) }
        : {}),
    })),
  }, {
    event: { context: "product", detail: { source: "only-bundles" } },
  });
  const userErrors = Array.isArray(result?.userErrors) ? result.userErrors : [];
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((error: any) => error.message).filter(Boolean).join(" ") || "Shopify rejected the cart update.");
  }
  return result;
}

export async function openShopifyCart(
  runtimeWindow: ShopifyActionsWindow = window as ShopifyActionsWindow,
) {
  const openCart = runtimeWindow.Shopify?.actions?.openCart;
  if (typeof openCart !== "function") {
    throw new Error("Shopify storefront cart actions are unavailable.");
  }
  return openCart();
}
