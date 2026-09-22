import {
  getStorefrontStatusGroups,
  getStorefrontStatusPresentation,
} from "../../../app/routes/app/app.dashboard/DashboardStatusGrid";
import { THEME_EXTENSION_RESOURCES } from "../../../app/lib/theme-extension-status";

const resources = THEME_EXTENSION_RESOURCES.map((resource, index) => ({
  ...resource,
  status: (["active", "available", "unavailable"] as const)[index % 3],
  enabled: index % 3 === 0,
  target: null,
}));

describe("dashboard storefront status", () => {
  it("groups every known resource without hiding optional app blocks", () => {
    const groups = getStorefrontStatusGroups(resources);

    expect(groups.appEmbeds.map((resource) => resource.handle)).toEqual([
      "bundle-app-embed",
    ]);
    expect(groups.appBlocks.map((resource) => resource.handle)).toEqual([
      "bundle-product-page",
      "bundle-product-page-embed",
      "bundle-page-builder-embed",
      "bundle-upsell",
    ]);
  });

  it.each([
    ["active", "success", "dashboard.storefrontSetup.status.enabled"],
    ["available", "info", "dashboard.storefrontSetup.status.ready"],
    ["unavailable", "neutral", "dashboard.storefrontSetup.status.unavailable"],
  ] as const)("maps %s to its canonical presentation", (status, tone, labelKey) => {
    expect(getStorefrontStatusPresentation(status)).toEqual({ tone, labelKey });
  });
});
