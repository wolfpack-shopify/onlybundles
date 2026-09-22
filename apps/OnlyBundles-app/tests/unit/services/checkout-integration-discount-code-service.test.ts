import {
  CheckoutIntegrationDiscountCodeService,
} from "../../../app/services/checkout-integration-discount-code-service.server";
import { createMockGraphQLResponse, mockShopifyAdmin } from "../../setup";

const MOCK_DISCOUNT_FUNCTION_ID = "gid://shopify/ShopifyFunction/discount-function-1";

function discountFunctionMock() {
  return createMockGraphQLResponse({
    shopifyFunctions: {
      edges: [{
        node: {
          id: MOCK_DISCOUNT_FUNCTION_ID,
          title: "bundle-discount-function",
          apiType: "discount",
          description: "bundle-discount-function",
        },
      }],
    },
  });
}

describe("CheckoutIntegrationDiscountCodeService", () => {
  const shopDomain = "test-shop.myshopify.com";

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 6, 2, 10, 0, 0));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reuses an existing active discount code without creating a new one", async () => {
    mockShopifyAdmin.graphql
      .mockResolvedValueOnce(discountFunctionMock())
      .mockResolvedValueOnce(createMockGraphQLResponse({
        discountNodes: {
          nodes: [{
            id: "gid://shopify/DiscountCodeNode/100",
            configuration: { id: "gid://shopify/Metafield/1" },
            discount: {
              __typename: "DiscountCodeApp",
              title: "WPB checkout integration - GoKwik",
              status: "ACTIVE",
              appDiscountType: {
                functionId: MOCK_DISCOUNT_FUNCTION_ID,
              },
              codes: {
                nodes: [{ code: "WPB-GOKWIK" }],
              },
              endsAt: null,
            },
          }],
        },
      }));

    mockShopifyAdmin.graphql.mockResolvedValue(createMockGraphQLResponse({discountCodeAppUpdate: {codeAppDiscount: {discountId: "gid://shopify/DiscountCodeNode/100"}, userErrors: []}}));
    const result = await CheckoutIntegrationDiscountCodeService.createForProvider(
      mockShopifyAdmin,
      shopDomain,
      "gokwik",
    );

    expect(result).toMatchObject({
      success: true,
      providerId: "gokwik",
      discountId: "gid://shopify/DiscountCodeNode/100",
      code: "WPB-GOKWIK",
    });

    expect(mockShopifyAdmin.graphql).toHaveBeenCalledTimes(3);
    expect(mockShopifyAdmin.graphql.mock.calls[2][1].variables.codeAppDiscount.metafields[0].key).toBe("discount_configuration");
    expect(mockShopifyAdmin.graphql.mock.calls[2][1].variables.codeAppDiscount.metafields[0]).not.toHaveProperty("id");
    const lookupCall = mockShopifyAdmin.graphql.mock.calls[1];
    expect(lookupCall[0]).toContain("discountNodes");
  });

  it("creates a stable reusable discount code when no active code exists", async () => {
    mockShopifyAdmin.graphql
      .mockResolvedValueOnce(discountFunctionMock())
      .mockResolvedValueOnce(createMockGraphQLResponse({
        discountNodes: { nodes: [] },
      }))
      .mockResolvedValueOnce(createMockGraphQLResponse({
        discountCodeAppCreate: {
          codeAppDiscount: {
            discountId: "gid://shopify/DiscountCodeNode/1",
            codes: { nodes: [{ code: "WPB-GOKWIK" }] },
            endsAt: null,
          },
          userErrors: [],
        },
      }));

    const result = await CheckoutIntegrationDiscountCodeService.createForProvider(
      mockShopifyAdmin,
      shopDomain,
      "gokwik",
    );

    expect(result).toMatchObject({
      success: true,
      providerId: "gokwik",
      discountId: "gid://shopify/DiscountCodeNode/1",
      code: "WPB-GOKWIK",
    });

    const createCall = mockShopifyAdmin.graphql.mock.calls[2];
    expect(createCall[0]).toContain("discountCodeAppCreate");
    expect(createCall[1].variables.codeAppDiscount).toMatchObject({
      title: "WPB checkout integration - GoKwik",
      code: "WPB-GOKWIK",
      functionId: MOCK_DISCOUNT_FUNCTION_ID,
      appliesOncePerCustomer: false,
      discountClasses: ["PRODUCT"],
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: false,
        shippingDiscounts: false,
      },
    });
    expect(createCall[1].variables.codeAppDiscount.usageLimit).toBeUndefined();
    expect(createCall[1].variables.codeAppDiscount.endsAt).toBeUndefined();
    expect(createCall[1].variables.codeAppDiscount.metafields).toEqual([
      expect.objectContaining({
        namespace: "$app",
        key: "discount_configuration",
        type: "json",
        value: JSON.stringify({
          version: 1,
          role: "checkout_integration",
          code: "WPB-GOKWIK",
          windowStart: "00:00:00",
          windowEnd: "23:59:59",
          providerId: "gokwik",
          shopDomain,
        }),
      }),
    ]);
  });

  it("does not create a code when the discount function is missing", async () => {
    mockShopifyAdmin.graphql.mockResolvedValueOnce(createMockGraphQLResponse({
      shopifyFunctions: { edges: [] },
    }));

    const result = await CheckoutIntegrationDiscountCodeService.createForProvider(
      mockShopifyAdmin,
      shopDomain,
      "shopflo",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("bundle-discount-function");
    expect(mockShopifyAdmin.graphql).toHaveBeenCalledTimes(1);
  });

  it("surfaces Shopify user errors", async () => {
    mockShopifyAdmin.graphql
      .mockResolvedValueOnce(discountFunctionMock())
      .mockResolvedValueOnce(createMockGraphQLResponse({
        discountNodes: { nodes: [] },
      }))
      .mockResolvedValueOnce(createMockGraphQLResponse({
        discountCodeAppCreate: {
          codeAppDiscount: null,
          userErrors: [{ field: ["functionId"], message: "Function not found" }],
        },
      }));

    const result = await CheckoutIntegrationDiscountCodeService.createForProvider(
      mockShopifyAdmin,
      shopDomain,
      "gokwik",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Function not found");
  });

  it("creates deterministic discount metadata for Shopflo handoff", async () => {
    mockShopifyAdmin.graphql
      .mockResolvedValueOnce(discountFunctionMock())
      .mockResolvedValueOnce(createMockGraphQLResponse({
        discountNodes: { nodes: [] },
      }))
      .mockResolvedValueOnce(createMockGraphQLResponse({
        discountCodeAppCreate: {
          codeAppDiscount: {
            discountId: "gid://shopify/DiscountCodeNode/2",
            codes: { nodes: [{ code: "WPB-SHOPFLO" }] },
            endsAt: null,
          },
          userErrors: [],
        },
      }));

    await CheckoutIntegrationDiscountCodeService.createForProvider(
      mockShopifyAdmin,
      shopDomain,
      "shopflo",
    );

    const createCall = mockShopifyAdmin.graphql.mock.calls[2];
    expect(createCall[1].variables.codeAppDiscount).toMatchObject({
      title: "WPB checkout integration - Shopflo",
      code: "WPB-SHOPFLO",
    });
    expect(JSON.parse(createCall[1].variables.codeAppDiscount.metafields[0].value)).toMatchObject({
      providerId: "shopflo",
    });
  });

  it("recovers gracefully if discount creation indicates the code already exists", async () => {
    mockShopifyAdmin.graphql
      .mockResolvedValueOnce(discountFunctionMock())
      .mockResolvedValueOnce(createMockGraphQLResponse({
        discountNodes: { nodes: [] },
      }))
      .mockResolvedValueOnce(createMockGraphQLResponse({
        discountCodeAppCreate: {
          codeAppDiscount: null,
          userErrors: [{ field: ["codeAppDiscount", "code"], message: "The discount code already exists." }],
        },
      }))
      .mockResolvedValueOnce(createMockGraphQLResponse({
        discountNodes: {
          nodes: [{
            id: "gid://shopify/DiscountCodeNode/3",
            discount: {
              __typename: "DiscountCodeApp",
              title: "WPB checkout integration - GoKwik",
              status: "ACTIVE",
              appDiscountType: { functionId: MOCK_DISCOUNT_FUNCTION_ID },
              codes: { nodes: [{ code: "WPB-GOKWIK" }] },
            },
          }],
        },
      }));

    mockShopifyAdmin.graphql.mockResolvedValue(createMockGraphQLResponse({discountCodeAppUpdate: {codeAppDiscount: {discountId: "gid://shopify/DiscountCodeNode/3"}, userErrors: []}}));
    const result = await CheckoutIntegrationDiscountCodeService.createForProvider(
      mockShopifyAdmin,
      shopDomain,
      "gokwik",
    );

    expect(result).toMatchObject({
      success: true,
      providerId: "gokwik",
      code: "WPB-GOKWIK",
    });
  });
});
