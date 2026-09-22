import { buildBundlePolicyMetafield, readPublishedBundlePolicy } from '../../../app/services/bundle-authorization-policy.server';
it('publishes one policy with Shopify compareDigest while preserving other opaque entries', async () => {
  const admin = { graphql: jest.fn().mockResolvedValue({ json: async () => ({ data: { shop: {
    id: 'gid://shopify/Shop/1', policy: { value: JSON.stringify({ other: { revision: 'keep', pricingMode: 'standard' } }), compareDigest: 'digest' },
  } } }) }) };
  const field = await buildBundlePolicyMetafield({ admin, bundleId: 'bundle-1', revision: 'new', pricingMode: 'scheduled', active: true });
  expect(field.compareDigest).toBe('digest');
  expect(JSON.parse(field.value)).toEqual({ other: { revision: 'keep', pricingMode: 'standard' }, 'bundle-1': { revision: 'new', pricingMode: 'scheduled' } });
  const inactive = await buildBundlePolicyMetafield({ admin, bundleId: 'other', revision: 'new', pricingMode: 'standard', active: false });
  expect(JSON.parse(inactive.value)).toEqual({});
});
it.each([null, { revision: 'one' }, 'old', { revision: 'one', pricingMode: 'invalid' }])('rejects unpublished or invalid current authorization: %j', async (value) => {
  const admin = { graphql: jest.fn().mockResolvedValue({ json: async () => ({ data: { shop: { id: 'gid://shopify/Shop/1', policy: { value: JSON.stringify({ 'bundle-1': value }), compareDigest: 'digest' } } } }) }) };
  await expect(readPublishedBundlePolicy(admin, 'bundle-1')).resolves.toBeNull();
});
it.each([
  { errors: [{ message: 'Denied' }], data: { shop: { id: 'gid://shopify/Shop/1', policy: null } } },
  { data: {} },
  { data: { shop: { id: 'gid://shopify/Shop/1' } } },
  { data: { shop: { id: 'gid://shopify/Shop/1', policy: { value: '{}', compareDigest: null } } } },
])('never creates a replacement map from an incomplete read: %j', async (response) => {
  const admin = { graphql: jest.fn().mockResolvedValue({ json: async () => response }) };
  await expect(buildBundlePolicyMetafield({ admin, bundleId: 'bundle-1', revision: 'new', pricingMode: 'standard', active: true })).rejects.toThrow();
});
it('counts the complete UTF-8 policy map before publishing', async () => {
  const admin = { graphql: jest.fn().mockResolvedValue({ json: async () => ({ data: { shop: { id: 'gid://shopify/Shop/1', policy: { value: JSON.stringify({ other: 'é'.repeat(5000) }), compareDigest: 'digest' } } } }) }) };
  await expect(buildBundlePolicyMetafield({ admin, bundleId: 'bundle-1', revision: 'new', pricingMode: 'standard', active: true })).rejects.toThrow('10KB');
});

it('revokes a deleted bundle with the native compareDigest while retaining other policies', async () => {
  const { removePublishedBundlePolicy } = await import('../../../app/services/bundle-authorization-policy.server');
  const admin = { graphql: jest.fn(async (_q, options?: any) => ({ json: async () => options?.variables
    ? { data: { metafieldsSet: { metafields: options.variables.metafields, userErrors: [] } } }
    : { data: { shop: { id: 'shop', policy: { value: JSON.stringify({ 'bundle-1': { revision: 'old', pricingMode: 'scheduled' }, other: { revision: 'keep', pricingMode: 'standard' } }), compareDigest: 'digest' } } } } })) };
  await removePublishedBundlePolicy(admin, 'bundle-1');
  const field = admin.graphql.mock.calls[1][1].variables.metafields[0];
  expect(field.compareDigest).toBe('digest');
  expect(JSON.parse(field.value)).toEqual({ other: { revision: 'keep', pricingMode: 'standard' } });
});
