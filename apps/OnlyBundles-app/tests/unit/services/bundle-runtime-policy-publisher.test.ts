import { publishBundleRuntimePolicy } from '../../../app/services/bundle-runtime-policy-publisher.server';
import { compileBundleRuntimePolicy } from '../../../app/services/bundle-runtime-policy.server';
import type { PolicyCompileOk } from '../../../app/lib/bundle-runtime-policy-types';

const parent = 'gid://shopify/ProductVariant/999';
const shop = 'gid://shopify/Shop/1';
const product = 'gid://shopify/Product/1';
function compiled(count = 1): PolicyCompileOk {
  return compileBundleRuntimePolicy({ parentVariantId: parent, bundle: {
    id: 'bundle', status: 'active', name: 'Bundle',
    steps: [{ id: 'group', minQuantity: 1, maxQuantity: 3, StepProduct: Array.from({ length: count }, (_, i) => ({ productId: `gid://shopify/Product/${i + 1}`, variants: [] })) }],
  } }) as PolicyCompileOk;
}
/** Stateful Shopify mock: compare-and-set writes, then independent node readback. */
function adminFixture() {
  const values = new Map<string, { value: string; compareDigest: string }>();
  const writes: any[][] = [];
  const controls = { failBatch: 0, corruptParent: false, concurrentActivation: false, topLevelError: false, throwWrite: false };
  let sequence = 0;
  const key = (owner: string, field: string) => `${owner}:${field}`;
  const set = (owner: string, field: string, value: unknown) => values.set(key(owner, field), { value: JSON.stringify(value), compareDigest: `digest-${++sequence}` });
  const get = (owner: string, field: string) => {
    const value = values.get(key(owner, field));
    return value ? { ...value, jsonValue: JSON.parse(value.value) } : null;
  };
  const admin = { graphql: jest.fn(async (query: string, options?: any) => {
    let response: any;
    if (query.includes('metafieldsSet')) {
      if (controls.throwWrite) throw new Error('network unavailable');
      const fields = options.variables.metafields;
      writes.push(fields);
      const conflict = fields.some((f: any) => f.compareDigest !== (get(f.ownerId, f.key)?.compareDigest ?? null));
      const failure = conflict || writes.length === controls.failBatch;
      if (controls.topLevelError) response = { errors: [{ message: 'unavailable' }] };
      else if (failure) response = { data: { metafieldsSet: { metafields: [], userErrors: [{ message: 'Conflict', code: 'STALE_OBJECT' }] } } };
      else {
        fields.forEach((f: any) => set(f.ownerId, f.key, JSON.parse(f.value)));
        response = { data: { metafieldsSet: { metafields: fields.map((f: any) => ({ key: f.key, namespace: '$app', value: f.value })), userErrors: [] } } };
      }
    } else if (query.includes('BundlePolicyRevisions')) {
      response = { data: { shop: { id: shop, policy: get(shop, 'ppb_policy_revisions') } } };
    } else if (query.includes('nodes(')) {
      response = { data: { nodes: options.variables.ids.map((id: string) => {
        let policy = get(id, id === parent ? 'bundle_parent_policy' : 'bundle_runtime_memberships');
        if (controls.corruptParent && writes.length && id === parent) policy = { value: '{}', jsonValue: {}, compareDigest: 'different' };
        return { id, policy };
      }) } };
      if (controls.concurrentActivation && writes.length) set(shop, 'ppb_policy_revisions', { other: { revision: 'new', pricingMode: 'standard' } });
    } else throw new Error(`Unexpected query: ${query}`);
    return { json: async () => response };
  }) };
  return { admin, writes, controls, set, get };
}

async function publish(fixture: ReturnType<typeof adminFixture>, result = compiled()) {
  return publishBundleRuntimePolicy({ admin: fixture.admin, shopId: shop, parentVariantId: parent, compiled: result });
}

describe('runtime policy publication', () => {
  test('publishes shared rules once and only membership references on products', async () => {
    const f = adminFixture(); const result = compiled();
    expect(await publish(f, result)).toMatchObject({ ok: true });
    const shared = f.get(shop, 'ppb_policy_revisions')?.jsonValue.bundle.policy;
    expect(shared).toMatchObject({ groups: result.productPolicies[0].metafield.policies[0].groups });
    const references = f.get(product, 'bundle_runtime_memberships')?.jsonValue;
    expect(references).toEqual([expect.any(String)]);
    expect(shared.membershipSets[references[0]]).toEqual(result.productPolicies[0].metafield.policies[0].memberships);
    expect(Buffer.byteLength(JSON.stringify(references))).toBeLessThanOrEqual(100);
    expect(f.get(product, 'bundle_runtime_policies')).toBeNull();
  });
  test('stages and verifies product and parent before activating the revision', async () => {
    const f = adminFixture(); const result = compiled();
    expect(await publish(f, result)).toMatchObject({ ok: true, revision: result.revision });
    expect(f.get(shop, 'ppb_policy_revisions')?.jsonValue.bundle).toMatchObject({ revision: result.revision, pricingMode: 'standard' });
    expect(f.writes.at(-1)?.[0].key).toBe('ppb_policy_revisions');
    expect(f.writes[0].every(field => Object.hasOwn(field, 'compareDigest'))).toBe(true);
  });
  test('preserves references for other active bundles and the previous active revision', async () => {
    const f = adminFixture(); const result = compiled();
    f.set(shop, 'ppb_policy_revisions', {
      bundle: { revision: 'old', pricingMode: 'standard', policy: { membershipSets: { old: [] } } },
      other: { revision: 'other-rev', pricingMode: 'standard', policy: { membershipSets: { other: [] } } },
    });
    f.set(product, 'bundle_runtime_memberships', ['old', 'other', 'obsolete']);
    expect(await publish(f, result)).toMatchObject({ ok: true });
    const refs = f.get(product, 'bundle_runtime_memberships')?.jsonValue;
    expect(refs).toEqual(expect.arrayContaining(['old', 'other']));
    expect(refs).not.toContain('obsolete');
    expect(refs).toHaveLength(3);
  });
  test('enforces the Shopify 25-field mutation limit', async () => {
    const f = adminFixture(); expect(await publish(f, compiled(30))).toMatchObject({ ok: true });
    expect(f.writes.slice(0, 2).map(batch => batch.length)).toEqual([25, 6]);
  });
  test.each(['failBatch', 'topLevelError', 'throwWrite'] as const)('does not activate on %s', async (mode) => {
    const f = adminFixture(); Object.assign(f.controls, { [mode]: mode === 'failBatch' ? 1 : true });
    expect(await publish(f)).toMatchObject({ ok: false, error: 'STAGE_WRITE_FAILED' });
    expect(f.get(shop, 'ppb_policy_revisions')).toBeNull();
  });
  test('parent readback is required', async () => {
    const f = adminFixture(); f.controls.corruptParent = true;
    expect(await publish(f)).toMatchObject({ ok: false, error: 'READBACK_MISMATCH' });
    expect(f.get(shop, 'ppb_policy_revisions')).toBeNull();
  });
  test('concurrent registry changes reject activation instead of overwriting them', async () => {
    const f = adminFixture(); f.controls.concurrentActivation = true;
    expect(await publish(f)).toMatchObject({ ok: false, error: 'ACTIVATION_FAILED' });
    expect(f.get(shop, 'ppb_policy_revisions')?.jsonValue.other.revision).toBe('new');
  });
  test('retained projections are included in the capacity check before any write', async () => {
    const f = adminFixture();
    f.set(shop, 'ppb_policy_revisions', { other: { policy: { membershipSets: { ['x'.repeat(100)]: [] } } } });
    f.set(product, 'bundle_runtime_memberships', ['x'.repeat(100)]);
    expect(await publish(f)).toMatchObject({ ok: false, error: 'POLICY_TOO_LARGE' });
    expect(f.writes).toHaveLength(0);
  });
  test('registry size is checked before any staging writes', async () => {
    const f = adminFixture(); f.set(shop, 'ppb_policy_revisions', { other: 'x'.repeat(9990) });
    expect(await publish(f)).toMatchObject({ ok: false, error: 'POLICY_TOO_LARGE' });
    expect(f.writes).toHaveLength(0);
  });
  test('scheduled publication retains native discount ownership', async () => {
    const f = adminFixture(); const result = compiled(); result.pricingMode = 'scheduled';
    expect(await publish(f, result)).toMatchObject({ ok: true });
    expect(f.get(shop, 'ppb_policy_revisions')?.jsonValue.bundle.pricingMode).toBe('scheduled');
  });
  test('inactive bundles are revoked and never activated', async () => {
    const f = adminFixture(); f.set(shop, 'ppb_policy_revisions', { bundle: { revision: 'old', pricingMode: 'standard' } });
    const result = compiled(); result.active = false;
    expect(await publish(f, result)).toMatchObject({ ok: true });
    expect(f.get(shop, 'ppb_policy_revisions')?.jsonValue.bundle).toBeUndefined();
  });
  test('compiler errors cause no Shopify requests', async () => {
    const f = adminFixture();
    expect(await publishBundleRuntimePolicy({ admin: f.admin, shopId: shop, parentVariantId: parent, compiled: { ok: false, error: 'INVALID_CONFIGURATION' } })).toMatchObject({ ok: false, error: 'COMPILE_ERROR' });
    expect(f.admin.graphql).not.toHaveBeenCalled();
  });
});

test('identical product memberships share one authoritative definition', async () => {
  const f=adminFixture(); expect(await publish(f,compiled(2))).toMatchObject({ok:true});
  const record=f.get(shop,'ppb_policy_revisions')?.jsonValue.bundle;
  expect(Object.keys(record.policy.membershipSets)).toHaveLength(1);
  expect(f.get(product,'bundle_runtime_memberships')?.jsonValue)
    .toEqual(f.get('gid://shopify/Product/2','bundle_runtime_memberships')?.jsonValue);
});
