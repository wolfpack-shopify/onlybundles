import { METAFIELD_KEYS, METAFIELD_NAMESPACE } from "../../../../constants/metafields";
import { AppLogger } from "../../../../lib/logger";

const VARIANT_DEFINITIONS = [
  {
    name: "Bundle Component Variants",
    key: METAFIELD_KEYS.COMPONENT_REFERENCE,
    type: "list.variant_reference",
    access: { admin: "MERCHANT_READ_WRITE", storefront: "PUBLIC_READ" },
  },
  {
    name: "Component Quantities",
    key: METAFIELD_KEYS.COMPONENT_QUANTITIES,
    type: "list.number_integer",
    validations: [{ name: "min", value: "1" }, { name: "max", value: "100" }],
    access: { admin: "MERCHANT_READ_WRITE", storefront: "PUBLIC_READ" },
  },
  {
    name: "Bundle Price Adjustment",
    key: "price_adjustment",
    type: "json",
    access: { admin: "MERCHANT_READ_WRITE", storefront: "NONE" },
  },
  {
    name: "Bundle Widget Configuration",
    key: METAFIELD_KEYS.BUNDLE_UI_CONFIG,
    type: "json",
    access: { admin: "MERCHANT_READ_WRITE", storefront: "PUBLIC_READ" },
  },
  {
    name: "Component Pricing",
    key: METAFIELD_KEYS.COMPONENT_PRICING,
    type: "json",
    access: { admin: "MERCHANT_READ_WRITE", storefront: "PUBLIC_READ" },
  },
  {
    name: "Bundle Parent Policy",
    key: "bundle_parent_policy",
    type: "json",
    access: { admin: "MERCHANT_READ", storefront: "NONE" },
  },
] as const;

export async function ensureVariantBundleMetafieldDefinitions(admin: any) {
  let success = true;
  for (const definition of VARIANT_DEFINITIONS) {
    try {
      const response = await admin.graphql(`
        mutation CreateVariantMetafieldDefinition($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id key }
            userErrors { field message code }
          }
        }
      `, {
        variables: {
          definition: {
            ...definition,
            namespace: METAFIELD_NAMESPACE,
            ownerType: "PRODUCTVARIANT",
          },
        },
      });
      const data = await response.json();
      const errors = data.data?.metafieldDefinitionCreate?.userErrors ?? [];
      if (data.errors?.length || errors.some((error: any) => error.code !== "TAKEN")) {
        success = false;
      }
      if (
        errors.some((error: any) => error.code === "TAKEN")
        && definition.access.admin === "MERCHANT_READ"
      ) {
        const updateResponse = await admin.graphql(`
          mutation UpdateVariantMetafieldDefinition($definition: MetafieldDefinitionUpdateInput!) {
            metafieldDefinitionUpdate(definition: $definition) {
              updatedDefinition { access { admin storefront } }
              userErrors { field message code }
            }
          }
        `, {
          variables: {
            definition: {
              namespace: METAFIELD_NAMESPACE,
              key: definition.key,
              ownerType: "PRODUCTVARIANT",
              access: definition.access,
            },
          },
        });
        const updateData = await updateResponse.json();
        const result = updateData.data?.metafieldDefinitionUpdate;
        if (
          updateData.errors?.length
          || result?.userErrors?.length
          || result?.updatedDefinition?.access?.admin !== "MERCHANT_READ"
        ) {
          success = false;
        }
      }
    } catch (error) {
      success = false;
      AppLogger.error("Failed to ensure variant metafield definition", {
        component: "definitions.server",
        key: definition.key,
      }, error);
    }
  }
  return success;
}
