import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readBundlePolicyMap } from './bundle-authorization-policy.server';
import type { PolicyCompileResult, PolicyPublishError, PolicyPublishResult, PublishedRuntimePolicy } from '../lib/bundle-runtime-policy-types';

type Admin = Parameters<typeof readBundlePolicyMap>[0];
type StoredPolicy = { bundleId: string; revision: string };
type Projection = { policies: StoredPolicy[] } | string[];
type Field = { ownerId: string; namespace: '$app'; key: string; type: 'json'; value: string; compareDigest: string | null };
type Snapshot = { value: Projection; compareDigest: string | null };
const BATCH_SIZE = 25;
const PROJECTION_LIMIT = 9_500;
const REGISTRY_LIMIT = 9_500;
// 200 ordinary line facts (450 bytes), 10 selection attributes (512 bytes),
// the shared registry and 3,380 bytes for owner configuration/envelope.
const MEMBERSHIP_REFERENCE_LIMIT = 100;
const SET = `mutation SetBundleRuntimePolicies($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { key namespace value }
    userErrors { field message code }
  }
}`;
const READ = `query ReadBundleRuntimePolicies($ids: [ID!]!) {
  nodes(ids: $ids) {
    id
    ... on Product {
      policy: metafield(namespace: "$app", key: "bundle_runtime_memberships") { jsonValue compareDigest }
    }
    ... on ProductVariant {
      policy: metafield(namespace: "$app", key: "bundle_parent_policy") { jsonValue compareDigest }
    }
  }
}`;
function fail(error: PolicyPublishError['error'], details: string): PolicyPublishError {
  return { ok: false, error, details };
}
async function read(admin: Admin, ids: string[]): Promise<Map<string, Snapshot>> {
  const result = new Map<string, Snapshot>();
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE);
    const payload = await (await admin.graphql(READ, { variables: { ids: batch } })).json();
    const nodes = payload.data?.nodes;
    if (payload.errors?.length || !Array.isArray(nodes) || nodes.length !== batch.length) throw new Error('Incomplete policy read');
    for (const id of batch) {
      const node = nodes.find((entry: { id?: string } | null) => entry?.id === id);
      if (!node || !Object.hasOwn(node, 'policy')) throw new Error(`Missing policy owner ${id}`);
      const field = node.policy;
      if (field === null) { result.set(id, { value: id.includes('/ProductVariant/') ? { policies: [] } : [], compareDigest: null }); continue; }
      const valid = id.includes('/ProductVariant/')
        ? Array.isArray(field?.jsonValue?.policies) && field.jsonValue.policies.every((policy: StoredPolicy) => policy && typeof policy.bundleId === 'string' && typeof policy.revision === 'string')
        : Array.isArray(field?.jsonValue) && field.jsonValue.every((reference: unknown) => typeof reference === 'string');
      if (!field || typeof field.compareDigest !== 'string' || !valid) throw new Error(`Invalid stored policy on ${id}`);
      result.set(id, { value: field.jsonValue, compareDigest: field.compareDigest });
    }
  }
  return result;
}
async function write(admin: Admin, fields: Field[]): Promise<void> {
  const payload = await (await admin.graphql(SET, { variables: { metafields: fields } })).json();
  const result = payload.data?.metafieldsSet;
  if (payload.errors?.length || !Array.isArray(result?.userErrors) || result.userErrors.length
    || !Array.isArray(result.metafields) || result.metafields.length !== fields.length) {
    throw new Error(`Policy write failed: ${JSON.stringify(payload.errors ?? result?.userErrors ?? [])}`);
  }
  for (const field of fields) {
    if (!result.metafields.some((saved: { key: string; value: string }) => saved.key === field.key
      && isDeepStrictEqual(JSON.parse(saved.value), JSON.parse(field.value)))) throw new Error('Incomplete policy write response');
  }
}

/** Stage bounded projections using CAS; activate only after every owner is read back.
 * Retains the old active revision during staging. Subsequent publication prunes older
 * revisions for this bundle. Other bundles remain untouched.
 */
export async function publishBundleRuntimePolicy(input: {
  admin: Admin; shopId: string; parentVariantId: string; compiled: PolicyCompileResult;
}): Promise<PolicyPublishResult> {
  const { admin, compiled, parentVariantId } = input;
  if (!compiled.ok) return fail(compiled.error === 'POLICY_TOO_LARGE' ? 'POLICY_TOO_LARGE' : 'COMPILE_ERROR', compiled.details ?? compiled.error);
  const { revision, parentPolicy, productPolicies, active, pricingMode } = compiled;
  let stage: PolicyPublishError['error'] = 'STAGE_WRITE_FAILED';
  try {
    const registry = await readBundlePolicyMap(admin);
    const policies = { ...registry.policies };
    const current = policies[parentPolicy.bundleId] as { revision?: string } | undefined;
    const source = productPolicies[0]?.metafield.policies[0];
    if (!source) return fail('COMPILE_ERROR', 'Missing shared bundle rules');
    const { memberships: _memberships, ...rules } = source;
    const membershipSets: Record<string, typeof source.memberships> = {};
    const references = productPolicies.map(({ productId, metafield }) => {
      const members = metafield.policies[0].memberships;
      const reference = createHash('sha256').update(JSON.stringify({ revision, members })).digest('base64url').slice(0, 22);
      if (membershipSets[reference] && !isDeepStrictEqual(membershipSets[reference], members)) throw new Error('Membership reference collision');
      membershipSets[reference] = members;
      return { ownerId: productId, key: 'bundle_runtime_memberships', reference };
    });
    const policy: PublishedRuntimePolicy = { ...rules, schemaVersion: 2, membershipSets };
    const published = { revision, pricingMode, policy };
    if (active) policies[parentPolicy.bundleId] = published;
    else delete policies[parentPolicy.bundleId];
    const registryValue = JSON.stringify(policies);
    if (Buffer.byteLength(registryValue, 'utf8') > REGISTRY_LIMIT) return fail('POLICY_TOO_LARGE', 'Shared shop rules exceed the 9,500-byte Function input budget');
    const activation: Field = {
      ownerId: registry.ownerId, namespace: '$app', key: 'ppb_policy_revisions', type: 'json',
      value: registryValue, compareDigest: registry.compareDigest,
    };
    if (!active) {
      stage = 'ACTIVATION_FAILED';
      await write(admin, [activation]);
      return { ok: true, revision, productCount: 0 };
    }
    const projections = [...references, { ownerId: parentVariantId, key: 'bundle_parent_policy' }];
    const snapshots = await read(admin, projections.map(field => field.ownerId));
    const activeReferences = new Set(Object.values(registry.policies).flatMap(record =>
      Object.keys((record as { policy?: { membershipSets?: Record<string, unknown> } } | null)?.policy?.membershipSets ?? {})));
    const fields: Field[] = [];
    for (const projection of projections) {
      const previous = snapshots.get(projection.ownerId)!;
      let value: string;
      if ('reference' in projection) {
        const retained = (previous.value as string[]).filter(reference => activeReferences.has(reference));
        value = JSON.stringify([...new Set([...retained, projection.reference])].sort());
        if (Buffer.byteLength(value, 'utf8') > MEMBERSHIP_REFERENCE_LIMIT) return fail('POLICY_TOO_LARGE', `Retained membership references on ${projection.ownerId} exceed the 200-line Function input budget (${MEMBERSHIP_REFERENCE_LIMIT} bytes)`);
      } else {
        const retained = (previous.value as { policies: StoredPolicy[] }).policies.filter(policy => policy.bundleId !== parentPolicy.bundleId
          || (policy.revision === current?.revision && policy.revision !== revision));
        value = JSON.stringify({ policies: [...retained, parentPolicy] });
        if (Buffer.byteLength(value, 'utf8') > PROJECTION_LIMIT) return fail('POLICY_TOO_LARGE', `Retained parent projection exceeds ${PROJECTION_LIMIT} bytes`);
      }
      fields.push({ ownerId: projection.ownerId, key: projection.key, namespace: '$app', type: 'json', value, compareDigest: previous.compareDigest });
    }
    for (let offset = 0; offset < fields.length; offset += BATCH_SIZE) await write(admin, fields.slice(offset, offset + BATCH_SIZE));
    stage = 'READBACK_MISMATCH';
    const saved = await read(admin, fields.map(field => field.ownerId));
    for (const field of fields) {
      if (!isDeepStrictEqual(saved.get(field.ownerId)?.value, JSON.parse(field.value))) return fail(stage, `Readback mismatch on ${field.ownerId}`);
    }
    stage = 'ACTIVATION_FAILED';
    // Use the digest captured before staging. Concurrent publication must retry
    // from a fresh snapshot; it must never overwrite another activated revision.
    await write(admin, [activation]);
    const activated = await readBundlePolicyMap(admin);
    if (!isDeepStrictEqual(activated.policies[parentPolicy.bundleId], published)) return fail(stage, 'Activation readback mismatch');
    return { ok: true, revision, productCount: productPolicies.length };
  } catch (error) {
    return fail(stage, String(error));
  }
}
