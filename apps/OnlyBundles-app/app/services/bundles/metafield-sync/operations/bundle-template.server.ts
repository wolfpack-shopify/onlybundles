import { isDeepStrictEqual } from "node:util";
import type { ShopifyAdmin } from "../../../../shopify.server";
import { METAFIELD_KEYS, METAFIELD_NAMESPACE } from "../../../../constants/metafields";
import { checkMetafieldSize } from "../utils/size-check";

const BUNDLE_UI_SCHEMA_VERSION = 4;

export class BundleTemplateSnapshotUnavailableError extends Error {
  constructor() {
    super("The storefront copy of this bundle needs to be synchronized before the template can be used.");
    this.name = "BundleTemplateSnapshotUnavailableError";
  }
}

export class BundleTemplateSnapshotConflictError extends Error {
  constructor() {
    super("The storefront configuration changed while the template was being saved. Please try again.");
    this.name = "BundleTemplateSnapshotConflictError";
  }
}

interface SyncBundleTemplateSnapshotInput {
  admin: ShopifyAdmin;
  bundleProductId: string;
  bundleId: string;
  bundleType: "full_page" | "product_page";
  bundleDesignTemplate: string | null;
  bundleDesignPresetId: string | null;
}

type BundleSnapshot = Record<string, unknown> & {
  schemaVersion: number;
  id: string;
  bundleType: string;
  steps: unknown[];
};

function parseBundleSnapshot(value: unknown): BundleSnapshot | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as BundleSnapshot
      : null;
  } catch {
    return null;
  }
}

function assertExpectedSnapshot(
  snapshot: BundleSnapshot | null,
  input: Pick<SyncBundleTemplateSnapshotInput, "bundleId" | "bundleType">,
): asserts snapshot is BundleSnapshot {
  if (
    !snapshot
    || snapshot.schemaVersion !== BUNDLE_UI_SCHEMA_VERSION
    || snapshot.id !== input.bundleId
    || snapshot.bundleType !== input.bundleType
    || !Array.isArray(snapshot.steps)
  ) {
    throw new BundleTemplateSnapshotUnavailableError();
  }
}

export async function syncBundleTemplateSnapshot({
  admin,
  bundleProductId,
  bundleId,
  bundleType,
  bundleDesignTemplate,
  bundleDesignPresetId,
}: SyncBundleTemplateSnapshotInput): Promise<{ updated: boolean }> {
  const queryResponse = await admin.graphql(`
    query BundleTemplateSnapshot($productId: ID!) {
      product(id: $productId) {
        variants(first: 1) {
          nodes {
            id
            bundleConfig: metafield(namespace: "$app", key: "bundle_ui_config") {
              type
              value
              compareDigest
            }
          }
        }
      }
    }
  `, { variables: { productId: bundleProductId } });
  const queryPayload = await queryResponse.json() as {
    errors?: unknown[];
    data?: {
      product?: {
        variants?: {
          nodes?: Array<{
            id?: string;
            bundleConfig?: {
              type?: string;
              value?: string;
              compareDigest?: string;
            } | null;
          }>;
        };
      } | null;
    };
  };

  if (queryPayload.errors?.length) {
    throw new Error("Unable to read the storefront bundle configuration.");
  }

  const variant = queryPayload.data?.product?.variants?.nodes?.[0];
  const metafield = variant?.bundleConfig;
  if (
    !variant?.id
    || !metafield
    || metafield.type !== "json"
    || typeof metafield.value !== "string"
    || typeof metafield.compareDigest !== "string"
  ) {
    throw new BundleTemplateSnapshotUnavailableError();
  }

  const currentSnapshot = parseBundleSnapshot(metafield.value);
  assertExpectedSnapshot(currentSnapshot, { bundleId, bundleType });

  if (
    currentSnapshot.bundleDesignTemplate === bundleDesignTemplate
    && currentSnapshot.bundleDesignPresetId === bundleDesignPresetId
  ) {
    return { updated: false };
  }

  const updatedSnapshot = {
    ...currentSnapshot,
    bundleDesignTemplate,
    bundleDesignPresetId,
  };
  const sizeCheck = checkMetafieldSize(
    updatedSnapshot,
    METAFIELD_KEYS.BUNDLE_UI_CONFIG,
    "syncBundleTemplateSnapshot",
  );
  if (!sizeCheck.withinLimit) {
    throw new Error("bundle_ui_config metafield exceeds Shopify's 64KB limit.");
  }

  const mutationResponse = await admin.graphql(`
    mutation SetBundleTemplateSnapshot($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          value
        }
        userErrors {
          code
          message
        }
      }
    }
  `, {
    variables: {
      metafields: [{
        ownerId: variant.id,
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEYS.BUNDLE_UI_CONFIG,
        type: "json",
        value: JSON.stringify(updatedSnapshot),
        compareDigest: metafield.compareDigest,
      }],
    },
  });
  const mutationPayload = await mutationResponse.json() as {
    errors?: unknown[];
    data?: {
      metafieldsSet?: {
        metafields?: Array<{ key?: string; value?: string }> | null;
        userErrors?: Array<{ code?: string | null; message?: string }>;
      } | null;
    };
  };
  const result = mutationPayload.data?.metafieldsSet;
  if (mutationPayload.errors?.length || !result) {
    throw new Error("Unable to update the storefront bundle template.");
  }

  const conflict = result.userErrors?.find(({ code }) =>
    code === "STALE_OBJECT" || code === "INVALID_COMPARE_DIGEST"
  );
  if (conflict) throw new BundleTemplateSnapshotConflictError();
  if (result.userErrors?.length) {
    throw new Error(result.userErrors[0]?.message ?? "Unable to update the storefront bundle template.");
  }

  const written = result.metafields?.[0];
  const writtenSnapshot = parseBundleSnapshot(written?.value);
  if (
    result.metafields?.length !== 1
    || written?.key !== METAFIELD_KEYS.BUNDLE_UI_CONFIG
    || !isDeepStrictEqual(writtenSnapshot, updatedSnapshot)
  ) {
    throw new Error("Shopify did not confirm the storefront bundle template update.");
  }

  return { updated: true };
}
