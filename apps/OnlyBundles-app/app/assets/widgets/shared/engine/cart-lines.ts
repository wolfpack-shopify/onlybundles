/**
 * Shared cart-line metadata helpers.
 *
 * These helpers build the display metadata used by FPB and PPB cart lines.
 * Cart submission, variant IDs, selling plans, and post-add behavior stay owned
 * by the widget controllers for now.
 */

'use strict';

const DEFAULT_CART_LINE_LABELS: any = {
  items: 'Items',
  retailPrice: 'Retail Price',
  youSave: 'Bundle Savings',
};

function formatCartLineItemTitle(product: any = {}) {
  const title = String(product.title || product.id || '');
  const variantTitle = String(product.variantTitle || product.variant || '').trim();
  if (!variantTitle || variantTitle === 'Default Title' || title.endsWith(`(${variantTitle})`)) {
    return title;
  }
  return `${title} (${variantTitle})`;
}

export function buildCartLineSourceProperties({
  selectedLines = [],
  retailPrice = '',
  discountAmount = '',
  discountPercentage = null,
  box = '1',
  includeBox = true,
  labels = null,
  tierProgress = null,
}: any = {}) {
  const displayProperties: any = {
    items: selectedLines
      .map(({ product = {}, quantity = 0 }: any) => `${Number(quantity || 0)} x ${formatCartLineItemTitle(product)}`)
      .join(', '),
    retailPrice: String(retailPrice || ''),
  };

  if (includeBox !== false) {
    displayProperties.box = String(box || '1');
  }

  if (discountAmount) {
    const percentage = `${Math.round(Number(discountPercentage || 0))}%`;
    displayProperties.youSave = {
      amount: String(discountAmount),
      percentage,
      amountPercentage: `${discountAmount} (${percentage})`,
    };
  }

  if (tierProgress) {
    displayProperties.tierProgress = tierProgress;
  }

  if (labels) {
    displayProperties.labels = {
      ...DEFAULT_CART_LINE_LABELS,
      ...labels,
    };
  }

  return {
    _bundle_display_properties: JSON.stringify(displayProperties),
  };
}

export function buildCartLineDisplayProperties(displayProperties: any = {}, labels = DEFAULT_CART_LINE_LABELS) {
  const cartLineLabels: any = {
    ...DEFAULT_CART_LINE_LABELS,
    ...labels,
  };
  const properties: any = {
    [cartLineLabels.items]: displayProperties.items,
    [cartLineLabels.retailPrice]: displayProperties.retailPrice,
    _bundle_display_properties: JSON.stringify(displayProperties),
  };

  if (displayProperties.youSave?.amountPercentage) {
    properties[cartLineLabels.youSave] = displayProperties.youSave.amountPercentage;
  }

  return properties;
}

export function extractTierProgressForBundle(bundle: any = {}) {
  if (!bundle?.pricing?.enabled) return null;
  const rules = Array.isArray(bundle?.pricing?.rules) ? bundle.pricing.rules : [];
  if (rules.length === 0) return null;

  const progressBar = bundle?.pricing?.displayOptions?.progressBar
    || bundle?.messaging?.displayOptions?.progressBar
    || null;

  if (progressBar?.enabled === false) {
    return null;
  }

  const normalizedRules = rules.map((r: any) => {
    const conditionType = r.conditionType || (r.minSubtotal !== undefined ? 'amount' : 'quantity');
    const isAmount = conditionType === 'amount';
    return {
      conditionType,
      minQuantity: isAmount ? undefined : Number(r.conditionValue ?? r.minQuantity ?? 0),
      minSubtotal: isAmount ? Number(r.conditionValue ?? r.minSubtotal ?? 0) : undefined,
      discountType: r.discountType || (bundle.pricing?.method === 'fixed_amount_off' ? 'fixed_amount' : 'percentage'),
      discountValue: Number(r.discountValue ?? 0),
      tierText: r.tierText || null,
    };
  });

  return {
    rules: normalizedRules,
    progressBar: progressBar ? {
      enabled: progressBar.enabled !== false,
      type: progressBar.type || 'simple',
      progressText: progressBar.progressText,
      successText: progressBar.successText,
    } : { enabled: true, type: 'simple' },
  };
}
