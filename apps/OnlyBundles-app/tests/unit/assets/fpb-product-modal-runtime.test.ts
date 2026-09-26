import { ensureFpbProductModalRuntime } from "../../../app/assets/widgets/full-page/product-modal-runtime";

describe("FPB product modal runtime loader", () => {
  it("loads the lazy modal asset once and reuses its runtime", async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const runtime = { create: jest.fn(), sanitize: jest.fn() };
    const runtimeWindow: any = {};
    let appendCount = 0;
    const runtimeDocument: any = {
      querySelector: jest.fn().mockReturnValue(null),
      createElement: jest.fn(() => {
        const listeners: Record<string, () => void> = {};
        return {
          src: "",
          defer: false,
          addEventListener: (name: string, listener: () => void) => {
            listeners[name] = listener;
          },
          listeners,
        };
      }),
      body: {
        append: (script: any) => {
          appendCount += 1;
          runtimeWindow.__WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME__ = runtime;
          script.listeners.load();
        },
      },
    };
    Object.defineProperty(globalThis, "window", { configurable: true, value: runtimeWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: runtimeDocument });

    try {
      const controller = { container: { dataset: { fpbModalScriptUrl: "/modal.js" } } };
      await expect(ensureFpbProductModalRuntime(controller)).resolves.toBe(runtime);
      await expect(ensureFpbProductModalRuntime(controller)).resolves.toBe(runtime);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    }

    expect(appendCount).toBe(1);
  });

  it("clears a failed load so the next product interaction can retry", async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const runtime = { create: jest.fn(), sanitize: jest.fn() };
    const runtimeWindow: any = {};
    let appendCount = 0;
    const runtimeDocument: any = {
      querySelector: jest.fn().mockReturnValue(null),
      createElement: jest.fn(() => {
        const listeners: Record<string, () => void> = {};
        return {
          src: "",
          defer: false,
          addEventListener: (name: string, listener: () => void) => {
            listeners[name] = listener;
          },
          listeners,
        };
      }),
      body: {
        append: (script: any) => {
          appendCount += 1;
          if (appendCount === 1) {
            script.listeners.error();
            return;
          }
          runtimeWindow.__WOLFPACK_FPB_PRODUCT_MODAL_RUNTIME__ = runtime;
          script.listeners.load();
        },
      },
    };
    Object.defineProperty(globalThis, "window", { configurable: true, value: runtimeWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: runtimeDocument });

    try {
      const controller = { container: { dataset: { fpbModalScriptUrl: "/modal.js" } } };
      await expect(ensureFpbProductModalRuntime(controller)).rejects.toThrow(
        "FPB product modal asset failed to load",
      );
      await expect(ensureFpbProductModalRuntime(controller)).resolves.toBe(runtime);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    }

    expect(appendCount).toBe(2);
  });
});
