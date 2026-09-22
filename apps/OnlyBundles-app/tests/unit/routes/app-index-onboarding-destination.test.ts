import {
  default as AppIndex,
  APP_SPLASH_SESSION_KEY,
  AppRouteLoadingWorkspace,
  getInitialAppDestination,
} from "../../../app/routes/app/app._index";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { flushSync } from "react-dom";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";

const navigate = jest.fn();
jest.mock("@remix-run/react", () => ({
  useNavigate: () => navigate,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "common.loading.appLabel": "Loading Wolfpack Product Bundles",
        "common.loading.workspace": "Loading your workspace",
      };
      return translations[key] ?? key;
    },
  }),
}));

describe("initial app destination", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://admin.shopify.com/app",
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      Event: dom.window.Event,
      MouseEvent: dom.window.MouseEvent,
      HTMLElement: dom.window.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    navigate.mockReset();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/app");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it("opens the dashboard after the splash has been seen in this Admin tab", () => {
    expect(getInitialAppDestination(true)).toBe("/app/dashboard");
  });

  it("keeps the first app entry on the splash screen", () => {
    expect(getInitialAppDestination(false)).toBeNull();
  });

  it("renders Polaris workspace feedback while client routing resolves", () => {
    const markup = renderToStaticMarkup(React.createElement(AppRouteLoadingWorkspace));

    expect(markup).toContain("<s-spinner");
    expect(markup).toContain('accessibilityLabel="Loading your workspace"');
    expect(markup).toContain("Loading your workspace");
  });

  it("shows the branded splash on first entry and opens the dashboard", async () => {
    flushSync(() => {
      root.render(React.createElement(AppIndex));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Only Bundles");
    expect(container.textContent).toContain(
      "Boost sales and average order value with customizable bundles.",
    );
    expect(container.textContent).toContain("Take me to my dashboard");
    expect(window.sessionStorage.getItem(APP_SPLASH_SESSION_KEY)).toBe("seen");
    expect(navigate).not.toHaveBeenCalled();

    const dashboardButton = Array.from(
      container.querySelectorAll<HTMLElement>("button, s-button"),
    ).find((action) =>
      action.textContent?.includes("Take me to my dashboard"),
    );

    flushSync(() => {
      dashboardButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(navigate).toHaveBeenCalledWith("/app/dashboard");
  });

  it("routes later app-name visits straight to the dashboard", async () => {
    window.sessionStorage.setItem(APP_SPLASH_SESSION_KEY, "seen");

    flushSync(() => {
      root.render(React.createElement(AppIndex));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(navigate).toHaveBeenCalledWith("/app/dashboard", { replace: true });
    expect(container.textContent).not.toContain("Take me to my dashboard");
  });
});
