/* eslint-disable testing-library/no-unnecessary-act -- Raw React createRoot needs act; no Testing Library utilities are used. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";

import { FpbStepCategoryAccordion } from "../../../app/routes/app/app.bundles.full-page-bundle.configure.$bundleId/sections/StepSetupCategoryAccordion";

describe("category product picker variant preselection", () => {
  let dom: JSDOM;
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><div id='root'></div>", {
      url: "https://app.example.com",
    });
    Object.assign(global, {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    host = document.getElementById("root")!;
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    delete (global as Record<string, unknown>).window;
    delete (global as Record<string, unknown>).document;
  });

  it("passes only the persisted variant IDs when reopening Shopify's product picker", async () => {
    const resourcePicker = jest.fn().mockResolvedValue(undefined);
    const category = {
      id: "category-1",
      name: "Category 1",
      collections: [],
      products: [
        {
          id: "gid://shopify/Product/100",
          title: "Amber Essence",
          variants: [
            { id: "gid://shopify/ProductVariant/201", title: "30ML" },
            { id: "gid://shopify/ProductVariant/203", title: "90ML" },
          ],
        },
      ],
    };
    const adapter = {
      categoryActiveTabs: {},
      categoryOpen: { "step-1__category-1": true },
      draggedCatKey: null,
      dragOverCatKey: null,
      handleCatDragEnd: jest.fn(),
      handleCatDragStart: jest.fn(),
      handleCatDrop: jest.fn(),
      hidePolarisModal: jest.fn(),
      markAsDirty: jest.fn(),
      openStepCategoryMultiLanguageModal: jest.fn(),
      setCategoryActiveTabs: jest.fn(),
      setCategoryOpen: jest.fn(),
      setDragOverCatKey: jest.fn(),
      shopify: { resourcePicker },
      showPolarisModal: jest.fn(),
      stepsState: { updateStepField: jest.fn() },
      styles: {},
      translationActionsDisabled: false,
    } as any;

    await act(async () => {
      root.render(
        React.createElement(FpbStepCategoryAccordion, {
          adapter,
          step: { id: "step-1", StepCategory: [category] },
          cat: category,
          catIndex: 0,
        }),
      );
    });

    const addProductsButton = Array.from(
      host.querySelectorAll<HTMLElement>("s-button"),
    ).find((button) => button.textContent?.trim() === "Add Products");
    expect(addProductsButton).toBeDefined();

    await act(async () => addProductsButton!.click());

    expect(resourcePicker).toHaveBeenCalledWith({
      type: "product",
      multiple: true,
      selectionIds: [
        {
          id: "gid://shopify/Product/100",
          variants: [
            { id: "gid://shopify/ProductVariant/201" },
            { id: "gid://shopify/ProductVariant/203" },
          ],
        },
      ],
    });
  });
});
