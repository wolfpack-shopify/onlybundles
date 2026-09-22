import { json } from "@remix-run/node";
import { useNavigate } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminSectionLoadingState } from "../../components/AdminSectionLoadingState";
import { APP_BRAND } from "../../lib/app-brand";
import styles from "../../styles/routes/app-index.module.css";
import { translateAdmin } from "~/i18n/config";

export const APP_SPLASH_SESSION_KEY = "only-bundles:app-splash-seen";

// The authenticated layout owns Shopify authentication. This child loader must
// not repeat authenticate.admin() because parent and child loaders run together.
export const loader = async () => {
  return json(null);
};

export function getInitialAppDestination(
  hasSeenSplash: boolean
): "/app/dashboard" | null {
  return hasSeenSplash ? "/app/dashboard" : null;
}

export function AppRouteLoadingWorkspace() {
  const { t } = useTranslation();

  return (
    <main className={styles.loadingWorkspace} aria-live="polite">
      <AdminSectionLoadingState label={t("common.loading.workspace")} />
    </main>
  );
}

export default function AppIndex() {
  const navigate = useNavigate();
  const [showSplash, setShowSplash] = useState(false);
  const hasResolvedEntry = useRef(false);

  useEffect(() => {
    if (hasResolvedEntry.current) return;
    hasResolvedEntry.current = true;

    const hasSeenSplash =
      window.sessionStorage.getItem(APP_SPLASH_SESSION_KEY) === "seen";
    const destination = getInitialAppDestination(hasSeenSplash);

    if (destination) {
      navigate(destination, { replace: true });
      return;
    }

    window.sessionStorage.setItem(APP_SPLASH_SESSION_KEY, "seen");
    setShowSplash(true);
  }, [navigate]);

  if (!showSplash) return <AppRouteLoadingWorkspace />;

  return (
    <main className={styles.splashViewport}>
      <s-page inlineSize="small">
        <s-section>
          <s-box paddingBlock="large-500">
            <s-stack direction="block" gap="large-300" alignItems="center">
              <s-box inlineSize="96px">
                <s-image
                  src={APP_BRAND.markPath}
                  alt={APP_BRAND.name}
                  aspectRatio="1/1"
                  objectFit="contain"
                />
              </s-box>
              <s-stack direction="block" gap="small-200" alignItems="center">
                <s-heading>{APP_BRAND.name}</s-heading>
                <s-paragraph color="subdued">
                  {translateAdmin("adminExtracted.appIndex.valueStatement")}
                </s-paragraph>
              </s-stack>
              <s-button
                variant="primary"
                onClick={() => navigate("/app/dashboard")}
              >
                {translateAdmin("adminExtracted.appIndex.takeMeToMyDashboard")}
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      </s-page>
    </main>
  );
}
