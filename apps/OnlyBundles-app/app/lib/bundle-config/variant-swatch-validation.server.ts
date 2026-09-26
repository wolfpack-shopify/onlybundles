import type { ShopifyAdmin } from "../../shopify.server";
import type { ConfigureValidationIssue } from "./configure-validation";

type SwatchMode = "color_swatch" | "image_swatch";

type ProductSwatchData = {
  id: string;
  options: Array<{
    name: string;
    optionValues: Array<{
      name: string;
      swatch?: {
        color?: string | null;
        image?: { id?: string | null } | null;
      } | null;
    }>;
  }>;
};

type ValidationTarget = {
  path: string;
  mode: SwatchMode;
  productIds: string[];
  collectionIds: string[];
};

const PRODUCT_SWATCH_QUERY = `#graphql
  query WpbVariantSwatchProduct($id: ID!) {
    product(id: $id) {
      id
      options {
        name
        optionValues {
          name
          swatch {
            color
            image { id }
          }
        }
      }
    }
  }
`;

const COLLECTION_SWATCH_QUERY = `#graphql
  query WpbVariantSwatchCollection($id: ID!, $after: String) {
    collection(id: $id) {
      products(first: 100, after: $after) {
        nodes {
          id
          options {
            name
            optionValues {
              name
              swatch {
                color
                image { id }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

function stableId(value: unknown, fallback: string) {
  const id = String(value ?? "").trim();
  return id || fallback;
}

function resourceGid(value: any, resource: "Product" | "Collection") {
  const candidates = resource === "Product"
    ? [value?.graphqlId, value?.productId, value?.selectionId, value?.id]
    : [value?.graphqlId, value?.collectionId, value?.selectionId, value?.id];
  for (const candidate of candidates) {
    const normalized = String(candidate ?? "").trim();
    if (!normalized) continue;
    if (normalized.startsWith(`gid://shopify/${resource}/`)) return normalized;
    if (/^\d+$/.test(normalized)) return `gid://shopify/${resource}/${normalized}`;
  }
  return "";
}

function collectTargets(steps: any[]): ValidationTarget[] {
  const targets: ValidationTarget[] = [];
  steps.forEach((step, stepIndex) => {
    const stepId = stableId(step?.id, `step-${stepIndex + 1}`);
    const stepDisplaysVariantsIndividually = step?.displayVariantsAsIndividual === true
      || step?.displayVariantsAsIndividualProducts === true;
    const categories = Array.isArray(step?.StepCategory) ? step.StepCategory : [];
    categories.forEach((category: any, categoryIndex: number) => {
      const mode = category?.variantSelectorMode;
      if (mode !== "color_swatch" && mode !== "image_swatch") return;
      if (
        stepDisplaysVariantsIndividually
        || category?.displayVariantsAsIndividualProducts === true
        || category?.displayVariantsAsIndividual === true
      ) return;
      const categoryId = stableId(category?.id, `category-${categoryIndex + 1}`);
      targets.push({
        path: `steps.${stepId}.categories.${categoryId}.variantSelectorMode`,
        mode,
        productIds: (Array.isArray(category?.products) ? category.products : [])
          .map((product: any) => resourceGid(product, "Product"))
          .filter(Boolean),
        collectionIds: (Array.isArray(category?.collections) ? category.collections : [])
          .map((collection: any) => resourceGid(collection, "Collection"))
          .filter(Boolean),
      });
    });
  });
  return targets;
}

async function readJson(response: Response) {
  const payload = await response.json();
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(String(payload.errors[0]?.message || "Shopify swatch query failed"));
  }
  return payload?.data || {};
}

async function fetchProduct(admin: ShopifyAdmin, id: string) {
  const response = await admin.graphql(PRODUCT_SWATCH_QUERY, {
    variables: { id },
  });
  const data = await readJson(response);
  return (data.product || null) as ProductSwatchData | null;
}

async function fetchCollectionProducts(admin: ShopifyAdmin, id: string) {
  const products: ProductSwatchData[] = [];
  let after: string | null = null;
  do {
    const response = await admin.graphql(COLLECTION_SWATCH_QUERY, {
      variables: { id, after },
    });
    const data = await readJson(response);
    const connection = data.collection?.products;
    if (!connection) return null;
    products.push(...(Array.isArray(connection.nodes) ? connection.nodes : []));
    after = connection.pageInfo?.hasNextPage
      ? connection.pageInfo?.endCursor || null
      : null;
  } while (after);
  return products;
}

function hasMeaningfulOptions(product: ProductSwatchData) {
  return (product.options || []).some((option) => {
    const values = (option.optionValues || [])
      .map((value) => String(value?.name || "").trim())
      .filter(Boolean);
    return values.length > 1
      || (values.length === 1 && values[0] !== "Default Title");
  });
}

function supportsMode(product: ProductSwatchData, mode: SwatchMode) {
  if (!hasMeaningfulOptions(product)) return true;
  return (product.options || []).some((option) => {
    const values = option.optionValues || [];
    if (values.length === 0) return false;
    return values.every((value) => mode === "color_swatch"
      ? Boolean(String(value.swatch?.color || "").trim())
      : Boolean(value.swatch?.image?.id));
  });
}

function errorFor(target: ValidationTarget, queryFailed = false): ConfigureValidationIssue {
  const selectorName = target.mode === "color_swatch" ? "color swatches" : "image swatches";
  return {
    path: target.path,
    message: queryFailed
      ? "Shopify swatches could not be validated. Try saving again."
      : `Every selectable product needs one complete Shopify option with ${selectorName}. Choose a different selector style or add the missing swatches in Shopify.`,
    section: "step_setup",
    controlId: `configure-${target.path.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
  };
}

export async function validateConfiguredVariantSwatches(
  admin: ShopifyAdmin,
  steps: any[],
): Promise<ConfigureValidationIssue[]> {
  const targets = collectTargets(steps);
  if (targets.length === 0) return [];

  const productCache = new Map<string, ProductSwatchData | null>();
  const collectionCache = new Map<string, ProductSwatchData[] | null>();
  const issues: ConfigureValidationIssue[] = [];

  for (const target of targets) {
    try {
      const products: ProductSwatchData[] = [];
      for (const productId of target.productIds) {
        if (!productCache.has(productId)) {
          productCache.set(productId, await fetchProduct(admin, productId));
        }
        const product = productCache.get(productId);
        if (product) products.push(product);
      }
      for (const collectionId of target.collectionIds) {
        if (!collectionCache.has(collectionId)) {
          collectionCache.set(
            collectionId,
            await fetchCollectionProducts(admin, collectionId),
          );
        }
        const collectionProducts = collectionCache.get(collectionId);
        if (collectionProducts) products.push(...collectionProducts);
      }

      const uniqueProducts = [...new Map(products.map((product) => [product.id, product])).values()];
      if (
        uniqueProducts.length === 0
        || uniqueProducts.some((product) => !supportsMode(product, target.mode))
      ) {
        issues.push(errorFor(target));
      }
    } catch {
      issues.push(errorFor(target, true));
    }
  }

  return issues;
}
