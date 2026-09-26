import { resolveFpbTemplateSelection } from "../../../app/lib/fpb-template-selection";

describe("resolveFpbTemplateSelection", () => {
  it("resolves missing full-page template fields to the canonical Standard selection", () => {
    expect(resolveFpbTemplateSelection({
      bundleType: "full_page",
      bundleDesignTemplate: null,
      bundleDesignPresetId: null,
    })).toEqual({
      bundleDesignTemplate: "FBP_SIDE_FOOTER",
      bundleDesignPresetId: "STANDARD",
    });
  });

  it("resolves blank full-page template fields to the canonical Standard selection", () => {
    expect(resolveFpbTemplateSelection({
      bundleType: "full_page",
      bundleDesignTemplate: "",
      bundleDesignPresetId: " ",
    })).toEqual({
      bundleDesignTemplate: "FBP_SIDE_FOOTER",
      bundleDesignPresetId: "STANDARD",
    });
  });

  it("does not expose obsolete preset identifiers as storefront aliases", () => {
    expect(resolveFpbTemplateSelection({
      bundleType: "full_page",
      bundleDesignTemplate: "FBP_SIDE_FOOTER",
      bundleDesignPresetId: "DEFAULT",
    })).toEqual({
      bundleDesignTemplate: "FBP_SIDE_FOOTER",
      bundleDesignPresetId: "STANDARD",
    });
  });

  it("preserves saved full-page template selections", () => {
    expect(resolveFpbTemplateSelection({
      bundleType: "full_page",
      bundleDesignTemplate: "FBP_SIDE_FOOTER",
      bundleDesignPresetId: "CLASSIC",
    })).toEqual({
      bundleDesignTemplate: "FBP_SIDE_FOOTER",
      bundleDesignPresetId: "CLASSIC",
    });
  });

  it("does not apply full-page defaults to product-page bundles", () => {
    expect(resolveFpbTemplateSelection({
      bundleType: "product_page",
      bundleDesignTemplate: null,
      bundleDesignPresetId: null,
    })).toEqual({
      bundleDesignTemplate: null,
      bundleDesignPresetId: null,
    });
  });
});
