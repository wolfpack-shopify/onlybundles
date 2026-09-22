import {
  applyGlobalSettingsControls,
  bindCartIntegrationEvents,
  initCollectionQuickAddControls,
} from "./settings-controls.js";
import { resolveAppEmbedOwnership } from "./app-embed-marker.js";

const ownership = resolveAppEmbedOwnership();
const embed = ownership.status === "owned" ? ownership.marker : null;
const controls = (window as Window & Record<string, any>).__WOLFPACK_SETTINGS_CONTROLS_RUNTIME__;

if (embed && controls) {
  const currentBundleLinks = embed.dataset.isFpbParentProduct === "true" && embed.dataset.productHandle
    ? [{
      bundleType: "full_page" as const,
      productHandle: embed.dataset.productHandle,
      targetUrl: embed.dataset.redirectPath ?? "",
    }]
    : [];
  applyGlobalSettingsControls(
    controls,
    window as unknown as Window & Record<string, unknown>,
    document,
    currentBundleLinks,
  );
  bindCartIntegrationEvents(controls);
  if (embed.dataset.pageType === "collection") {
    void initCollectionQuickAddControls(controls, embed.dataset.bundleLinksEndpoint ?? "");
  }
}
