import '@shopify/ui-extensions/preact';
import {h, render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {
  useAppMetafields,
  useApplyCartLinesChange,
  useCartLines,
  useTranslate,
} from '@shopify/ui-extensions/checkout/preact';

import {
  classifyOfferState,
  linesForOffer,
  mutateCheckoutOffer,
  type OfferCartLine,
} from './offer-mutations';

type CheckoutOffer = {
  key: string;
  groupKey: string;
  runtimeGroupId: string;
  tierId: string;
  kind: 'addon' | 'gift';
  title: string;
  maxQuantity: number;
  eligibility: {type: 'QUANTITY' | 'AMOUNT'; value: number};
  discount: {type: 'PERCENTAGE'; value: number} | null;
  variants: Array<{id: string; title: string}>;
};

type BundleUiConfig = {
  id?: string;
  runtimePolicyRevision?: string;
  name?: string;
  checkoutOffers?: CheckoutOffer[];
  pricing?: {
    method?: string;
    rules?: Array<{conditionType?: string}>;
    displayOptions?: {bundleQuantityOptions?: {enabled?: boolean}};
  } | null;
  boxSelection?: {isEnabled?: boolean} | null;
};

type OfferGroup = {
  id: string;
  selection: { bundleId: string; revision: string; instanceId: string };
  name: string;
  config: BundleUiConfig;
  offers: CheckoutOffer[];
};

const Details = 's-details' as any;
const Summary = 's-summary' as any;

function attributeValue(line: any, key: string) {
  return line?.attributes?.find((attribute: any) => attribute.key === key)?.value;
}

function parseConfig(value: string): BundleUiConfig | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function activeOffers(offers: CheckoutOffer[], metrics: {quantity: number; amount: number}) {
  const byGroup = new Map<string, CheckoutOffer[]>();
  offers.forEach((offer) => {
    const group = byGroup.get(offer.groupKey) ?? [];
    group.push(offer);
    byGroup.set(offer.groupKey, group);
  });
  return [...byGroup.values()].flatMap((group) => {
    const eligible = group
      .filter((offer) => (offer.eligibility.type === 'AMOUNT' ? metrics.amount : metrics.quantity) >= offer.eligibility.value)
      .sort((a, b) => a.eligibility.value - b.eligibility.value);
    return eligible.length > 0 ? [eligible[eligible.length - 1]] : [];
  });
}

function componentPolicies(lines: any[], appMetafields: any[]) {
  return lines.flatMap(line => {
    let selected: any;
    try { selected = JSON.parse(attributeValue(line, '_wpb_selection') ?? 'null'); } catch { return []; }
    if (!selected?.bundleId || !selected?.revision || !selected?.instanceId) return [];
    const productId = String(line.merchandise?.product?.id ?? '').split('/').pop();
    const metafield = appMetafields.find(entry => entry?.target?.type === 'product'
      && String(entry.target.id).split('/').pop() === productId && entry.metafield?.key === 'bundle_runtime_policies');
    try {
      const policy = JSON.parse(metafield?.metafield?.value ?? 'null')?.policies?.find((policy: any) => policy.bundleId === selected.bundleId && policy.revision === selected.revision);
      return policy ? [{ line, selected, policy, namespace: metafield.metafield.namespace }] : [];
    } catch { return []; }
  });
}

export function buildOfferGroups(lines: any[], appMetafields: any[]): OfferGroup[] {
  const configs = new Map<string, BundleUiConfig>();
  appMetafields.filter(entry => entry?.target?.type === 'variant' && entry?.metafield?.key === 'bundle_ui_config').forEach(entry => {
    const config = parseConfig(entry.metafield.value);
    if (config) configs.set(String(entry.target.id).split('/').pop()!, config);
  });
  const grouped = new Map<string, { config: BundleUiConfig; selection: OfferGroup['selection']; quantity: number; amount: number }>();
  for (const { line, selected, policy } of componentPolicies(lines, appMetafields)) {
    const config = configs.get(String(policy.parentVariantId).split('/').pop()!);
    if (!config || config.id !== selected.bundleId || config.runtimePolicyRevision !== selected.revision || !Array.isArray(config.checkoutOffers)) continue;
    const key = JSON.stringify([selected.bundleId, selected.instanceId]);
    const group = grouped.get(key) ?? { config, selection: selected, quantity: 0, amount: 0 };
    const role = policy.groups?.find((group: any) => group.id === selected.groupId)?.role;
    if (role === 'component' || role === 'default') {
      group.quantity += line.quantity;
      // UI feedback only; the Discount Function computes eligibility from its own Shopify input.
      group.amount += Number(line.cost?.totalAmount?.amount ?? 0) + (line.discountAllocations ?? []).reduce((sum: number, allocation: any) => sum + Number(allocation.discountedAmount?.amount ?? 0), 0);
    }
    grouped.set(key, group);
  }
  return [...grouped.values()].map(group => ({ id: group.selection.instanceId, selection: group.selection,
    name: group.config.name ?? '', config: group.config, offers: activeOffers(group.config.checkoutOffers ?? [], group) }));
}

export function getReadOnlyStatusKeys(config: BundleUiConfig) {
  const method = String(config.pricing?.method ?? '').toLowerCase();
  const statuses: string[] = [];
  if (method === 'buy_x_get_y') statuses.push('buyXGetYStatus');
  if (method !== 'buy_x_get_y' && (config.pricing?.rules?.length ?? 0) > 1) {
    statuses.push('volumeStatus');
  }
  if (config.boxSelection?.isEnabled === true || config.pricing?.displayOptions?.bundleQuantityOptions?.enabled === true) {
    statuses.push('bundleQuantityOptionsStatus');
  }
  return statuses;
}

export function isOfferControlPending(
  pendingKey: string | null,
  groupId: string,
  offerKey: string,
) {
  return pendingKey === `${groupId}:${offerKey}`;
}

type ParentReference = { id: string; namespace: string; revision: string };
type ParentQueryResult = { data?: { nodes: Array<{ id: string; metafield?: { value: string } | null } | null> } };

export async function loadParentMetafields(
  references: ParentReference[],
  query: (document: string, options: { variables: { ids: string[]; namespace: string } }) => Promise<ParentQueryResult>,
) {
  const namespace = references[0]?.namespace;
  if (!namespace || references.some(reference => reference.namespace !== namespace)) return [];
  const ids = [...new Set(references.map(reference => reference.id))];
  const result = await query(`
    query CheckoutBundleDisplay($ids: [ID!]!, $namespace: String!) {
      nodes(ids: $ids) { ... on ProductVariant { id metafield(namespace: $namespace, key: "bundle_ui_config") { value } } }
    }`, { variables: { ids, namespace } });
  return (result.data?.nodes ?? []).flatMap(node => node?.metafield
    ? [{ target: { type: 'variant', id: node.id }, metafield: { namespace, key: 'bundle_ui_config', value: node.metafield.value } }] : []);
}

function BundleOffersExtension() {
  const lines = useCartLines() as unknown as OfferCartLine[];
  const appMetafields = useAppMetafields();
  const applyCartLinesChange = useApplyCartLinesChange();
  const translate = useTranslate();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parentMetafields, setParentMetafields] = useState<any[]>([]);
  const parentReferences = componentPolicies(lines, appMetafields).map(entry => ({
    id: entry.policy.parentVariantId, namespace: entry.namespace, revision: entry.selected.revision,
  }));
  const parentKey = JSON.stringify(parentReferences);
  useEffect(() => {
    let current = true;
    if (!parentReferences.length) { setParentMetafields([]); return; }
    void loadParentMetafields(parentReferences, (document, options) => shopify.query(document, options))
      .then(fields => { if (current) setParentMetafields(fields); })
      .catch(() => { if (current) setParentMetafields([]); });
    return () => { current = false; };
  }, [parentKey]);
  const groups = buildOfferGroups(lines, [...appMetafields, ...parentMetafields]);
  if (groups.every(group => group.offers.length === 0)) return null;

  const changeOffer = async (
    group: OfferGroup,
    offer: CheckoutOffer,
    selectedVariantId: string | null,
    quantity: number,
  ) => {
    setPendingKey(`${group.id}:${offer.key}`);
    setError(null);
    try {
      await mutateCheckoutOffer({
        offer,
        selectedVariantId,
        requestedQuantity: quantity,
        getLines: () => shopify.lines.value as unknown as OfferCartLine[],
        applyCartLinesChange: (change) => applyCartLinesChange(change),
        selection: { ...group.selection, groupId: offer.runtimeGroupId },
      });
    } catch {
      setError(String(translate('offerUpdateFailed')));
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <Details>
      <Summary slot="summary">{String(translate('bundleAndSave'))}</Summary>
      <s-stack direction="block" gap="base">
        {groups.map((group) => (
          <s-section key={group.id} heading={group.name || translate('bundleOffers')}>
            <s-stack direction="block" gap="small-300">
              {group.offers.map((offer) => {
                const offerLines = linesForOffer(lines, offer.key, group.id);
                const state = classifyOfferState(offerLines, offer.maxQuantity);
                const currentLine = offerLines[0];
                const selectedVariantId = currentLine?.merchandise.id ?? '';
                const quantity = currentLine?.quantity ?? 1;
                const pending = isOfferControlPending(pendingKey, group.id, offer.key);

                if (state.readOnly) {
                  return (
                    <s-banner key={offer.key} tone="info" heading={offer.title}>
                      {String(translate(state.reason === 'over-limit' ? 'offerOverLimitReadOnly' : 'offerMultipleVariantsReadOnly'))}
                    </s-banner>
                  );
                }

                const selector = offer.kind === 'gift' && offer.variants.length === 1
                  ? (
                      <s-checkbox
                        label={offer.title}
                        checked={Boolean(selectedVariantId)}
                        disabled={pending}
                        onChange={(event) => {
                          const checked = (event.currentTarget as HTMLInputElement).checked;
                          void changeOffer(group, offer, checked ? offer.variants[0].id : null, checked ? 1 : 0);
                        }}
                      />
                    )
                  : (
                      <s-select
                        label={offer.title}
                        value={selectedVariantId}
                        disabled={pending}
                        onChange={(event) => {
                          const value = (event.currentTarget as HTMLSelectElement).value;
                          const replacementQuantity = currentLine ? quantity : 1;
                          void changeOffer(group, offer, value || null, value ? replacementQuantity : 0);
                        }}
                      >
                        <s-option value="">{String(translate('noAddon'))}</s-option>
                        {offer.variants.map((variant) => (
                          <s-option key={variant.id} value={variant.id}>{variant.title}</s-option>
                        ))}
                      </s-select>
                    );

                return (
                  <s-stack key={offer.key} direction="block" gap="small-200">
                    {selector}
                    {selectedVariantId && offer.maxQuantity > 1 && (
                      <s-number-field
                        label={translate('quantity')}
                        min={1}
                        max={offer.maxQuantity}
                        step={1}
                        value={String(quantity)}
                        disabled={pending}
                        onChange={(event) => {
                          const nextQuantity = Number((event.currentTarget as unknown as HTMLInputElement).value);
                          void changeOffer(group, offer, selectedVariantId, nextQuantity);
                        }}
                      />
                    )}
                  </s-stack>
                );
              })}
              {getReadOnlyStatusKeys(group.config).map((status) => (
                <s-text key={status} color="subdued">{String(translate(status))}</s-text>
              ))}
            </s-stack>
          </s-section>
        ))}
        {error && <s-banner tone="critical">{error}</s-banner>}
      </s-stack>
    </Details>
  );
}

export default function extension() {
  render(h(BundleOffersExtension, {}), document.body);
}
