/**
 * Settings Rule Evaluator
 *
 * Evaluates declarative visibility/enablement rules from the settings schema
 * against runtime context (capabilities, param values, device state).
 *
 * Rule types:
 * - offroad_only: true when device is offroad
 * - not_engaged: true when the vehicle is not actively engaged (matches
 *   Raylib `engaged = started AND (selfdriveState.enabled OR
 *   selfdriveStateSP.mads.enabled)`)
 * - capability: checks a field from SettingsCapabilities
 * - param: checks a current param value for equality
 * - param_compare: checks a param value with >, <, >=, <=
 * - not: negates a sub-rule
 * - any: OR of sub-rules
 * - all: AND of sub-rules
 *
 * Design decisions:
 * - Null capabilities → permissive (return true) to avoid hiding settings
 *   before capabilities are loaded
 * - Unknown rule types → permissive (forward compatibility)
 * - String↔boolean coercion: '1'/'true' == true, '0'/'false' == false
 * - String↔number coercion: parseInt/parseFloat for comparisons
 */

import type { Rule, Capabilities } from '$lib/types/schema';

export interface RuleContext {
	capabilities: Capabilities | null;
	paramValues: Record<string, unknown>;
	isOffroad: boolean;
	engaged: boolean;
}

/**
 * Evaluate a single rule against the given context.
 */
/**
 * Check if a rule tree references any capability fields.
 */
function _referencesCapability(rule: Rule): boolean {
	if (rule.type === 'capability') return true;
	if (rule.type === 'not') return _referencesCapability(rule.condition);
	if (rule.type === 'any' || rule.type === 'all')
		return rule.conditions.some(_referencesCapability);
	return false;
}

export function evaluateRule(rule: Rule, ctx: RuleContext): boolean {
	// When capabilities are unknown (null), any rule involving capabilities
	// is permissive (return true). This prevents not/any/all wrappers from
	// inverting the permissive intent.
	if (!ctx.capabilities && _referencesCapability(rule)) return true;

	switch (rule.type) {
		case 'offroad_only':
			return ctx.isOffroad;

		case 'not_engaged':
			return !ctx.engaged;

		case 'capability': {
			const value = ctx.capabilities![rule.field as keyof Capabilities];
			return value === rule.equals;
		}

		case 'param': {
			const raw = ctx.paramValues[rule.key];
			return _compareParamValue(raw, rule.equals);
		}

		case 'param_compare': {
			const raw = ctx.paramValues[rule.key];
			const numValue = _toNumber(raw);
			if (numValue === null) return false; // Missing or non-numeric → comparison fails
			switch (rule.op) {
				case '>':
					return numValue > rule.value;
				case '<':
					return numValue < rule.value;
				case '>=':
					return numValue >= rule.value;
				case '<=':
					return numValue <= rule.value;
				default:
					return false;
			}
		}

		case 'not':
			return !evaluateRule(rule.condition, ctx);

		case 'any':
			return rule.conditions.some((c) => evaluateRule(c, ctx));

		case 'all':
			return rule.conditions.every((c) => evaluateRule(c, ctx));

		default:
			return true; // Unknown rule types are permissive (forward compat)
	}
}

/**
 * Evaluate a list of rules with AND semantics.
 * Empty or undefined rules = always true (no restrictions).
 */
export function evaluateRules(rules: Rule[] | undefined, ctx: RuleContext): boolean {
	if (!rules || rules.length === 0) return true;
	return rules.every((r) => evaluateRule(r, ctx));
}

/**
 * Check if an item is visible given the current context.
 */
export function isVisible(visibility: Rule[] | undefined, ctx: RuleContext): boolean {
	return evaluateRules(visibility, ctx);
}

/**
 * Check if an item is enabled given the current context.
 */
export function isEnabled(enablement: Rule[] | undefined, ctx: RuleContext): boolean {
	return evaluateRules(enablement, ctx);
}

/**
 * Check if enablement rules contain an offroad_only constraint.
 * Used to show a "requires offroad" badge on the frontend.
 */
export function requiresOffroad(enablement: Rule[] | undefined): boolean {
	if (!enablement) return false;
	return enablement.some((r) => {
		if (r.type === 'offroad_only') return true;
		if (r.type === 'all') return r.conditions.some((c) => c.type === 'offroad_only');
		return false;
	});
}

/**
 * Check if a rule list depends on ShowAdvancedControls.
 * Used to show an "Advanced" badge on the frontend.
 *
 * NOTE: schema now puts ShowAdvancedControls in `enablement` (so the item
 * shows but is disabled when Advanced is off). Callers should pass the
 * enablement list. Visibility list is also accepted for legacy schemas.
 */
export function isAdvancedSetting(rules: Rule[] | undefined): boolean {
	if (!rules) return false;
	function check(rule: Rule): boolean {
		if (rule.type === 'param' && rule.key === 'ShowAdvancedControls') return true;
		if (rule.type === 'all' || rule.type === 'any') return rule.conditions.some(check);
		if (rule.type === 'not') return check(rule.condition);
		return false;
	}
	return rules.some(check);
}

/** Fallback labels for capability fields (used when schema doesn't provide capability_labels) */
const CAPABILITY_LABELS_FALLBACK: Record<string, string> = {
	has_longitudinal_control: 'Longitudinal control',
	has_icbm: 'ICBM enabled',
	icbm_available: 'ICBM available',
	torque_allowed: 'torque steering (not available for angle steering vehicles)',
	alpha_long_available: 'Alpha longitudinal available',
	has_stop_and_go: 'Stop and Go',
	pcm_cruise: 'PCM cruise',
	enable_bsm: 'BSM available',
	stock_longitudinal: 'Stock longitudinal',
	tesla_has_vehicle_bus: 'Tesla vehicle bus',
	device_type: 'Device type'
};

/**
 * Get human-readable reasons why an item is disabled.
 * Returns an array of short reason strings for each failed enablement rule.
 * Skips offroad_only (handled separately by the Offroad badge).
 *
 * Stack order: dependency reasons first (more actionable), Advanced last.
 * The Advanced reason is rendered as a separate ADVANCED badge by the UI
 * so it's filtered out of the returned array unless includeAdvanced is true.
 */
export function getDisabledReasons(
	enablement: Rule[] | undefined,
	ctx: RuleContext,
	paramTitleLookup?: (key: string) => string | undefined,
	capabilityLabels?: Record<string, string>,
	includeAdvanced = false
): string[] {
	if (!enablement || enablement.length === 0) return [];
	const capLabels = capabilityLabels ?? CAPABILITY_LABELS_FALLBACK;
	const dependencyReasons: string[] = [];
	const advancedReasons: string[] = [];

	for (const rule of enablement) {
		if (evaluateRule(rule, ctx)) continue;
		const reason = _describeFailedRule(rule, ctx, paramTitleLookup, capLabels);
		if (!reason) continue;
		if (_isAdvancedFailure(rule)) {
			advancedReasons.push(reason);
		} else {
			dependencyReasons.push(reason);
		}
	}
	return includeAdvanced ? [...dependencyReasons, ...advancedReasons] : dependencyReasons;
}

/** True when a single rule is solely a ShowAdvancedControls = true check
 *  (i.e. the rule's only purpose is the Advanced gate, not a real dependency). */
function _isAdvancedFailure(rule: Rule): boolean {
	if (rule.type === 'param' && rule.key === 'ShowAdvancedControls') return true;
	if (rule.type === 'all' && rule.conditions.length === 1)
		return _isAdvancedFailure(rule.conditions[0]!);
	return false;
}

function _describeFailedRule(
	rule: Rule,
	ctx: RuleContext,
	paramTitleLookup?: (key: string) => string | undefined,
	capLabels?: Record<string, string>
): string | null {
	switch (rule.type) {
		case 'offroad_only':
			return null;

		case 'not_engaged':
			return 'Disengage the vehicle to change this setting';

		case 'capability': {
			// When no car is fingerprinted (brand empty), show a vehicle-start prompt
			// instead of specific capability names — matches device-side behavior.
			const noCarFingerprinted = ctx.capabilities && !ctx.capabilities.brand;
			if (noCarFingerprinted) return 'Start the vehicle to check vehicle compatibility';

			const label = capLabels?.[rule.field] ?? CAPABILITY_LABELS_FALLBACK[rule.field] ?? rule.field;
			if (rule.equals === true) return `Requires ${label}`;
			if (rule.equals === false) return `Not available with ${label}`;
			return `Requires ${label} = ${rule.equals}`;
		}

		case 'param': {
			const paramVal = ctx.paramValues[rule.key];
			if (paramVal === undefined || paramVal === null) return null;
			const title = paramTitleLookup?.(rule.key) ?? rule.key;
			if (rule.equals === true) return `Enable "${title}" first`;
			if (rule.equals === false) return `Disable "${title}" first`;
			return `Requires "${title}" = ${rule.equals}`;
		}

		case 'param_compare': {
			const title = paramTitleLookup?.(rule.key) ?? rule.key;
			const opLabels: Record<string, string> = {
				'>': 'above',
				'<': 'below',
				'>=': 'at least',
				'<=': 'at most'
			};
			return `Requires "${title}" ${opLabels[rule.op] ?? rule.op} ${rule.value}`;
		}

		case 'not': {
			// The not rule failed = inner condition is true, but we need it false
			if (rule.condition.type === 'param') {
				const notParamVal = ctx.paramValues[rule.condition.key];
				if (notParamVal === undefined || notParamVal === null) return null;
				const title = paramTitleLookup?.(rule.condition.key) ?? rule.condition.key;
				if (rule.condition.equals === true) return `Disable "${title}" first`;
				if (rule.condition.equals === false) return `Enable "${title}" first`;
				return `Requires "${title}" ≠ ${rule.condition.equals}`;
			}
			if (rule.condition.type === 'capability') {
				const label =
					capLabels?.[rule.condition.field] ??
					CAPABILITY_LABELS_FALLBACK[rule.condition.field] ??
					rule.condition.field;
				if (rule.condition.equals === true) return `Not available with ${label}`;
				if (rule.condition.equals === false) return `Requires ${label}`;
				return `Not available when ${label} = ${rule.condition.equals}`;
			}
			// Fallback: try inner description (for nested rules)
			if (!evaluateRule(rule.condition, ctx)) {
				return _describeFailedRule(rule.condition, ctx, paramTitleLookup, capLabels);
			}
			return null;
		}

		case 'any': {
			// All conditions failed (OR not satisfied) — join descriptions with "or"
			const descs: string[] = [];
			for (const sub of rule.conditions) {
				const desc = _describeFailedRule(sub, ctx, paramTitleLookup, capLabels);
				if (desc) descs.push(desc);
			}
			if (descs.length === 0) return null;
			if (descs.length === 1) return descs[0]!;
			// Strip common "Requires " prefix for joined message
			const prefix = 'Requires ';
			const allHavePrefix = descs.every((d) => d.startsWith(prefix));
			if (allHavePrefix) {
				const items = descs.map((d) => d.slice(prefix.length));
				return `${prefix}${items.join(' or ')}`;
			}
			return descs.join(' or ');
		}

		case 'all': {
			for (const sub of rule.conditions) {
				if (!evaluateRule(sub, ctx)) {
					const desc = _describeFailedRule(sub, ctx, paramTitleLookup, capLabels);
					if (desc) return desc;
				}
			}
			return null;
		}

		default:
			return null;
	}
}

/** Collect all param keys that require offroad from a schema */
export function collectOffroadOnlyKeys(
	schema: import('$lib/types/schema').SettingsSchema
): Set<string> {
	const keys = new Set<string>();
	function checkItem(item: {
		key: string;
		enablement?: Rule[];
		sub_items?: Array<{ key: string; enablement?: Rule[] }>;
	}) {
		if (requiresOffroad(item.enablement)) keys.add(item.key);
		for (const sub of item.sub_items ?? []) {
			if (requiresOffroad(sub.enablement)) keys.add(sub.key);
		}
	}
	for (const panel of schema.panels ?? []) {
		for (const item of panel.items ?? []) checkItem(item);
		for (const sp of panel.sub_panels ?? []) {
			for (const item of sp.items ?? []) checkItem(item);
		}
		for (const section of panel.sections ?? []) {
			for (const item of section.items ?? []) checkItem(item);
			for (const sp of section.sub_panels ?? []) {
				for (const item of sp.items ?? []) checkItem(item);
			}
		}
	}
	for (const brandSettings of Object.values(schema.vehicle_settings ?? {})) {
		for (const item of brandSettings.items ?? []) {
			if (requiresOffroad(item.enablement)) keys.add(item.key);
		}
	}
	return keys;
}

/** Collect all param keys referenced in a set of rules (for dependency tracking) */
export function collectParamDependencies(rules: Rule[] | undefined): string[] {
	if (!rules) return [];
	const keys: string[] = [];
	function walk(rule: Rule) {
		if (rule.type === 'param' || rule.type === 'param_compare') {
			keys.push(rule.key);
		} else if (rule.type === 'not') {
			walk(rule.condition);
		} else if (rule.type === 'any' || rule.type === 'all') {
			rule.conditions.forEach(walk);
		}
	}
	rules.forEach(walk);
	return keys;
}

/**
 * Compare a param value against an expected value with type coercion.
 *
 * Device params are often stored as strings ('1', '0', 'true', 'false')
 * but rules specify boolean or numeric comparisons. This function handles
 * the coercion transparently.
 */
function _compareParamValue(actual: unknown, expected: unknown): boolean {
	if (actual === expected) return true;
	if (actual === undefined || actual === null) {
		if (typeof expected === 'boolean') return expected === false;
		return false;
	}

	// Boolean comparison with string coercion
	if (typeof expected === 'boolean') {
		if (typeof actual === 'string') {
			const boolValue = actual === '1' || actual.toLowerCase() === 'true';
			return boolValue === expected;
		}
		if (typeof actual === 'number') {
			return (actual !== 0) === expected;
		}
	}

	// Numeric comparison with string coercion
	if (typeof expected === 'number') {
		if (typeof actual === 'string') {
			const numValue = Number(actual);
			return !isNaN(numValue) && numValue === expected;
		}
	}

	// String comparison with numeric coercion
	if (typeof expected === 'string' && typeof actual === 'number') {
		return String(actual) === expected;
	}

	return false;
}

/**
 * Convert a param value to a number for comparison operators.
 * Returns null if the value cannot be converted.
 */
function _toNumber(value: unknown): number | null {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const n = Number(value);
		return isNaN(n) ? null : n;
	}
	if (typeof value === 'boolean') return value ? 1 : 0;
	return null;
}
