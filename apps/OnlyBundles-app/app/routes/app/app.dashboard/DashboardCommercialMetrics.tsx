import { Fragment, Suspense } from "react";
import { Await, useRevalidator } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import type { DashboardCommercialMetrics as DashboardCommercialMetricsData } from "../../../services/analytics/dashboard-commercial-metrics.server";

type DashboardCommercialMetricsProps = {
  metrics: DashboardCommercialMetricsData;
};

function formatCurrency(
  amountCents: number | null,
  currencyCode: string,
  locale: string,
  unavailable: string,
) {
  if (amountCents === null) return unavailable;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
  }).format(amountCents / 100);
}

export function DashboardCommercialMetrics({
  metrics,
}: DashboardCommercialMetricsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const unavailable = t("dashboard.commercialMetrics.unavailable");
  const metricItems = [
    {
      label: t("dashboard.commercialMetrics.bundleRevenue"),
      value: formatCurrency(
        metrics.totalBundleRevenue,
        metrics.currencyCode,
        locale,
        unavailable,
      ),
    },
    {
      label: t("dashboard.commercialMetrics.ordersWithBundles"),
      value: new Intl.NumberFormat(locale).format(metrics.ordersWithBundles),
    },
    {
      label: t("dashboard.commercialMetrics.averageOrderValue"),
      value: formatCurrency(
        metrics.averageOrderValue,
        metrics.currencyCode,
        locale,
        unavailable,
      ),
    },
    {
      label: t("dashboard.commercialMetrics.viewToOrderConversion"),
      value:
        metrics.viewToOrderRate === null
          ? unavailable
          : `${new Intl.NumberFormat(locale, {
              maximumFractionDigits: 2,
            }).format(metrics.viewToOrderRate)}%`,
    },
  ];

  return (
    <s-section heading={t("dashboard.commercialMetrics.heading")}>
      <s-stack direction="block" gap="base">
        <s-text>
          {t("dashboard.commercialMetrics.description", {
            days: metrics.days,
            currency: metrics.currencyCode,
          })}
        </s-text>
        <s-grid
          gridTemplateColumns="@container (inline-size <= 600px) 1fr, 1fr auto 1fr auto 1fr auto 1fr"
          gap="small"
        >
          {metricItems.map((metric, index) => (
            <Fragment key={metric.label}>
              {index > 0 && <s-divider direction="block" />}
              <s-clickable
                onClick={() => window.open("/app/attribution", "_self")}
                paddingBlock="small-400"
                paddingInline="small-100"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small-200">
                  <s-heading>{metric.label}</s-heading>
                  <s-text type="strong">{metric.value}</s-text>
                </s-stack>
              </s-clickable>
            </Fragment>
          ))}
        </s-grid>
      </s-stack>
    </s-section>
  );
}

function DashboardCommercialMetricsLoading() {
  const { t } = useTranslation();
  return (
    <s-section heading={t("dashboard.commercialMetrics.heading")}>
      <s-stack direction="inline" alignItems="center" gap="small">
        <s-spinner
          size="base"
          accessibilityLabel={t("dashboard.commercialMetrics.loading")}
        />
        <s-text>{t("dashboard.commercialMetrics.loading")}</s-text>
      </s-stack>
    </s-section>
  );
}

function DashboardCommercialMetricsError() {
  const { t } = useTranslation();
  const revalidator = useRevalidator();
  return (
    <s-banner tone="critical" heading={t("dashboard.commercialMetrics.errorHeading")}>
      <s-stack direction="inline" alignItems="center" gap="base">
        <s-text>{t("dashboard.commercialMetrics.errorDescription")}</s-text>
        <s-button variant="tertiary" onClick={() => revalidator.revalidate()}>
          {t("dashboard.commercialMetrics.retry")}
        </s-button>
      </s-stack>
    </s-banner>
  );
}

export function DashboardDeferredCommercialMetrics({
  metrics,
}: {
  metrics: Promise<DashboardCommercialMetricsData>;
}) {
  return (
    <Suspense fallback={<DashboardCommercialMetricsLoading />}>
      <Await resolve={metrics} errorElement={<DashboardCommercialMetricsError />}>
        {(resolvedMetrics) => (
          <DashboardCommercialMetrics metrics={resolvedMetrics} />
        )}
      </Await>
    </Suspense>
  );
}
