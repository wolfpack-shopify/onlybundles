import {
  createPpbLoadingOverlay,
  readPpbLoadingScreen,
} from "../../../app/storefront/ppb-loading-screen";

type MockNode = {
  tagName: string;
  children: MockNode[];
  attributes: Map<string, string>;
  src?: string;
  alt?: string;
  append: (...children: MockNode[]) => void;
  setAttribute: (name: string, value: string) => void;
  style: { setProperty: (name: string, value: string) => void };
};

function createMockDocument() {
  return {
    createElement(tagName: string): MockNode {
      return {
        tagName: tagName.toUpperCase(),
        children: [],
        attributes: new Map(),
        append(...children: MockNode[]) {
          this.children.push(...children);
        },
        setAttribute(name: string, value: string) {
          this.attributes.set(name, value);
        },
        style: { setProperty: jest.fn() },
      };
    },
  } as unknown as Document;
}

describe("PPB bootstrap loading screen", () => {
  it("renders the merchant loading media while the widget initializes", () => {
    const overlay = createPpbLoadingOverlay({
      gifUrl: "https://cdn.shopify.com/s/files/loading.gif",
      backgroundColor: "#123456",
    }, createMockDocument()) as unknown as MockNode;

    expect(overlay.attributes.get("role")).toBe("status");
    expect(overlay.attributes.get("aria-label")).toBe("Loading bundle");
    expect(overlay.children).toHaveLength(1);
    expect(overlay.children[0].tagName).toBe("IMG");
    expect(overlay.children[0].src).toBe("https://cdn.shopify.com/s/files/loading.gif");
  });

  it("renders the default loading animation when no merchant media is set", () => {
    const overlay = createPpbLoadingOverlay(null, createMockDocument()) as unknown as MockNode;

    expect(overlay.children).toHaveLength(1);
    expect(overlay.children[0].tagName).toBe("DIV");
    expect(overlay.children[0].attributes.get("role")).toBe("status");
  });

  it("reads the loading settings from the Shopify-hosted PPB runtime", () => {
    expect(readPpbLoadingScreen(JSON.stringify({
      loadingScreen: { gifUrl: null, backgroundColor: "#fedcba" },
    }))).toEqual({ gifUrl: null, backgroundColor: "#fedcba" });
    expect(readPpbLoadingScreen("{")).toBeNull();
  });
});
