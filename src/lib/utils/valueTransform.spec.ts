import { describe, expect, it } from 'vitest';
import type { ValueTransformByUnit } from '$lib/types/schema';
import {
	resolveValueTransform,
	toDisplayStep,
	toDisplayValue,
	toStoredValue
} from './valueTransform';

const laneTurnTransforms: ValueTransformByUnit = {
	metric: { scale: 1.609344, precision: 0, step: 1 },
	imperial: { scale: 1, precision: 0, step: 1 }
};

describe('value transforms', () => {
	it('converts the lane turn range to whole km/h', () => {
		const transform = resolveValueTransform(laneTurnTransforms, true);
		expect(toDisplayValue(0, transform)).toBe(0);
		expect(toDisplayValue(20, transform)).toBe(32);
		expect(toDisplayStep(1, transform)).toBe(1);
	});

	it('converts displayed metric values back to canonical mph', () => {
		const transform = resolveValueTransform(laneTurnTransforms, true);
		const stored = toStoredValue(32, transform);
		expect(stored).toBeCloseTo(19.883878, 6);
		expect(toDisplayValue(stored, transform)).toBe(32);
	});

	it('keeps imperial display values in whole mph', () => {
		const transform = resolveValueTransform(laneTurnTransforms, false);
		expect(toDisplayValue(19.883878, transform)).toBe(20);
		expect(toStoredValue(20, transform)).toBe(20);
	});

	it('is an identity transform when no metadata is provided', () => {
		expect(resolveValueTransform(undefined, true)).toBeUndefined();
		expect(toDisplayValue(12.5, undefined)).toBe(12.5);
		expect(toStoredValue(12.5, undefined)).toBe(12.5);
		expect(toDisplayStep(0.5, undefined)).toBe(0.5);
	});

	it('uses an explicit display step without requiring a canonical step', () => {
		const transform = { scale: 1.609344, precision: 3, step: 0.001 };
		expect(toDisplayStep(undefined, transform)).toBe(0.001);
	});
});
