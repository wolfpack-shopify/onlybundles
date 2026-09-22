import { useTranslation } from "react-i18next";
import type {
  NormalizedThemeExtensionResource,
  ThemeExtensionStatus,
} from "../../../lib/theme-extension-status";

type DashboardStatusGridProps = {
  resources: NormalizedThemeExtensionResource[];
  error: boolean;
  loading: boolean;
  themeEditorUrl: string | null;
  onOpenEnableInstructions: () => void;
  onOpenThemeEditor: () => void;
  onRefresh: () => void | Promise<unknown>;
  enableActionRef?: { current: any };
};

const RESOURCE_LABEL_KEYS: Record<
  NormalizedThemeExtensionResource["handle"],
  string
> = {
  "bundle-app-embed": "dashboard.storefrontSetup.resourceLabels.bundleAppEmbed",
  "bundle-product-page": "dashboard.storefrontSetup.resourceLabels.bundleProductPage",
  "bundle-product-page-embed":
    "dashboard.storefrontSetup.resourceLabels.bundleProductPageEmbed",
  "bundle-page-builder-embed":
    "dashboard.storefrontSetup.resourceLabels.bundlePageBuilderEmbed",
  "bundle-upsell": "dashboard.storefrontSetup.resourceLabels.bundleUpsell",
};

export function getStorefrontStatusGroups(
  resources: NormalizedThemeExtensionResource[],
) {
  return {
    appEmbeds: resources.filter((resource) => resource.kind === "embed"),
    appBlocks: resources.filter((resource) => resource.kind === "block"),
  };
}

export function getStorefrontStatusPresentation(status: ThemeExtensionStatus): {
  tone: "success" | "info" | "neutral";
  labelKey: string;
} {
  if (status === "active") {
    return {
      tone: "success",
      labelKey: "dashboard.storefrontSetup.status.enabled",
    };
  }
  if (status === "available") {
    return {
      tone: "info",
      labelKey: "dashboard.storefrontSetup.status.ready",
    };
  }
  return {
    tone: "neutral",
    labelKey: "dashboard.storefrontSetup.status.unavailable",
  };
}

function StatusGrid({
  columns,
  resources,
  statusPlacement = "inline",
}: {
  columns: string;
  resources: NormalizedThemeExtensionResource[];
  statusPlacement?: "inline" | "trailing";
}) {
  const { t } = useTranslation();
  return (
    <s-grid gridTemplateColumns={columns} gap="small-200">
      {resources.map((resource) => {
        const presentation = getStorefrontStatusPresentation(resource.status);
        return (
          <s-box
            key={resource.handle}
            padding="small-200"
            background="subdued"
            borderRadius="base"
            blockSize="100%"
          >
            {statusPlacement === "trailing" ? (
              <s-grid
                gridTemplateRows="1fr auto"
                gap="small-200"
                blockSize="100%"
              >
                <s-text>{t(RESOURCE_LABEL_KEYS[resource.handle])}</s-text>
                <s-stack direction="inline" justifyContent="end">
                  <s-badge tone={presentation.tone}>
                    {t(presentation.labelKey)}
                  </s-badge>
                </s-stack>
              </s-grid>
            ) : (
              <s-stack
                direction="inline"
                alignItems="center"
                justifyContent="space-between"
                gap="base"
              >
                <s-text>{t(RESOURCE_LABEL_KEYS[resource.handle])}</s-text>
                <s-badge tone={presentation.tone}>
                  {t(presentation.labelKey)}
                </s-badge>
              </s-stack>
            )}
          </s-box>
        );
      })}
    </s-grid>
  );
}

export function DashboardStatusGrid({
  enableActionRef,
  error,
  loading,
  onOpenEnableInstructions,
  onOpenThemeEditor,
  onRefresh,
  resources,
  themeEditorUrl,
}: DashboardStatusGridProps) {
  const { t } = useTranslation();
  const { appEmbeds, appBlocks } = getStorefrontStatusGroups(resources);
  const appEmbedActive = appEmbeds.some(
    (resource) => resource.status === "active",
  );

  return (
    <s-section heading={t("dashboard.storefrontSetup.sectionHeading")}>
      <s-query-container containerName="storefront-status">
        <s-stack direction="block" gap="base">
          <s-grid
            gridTemplateColumns="@container (inline-size <= 600px) 1fr, 1fr auto"
            gap="base"
            alignItems="center"
          >
            <s-paragraph color="subdued">
              {t("dashboard.storefrontSetup.publishedThemeDescription")}
            </s-paragraph>
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-button
                variant="secondary"
                icon="edit"
                onClick={onOpenThemeEditor}
                disabled={!themeEditorUrl}
              >
                {t("dashboard.storefrontSetup.openThemeEditor")}
              </s-button>
              <s-button
                variant="secondary"
                icon="refresh"
                onClick={() => void onRefresh()}
                loading={loading}
              >
                {t("dashboard.storefrontSetup.refresh")}
              </s-button>
            </s-stack>
          </s-grid>

          {error ? (
            <s-banner tone="critical">
              <s-stack direction="inline" alignItems="center" gap="base">
                <s-text>{t("dashboard.storefrontSetup.errorDescription")}</s-text>
                <s-button variant="tertiary" onClick={() => void onRefresh()}>
                  {t("dashboard.storefrontSetup.retry")}
                </s-button>
              </s-stack>
            </s-banner>
          ) : loading && resources.length === 0 ? (
            <s-stack direction="inline" alignItems="center" gap="small">
              <s-spinner
                size="base"
                accessibilityLabel={t(
                  "dashboard.storefrontSetup.loadingDescription",
                )}
              />
              <s-text>{t("dashboard.storefrontSetup.loadingDescription")}</s-text>
            </s-stack>
          ) : (
            <s-grid
              gridTemplateColumns="@container (inline-size <= 700px) 1fr, 1fr 1fr"
              gap="base"
            >
              <s-stack direction="block" gap="small-200">
                <s-stack
                  direction="inline"
                  alignItems="center"
                  justifyContent="space-between"
                  gap="base"
                >
                  <s-heading>
                    {t("dashboard.storefrontSetup.appEmbedsHeading")}
                  </s-heading>
                  {!appEmbedActive && (
                    <s-button
                      ref={enableActionRef}
                      variant="tertiary"
                      onClick={onOpenEnableInstructions}
                      disabled={!themeEditorUrl}
                    >
                      {t("dashboard.storefrontSetup.activate")}
                    </s-button>
                  )}
                </s-stack>
                <StatusGrid columns="1fr" resources={appEmbeds} />
              </s-stack>
              <s-stack direction="block" gap="small-200">
                <s-heading>
                  {t("dashboard.storefrontSetup.appBlocksHeading")}
                </s-heading>
                <StatusGrid
                  columns="@container (inline-size <= 500px) 1fr, 1fr 1fr"
                  resources={appBlocks}
                  statusPlacement="trailing"
                />
              </s-stack>
            </s-grid>
          )}
        </s-stack>
      </s-query-container>
    </s-section>
  );
}
