import { describe, it, expect } from 'vitest';
import {
	evaluateRule,
	evaluateRules,
	isVisible,
	isEnabled,
	requiresOffroad,
	getDisabledReasons,
	type RuleContext
} from './evaluator';
import type { Rule } from '$lib/types/schema';

// ── Helpers ─────────────────────────────────────────────────────────────────

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
	return {
		capabilities: {
			has_longitudinal_control: true,
			has_icbm: false,
			icbm_available: true,
			torque_allowed: true,
			brand: 'hyundai',
			pcm_cruise: false,
			alpha_long_available: true,
			steer_control_type: 'torque',
			enable_bsm: true,
			is_release: false,
			is_sp_release: false,
			is_development: true,
			tesla_has_vehicle_bus: false,
			has_stop_and_go: false,
			stock_longitudinal: false,
			device_type: 'tici'
		},
		paramValues: {},
		isOffroad: true,
		...overrides
	};
}

// ── offroad_only ────────────────────────────────────────────────────────────

describe('offroad_only', () => {
	const rule: Rule = { type: 'offroad_only' };

	it('returns true when offroad', () => {
		expect(evaluateRule(rule, ctx({ isOffroad: true }))).toBe(true);
	});

	it('returns false when onroad', () => {
		expect(evaluateRule(rule, ctx({ isOffroad: false }))).toBe(false);
	});
});

// ── capability ──────────────────────────────────────────────────────────────

describe('capability', () => {
	it('matches boolean capability field', () => {
		const rule: Rule = { type: 'capability', field: 'has_longitudinal_control', equals: true };
		expect(evaluateRule(rule, ctx())).toBe(true);
	});

	it('fails when capability does not match', () => {
		const rule: Rule = { type: 'capability', field: 'has_icbm', equals: true };
		expect(evaluateRule(rule, ctx())).toBe(false);
	});

	it('matches string capability field (brand)', () => {
		const rule: Rule = { type: 'capability', field: 'brand', equals: 'hyundai' };
		expect(evaluateRule(rule, ctx())).toBe(true);
	});

	it('fails for wrong brand', () => {
		const rule: Rule = { type: 'capability', field: 'brand', equals: 'tesla' };
		expect(evaluateRule(rule, ctx())).toBe(false);
	});

	it('returns true (permissive) when capabilities are null', () => {
		const rule: Rule = { type: 'capability', field: 'has_longitudinal_control', equals: true };
		expect(evaluateRule(rule, ctx({ capabilities: null }))).toBe(true);
	});

	it('returns true (permissive) when capabilities are null and equals false', () => {
		const rule: Rule = { type: 'capability', field: 'has_icbm', equals: false };
		expect(evaluateRule(rule, ctx({ capabilities: null }))).toBe(true);
	});
});

// ── param ───────────────────────────────────────────────────────────────────

describe('param', () => {
	it('matches boolean param value', () => {
		const rule: Rule = { type: 'param', key: 'Mads', equals: true };
		expect(evaluateRule(rule, ctx({ paramValues: { Mads: true } }))).toBe(true);
	});

	it('fails when param is false', () => {
		const rule: Rule = { type: 'param', key: 'Mads', equals: true };
		expect(evaluateRule(rule, ctx({ paramValues: { Mads: false } }))).toBe(false);
	});

	it('coerces string "1" to boolean true', () => {
		const rule: Rule = { type: 'param', key: 'Mads', equals: true };
		expect(evaluateRule(rule, ctx({ paramValues: { Mads: '1' } }))).toBe(true);
	});

	it('coerces string "0" to boolean false', () => {
		const rule: Rule = { type: 'param', key: 'Mads', equals: false };
		expect(evaluateRule(rule, ctx({ paramValues: { Mads: '0' } }))).toBe(true);
	});

	it('coerces string "true" to boolean true', () => {
		const rule: Rule = { type: 'param', key: 'Mads', equals: true };
		expect(evaluateRule(rule, ctx({ paramValues: { Mads: 'true' } }))).toBe(true);
	});

	it('coerces string "false" to boolean false', () => {
		const rule: Rule = { type: 'param', key: 'Mads', equals: false };
		expect(evaluateRule(rule, ctx({ paramValues: { Mads: 'false' } }))).toBe(true);
	});

	it('coerces number 0 to boolean false', () => {
		const rule: Rule = { type: 'param', key: 'Mads', equals: false };
		expect(evaluateRule(rule, ctx({ paramValues: { Mads: 0 } }))).toBe(true);
	});

	it('coerces number 1 to boolean true', () => {
		const rule: Rule = { type: 'param', key: 'Mads', equals: true };
		expect(evaluateRule(rule, ctx({ paramValues: { Mads: 1 } }))).toBe(true);
	});

	it('matches numeric param value', () => {
		const rule: Rule = { type: 'param', key: 'OnroadScreenOffBrightness', equals: 0 };
		expect(evaluateRule(rule, ctx({ paramValues: { OnroadScreenOffBrightness: 0 } }))).toBe(true);
	});

	it('coerces string to number for numeric comparison', () => {
		const rule: Rule = { type: 'param', key: 'OnroadScreenOffBrightness', equals: 5 };
		expect(evaluateRule(rule, ctx({ paramValues: { OnroadScreenOffBrightness: '5' } }))).toBe(true);
	});

	it('returns false for missing param', () => {
		const rule: Rule = { type: 'param', key: 'NonExistent', equals: true };
		expect(evaluateRule(rule, ctx({ paramValues: {} }))).toBe(false);
	});

	it('returns false for undefined param value', () => {
		const rule: Rule = { type: 'param', key: 'Mads', equals: true };
		expect(evaluateRule(rule, ctx({ paramValues: { Mads: undefined } }))).toBe(false);
	});
});

// ── param_compare ───────────────────────────────────────────────────────────

describe('param_compare', () => {
	it('greater than — true', () => {
		const rule: Rule = { type: 'param_compare', key: 'AutoLaneChangeTimer', op: '>', value: 0 };
		expect(evaluateRule(rule, ctx({ paramValues: { AutoLaneChangeTimer: 2 } }))).toBe(true);
	});

	it('greater than — false (equal)', () => {
		const rule: Rule = { type: 'param_compare', key: 'AutoLaneChangeTimer', op: '>', value: 0 };
		expect(evaluateRule(rule, ctx({ paramValues: { AutoLaneChangeTimer: 0 } }))).toBe(false);
	});

	it('less than — true', () => {
		const rule: Rule = { type: 'param_compare', key: 'SpeedLimitMode', op: '<', value: 3 };
		expect(evaluateRule(rule, ctx({ paramValues: { SpeedLimitMode: 1 } }))).toBe(true);
	});

	it('greater than or equal — true (equal)', () => {
		const rule: Rule = { type: 'param_compare', key: 'SpeedLimitMode', op: '>=', value: 1 };
		expect(evaluateRule(rule, ctx({ paramValues: { SpeedLimitMode: 1 } }))).toBe(true);
	});

	it('less than or equal — true', () => {
		const rule: Rule = { type: 'param_compare', key: 'SpeedLimitMode', op: '<=', value: 2 };
		expect(evaluateRule(rule, ctx({ paramValues: { SpeedLimitMode: 2 } }))).toBe(true);
	});

	it('coerces string param to number', () => {
		const rule: Rule = { type: 'param_compare', key: 'AutoLaneChangeTimer', op: '>', value: 0 };
		expect(evaluateRule(rule, ctx({ paramValues: { AutoLaneChangeTimer: '3' } }))).toBe(true);
	});

	it('returns false for missing param', () => {
		const rule: Rule = { type: 'param_compare', key: 'Missing', op: '>', value: 0 };
		expect(evaluateRule(rule, ctx({ paramValues: {} }))).toBe(false);
	});

	it('returns false for non-numeric string param', () => {
		const rule: Rule = { type: 'param_compare', key: 'Bad', op: '>', value: 0 };
		expect(evaluateRule(rule, ctx({ paramValues: { Bad: 'abc' } }))).toBe(false);
	});

	it('coerces boolean to number', () => {
		const rule: Rule = { type: 'param_compare', key: 'Flag', op: '>=', value: 1 };
		expect(evaluateRule(rule, ctx({ paramValues: { Flag: true } }))).toBe(true);
	});
});

// ── not ─────────────────────────────────────────────────────────────────────

describe('not', () => {
	it('negates a true rule', () => {
		const rule: Rule = { type: 'not', condition: { type: 'offroad_only' } };
		expect(evaluateRule(rule, ctx({ isOffroad: true }))).toBe(false);
	});

	it('negates a false rule', () => {
		const rule: Rule = { type: 'not', condition: { type: 'offroad_only' } };
		expect(evaluateRule(rule, ctx({ isOffroad: false }))).toBe(true);
	});

	it('double negation', () => {
		const rule: Rule = {
			type: 'not',
			condition: { type: 'not', condition: { type: 'offroad_only' } }
		};
		expect(evaluateRule(rule, ctx({ isOffroad: true }))).toBe(true);
	});
});

// ── any ─────────────────────────────────────────────────────────────────────

describe('any', () => {
	it('returns true if any condition matches', () => {
		const rule: Rule = {
			type: 'any',
			conditions: [
				{ type: 'capability', field: 'has_longitudinal_control', equals: true },
				{ type: 'capability', field: 'has_icbm', equals: true }
			]
		};
		expect(evaluateRule(rule, ctx())).toBe(true);
	});

	it('returns false if no condition matches', () => {
		const rule: Rule = {
			type: 'any',
			conditions: [
				{ type: 'capability', field: 'has_icbm', equals: true },
				{ type: 'capability', field: 'pcm_cruise', equals: true }
			]
		};
		expect(evaluateRule(rule, ctx())).toBe(false);
	});

	it('returns false for empty conditions', () => {
		const rule: Rule = { type: 'any', conditions: [] };
		expect(evaluateRule(rule, ctx())).toBe(false);
	});
});

// ── all ─────────────────────────────────────────────────────────────────────

describe('all', () => {
	it('returns true if all conditions match', () => {
		const rule: Rule = {
			type: 'all',
			conditions: [
				{ type: 'offroad_only' },
				{ type: 'capability', field: 'torque_allowed', equals: true }
			]
		};
		expect(evaluateRule(rule, ctx())).toBe(true);
	});

	it('returns false if any condition fails', () => {
		const rule: Rule = {
			type: 'all',
			conditions: [
				{ type: 'offroad_only' },
				{ type: 'capability', field: 'has_icbm', equals: true }
			]
		};
		expect(evaluateRule(rule, ctx())).toBe(false);
	});

	it('returns true for empty conditions', () => {
		const rule: Rule = { type: 'all', conditions: [] };
		expect(evaluateRule(rule, ctx())).toBe(true);
	});
});

// ── unknown rule type ───────────────────────────────────────────────────────

describe('unknown rule type', () => {
	it('returns true for forward compatibility', () => {
		const rule = { type: 'future_rule_v2' } as unknown as Rule;
		expect(evaluateRule(rule, ctx())).toBe(true);
	});
});

// ── evaluateRules ───────────────────────────────────────────────────────────

describe('evaluateRules', () => {
	it('returns true for undefined rules', () => {
		expect(evaluateRules(undefined, ctx())).toBe(true);
	});

	it('returns true for empty array', () => {
		expect(evaluateRules([], ctx())).toBe(true);
	});

	it('ANDs all rules', () => {
		const rules: Rule[] = [
			{ type: 'offroad_only' },
			{ type: 'capability', field: 'torque_allowed', equals: true }
		];
		expect(evaluateRules(rules, ctx())).toBe(true);
	});

	it('fails if any rule fails', () => {
		const rules: Rule[] = [
			{ type: 'offroad_only' },
			{ type: 'capability', field: 'has_icbm', equals: true }
		];
		expect(evaluateRules(rules, ctx())).toBe(false);
	});
});

// ── isVisible / isEnabled ───────────────────────────────────────────────────

describe('isVisible', () => {
	it('returns true for no visibility rules', () => {
		expect(isVisible(undefined, ctx())).toBe(true);
	});

	it('evaluates visibility rules', () => {
		const rules: Rule[] = [{ type: 'param', key: 'Mads', equals: true }];
		expect(isVisible(rules, ctx({ paramValues: { Mads: true } }))).toBe(true);
		expect(isVisible(rules, ctx({ paramValues: { Mads: false } }))).toBe(false);
	});
});

describe('isEnabled', () => {
	it('returns true for no enablement rules', () => {
		expect(isEnabled(undefined, ctx())).toBe(true);
	});

	it('evaluates enablement rules', () => {
		const rules: Rule[] = [{ type: 'offroad_only' }];
		expect(isEnabled(rules, ctx({ isOffroad: true }))).toBe(true);
		expect(isEnabled(rules, ctx({ isOffroad: false }))).toBe(false);
	});
});

// ── requiresOffroad ─────────────────────────────────────────────────────────

describe('requiresOffroad', () => {
	it('returns false for no rules', () => {
		expect(requiresOffroad(undefined)).toBe(false);
	});

	it('returns false for empty rules', () => {
		expect(requiresOffroad([])).toBe(false);
	});

	it('detects top-level offroad_only', () => {
		expect(requiresOffroad([{ type: 'offroad_only' }])).toBe(true);
	});

	it('detects offroad_only inside all()', () => {
		const rules: Rule[] = [
			{
				type: 'all',
				conditions: [
					{ type: 'offroad_only' },
					{ type: 'capability', field: 'torque_allowed', equals: true }
				]
			}
		];
		expect(requiresOffroad(rules)).toBe(true);
	});

	it('does not detect offroad_only nested deeper', () => {
		const rules: Rule[] = [
			{
				type: 'any',
				conditions: [{ type: 'offroad_only' }]
			}
		];
		// requiresOffroad only checks top-level and one level inside all()
		expect(requiresOffroad(rules)).toBe(false);
	});

	it('returns false for non-offroad rules', () => {
		const rules: Rule[] = [{ type: 'capability', field: 'torque_allowed', equals: true }];
		expect(requiresOffroad(rules)).toBe(false);
	});
});

// ── Real-world rule combinations ────────────────────────────────────────────

describe('real-world rule combinations', () => {
	it('MADS sub-items visible when Mads=true', () => {
		const rules: Rule[] = [{ type: 'param', key: 'Mads', equals: true }];
		expect(isVisible(rules, ctx({ paramValues: { Mads: '1' } }))).toBe(true);
		expect(isVisible(rules, ctx({ paramValues: { Mads: '0' } }))).toBe(false);
	});

	it('ChevronInfo disabled without longitudinal control', () => {
		const rules: Rule[] = [{ type: 'capability', field: 'has_longitudinal_control', equals: true }];
		expect(isEnabled(rules, ctx())).toBe(true);

		const noLong = ctx();
		noLong.capabilities!.has_longitudinal_control = false;
		expect(isEnabled(rules, noLong)).toBe(false);
	});

	it('BSM delay: enableBsm AND timer > NUDGE', () => {
		const rules: Rule[] = [
			{ type: 'capability', field: 'enable_bsm', equals: true },
			{ type: 'param_compare', key: 'AutoLaneChangeTimer', op: '>', value: 0 }
		];
		expect(isEnabled(rules, ctx({ paramValues: { AutoLaneChangeTimer: 2 } }))).toBe(true);
		expect(isEnabled(rules, ctx({ paramValues: { AutoLaneChangeTimer: 0 } }))).toBe(false);

		const noBsm = ctx({ paramValues: { AutoLaneChangeTimer: 2 } });
		noBsm.capabilities!.enable_bsm = false;
		expect(isEnabled(rules, noBsm)).toBe(false);
	});

	it('EnforceTorque disabled when NNLC enabled', () => {
		const rules: Rule[] = [
			{ type: 'offroad_only' },
			{ type: 'capability', field: 'torque_allowed', equals: true },
			{ type: 'param', key: 'NeuralNetworkLateralControl', equals: false }
		];
		expect(isEnabled(rules, ctx({ paramValues: { NeuralNetworkLateralControl: '0' } }))).toBe(true);
		expect(isEnabled(rules, ctx({ paramValues: { NeuralNetworkLateralControl: '1' } }))).toBe(
			false
		);
	});

	it('Custom ACC: (has_long OR has_icbm) AND offroad', () => {
		const rules: Rule[] = [
			{ type: 'offroad_only' },
			{
				type: 'any',
				conditions: [
					{ type: 'capability', field: 'has_longitudinal_control', equals: true },
					{ type: 'capability', field: 'has_icbm', equals: true }
				]
			}
		];
		// has_long=true → enabled
		expect(isEnabled(rules, ctx())).toBe(true);

		// neither has_long nor has_icbm → disabled
		const neither = ctx();
		neither.capabilities!.has_longitudinal_control = false;
		neither.capabilities!.has_icbm = false;
		expect(isEnabled(rules, neither)).toBe(false);

		// has_icbm=true, has_long=false → enabled
		const icbmOnly = ctx();
		icbmOnly.capabilities!.has_longitudinal_control = false;
		icbmOnly.capabilities!.has_icbm = true;
		expect(isEnabled(rules, icbmOnly)).toBe(true);
	});

	it('Brightness timer NOT IN (AUTO, AUTO_DARK)', () => {
		const rules: Rule[] = [
			{
				type: 'not',
				condition: {
					type: 'any',
					conditions: [
						{ type: 'param', key: 'OnroadScreenOffBrightness', equals: 0 },
						{ type: 'param', key: 'OnroadScreenOffBrightness', equals: 1 }
					]
				}
			}
		];
		// Auto (0) → disabled
		expect(isEnabled(rules, ctx({ paramValues: { OnroadScreenOffBrightness: 0 } }))).toBe(false);
		// Auto Dark (1) → disabled
		expect(isEnabled(rules, ctx({ paramValues: { OnroadScreenOffBrightness: 1 } }))).toBe(false);
		// Manual 5% (3) → enabled
		expect(isEnabled(rules, ctx({ paramValues: { OnroadScreenOffBrightness: 3 } }))).toBe(true);
	});

	it('Toyota StopAndGo: offroad AND has_long AND NOT enforce_stock', () => {
		const rules: Rule[] = [
			{ type: 'offroad_only' },
			{ type: 'capability', field: 'has_longitudinal_control', equals: true },
			{ type: 'param', key: 'ToyotaEnforceStockLongitudinal', equals: false }
		];
		expect(
			isEnabled(
				rules,
				ctx({ paramValues: { ToyotaEnforceStockLongitudinal: false }, isOffroad: true })
			)
		).toBe(true);
		expect(
			isEnabled(
				rules,
				ctx({ paramValues: { ToyotaEnforceStockLongitudinal: true }, isOffroad: true })
			)
		).toBe(false);
		expect(
			isEnabled(
				rules,
				ctx({ paramValues: { ToyotaEnforceStockLongitudinal: false }, isOffroad: false })
			)
		).toBe(false);
	});

	it('no car fingerprinted: capability rules fail with vehicle-start message', () => {
		const rules: Rule[] = [{ type: 'capability', field: 'has_longitudinal_control', equals: true }];
		const noCar = ctx();
		noCar.capabilities!.brand = '';
		noCar.capabilities!.has_longitudinal_control = false;

		expect(isEnabled(rules, noCar)).toBe(false);
		const reasons = getDisabledReasons(rules, noCar);
		expect(reasons).toEqual(['Start the vehicle to check vehicle compatibility']);
	});
});
