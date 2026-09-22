import React from "react";

import { FpbDiscountMessagingOptions } from "../../../app/routes/app/app.bundles.full-page-bundle.configure.$bundleId/sections/DiscountMessagingOptions";
import {
  PpbDiscountMessagingOptions,
  type PpbDiscountMessagingOptionsProps,
} from "../../../app/routes/app/app.bundles.product-page-bundle.configure.$bundleId/PpbDiscountMessagingOptions";
import { DiscountMethod } from "../../../app/types/pricing";

jest.mock("../../../app/i18n/config", () => ({
  translateAdmin: (key: string) => key,
}));

function findElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement) => boolean,
): React.ReactElement[] {
  const matches: React.ReactElement[] = [];
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement(child)) continue;
    if (predicate(child)) matches.push(child);
    matches.push(...findElements(child.props.children, predicate));
  }
  return matches;
}

function makePricingState(discountType: DiscountMethod) {
  return {
    discountMessagingEnabled: true,
    discountRules: [],
    discountType,
    setDiscountMessagingEnabled: jest.fn(),
  };
}

function renderFpb(discountType: DiscountMethod) {
  return FpbDiscountMessagingOptions({
    localization: {
      activeLocale: "en",
      enabled: false,
      globalSuccessMessage: "",
      locales: [],
      ruleMessagesByLocale: {},
      setActiveLocale: jest.fn(),
      setEnabled: jest.fn(),
      setGlobalSuccessMessage: jest.fn(),
      setRuleMessagesByLocale: jest.fn(),
      setSuccessMessageByLocale: jest.fn(),
      successMessageByLocale: {},
    },
    markAsDirty: jest.fn(),
    normalizedRuleMessages: {},
    onShowVariables: jest.fn(),
    pricingState: makePricingState(discountType) as never,
    styles: {},
  });
}

function renderPpb(discountType: DiscountMethod) {
  return PpbDiscountMessagingOptions({
    activeDiscountLocale: "en",
    discountMessagingMultiLanguageEnabled: false,
    globalSuccessMessage: "",
    markAsDirty: jest.fn(),
    pricingState: makePricingState(discountType),
    ruleMessages: {},
    ruleMessagesByLocale: {},
    setActiveDiscountLocale: jest.fn(),
    setDiscountMessagingMultiLanguageEnabled: jest.fn(),
    setGlobalSuccessMessage: jest.fn(),
    setIsDiscountVariablesModalOpen: jest.fn(),
    setRuleMessagesByLocale: jest.fn(),
    setSuccessMessageByLocale: jest.fn(),
    shopLocales: [],
    successMessageByLocale: {},
    updateRuleMessage: jest.fn(),
  } as unknown as PpbDiscountMessagingOptionsProps);
}

function expectCanonicalGuidanceBanner(view: React.ReactNode) {
  const banners = findElements(view, (element) => element.type === "s-banner");
  expect(banners).toHaveLength(1);
  expect(banners[0].props).toMatchObject({
    dismissible: true,
    heading: "tooltips.discountMessaging.title",
    tone: "info",
  });
  expect(banners[0].props.children).toBe(
    "adminExtracted.appBundlesFullPageBundleConfigure.sections.discountmessagingoptions.discountMessagingDisplaysTheTotalQuantityToClaimOfferBuyGetToEns",
  );
}

describe("Buy X Get Y discount messaging guidance", () => {
  it("uses the canonical dismissible information banner in PPB", () => {
    expectCanonicalGuidanceBanner(renderPpb(DiscountMethod.BUY_X_GET_Y));
  });

  it("uses the canonical dismissible information banner in FPB", () => {
    expectCanonicalGuidanceBanner(renderFpb(DiscountMethod.BUY_X_GET_Y));
  });

  it("does not show method-specific guidance for percentage discounts", () => {
    expect(findElements(
      renderPpb(DiscountMethod.PERCENTAGE_OFF),
      (element) => element.type === "s-banner",
    )).toHaveLength(0);
    expect(findElements(
      renderFpb(DiscountMethod.PERCENTAGE_OFF),
      (element) => element.type === "s-banner",
    )).toHaveLength(0);
  });
});
