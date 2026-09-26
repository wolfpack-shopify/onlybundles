type BundleTemplateInput = {
  bundleType?: string | null;
  bundleDesignTemplate?: string | null;
  bundleDesignPresetId?: string | null;
};

type FpbTemplateSelection = {
  bundleDesignTemplate: string | null;
  bundleDesignPresetId: string | null;
};

const FPB_TEMPLATE = "FBP_SIDE_FOOTER";
const FPB_PRESETS = new Set(["STANDARD", "CLASSIC", "COMPACT", "HORIZONTAL"]);

function normalizeTemplateValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveFpbTemplateSelection(
  bundle: BundleTemplateInput,
): FpbTemplateSelection {
  const savedTemplate = normalizeTemplateValue(bundle.bundleDesignTemplate);
  const savedPreset = normalizeTemplateValue(bundle.bundleDesignPresetId);

  if (bundle.bundleType !== "full_page") {
    return {
      bundleDesignTemplate: savedTemplate,
      bundleDesignPresetId: savedPreset,
    };
  }

  if (savedTemplate !== FPB_TEMPLATE || !savedPreset || !FPB_PRESETS.has(savedPreset)) {
    return {
      bundleDesignTemplate: FPB_TEMPLATE,
      bundleDesignPresetId: "STANDARD",
    };
  }

  return {
    bundleDesignTemplate: savedTemplate,
    bundleDesignPresetId: savedPreset,
  };
}
