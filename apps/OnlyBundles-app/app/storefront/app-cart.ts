import { initCartPropertiesCleaner } from "./cart-properties-cleanup.js";
import { initCartTierProgressBar, syncCartTierProgressBar } from "./cart-tier-progress-bar.js";

initCartPropertiesCleaner();
initCartTierProgressBar();
document.addEventListener("shopify:section:load", () => void syncCartTierProgressBar());
