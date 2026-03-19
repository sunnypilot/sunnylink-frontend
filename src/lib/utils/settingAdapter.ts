/**
 * Adapter: converts legacy RenderableSetting → SchemaItem
 *
 * This allows legacy settings (from SETTINGS_DEFINITIONS) to be rendered
 * with SchemaItemRenderer, achieving visual consistency across the app.
 */

import type { SchemaItem, WidgetType } from '$lib/types/schema';
import type { RenderableSetting } from '$lib/types/settings';

export function settingToSchemaItem(setting: RenderableSetting): SchemaItem {
  const extra = setting._extra ?? setting.value?._extra;
  const type = setting.value?.type;

  let widget: WidgetType = 'info';

  if (type === 'Bool') {
    widget = 'toggle';
  } else if (extra?.options && extra.options.length > 0) {
    widget = extra.options.length <= 4 ? 'multiple_button' : 'option';
  } else if (type === 'Int' || type === 'Float') {
    // Numeric with min/max renders as option (slider-like) in SchemaItemRenderer
    widget = extra?.min !== undefined ? 'option' : 'info';
  } else if (type === 'Json') {
    widget = 'info';
  } else if (type === 'String') {
    widget = 'info';
  }

  return {
    key: setting.key,
    widget,
    title: extra?.title || setting.label || setting.key,
    description: extra?.description || setting.description || undefined,
    options: extra?.options?.map((o) => ({
      value: o.value,
      label: o.label
    })),
    min: extra?.min,
    max: extra?.max,
    step: extra?.step,
    unit: extra?.unit
  };
}

/**
 * Convert an array of RenderableSettings into SchemaItems,
 * filtering out sections and hidden/readonly items.
 */
export function settingsToSchemaItems(
  settings: RenderableSetting[],
  opts?: { includeReadonly?: boolean }
): SchemaItem[] {
  return settings
    .filter((s) => !s.isSection && !s.hidden && (opts?.includeReadonly || !s.readonly))
    .map(settingToSchemaItem);
}
