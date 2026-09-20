import { isDeepStrictEqual } from 'node:util';
import type { OfferPolicyTiming } from '../lib/offer-policy-decision';

export type PublishedBundlePolicy = { revision: string; pricingMode: 'standard' | 'scheduled' };

export function scheduleRevisionMaterial(policy?: OfferPolicyTiming | null) {
  const mode = policy?.scheduleMode ?? 'always';
  const instant = (value: Date | string | null | undefined) => value == null ? null : new Date(value).toISOString();
  if (mode === 'one_time') return { mode, startsAt: instant(policy?.startsAt), endsAt: instant(policy?.endsAt) };
  if (mode === 'recurring') return {
    mode, frequency: policy?.recurrenceFrequency, timezone: policy?.recurrenceTimezone,
    anchorDate: instant(policy?.recurrenceAnchorDate)?.slice(0, 10),
    startMinute: policy?.recurrenceWindowStartMinute, endMinute: policy?.recurrenceWindowEndMinute,
    termination: policy?.recurrenceTermination ?? 'never', endsOn: instant(policy?.recurrenceEndsOn)?.slice(0, 10),
    runCount: policy?.recurrenceRunCount ?? null,
  };
  return { mode };
}

export type BundleAuthorizationPolicy = PublishedBundlePolicy & {
  active: boolean; shop: string; bundleId: string; parentVariantId: string; countryRule: string;
};
type Admin = { graphql: (query: string, options?: any) => Promise<{ json: () => Promise<any> }> };

export async function readBundlePolicyMap(admin: Admin) {
  const response = await admin.graphql(`
    query BundlePolicyRevisions {
      shop { id policy: metafield(namespace: "$app", key: "ppb_policy_revisions") { value compareDigest } }
    }
  `);
  const payload = await response.json();
  if (payload.errors?.length || !payload.data?.shop?.id) throw new Error('Unable to read published bundle policies');
  const shop = payload.data.shop;
  if (!Object.hasOwn(shop, 'policy')) throw new Error('Incomplete published bundle policy response');
  const policies: unknown = shop.policy ? JSON.parse(shop.policy.value) : {};
  if (!policies || typeof policies !== 'object' || Array.isArray(policies)) throw new Error('Invalid published bundle policy map');
  if (shop.policy && typeof shop.policy.compareDigest !== 'string') throw new Error('Missing Shopify policy compareDigest');
  return { ownerId: String(shop.id), compareDigest: shop.policy?.compareDigest ?? null, policies: policies as Record<string, unknown> };
}

export async function readPublishedBundlePolicy(admin: Admin, bundleId: string): Promise<PublishedBundlePolicy | null> {
  const { policies } = await readBundlePolicyMap(admin);
  const value = policies[bundleId];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<PublishedBundlePolicy>;
  return typeof record.revision === 'string' && record.revision.length > 0
    && (record.pricingMode === 'standard' || record.pricingMode === 'scheduled')
    ? { revision: record.revision, pricingMode: record.pricingMode } : null;
}

export async function buildBundlePolicyMetafield(input: {
  admin: Admin; bundleId: string; revision: string; pricingMode: PublishedBundlePolicy['pricingMode']; active: boolean;
}) {
  const { ownerId, compareDigest, policies } = await readBundlePolicyMap(input.admin);
  if (input.active) policies[input.bundleId] = { revision: input.revision, pricingMode: input.pricingMode };
  else delete policies[input.bundleId];
  const value = JSON.stringify(policies);
  if (Buffer.byteLength(value, 'utf8') > 10_000) throw new Error('Bundle policy map exceeds the Shopify Function 10KB input limit');
  return { ownerId, namespace: '$app', key: 'ppb_policy_revisions', type: 'json', value, compareDigest };
}

export async function removePublishedBundlePolicy(admin: Admin, bundleId: string): Promise<void> {
  const field = await buildBundlePolicyMetafield({ admin, bundleId, revision: '', pricingMode: 'standard', active: false });
  const response = await admin.graphql(`mutation RevokeBundlePolicy($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { metafields { key value } userErrors { field message } }
  }`, { variables: { metafields: [field] } });
  const payload = await response.json();
  const result = payload.data?.metafieldsSet;
  const saved = result?.metafields?.find((value: any) => value.key === field.key);
  if (payload.errors?.length || !Array.isArray(result?.userErrors) || result.userErrors.length || !saved
    || !isDeepStrictEqual(JSON.parse(saved.value), JSON.parse(field.value))) throw new Error('Unable to revoke published bundle policy');
}
