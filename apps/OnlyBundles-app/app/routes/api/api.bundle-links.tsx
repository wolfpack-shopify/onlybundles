import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { buildStorefrontProxyPath } from "../../config/storefront-proxy-routes";
import { BundleStatus, BundleType } from "../../constants/bundle";
import { prisma } from "../../db.server";
import { AppLogger } from "../../lib/logger";
import { authenticate } from "../../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    const bundles = await prisma.bundle.findMany({
      where: {
        shopId: session.shop,
        status: { in: [BundleStatus.ACTIVE, BundleStatus.UNLISTED] },
        shopifyProductHandle: { not: null },
      },
      select: { bundleType: true, publicNumber: true, shopifyProductHandle: true },
    });
    const links = bundles.flatMap((bundle) => {
      const productHandle = bundle.shopifyProductHandle?.trim();
      if (!productHandle) return [];
      if (bundle.bundleType === BundleType.FULL_PAGE) {
        if (!bundle.publicNumber) return [];
        return [{
          bundleType: BundleType.FULL_PAGE,
          productHandle,
          targetUrl: buildStorefrontProxyPath(`wpb/${bundle.publicNumber}`),
        }];
      }
      return [{
        bundleType: BundleType.PRODUCT_PAGE,
        productHandle,
        targetUrl: `/products/${productHandle}`,
      }];
    });
    return json({ schemaVersion: 1, links }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: unknown) {
    AppLogger.error("Failed to load storefront bundle links", {
      component: "api.bundle-links",
      shopDomain: session.shop,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Bundle links are temporarily unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
