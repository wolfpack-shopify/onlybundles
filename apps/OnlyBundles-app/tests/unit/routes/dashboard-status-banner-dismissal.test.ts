import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardStatusGrid } from "../../../app/routes/app/app.dashboard/DashboardStatusGrid";
import { THEME_EXTENSION_RESOURCES } from "../../../app/lib/theme-extension-status";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("dashboard published-theme status", () => {
  it("renders every resource persistently with refresh and activation actions", () => {
    const resources = THEME_EXTENSION_RESOURCES.map((resource) => ({
      ...resource,
      status: "available" as const,
      enabled: false,
      target: null,
    }));

    const view = renderToStaticMarkup(
      React.createElement(DashboardStatusGrid, {
        resources,
        error: false,
        loading: false,
        themeEditorUrl: "https://theme-editor.test",
        onOpenEnableInstructions: jest.fn(),
        onOpenThemeEditor: jest.fn(),
        onRefresh: jest.fn(),
      }),
    );

    expect(view).toContain("dashboard.storefrontSetup.publishedThemeDescription");
    expect(view).toContain("dashboard.storefrontSetup.appEmbedsHeading");
    expect(view).toContain("dashboard.storefrontSetup.appBlocksHeading");
    expect(view).toContain("dashboard.storefrontSetup.resourceLabels.bundleAppEmbed");
    expect(view).toContain("dashboard.storefrontSetup.resourceLabels.bundleProductPage");
    expect(view).toContain("dashboard.storefrontSetup.resourceLabels.bundleProductPageEmbed");
    expect(view).toContain("dashboard.storefrontSetup.resourceLabels.bundlePageBuilderEmbed");
    expect(view).toContain("dashboard.storefrontSetup.resourceLabels.bundleUpsell");
    expect(view).toContain("dashboard.storefrontSetup.refresh");
    expect(view).toContain("dashboard.storefrontSetup.openThemeEditor");
    expect(view).toContain("dashboard.storefrontSetup.activate");
    expect(view).not.toContain("dismissible");
  });

  it("renders a native retry state after an App Bridge status error", () => {
    const view = renderToStaticMarkup(
      React.createElement(DashboardStatusGrid, {
        resources: [],
        error: true,
        loading: false,
        themeEditorUrl: null,
        onOpenEnableInstructions: jest.fn(),
        onOpenThemeEditor: jest.fn(),
        onRefresh: jest.fn(),
      }),
    );

    expect(view).toContain("dashboard.storefrontSetup.errorDescription");
    expect(view).toContain("dashboard.storefrontSetup.retry");
  });
});
