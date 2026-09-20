import { buildBundleSelectionProperties } from "../../../app/assets/widgets/shared/engine/cart-submit";
export type OfferAttribute = { key: string; value: string };

export type OfferCartLine = {
  id: string;
  quantity: number;
  merchandise: { id: string; product?: { id: string } };
  cost?: { totalAmount?: { amount: string | number } };
  attributes: OfferAttribute[];
  discountAllocations?: Array<{ discountedAmount?: { amount?: number | string } }>;
};

type MutableCheckoutOffer = {
  key: string;
  maxQuantity: number;
  discount: { type: "PERCENTAGE"; value: number } | null;
};

function attributeValue(line: OfferCartLine, key: string) {
  return line.attributes.find((attribute) => attribute.key === key)?.value;
}

export function linesForOffer(lines: OfferCartLine[], offerKey: string, instanceId: string) {
  return lines.filter((line) => {
    if (attributeValue(line, "_checkout_offer_key") !== offerKey) return false;
    try { return JSON.parse(attributeValue(line, "_wpb_selection") ?? 'null')?.instanceId === instanceId; } catch { return false; }
  });
}

export function classifyOfferState(lines: OfferCartLine[], maxQuantity: number) {
  const variantIds = new Set(lines.map((line) => line.merchandise.id));
  if (variantIds.size > 1) return { readOnly: true, reason: "multiple-variants" as const };
  const quantity = lines.reduce((sum, candidate) => sum + candidate.quantity, 0);
  if (quantity > maxQuantity) return { readOnly: true, reason: "over-limit" as const };
  return { readOnly: false, reason: null, quantity };
}

function successful(result: any) {
  return result?.type !== "error";
}

async function waitFor(
  predicate: () => boolean,
  attempts = 10,
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function restorePreviousLine(input: {
  previous: OfferCartLine | null;
  offerKey: string;
  instanceId: string;
  getLines: () => OfferCartLine[];
  applyCartLinesChange: (change: any) => Promise<any>;
}) {
  const current = linesForOffer(input.getLines(), input.offerKey, input.instanceId)[0] ?? null;
  if (!input.previous) {
    if (current) {
      await input.applyCartLinesChange({ type: "removeCartLine", id: current.id, quantity: current.quantity });
    }
    return;
  }
  if (current) {
    await input.applyCartLinesChange({
      type: "updateCartLine",
      id: current.id,
      merchandiseId: input.previous.merchandise.id,
      quantity: input.previous.quantity,
      attributes: input.previous.attributes,
    });
    return;
  }
  await input.applyCartLinesChange({
    type: "addCartLine",
    merchandiseId: input.previous.merchandise.id,
    quantity: input.previous.quantity,
    attributes: input.previous.attributes,
  });
}

export async function mutateCheckoutOffer(input: {
  offer: MutableCheckoutOffer;
  selectedVariantId: string | null;
  requestedQuantity: number;
  getLines: () => OfferCartLine[];
  selection: { bundleId: string; revision: string; instanceId: string; groupId: string };
  applyCartLinesChange: (change: any) => Promise<any>;
}) {
  const existingLines = linesForOffer(input.getLines(), input.offer.key, input.selection.instanceId);
  const state = classifyOfferState(existingLines, input.offer.maxQuantity);
  if (state.readOnly) throw new Error(`Checkout offer is read-only: ${state.reason}`);
  const previous = existingLines[0] ?? null;

  if (!input.selectedVariantId) {
    if (!previous) return;
    const current = linesForOffer(input.getLines(), input.offer.key, input.selection.instanceId)[0];
    if (!current) return;
    const result = await input.applyCartLinesChange({ type: "removeCartLine", id: current.id, quantity: current.quantity });
    if (!successful(result)) throw new Error(result?.message || "Cart line removal failed");
    return;
  }

  if (!Number.isInteger(input.requestedQuantity) || input.requestedQuantity < 1 || input.requestedQuantity > input.offer.maxQuantity) {
    throw new Error("Requested checkout offer quantity is outside the configured range");
  }

  const selectionProperties = buildBundleSelectionProperties(input.selection);
  const attributes = [{ key: '_checkout_offer_key', value: input.offer.key },
    ...Object.entries(selectionProperties).map(([key, value]) => ({ key, value }))];
  const current = linesForOffer(input.getLines(), input.offer.key, input.selection.instanceId)[0] ?? null;
  const change = current
    ? {
        type: "updateCartLine",
        id: current.id,
        merchandiseId: input.selectedVariantId,
        quantity: input.requestedQuantity,
        attributes,
      }
    : {
        type: "addCartLine",
        merchandiseId: input.selectedVariantId,
        quantity: input.requestedQuantity,
        attributes,
      };
  const result = await input.applyCartLinesChange(change);
  if (!successful(result)) throw new Error(result?.message || "Cart line mutation failed");

  const verified = await waitFor(() => {
    const updated = linesForOffer(input.getLines(), input.offer.key, input.selection.instanceId)[0];
    return Boolean(
      updated
      && updated.merchandise.id === input.selectedVariantId
      && updated.quantity === input.requestedQuantity,
    );
  });
  if (!verified) {
    await restorePreviousLine({
      previous,
      offerKey: input.offer.key,
      instanceId: input.selection.instanceId,
      getLines: input.getLines,
      applyCartLinesChange: input.applyCartLinesChange,
    });
    throw new Error("Checkout offer cart update verification failed");
  }
}
