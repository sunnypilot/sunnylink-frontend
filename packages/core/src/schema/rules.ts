import type { Rule, Capabilities, SettingsSchema } from './types';

export interface RuleContext {
	capabilities: Capabilities | null;
	paramValues: Record<string, unknown>;
	isOffroad: boolean;
}

function referencesCapability(rule: Rule): boolean {
	if (rule.type === 'capability') return true;
	if (rule.type === 'not') return referencesCapability(rule.condition);
	if (rule.type === 'any' || rule.type === 'all') return rule.conditions.some(referencesCapability);
	return false;
}

export function evaluateRule(rule: Rule, ctx: RuleContext): boolean {
	if (!ctx.capabilities && referencesCapability(rule)) return true;

	switch (rule.type) {
		case 'offroad_only':
			return ctx.isOffroad;

		case 'capability': {
			const value = ctx.capabilities![rule.field as keyof Capabilities];
			return value === rule.equals;
		}

		case 'param':
			return compareParamValue(ctx.paramValues[rule.key], rule.equals);

		case 'param_compare': {
			const numValue = toNumber(ctx.paramValues[rule.key]);
			if (numValue === null) return false;
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
			return rule.conditions.some((condition) => evaluateRule(condition, ctx));

		case 'all':
			return rule.conditions.every((condition) => evaluateRule(condition, ctx));

		default:
			return true;
	}
}

export function evaluateRules(rules: Rule[] | undefined, ctx: RuleContext): boolean {
	if (!rules || rules.length === 0) return true;
	return rules.every((rule) => evaluateRule(rule, ctx));
}

export function isVisible(visibility: Rule[] | undefined, ctx: RuleContext): boolean {
	return evaluateRules(visibility, ctx);
}

export function isEnabled(enablement: Rule[] | undefined, ctx: RuleContext): boolean {
	return evaluateRules(enablement, ctx);
}

export function requiresOffroad(enablement: Rule[] | undefined): boolean {
	if (!enablement) return false;
	return enablement.some((rule) => {
		if (rule.type === 'offroad_only') return true;
		if (rule.type === 'all') return rule.conditions.some((condition) => condition.type === 'offroad_only');
		return false;
	});
}

export function isAdvancedSetting(visibility: Rule[] | undefined): boolean {
	if (!visibility) return false;

	function check(rule: Rule): boolean {
		if (rule.type === 'param' && rule.key === 'ShowAdvancedControls') return true;
		if (rule.type === 'all' || rule.type === 'any') return rule.conditions.some(check);
		if (rule.type === 'not') return check(rule.condition);
		return false;
	}

	return visibility.some(check);
}

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

export function getDisabledReasons(
	enablement: Rule[] | undefined,
	ctx: RuleContext,
	paramTitleLookup?: (key: string) => string | undefined,
	capabilityLabels?: Record<string, string>
): string[] {
	if (!enablement || enablement.length === 0) return [];
	const capLabels = capabilityLabels ?? CAPABILITY_LABELS_FALLBACK;
	const reasons: string[] = [];

	for (const rule of enablement) {
		if (evaluateRule(rule, ctx)) continue;
		const reason = describeFailedRule(rule, ctx, paramTitleLookup, capLabels);
		if (reason) reasons.push(reason);
	}

	return reasons;
}

function describeFailedRule(
	rule: Rule,
	ctx: RuleContext,
	paramTitleLookup?: (key: string) => string | undefined,
	capLabels?: Record<string, string>
): string | null {
	switch (rule.type) {
		case 'offroad_only':
			return null;

		case 'capability': {
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

			if (!evaluateRule(rule.condition, ctx)) {
				return describeFailedRule(rule.condition, ctx, paramTitleLookup, capLabels);
			}

			return null;
		}

		case 'any': {
			const descriptions: string[] = [];
			for (const condition of rule.conditions) {
				const description = describeFailedRule(condition, ctx, paramTitleLookup, capLabels);
				if (description) descriptions.push(description);
			}
			if (descriptions.length === 0) return null;
			if (descriptions.length === 1) return descriptions[0]!;
			const prefix = 'Requires ';
			if (descriptions.every((description) => description.startsWith(prefix))) {
				return `${prefix}${descriptions.map((description) => description.slice(prefix.length)).join(' or ')}`;
			}
			return descriptions.join(' or ');
		}

		case 'all': {
			for (const condition of rule.conditions) {
				if (!evaluateRule(condition, ctx)) {
					const description = describeFailedRule(condition, ctx, paramTitleLookup, capLabels);
					if (description) return description;
				}
			}
			return null;
		}

		default:
			return null;
	}
}

export function collectOffroadOnlyKeys(schema: SettingsSchema): Set<string> {
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
		for (const subPanel of panel.sub_panels ?? []) {
			for (const item of subPanel.items ?? []) checkItem(item);
		}
		for (const section of panel.sections ?? []) {
			for (const item of section.items ?? []) checkItem(item);
			for (const subPanel of section.sub_panels ?? []) {
				for (const item of subPanel.items ?? []) checkItem(item);
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

function compareParamValue(actual: unknown, expected: unknown): boolean {
	if (actual === expected) return true;
	if (actual === undefined || actual === null) {
		if (typeof expected === 'boolean') return expected === false;
		return false;
	}

	if (typeof expected === 'boolean') {
		if (typeof actual === 'string') {
			const boolValue = actual === '1' || actual.toLowerCase() === 'true';
			return boolValue === expected;
		}
		if (typeof actual === 'number') {
			return (actual !== 0) === expected;
		}
	}

	if (typeof expected === 'number' && typeof actual === 'string') {
		const numValue = Number(actual);
		return !isNaN(numValue) && numValue === expected;
	}

	if (typeof expected === 'string' && typeof actual === 'number') {
		return String(actual) === expected;
	}

	return false;
}

function toNumber(value: unknown): number | null {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const numberValue = Number(value);
		return isNaN(numberValue) ? null : numberValue;
	}
	if (typeof value === 'boolean') return value ? 1 : 0;
	return null;
}
