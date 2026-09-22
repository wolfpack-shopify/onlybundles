import { BundleProductModal } from "../assets/bundle-modal-component.js";
import { sanitizeRichHtmlFragment } from "../assets/widgets/shared/rich-html.js";

window.__WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME__ = {
  create: (controller: unknown) => new BundleProductModal(controller),
  sanitize: sanitizeRichHtmlFragment,
};
