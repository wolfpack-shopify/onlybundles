import React from "react";
import { flushSync } from "react-dom";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { usePpbPreviewReadinessHandlers } from "../../../app/routes/app/app.bundles.product-page-bundle.configure.$bundleId/usePpbPreviewReadinessHandlers";

const mockPrepareStorefrontPreviewForOpen = jest.fn();
const mockValidatePpbWidgetPlacementFromAppBridge = jest.fn();
const mockOpenPendingDashboardPreview = jest.fn();
const mockNavigatePendingDashboardPreview = jest.fn();
const mockClosePendingDashboardPreview = jest.fn();

jest.mock("../../../app/lib/storefront-sync-preview.client", () => ({
  prepareStorefrontPreviewForOpen: () =>
    mockPrepareStorefrontPreviewForOpen(),
}));

jest.mock("../../../app/lib/ppb-widget-placement.client", () => ({
  validatePpbWidgetPlacementFromAppBridge: (input: unknown) =>
    mockValidatePpbWidgetPlacementFromAppBridge(input),
  resolvePpbWidgetPlacementAction: () => ({ type: "preview" }),
}));

jest.mock("../../../app/lib/dashboard-preview-window", () => ({
  openPendingDashboardPreview: () => mockOpenPendingDashboardPreview(),
  navigatePendingDashboardPreview: (popup: Window | null, url: string) =>
    mockNavigatePendingDashboardPreview(popup, url),
  closePendingDashboardPreview: (popup: Window | null) =>
    mockClosePendingDashboardPreview(popup),
}));

jest.mock("../../../app/lib/bundle-preview-url", () => ({
  appendBundlePreviewToken: (url: string, token: string) =>
    `${url}?wpb_preview=${token}`,
}));

jest.mock("../../../app/lib/bundle-preview-readiness", () => ({
  markBundlePreviewComplete: jest.fn(),
}));

jest.mock("../../../app/lib/logger", () => ({
  AppLogger: { error: jest.fn() },
}));

jest.mock("../../../app/lib/admin-alert-feedback", () => ({
  showAdminTransientErrorToast: jest.fn(),
}));

jest.mock("../../../app/i18n/config", () => ({
  i18n: { t: (key: string) => key },
}));

describe("PPB storefront preview", () => {
  let container: HTMLDivElement;
  let root: Root;
  let handlers: ReturnType<typeof usePpbPreviewReadinessHandlers> | null;

  beforeEach(() => {
    handlers = null;
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://admin.shopify.com/store/test/apps/only-bundles/app/bundles/product-page-bundle/configure/bundle-1",
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      Event: dom.window.Event,
      HTMLElement: dom.window.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mockPrepareStorefrontPreviewForOpen.mockResolvedValue({
      success: true,
      ready: true,
      previewToken: "signed-preview-token",
    });
    mockValidatePpbWidgetPlacementFromAppBridge.mockResolvedValue({
      ready: true,
      installationLink: null,
      message: null,
    });
    mockOpenPendingDashboardPreview.mockReturnValue({ closed: false });
    mockNavigatePendingDashboardPreview.mockReturnValue(true);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it("opens the signed saved-product URL without assigning a product template", async () => {
    const base = {
      apiKey: "sit-api-key",
      appEmbedEnabled: true,
      blockHandle: "bundle-product-page",
      bundle: {
        id: "bundle-1",
        status: "ACTIVE",
        shopifyProductHandle: "bundle-parent",
      },
      bundleProduct: {
        id: "gid://shopify/Product/1",
        onlineStoreUrl: "https://test-shop.myshopify.com/products/bundle-parent",
      },
      clearOperationAlert: jest.fn(),
      forceNavigation: false,
      formState: { templateName: "bundle-template" },
      isDirty: false,
      loadedBundleProduct: null,
      loaderData: {},
      navigate: jest.fn(),
      openThemeEditorForAppEmbed: jest.fn(),
      pricingState: { discountEnabled: false },
      productStatus: "ACTIVE",
      refreshParentProductStatusFromShopify: jest.fn(),
      setActiveSection: jest.fn(),
      setOperationAlert: jest.fn(),
      shop: "test-shop.myshopify.com",
      shopify: {
        app: { extensions: jest.fn() },
        saveBar: { leaveConfirmation: jest.fn() },
        toast: { show: jest.fn() },
      },
      stepsState: { addStep: jest.fn(), steps: [] },
      themeEditorUrl: "https://admin.shopify.com/themes/current/editor",
      triggerSaveBarIrritation: jest.fn(),
    } as any;
    const visibility = {
      bundleEmbedEnabled: false,
      upsellWidgetEnabled: false,
    } as any;
    const templateState = {
      hasPreview: false,
      setActiveTabIndex: jest.fn(),
      setHasPreview: jest.fn(),
      setReadinessOpen: jest.fn(),
      setSlideDir: jest.fn(),
      setSlideKey: jest.fn(),
    } as any;

    function Harness() {
      const value = usePpbPreviewReadinessHandlers({
        base,
        visibility,
        templateState,
      });
      handlers = value;
      return null;
    }

    flushSync(() => {
      root.render(React.createElement(Harness));
    });
    await act(async () => {
      await handlers!.handlePreviewBundle();
    });

    const submittedIntents = (global.fetch as jest.Mock).mock.calls.map(
      ([, init]) => (init?.body as FormData | undefined)?.get("intent"),
    );
    expect(submittedIntents).toEqual(["recordBundlePreview"]);
    expect(mockPrepareStorefrontPreviewForOpen).toHaveBeenCalledTimes(1);
    expect(mockValidatePpbWidgetPlacementFromAppBridge).toHaveBeenCalledTimes(1);
    expect(mockNavigatePendingDashboardPreview).toHaveBeenCalledWith(
      expect.anything(),
      "https://test-shop.myshopify.com/products/bundle-parent?wpb_preview=signed-preview-token",
    );
  });
});
