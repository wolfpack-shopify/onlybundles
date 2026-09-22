-- Storefront selection hint, updated only after Shopify policy activation is verified.
ALTER TABLE "Bundle" ADD COLUMN "runtimePolicyRevision" TEXT;
