type VariantSelectionStatus = 'incomplete' | 'available' | 'unavailable' | 'nonexistent';
type NormalizedProductOption = { index: number; name: string };

export type VariantSelectionResult = {
  status: VariantSelectionStatus;
  selection: Record<string, string>;
  variant: any | null;
};

const selectorInstanceCounts = new WeakMap<Document, number>();
const draftSelections = new WeakMap<object, Map<string, Record<string, string>>>();

function optionName(option: unknown, index: number) {
  if (option && typeof option === 'object' && 'name' in option) {
    return String((option as { name?: unknown }).name ?? `Option ${index + 1}`);
  }
  return String(option ?? `Option ${index + 1}`);
}

function productOptions(product: any): NormalizedProductOption[] {
  const configured = Array.isArray(product?.options) ? product.options : [];
  if (configured.length > 0) {
    return configured.map((option: unknown, index: number) => ({
      index: index + 1,
      name: optionName(option, index),
    }));
  }

  const firstVariant = (Array.isArray(product?.variants) ? product.variants : [])[0];
  return [1, 2, 3]
    .filter((index) => String(firstVariant?.[`option${index}`] ?? '').trim())
    .map((index) => ({ index, name: `Option ${index}` }));
}

function variantOptionValue(variant: any, name: string, index: number) {
  const canonical = (Array.isArray(variant?.selectedOptions) ? variant.selectedOptions : [])
    .find((selected: any) => String(selected?.name ?? '') === name);
  return String(canonical?.value ?? variant?.[`option${index}`] ?? '');
}

function uniqueOptionValues(product: any, name: string, index: number) {
  const values: string[] = [];
  const seen = new Set<string>();
  (Array.isArray(product?.variants) ? product.variants : []).forEach((variant: any) => {
    const value = variantOptionValue(variant, name, index);
    if (!value || seen.has(value)) return;
    seen.add(value);
    values.push(value);
  });
  return values;
}

function isSellableVariant(variant: any) {
  return variant?.available !== false && variant?.availableForSale !== false;
}

function variantIdentity(variant: any) {
  return String(variant?.selectionId || variant?.variantId || variant?.id || '');
}

function normalizeSelection(product: any, selection: any = {}) {
  const normalized: Record<string, string> = {};
  productOptions(product).forEach(({ name, index }) => {
    const value = String(selection?.[name] ?? selection?.[index - 1] ?? '').trim();
    if (value && uniqueOptionValues(product, name, index).includes(value)) {
      normalized[name] = value;
    }
  });
  return normalized;
}

export function selectionForVariant(product: any, variant: any) {
  const selection: Record<string, string> = {};
  if (!variant) return selection;
  productOptions(product).forEach(({ name, index }) => {
    const value = variantOptionValue(variant, name, index);
    if (value) selection[name] = value;
  });
  return selection;
}

export function resolveExactVariantSelection(
  product: any,
  selection: Record<string, string> = {},
): VariantSelectionResult {
  const options = productOptions(product);
  const normalized = normalizeSelection(product, selection);
  if (options.length > 0 && options.some(({ name }) => !normalized[name])) {
    return { status: 'incomplete', selection: normalized, variant: null };
  }

  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const variant = variants.find((candidate: any) => options.every(({ name, index }) => (
    variantOptionValue(candidate, name, index) === normalized[name]
  ))) || null;
  if (!variant) return { status: 'nonexistent', selection: normalized, variant: null };
  return {
    status: isSellableVariant(variant) ? 'available' : 'unavailable',
    selection: normalized,
    variant,
  };
}

export function resolveInitialVariantSelection({
  product,
  draft,
  committedVariantIds = [],
  defaultVariantId = null,
}: any): VariantSelectionResult {
  const normalizedDraft = normalizeSelection(product, draft);
  if (Object.keys(normalizedDraft).length > 0) {
    return resolveExactVariantSelection(product, normalizedDraft);
  }

  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const committed = new Set((committedVariantIds || []).map(String));
  const restoredVariant = variants.find((variant: any) => committed.has(variantIdentity(variant)))
    || variants.find((variant: any) => variantIdentity(variant) === String(defaultVariantId || ''))
    || null;
  return restoredVariant
    ? resolveExactVariantSelection(product, selectionForVariant(product, restoredVariant))
    : resolveExactVariantSelection(product, {});
}

export function createVariantDraftKey({ stepId, categoryId, product }: any) {
  const productId = product?.parentProductId || product?.baseProductId || product?.productId || product?.id || '';
  return [stepId || 'step', categoryId || 'category', productId || 'product'].map(String).join(':');
}

export function getVariantSelectionDraft(owner: object, key: string) {
  return { ...(draftSelections.get(owner)?.get(key) || {}) };
}

export function setVariantSelectionDraft(owner: object, key: string, selection: Record<string, string>) {
  let ownerDrafts = draftSelections.get(owner);
  if (!ownerDrafts) {
    ownerDrafts = new Map();
    draftSelections.set(owner, ownerDrafts);
  }
  ownerDrafts.set(key, { ...selection });
}

export function resolveCanonicalOptionValueSwatch(
  product: any,
  requestedOptionName: unknown,
  value: unknown,
) {
  const option = (Array.isArray(product?.options) ? product.options : []).find(
    (candidate: any) => candidate && typeof candidate === 'object'
      && String(candidate.name ?? '') === String(requestedOptionName ?? ''),
  );
  const optionValue = (Array.isArray(option?.optionValues) ? option.optionValues : []).find(
    (candidate: any) => String(candidate?.name ?? '') === String(value ?? ''),
  );
  const color = optionValue?.swatch?.color ?? null;
  const image = optionValue?.swatch?.image ?? null;
  if (!color && !image) return null;
  return { color, image, label: String(optionValue?.name ?? value ?? '') };
}

function nextSelectorInstanceId(runtimeDocument: Document, productId: unknown) {
  const count = (selectorInstanceCounts.get(runtimeDocument) || 0) + 1;
  selectorInstanceCounts.set(runtimeDocument, count);
  const stableProductId = String(productId ?? 'product').replace(/[^a-zA-Z0-9_-]+/g, '-');
  return `fpb-variant-${stableProductId}-${count}`;
}

function swatchImageUrl(image: any) {
  return image?.previewImage?.url || image?.url || image?.src || '';
}

function requestedSwatch(swatch: any, kind: 'color' | 'image' | null) {
  if (kind === 'color') return Boolean(swatch?.color);
  if (kind === 'image') return Boolean(swatch?.image);
  return false;
}

function valueAvailability(product: any, selection: Record<string, string>, name: string, value: string) {
  const candidate = { ...selection, [name]: value };
  const options = productOptions(product);
  if (options.every((option) => Boolean(candidate[option.name]))) {
    return resolveExactVariantSelection(product, candidate).status;
  }

  const matches = (Array.isArray(product?.variants) ? product.variants : []).filter((variant: any) => (
    options.every(({ name: optionName, index }) => (
      !candidate[optionName] || variantOptionValue(variant, optionName, index) === candidate[optionName]
    ))
  ));
  if (matches.some(isSellableVariant)) return 'available';
  return matches.length > 0 ? 'unavailable' : 'nonexistent';
}

function availabilityLabel(value: string, status: VariantSelectionStatus) {
  if (status === 'unavailable') return `${value} — out of stock`;
  if (status === 'nonexistent') return `${value} — unavailable combination`;
  return value;
}

function applySelectionPresentation(root: HTMLElement, product: any, selection: Record<string, string>) {
  const result = resolveExactVariantSelection(product, selection);
  root.dataset.selectionStatus = result.status;
  root.querySelectorAll<HTMLInputElement>('.vs-input').forEach((input) => {
    const name = String(input.dataset.optionName || '');
    input.checked = selection[name] === input.value;
    const status = valueAvailability(product, selection, name, input.value);
    const control = input.closest<HTMLElement>('.vs-radio-control');
    if (control) control.dataset.availability = status;
    input.setAttribute('aria-label', availabilityLabel(input.value, status));
  });
  root.querySelectorAll<HTMLSelectElement>('.vs-native-select').forEach((select) => {
    const name = String(select.dataset.optionName || '');
    select.value = selection[name] || '';
    Array.from(select.options).forEach((option) => {
      const baseLabel = option.dataset.baseLabel;
      if (!baseLabel) return;
      const status = valueAvailability(product, selection, name, option.value);
      option.dataset.availability = status;
      option.textContent = availabilityLabel(baseLabel, status);
    });
  });
  return result;
}

function createNativeOptionSelect({
  instanceId,
  option,
  values,
  selection,
  product,
  runtimeDocument,
}: any) {
  const group = runtimeDocument.createElement('div');
  group.className = 'vs-option-group vs-option-group--select';
  const label = runtimeDocument.createElement('label');
  label.className = 'vs-visually-hidden';
  label.htmlFor = `${instanceId}-select-${option.index}`;
  label.textContent = `Select ${option.name}`;
  const select = runtimeDocument.createElement('select');
  select.id = label.htmlFor;
  select.className = 'vs-native-select';
  select.dataset.optionIndex = String(option.index);
  select.dataset.optionName = option.name;
  const placeholder = runtimeDocument.createElement('option');
  placeholder.value = '';
  placeholder.textContent = `Select ${option.name}`;
  placeholder.disabled = true;
  placeholder.selected = !selection[option.name];
  select.append(placeholder);
  values.forEach((value: string) => {
    const choice = runtimeDocument.createElement('option');
    choice.value = value;
    choice.dataset.baseLabel = value;
    choice.textContent = availabilityLabel(
      value,
      valueAvailability(product, selection, option.name, value),
    );
    choice.selected = selection[option.name] === value;
    select.append(choice);
  });
  group.append(label, select);
  return group;
}

function createVisualOptionGroup({
  instanceId,
  mode,
  option,
  values,
  selection,
  product,
  swatchKind,
  swatchTooltipEnabled,
  runtimeDocument,
}: any) {
  const group = runtimeDocument.createElement('fieldset');
  group.className = 'vs-option-group vs-option-group--visual';
  group.dataset.optionIndex = String(option.index);
  const legend = runtimeDocument.createElement('legend');
  legend.className = 'vs-option-group-label';
  legend.textContent = option.name;
  const valuesElement = runtimeDocument.createElement('div');
  valuesElement.className = 'vs-btn-group';
  const groupName = `${instanceId}-option-${option.index}`;

  values.forEach((value: string, valueIndex: number) => {
    const swatch = swatchKind
      ? resolveCanonicalOptionValueSwatch(product, option.name, value)
      : null;
    const hasRequestedSwatch = requestedSwatch(swatch, swatchKind);
    const status = valueAvailability(product, selection, option.name, value);
    const control = runtimeDocument.createElement('label');
    control.className = `vs-radio-control${hasRequestedSwatch ? ' vs-radio-control--swatch' : ' vs-radio-control--neutral'}`;
    control.dataset.availability = status;
    const input = runtimeDocument.createElement('input');
    input.type = 'radio';
    input.id = `${groupName}-value-${valueIndex + 1}`;
    input.name = groupName;
    input.value = value;
    input.className = 'vs-input';
    input.dataset.optionIndex = String(option.index);
    input.dataset.optionName = option.name;
    input.checked = selection[option.name] === value;
    input.setAttribute('aria-label', availabilityLabel(value, status));
    const visual = runtimeDocument.createElement('span');
    visual.className = 'vs-btn';
    if (hasRequestedSwatch && swatchKind === 'color') {
      visual.dataset.swatchKind = 'color';
      visual.style.setProperty('--vs-swatch-color', String(swatch?.color));
    } else if (hasRequestedSwatch && swatchKind === 'image') {
      visual.dataset.swatchKind = 'image';
      const image = runtimeDocument.createElement('img');
      image.src = swatchImageUrl(swatch?.image);
      image.alt = '';
      visual.append(image);
    }
    if (!hasRequestedSwatch || mode === 'pill') {
      const text = runtimeDocument.createElement('span');
      text.className = 'vs-btn-label';
      text.textContent = value;
      visual.append(text);
    }
    if (swatchTooltipEnabled && hasRequestedSwatch) control.title = value;
    control.append(input, visual);
    valuesElement.append(control);
  });
  group.append(legend, valuesElement);
  return group;
}

class VariantSelectorComponent {
  static createConfiguredElement(
    product: any,
    primaryOptionName: any,
    configuration: any = {},
    runtimeDocument: Document = document,
  ) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const options = productOptions(product);
    if (variants.length <= 1 || options.length === 0) return null;

    const mode = configuration.variantSelectorMode || 'dropdown';
    const selection = normalizeSelection(product, configuration.selection || {});
    const instanceId = nextSelectorInstanceId(
      runtimeDocument,
      product?.parentProductId || product?.id || product?.productId,
    );
    const root = runtimeDocument.createElement('div');
    root.className = `vs-wrapper vs-wrapper--configured vs-wrapper--${mode}`;
    root.dataset.vsProductId = String(product?.id || product?.productId || '');

    let visualOption: any = null;
    if (mode !== 'dropdown') {
      const explicit = options.find((option) => option.name.toLowerCase() === String(primaryOptionName || '').toLowerCase());
      if (mode === 'pill') {
        visualOption = explicit || options.reduce((best, candidate) => (
          uniqueOptionValues(product, candidate.name, candidate.index).length
            < uniqueOptionValues(product, best.name, best.index).length ? candidate : best
        ), options[0]);
      } else {
        const swatchKind = mode === 'color_swatch' ? 'color' : 'image';
        const hasCompleteSwatches = (option: any) => uniqueOptionValues(product, option.name, option.index)
          .every((value) => requestedSwatch(
            resolveCanonicalOptionValueSwatch(product, option.name, value),
            swatchKind,
          ));
        const hasAnySwatch = (option: any) => uniqueOptionValues(product, option.name, option.index)
          .some((value) => requestedSwatch(
            resolveCanonicalOptionValueSwatch(product, option.name, value),
            swatchKind,
          ));
        visualOption = (explicit && hasCompleteSwatches(explicit) ? explicit : null)
          || options.find(hasCompleteSwatches)
          || (explicit && hasAnySwatch(explicit) ? explicit : null)
          || options.find(hasAnySwatch)
          || explicit
          || options[0];
      }
    }

    const orderedOptions = visualOption
      ? [visualOption, ...options.filter((option) => option !== visualOption)]
      : options;
    orderedOptions.forEach((option) => {
      const values = uniqueOptionValues(product, option.name, option.index);
      if (values.length === 0) return;
      if (visualOption === option) {
        root.append(createVisualOptionGroup({
          instanceId,
          mode,
          option,
          values,
          selection,
          product,
          swatchKind: mode === 'color_swatch' ? 'color' : mode === 'image_swatch' ? 'image' : null,
          swatchTooltipEnabled: configuration.swatchTooltipEnabled === true,
          runtimeDocument,
        }));
      } else {
        root.append(createNativeOptionSelect({
          instanceId,
          option,
          values,
          selection,
          product,
          runtimeDocument,
        }));
      }
    });
    applySelectionPresentation(root, product, selection);
    return root;
  }

  static createElement(product: any, primaryOptionName: any, runtimeDocument: Document = document) {
    return VariantSelectorComponent.createConfiguredElement(
      product,
      primaryOptionName,
      { variantSelectorMode: 'pill' },
      runtimeDocument,
    );
  }

  static createDropdownElement(product: any, primaryOptionName: any, options: any = {}) {
    return VariantSelectorComponent.createConfiguredElement(
      product,
      primaryOptionName,
      { ...options, variantSelectorMode: 'dropdown' },
      options.document || document,
    );
  }

  static attachListeners(cardEl: HTMLElement, product: any, onSelectionChange: any) {
    const root = cardEl.matches?.('.vs-wrapper')
      ? cardEl
      : cardEl.querySelector<HTMLElement>('.vs-wrapper');
    if (!root) return;

    root.addEventListener('click', (event) => event.stopPropagation());
    root.addEventListener('change', (event: Event) => {
      const input = (event.target as HTMLElement | null)?.closest<HTMLInputElement>(
        '.vs-input, .vs-native-select',
      );
      if (!input) return;
      event.stopPropagation();
      const selection: Record<string, string> = {};
      root.querySelectorAll<HTMLInputElement>('.vs-input:checked').forEach((choice) => {
        selection[String(choice.dataset.optionName || '')] = choice.value;
      });
      root.querySelectorAll<HTMLSelectElement>('.vs-native-select').forEach((select) => {
        if (select.value) selection[String(select.dataset.optionName || '')] = select.value;
      });
      const result = applySelectionPresentation(root, product, selection);
      onSelectionChange?.(result);
    });
  }
}

export { VariantSelectorComponent };
