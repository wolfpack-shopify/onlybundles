import { createDefaultLoadingAnimation } from "../assets/widgets/shared/default-loading-animation.js";

export type PpbLoadingScreenSettings = {
  gifUrl?: string | null;
  backgroundColor?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createPpbLoadingOverlay(
  settings: PpbLoadingScreenSettings | null | undefined,
  runtimeDocument: Document = document,
) {
  const overlay = runtimeDocument.createElement("div");
  overlay.className = "bundle-loading-overlay is-visible";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-label", "Loading bundle");
  const backgroundColor = typeof settings?.backgroundColor === "string"
    && settings.backgroundColor.trim()
    ? settings.backgroundColor
    : "#ffffff";
  overlay.style.setProperty("--wpb-loading-screen-bg", backgroundColor);

  if (typeof settings?.gifUrl === "string" && settings.gifUrl.trim()) {
    const image = runtimeDocument.createElement("img");
    image.className = "bundle-loading-overlay__gif";
    image.src = settings.gifUrl;
    image.alt = "";
    overlay.append(image);
  } else {
    overlay.append(createDefaultLoadingAnimation(runtimeDocument));
  }

  return overlay;
}

export function readPpbLoadingScreen(runtimeJson: string | undefined) {
  if (!runtimeJson) return null;
  try {
    const runtime: unknown = JSON.parse(runtimeJson);
    return isRecord(runtime) && isRecord(runtime.loadingScreen)
      ? runtime.loadingScreen as PpbLoadingScreenSettings
      : null;
  } catch {
    return null;
  }
}
