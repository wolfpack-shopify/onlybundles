import { fullPageAnalyticsConfigMethods } from "../../../app/assets/widgets/full-page/methods/analytics-config-methods";

describe("FPB runtime Controls application", () => {
  it("applies the custom font, exposes selectors, and executes bundle-page script once", async () => {
    const setProperty = jest.fn();
    const runtimeWindow = {
      Shopify: { shop: "test.myshopify.com" },
      __bundleScriptRuns: 0,
      __WOLFPACK_SETTINGS_CONTROLS_RUNTIME__: {
        landingPage: {
          font: { customFont: "Inter" },
          scripts: { bundlePage: "window.__bundleScriptRuns += 1" },
          selectors: { addToCartButtons: ".add", buyNowButton: ".buy" },
        },
      },
    };
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: runtimeWindow });
    const context: any = {
      config: {},
      container: { dataset: {}, style: { setProperty, removeProperty: jest.fn() } },
      _runControlsScript: fullPageAnalyticsConfigMethods._runControlsScript,
      _getLandingPageControls: fullPageAnalyticsConfigMethods._getLandingPageControls,
    };

    try {
      await fullPageAnalyticsConfigMethods.loadControlsSettings.call(context);
      await fullPageAnalyticsConfigMethods.loadControlsSettings.call(context);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }

    expect(setProperty).toHaveBeenCalledWith("--wpb-controls-font-family", "Inter");
    expect(runtimeWindow.__bundleScriptRuns).toBe(1);
    expect((runtimeWindow as Record<string, unknown>).__WPB_BUNDLE_BUTTON_SELECTORS__).toEqual({
      addToCartButtons: ".add",
      buyNowButton: ".buy",
    });
  });

  it("selects the exact or base locale from the inline FPB runtime without fetching", async () => {
    const originalWindow = globalThis.window;
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { Shopify: { shop: "caller-controlled.myshopify.com", locale: "fr-CA" } },
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const context: any = {
      config: {},
      container: { dataset: { fpbRuntime: JSON.stringify({
        schemaVersion: 1,
        languages: {
          en: { activeLocale: "en", sharedCartLabels: {}, textOverrides: { nextButton: "Next" } },
          fr: { activeLocale: "fr", sharedCartLabels: {}, textOverrides: { nextButton: "Suivant" } },
        },
      }) } },
    };

    try {
      await fullPageAnalyticsConfigMethods.loadLanguageSettings.call(context);
    } finally {
      globalThis.fetch = originalFetch;
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(context.config.textOverrides).toEqual({ nextButton: "Suivant" });
  });

  it("mounts bundle-builder CSS on the FPB surface", async () => {
    const styles: any[] = [];
    const runtimeDocument = {
      head: { appendChild: (style: any) => styles.push(style) },
      querySelector: () => styles[0] ?? null,
      createElement: () => ({ dataset: {}, textContent: "", remove: jest.fn() }),
    };
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        Shopify: { shop: "test.myshopify.com" },
        __WOLFPACK_SETTINGS_CONTROLS_RUNTIME__: {
          landingPage: {
            css: { bundleBuilderPages: ".builder-marker { color: red; }" },
            font: {}, scripts: {}, selectors: {},
          },
        },
      },
    });
    Object.defineProperty(globalThis, "document", { configurable: true, value: runtimeDocument });
    const context = {
      config: {},
      container: { dataset: {}, style: { setProperty: jest.fn(), removeProperty: jest.fn() } },
      _runControlsScript: fullPageAnalyticsConfigMethods._runControlsScript,
      _getLandingPageControls: fullPageAnalyticsConfigMethods._getLandingPageControls,
    };

    try {
      await fullPageAnalyticsConfigMethods.loadControlsSettings.call(context);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    }

    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe(".builder-marker { color: red; }");
  });
});
