import type { ValueTransform, ValueTransformByUnit } from '$lib/types/schema';

export function resolveValueTransform(
	transforms: ValueTransformByUnit | undefined,
	isMetric: boolean
): ValueTransform | undefined {
	return isMetric ? transforms?.metric : transforms?.imperial;
}

export function toDisplayValue(value: number, transform: ValueTransform | undefined): number {
	if (!transform || !Number.isFinite(value) || transform.scale <= 0) return value;
	return Number((value * transform.scale).toFixed(transform.precision));
}

export function toStoredValue(value: number, transform: ValueTransform | undefined): number {
	if (!transform || !Number.isFinite(value) || transform.scale <= 0) return value;
	return value / transform.scale;
}

export function toDisplayStep(
	step: number | undefined,
	transform: ValueTransform | undefined
): number | undefined {
	if (transform?.step !== undefined) return transform.step;
	if (step === undefined) return undefined;
	return toDisplayValue(step, transform);
}
