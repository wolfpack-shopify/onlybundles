type ProductModalRuntime = {
  create: (controller: unknown) => { open: (...args: any[]) => void };
  sanitize: (
    source: unknown,
    profile: "product-description" | "review-badge",
    runtimeWindow?: Window,
  ) => DocumentFragment;
};

declare global {
  interface Window {
    __WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME__?: ProductModalRuntime;
    __WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME_PROMISE__?: Promise<ProductModalRuntime>;
  }
}

export function ensureFpbProductModalRuntime(controller: any): Promise<ProductModalRuntime> {
  if (window.__WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME__) {
    return Promise.resolve(window.__WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME__);
  }
  if (window.__WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME_PROMISE__) {
    return window.__WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME_PROMISE__;
  }
  const src = controller?.container?.dataset?.fpbModalScriptUrl;
  if (!src) return Promise.reject(new Error("FPB product modal asset URL is missing"));

  const loadPromise = new Promise<ProductModalRuntime>((resolve, reject) => {
    const finish = () => {
      const runtime = window.__WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME__;
      if (runtime) resolve(runtime);
      else reject(new Error("FPB product modal runtime did not initialize"));
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("FPB product modal asset failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("FPB product modal asset failed to load")), { once: true });
    document.body.append(script);
  });
  window.__WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME_PROMISE__ = loadPromise.catch((error) => {
    delete window.__WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME_PROMISE__;
    throw error;
  });
  return window.__WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME_PROMISE__;
}

export async function ensureFpbProductModal(controller: any) {
  if (controller.productModal) return controller.productModal;
  const runtime = await ensureFpbProductModalRuntime(controller);
  controller.productModal = runtime.create(controller);
  return controller.productModal;
}
