/**
 * Settings Rule Evaluator
 *
 * Evaluates declarative visibility/enablement rules from the settings schema
 * against runtime context (capabilities, param values, device state).
 *
 * Rule types:
 * - offroad_only: true when device is offroad
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
}

/**
 * Evaluate a single rule against the given context.
 */
export function evaluateRule(rule: Rule, ctx: RuleContext): boolean {
	switch (rule.type) {
		case 'offroad_only':
			return ctx.isOffroad;

		case 'capability': {
			if (!ctx.capabilities) return true; // Permissive when unknown
			const value = ctx.capabilities[rule.field as keyof Capabilities];
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
	if (actual === undefined || actual === null) return false;

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
