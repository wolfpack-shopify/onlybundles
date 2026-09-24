import {
  initializeFpbProductPageUpsells,
  reconcileFpbUpsellPlacement,
} from "./fpb-product-page-upsell.js";
import {
  initializePpbBundleEmbed,
  reconcilePpbBundleEmbedPlacement,
} from "./ppb-bundle-embed.js";
import {
  findPageBuilderEmbedMarker,
  initializePageBuilderEmbed,
  suppressesAutomaticPpbEmbed,
} from "./page-builder-embed.js";
import { resolveAppEmbedOwnership } from "./app-embed-marker.js";
import { scheduleNonCriticalStorefrontTask } from "../assets/widgets/shared/storefront-analytics.js";

const ownership = resolveAppEmbedOwnership();
const embed = ownership.status === "owned" ? ownership.marker : null;

function hydrateProductFeatures() {
  if (!embed) return;
  void initializePageBuilderEmbed(embed);
  reconcileFpbUpsellPlacement();
  scheduleNonCriticalStorefrontTask(() => {
    void initializeFpbProductPageUpsells(embed);
  });
  if (!suppressesAutomaticPpbEmbed(findPageBuilderEmbedMarker())) {
    reconcilePpbBundleEmbedPlacement();
    void initializePpbBundleEmbed(embed);
  }
}

hydrateProductFeatures();
document.addEventListener("shopify:section:load", hydrateProductFeatures);
