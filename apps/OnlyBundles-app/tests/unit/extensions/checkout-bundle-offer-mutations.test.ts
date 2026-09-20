import { classifyOfferState, mutateCheckoutOffer, linesForOffer, type OfferCartLine } from '../../../extensions/bundle-checkout-ui/src/offer-mutations';
import { loadParentMetafields, buildOfferGroups, getReadOnlyStatusKeys, isOfferControlPending } from '../../../extensions/bundle-checkout-ui/src/BundleOffers';
const selection = { bundleId: 'bundle', revision: 'r', instanceId: 'i', groupId: 'extras' };
const attributes = (instanceId = 'i') => [{ key: '_checkout_offer_key', value: 'offer' }, { key: '_wpb_selection', value: JSON.stringify({ ...selection, instanceId }) }];
const line = (quantity = 1, instanceId = 'i'): OfferCartLine => ({ id: 'line', quantity, merchandise: { id: 'gid://shopify/ProductVariant/2' }, attributes: attributes(instanceId), discountAllocations: [{ discountedAmount: { amount: 2 } }] });
const offer = { key: 'offer', maxQuantity: 3, discount: null };

test('checkout offer mutations submit identifiers directly and isolate instances', async () => {
  let lines = [line(1), { ...line(2, 'other'), id: 'other-line' }];
  const apply = jest.fn(async change => {
    lines = lines.map(candidate => candidate.id === change.id ? { ...candidate, quantity: change.quantity, attributes: change.attributes, merchandise: { id: change.merchandiseId } } : candidate);
    return { type: 'success' };
  });
  await mutateCheckoutOffer({ offer, selection, selectedVariantId: 'gid://shopify/ProductVariant/3', requestedQuantity: 3, getLines: () => lines, applyCartLinesChange: apply });
  expect(apply).toHaveBeenCalledWith(expect.objectContaining({ type: 'updateCartLine', id: 'line', quantity: 3, attributes: expect.arrayContaining(attributes()) }));
  expect(linesForOffer(lines, 'offer', 'other')[0].quantity).toBe(2);
  expect(lines[0].attributes.some(attribute => attribute.key === '_wolfpack_bundle_runtime')).toBe(false);
});

test('removal uses the latest Shopify cart-line ID', async () => {
  let lines = [line()];
  const apply = jest.fn(async () => { lines = []; return { type: 'success' }; });
  await mutateCheckoutOffer({ offer, selection, selectedVariantId: null, requestedQuantity: 0, getLines: () => lines, applyCartLinesChange: apply });
  expect(apply).toHaveBeenCalledWith({ type: 'removeCartLine', id: 'line', quantity: 1 });
});

test.each([0, 4, 1.5])('rejects invalid requested quantity %s before mutation', async quantity => {
  const apply = jest.fn();
  await expect(mutateCheckoutOffer({ offer, selection, selectedVariantId: 'gid://shopify/ProductVariant/2', requestedQuantity: quantity, getLines: () => [line()], applyCartLinesChange: apply })).rejects.toThrow();
  expect(apply).not.toHaveBeenCalled();
});

test('multiple variants and excessive existing quantities are read-only', () => {
  expect(classifyOfferState([line(4)],3).readOnly).toBe(true);
  expect(classifyOfferState([line(), { ...line(), merchandise: { id: 'different' } }],3).readOnly).toBe(true);
});

test('groups component lines using app-owned product policies and current parent display config', () => {
  const config = { id:'bundle',runtimePolicyRevision:'r',name:'Bundle',checkoutOffers:[{...offer,groupKey:'extras',runtimeGroupId:'extras',tierId:'t',kind:'addon',title:'Extra',eligibility:{type:'QUANTITY',value:2},variants:[]} ]};
  const policy = { bundleId:'bundle',revision:'r',parentVariantId:'gid://shopify/ProductVariant/99',groups:[{id:'paid',role:'component'}] };
  const component = { ...line(2),merchandise:{id:'gid://shopify/ProductVariant/1',product:{id:'gid://shopify/Product/1'}},attributes:[{key:'_wpb_selection',value:JSON.stringify({...selection,groupId:'paid'})}] };
  const metafields = [{target:{type:'product',id:'1'},metafield:{key:'bundle_runtime_policies',value:JSON.stringify({policies:[policy]})}},
    {target:{type:'variant',id:'99'},metafield:{key:'bundle_ui_config',value:JSON.stringify(config)}}];
  expect(buildOfferGroups([component],metafields)).toMatchObject([{id:'i',name:'Bundle',offers:[{key:'offer'}]}]);
  expect(buildOfferGroups([component],metafields.slice(1))).toEqual([]);
});

test('read-only pricing status and pending controls retain their scope', () => {
  expect(getReadOnlyStatusKeys({pricing:{method:'buy_x_get_y'}})).toEqual(['buyXGetYStatus']);
  expect(isOfferControlPending('i:offer','i','offer')).toBe(true);
  expect(isOfferControlPending('other:offer','i','offer')).toBe(false);
});

test('checkout parent hydration uses the namespace returned by Shopify app metafields', async () => {
  const query = jest.fn().mockResolvedValue({data:{nodes:[{id:'gid://shopify/ProductVariant/99',metafield:{value:'{"id":"bundle"}'}}]}});
  const fields = await loadParentMetafields([{id:'gid://shopify/ProductVariant/99',namespace:'app--123',revision:'r'}], query);
  expect(query).toHaveBeenCalledWith(expect.any(String), {variables:{ids:['gid://shopify/ProductVariant/99'],namespace:'app--123'}});
  expect(fields).toEqual([{target:{type:'variant',id:'gid://shopify/ProductVariant/99'},metafield:{namespace:'app--123',key:'bundle_ui_config',value:'{"id":"bundle"}'}}]);
});

test('checkout parent hydration does not guess an app namespace', async () => {
  const query = jest.fn();
  expect(await loadParentMetafields([{id:'gid://shopify/ProductVariant/99',namespace:'',revision:'r'}], query)).toEqual([]);
  expect(query).not.toHaveBeenCalled();
});
