import type { LoaderFunctionArgs } from "@remix-run/node";
import { BundleStatus } from "../../constants/bundle";
import db from "../../db.server";
import { renderFpbLoadingScreen } from "../../lib/bundle-loading-screen";
import { verifyBundlePreviewToken } from "../../lib/bundle-preview-token.server";
import { parseFpbPublicNumber } from "../../lib/fpb-storefront-url";
import { AppLogger } from "../../lib/logger";
import { buildOfferCountryLiquidGuard } from "../../lib/offer-country-liquid-guard.server";
import { SPECIFIC_LINK_OFFER_QUERY_PARAM } from "../../lib/specific-link-offer";
import { resolveSpecificLinkOfferEligibility } from "../../lib/specific-link-offer-eligibility.server";
import { authenticate } from "../../shopify.server";

const PUBLIC_CACHE_CONTROL = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";
const PRIVATE_CACHE_CONTROL = "private, no-store";
const FPB_TEMPLATE = "FBP_SIDE_FOOTER";
const FPB_PRESETS = new Set(["STANDARD", "CLASSIC", "COMPACT", "HORIZONTAL"]);

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

function duration(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

function serverTiming(input: { db: number; storefront?: number; total: number }) {
  return [
    `db;dur=${input.db}`,
    input.storefront === undefined ? null : `storefront;dur=${input.storefront}`,
    `total;dur=${input.total}`,
  ].filter(Boolean).join(", ");
}

function errorResponse(
  message: string,
  status: number,
  timing: { db: number; storefront?: number; total: number },
) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Server-Timing": serverTiming(timing),
    },
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonMetafieldValue(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isValidBundleSnapshot(
  value: unknown,
  bundle: { id: string; publicNumber: number | null; runtimePolicyRevision: string | null },
) {
  return isRecord(value)
    && value.schemaVersion === 4
    && value.id === bundle.id
    && value.bundleType === "full_page"
    && value.bundleDesignTemplate === FPB_TEMPLATE
    && FPB_PRESETS.has(value.bundleDesignPresetId)
    && value.publicNumber === bundle.publicNumber
    && value.runtimePolicyRevision === bundle.runtimePolicyRevision
    && Array.isArray(value.steps);
}

function isValidFpbRuntime(value: unknown) {
  return isRecord(value)
    && value.schemaVersion === 1
    && isRecord(value.loadingScreen)
    && typeof value.loadingScreen.backgroundColor === "string"
    && isRecord(value.languages)
    && isRecord(value.languages.en);
}

function hasRestrictedDelivery(policy: Record<string, any> | null) {
  if (!policy) return false;
  return policy.specificLinkRequired === true
    || policy.countryTargetingEnabled === true
    || policy.scheduleMode !== "always"
    || Boolean(policy.startsAt)
    || Boolean(policy.endsAt);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const { session, storefront, liquid } = await authenticate.public.appProxy(request);
  if (!session || !storefront) throw new Response("Unauthorized", { status: 401 });
  const shopDomain = session.shop;
  const publicNumber = parseFpbPublicNumber(params.bundleId);
  if (publicNumber === null) {
    return errorResponse("Bundle not found", 404, { db: 0, total: duration(startedAt) });
  }

  const dbStartedAt = Date.now();
  const bundle = await db.bundle.findFirst({
    where: { publicNumber, shopId: shopDomain, bundleType: "full_page" },
    select: {
      id: true,
      publicNumber: true,
      status: true,
      shopifyProductId: true,
      bundleType: true,
      runtimePolicyRevision: true,
      offerPolicy: {
        select: {
          id: true,
          specificLinkRequired: true,
          priority: true,
          stopLowerPriority: true,
          scheduleMode: true,
          startsAt: true,
          endsAt: true,
          recurrenceFrequency: true,
          recurrenceTimezone: true,
          recurrenceAnchorDate: true,
          recurrenceWindowStartMinute: true,
          recurrenceWindowEndMinute: true,
          recurrenceTermination: true,
          recurrenceEndsOn: true,
          recurrenceRunCount: true,
          countryTargetingEnabled: true,
          countryTargetingMode: true,
          countryCodes: true,
          ruleVersion: true,
          conditions: {
            select: {
              type: true,
              tokenHash: true,
              expiresAt: true,
              revokedAt: true,
            },
          },
        },
      },
    },
  });
  const dbDuration = duration(dbStartedAt);

  if (!bundle) {
    return errorResponse("Bundle not found", 404, {
      db: dbDuration,
      total: duration(startedAt),
    });
  }

  const hasValidPreviewToken = verifyBundlePreviewToken({
    token: url.searchParams.get("wpb_preview"),
    shop: shopDomain,
    bundleId: bundle.id,
  });
  const isPublic = bundle.status === BundleStatus.ACTIVE
    || bundle.status === BundleStatus.UNLISTED;
  if (!isPublic && !(bundle.status === BundleStatus.DRAFT && hasValidPreviewToken)) {
    return errorResponse("Bundle not found", 404, {
      db: dbDuration,
      total: duration(startedAt),
    });
  }

  const offerDecision = hasValidPreviewToken
    ? { eligible: true, reasonCode: "not_required" as const }
    : resolveSpecificLinkOfferEligibility({
      policy: bundle.offerPolicy as any,
      token: url.searchParams.get(SPECIFIC_LINK_OFFER_QUERY_PARAM),
    });
  if (!offerDecision.eligible) {
    return errorResponse("Bundle not found", 404, {
      db: dbDuration,
      total: duration(startedAt),
    });
  }

  if (!bundle.shopifyProductId) {
    return errorResponse("Bundle storefront snapshot is unavailable", 503, {
      db: dbDuration,
      total: duration(startedAt),
    });
  }

  const storefrontStartedAt = Date.now();
  let payload: any;
  try {
    const response = await storefront.graphql(`
      query FpbStorefrontSnapshot($productId: ID!) {
        product(id: $productId) {
          variants(first: 1) {
            nodes {
              bundleConfig: metafield(namespace: "$app", key: "bundle_ui_config") {
                value
              }
            }
          }
        }
        shop {
          fpbRuntime: metafield(namespace: "$app", key: "fpb_storefront_runtime") {
            value
          }
        }
      }
    `, { variables: { productId: bundle.shopifyProductId } });
    payload = await response.json();
  } catch (error) {
    AppLogger.error("FPB Storefront snapshot query failed", {
      component: "wpb.proxy",
      shop: shopDomain,
      bundleId: bundle.id,
    }, error);
    return errorResponse("Bundle storefront snapshot is unavailable", 503, {
      db: dbDuration,
      storefront: duration(storefrontStartedAt),
      total: duration(startedAt),
    });
  }
  const storefrontDuration = duration(storefrontStartedAt);
  const bundleSnapshot = parseJsonMetafieldValue(
    payload.data?.product?.variants?.nodes?.[0]?.bundleConfig?.value,
  );
  const fpbRuntime = parseJsonMetafieldValue(payload.data?.shop?.fpbRuntime?.value);
  if (
    payload.errors?.length
    || !isValidBundleSnapshot(bundleSnapshot, bundle)
    || !isValidFpbRuntime(fpbRuntime)
  ) {
    return errorResponse("Bundle storefront snapshot is unavailable", 503, {
      db: dbDuration,
      storefront: storefrontDuration,
      total: duration(startedAt),
    });
  }

  const loadingScreen = fpbRuntime.loadingScreen;
  const loadingGifAttr = loadingScreen.gifUrl
    ? ` data-fpb-loading-gif="${escapeHtmlAttribute(loadingScreen.gifUrl)}"`
    : "";
  const templateTypeAttr = bundleSnapshot.bundleDesignTemplate
    ? ` data-fpb-template-type="${escapeHtmlAttribute(bundleSnapshot.bundleDesignTemplate)}"`
    : "";
  const designPresetAttr = bundleSnapshot.bundleDesignPresetId
    ? ` data-fpb-design-preset="${escapeHtmlAttribute(bundleSnapshot.bundleDesignPresetId)}"`
    : "";
  const marker = `<div data-wpb-full-page-bundle data-bundle-id="${escapeHtmlAttribute(bundle.id)}" data-bundle-type="full_page" data-bundle-config-source="shopify_storefront" data-shop="${escapeHtmlAttribute(shopDomain)}" data-country-code="{{ localization.country.iso_code }}" data-fpb-loading-background="${escapeHtmlAttribute(loadingScreen.backgroundColor)}"${loadingGifAttr}${templateTypeAttr}${designPresetAttr} data-fpb-runtime='${escapeHtmlAttribute(JSON.stringify(fpbRuntime))}' data-bundle-config='${escapeHtmlAttribute(JSON.stringify(bundleSnapshot))}' hidden>${renderFpbLoadingScreen(loadingScreen)}</div>`;
  const body = hasValidPreviewToken
    ? marker
    : buildOfferCountryLiquidGuard(marker, bundle.offerPolicy);
  const cacheControl = isPublic
    && !hasValidPreviewToken
    && !hasRestrictedDelivery(bundle.offerPolicy as Record<string, any> | null)
    && !url.searchParams.has(SPECIFIC_LINK_OFFER_QUERY_PARAM)
    ? PUBLIC_CACHE_CONTROL
    : PRIVATE_CACHE_CONTROL;

  AppLogger.info("FPB proxy page rendered", {
    component: "wpb.proxy",
    shop: shopDomain,
    bundleId: bundle.id,
    publicNumber,
    status: 200,
    renderDurationMs: duration(startedAt),
  });
  return liquid(body, {
    status: 200,
    headers: {
      "Cache-Control": cacheControl,
      "Server-Timing": serverTiming({
        db: dbDuration,
        storefront: storefrontDuration,
        total: duration(startedAt),
      }),
    },
  });
}
