import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { DashboardCommercialMetrics } from "../../../app/routes/app/app.dashboard/DashboardCommercialMetrics";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "en-IN", language: "en-IN" },
  }),
}));

describe("DashboardCommercialMetrics", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      Event: dom.window.Event,
      MouseEvent: dom.window.MouseEvent,
      HTMLElement: dom.window.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    Object.defineProperty(window, "open", {
      configurable: true,
      value: jest.fn(),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it("renders the four merchant metrics using the Shopify shop currency", () => {
    const view = renderToStaticMarkup(
      React.createElement(DashboardCommercialMetrics, {
        metrics: {
          days: 30,
          currencyCode: "INR",
          totalBundleRevenue: 123_456,
          ordersWithBundles: 12,
          averageOrderValue: 10_288,
          viewToOrderRate: 4.25,
        },
      }),
    );

    expect(view).toContain("dashboard.commercialMetrics.bundleRevenue");
    expect(view).toContain("dashboard.commercialMetrics.ordersWithBundles");
    expect(view).toContain("dashboard.commercialMetrics.averageOrderValue");
    expect(view).toContain("dashboard.commercialMetrics.viewToOrderConversion");
    expect(view).toContain("₹1,234.56");
    expect(view).toContain("4.25%");
    expect(view).not.toContain("href=");
  });

  it("uses Shopify embedded navigation for every metric tile", () => {
    flushSync(() => {
      root.render(
        React.createElement(DashboardCommercialMetrics, {
          metrics: {
            days: 30,
            currencyCode: "INR",
            totalBundleRevenue: 123_456,
            ordersWithBundles: 12,
            averageOrderValue: 10_288,
            viewToOrderRate: 4.25,
          },
        }),
      );
    });

    const metricTiles = container.querySelectorAll("s-clickable");
    expect(metricTiles).toHaveLength(4);

    metricTiles.forEach((metricTile) => {
      flushSync(() => {
        metricTile.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    });

    expect(window.open).toHaveBeenCalledTimes(4);
    expect(window.open).toHaveBeenCalledWith("/app/attribution", "_self");
  });

  it("shows an unavailable value when a rate has no valid denominator", () => {
    const view = renderToStaticMarkup(
      React.createElement(DashboardCommercialMetrics, {
        metrics: {
          days: 30,
          currencyCode: "INR",
          totalBundleRevenue: 0,
          ordersWithBundles: 0,
          averageOrderValue: null,
          viewToOrderRate: null,
        },
      }),
    );

    expect(view).toContain("dashboard.commercialMetrics.unavailable");
  });
});
