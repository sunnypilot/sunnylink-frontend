import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { deviceState } from '$lib/stores/device.svelte';
import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
import type { SchemaItem } from '$lib/types/schema';
import SchemaItemRenderer from './SchemaItemRenderer.svelte';

const DEVICE_ID = 'value-transform-test-device';
const MPH_TO_KPH = 1.609344;

const laneTurnItem: SchemaItem = {
	key: 'LaneTurnValue',
	title: 'Adjust lane turn speed',
	widget: 'option',
	min: 0,
	max: 20,
	step: 1,
	unit: { metric: 'km/h', imperial: 'mph' },
	value_transform: {
		metric: { scale: MPH_TO_KPH, precision: 0, step: 1 },
		imperial: { scale: 1, precision: 0, step: 1 }
	}
};

function seedDevice(storedValue: number, isMetric = true): void {
	pendingChanges.clearAll(DEVICE_ID);
	deviceState.deviceValues[DEVICE_ID] = {
		LaneTurnValue: storedValue,
		IsMetric: isMetric ? 1 : 0
	};
	deviceState.onlineStatuses[DEVICE_ID] = 'offline';
}

afterEach(() => {
	cleanup();
	pendingChanges.clearAll(DEVICE_ID);
	delete deviceState.deviceValues[DEVICE_ID];
	delete deviceState.onlineStatuses[DEVICE_ID];
});

describe('SchemaItemRenderer value transforms', () => {
	it('does not rewrite a canonical maximum that rounds to the display maximum', async () => {
		seedDevice(20);
		const rendered = render(SchemaItemRenderer, { deviceId: DEVICE_ID, item: laneTurnItem });

		const increase = page.getByRole('button', { name: 'Increase Adjust lane turn speed' });
		await expect.element(increase).toBeDisabled();
		expect(rendered.container.textContent).toContain('32 km/h');
		expect(rendered.container.textContent).not.toContain('32.0');
		expect(deviceState.deviceValues[DEVICE_ID]?.LaneTurnValue).toBe(20);
		expect(pendingChanges.getForKey(DEVICE_ID, 'LaneTurnValue')).toBeUndefined();
	});

	it('writes the canonical mph value when increasing from 31 to 32 km/h', async () => {
		seedDevice(31 / MPH_TO_KPH);
		render(SchemaItemRenderer, { deviceId: DEVICE_ID, item: laneTurnItem });

		await page.getByRole('button', { name: 'Increase Adjust lane turn speed' }).click();

		const expectedStored = 32 / MPH_TO_KPH;
		expect(deviceState.deviceValues[DEVICE_ID]?.LaneTurnValue).toBeCloseTo(expectedStored, 10);
		expect(pendingChanges.getForKey(DEVICE_ID, 'LaneTurnValue')?.desiredValue).toBeCloseTo(
			expectedStored,
			10
		);
	});

	it('switches units without changing the canonical value', async () => {
		seedDevice(20);
		const rendered = render(SchemaItemRenderer, { deviceId: DEVICE_ID, item: laneTurnItem });
		expect(rendered.container.textContent).toContain('32 km/h');

		deviceState.deviceValues[DEVICE_ID]!.IsMetric = 0;
		await tick();

		expect(rendered.container.textContent).toContain('20 mph');
		expect(deviceState.deviceValues[DEVICE_ID]?.LaneTurnValue).toBe(20);
		expect(pendingChanges.getForKey(DEVICE_ID, 'LaneTurnValue')).toBeUndefined();
	});

	it('honors transformed display precision and step without a canonical step', async () => {
		seedDevice(20);
		deviceState.deviceValues[DEVICE_ID]!.PrecisionValue = 1.25;
		const precisionItem: SchemaItem = {
			key: 'PrecisionValue',
			title: 'Precision value',
			widget: 'option',
			min: 0,
			max: 10,
			unit: 'widgets',
			value_transform: {
				metric: { scale: 1, precision: 3, step: 0.001 }
			}
		};

		const rendered = render(SchemaItemRenderer, {
			deviceId: DEVICE_ID,
			item: precisionItem
		});
		const input = rendered.container.querySelector<HTMLInputElement>('input[type="range"]');

		expect(input?.step).toBe('0.001');
		expect(rendered.container.textContent).toContain('1.250 widgets');

		await page.getByRole('button', { name: 'Increase Precision value' }).click();
		expect(deviceState.deviceValues[DEVICE_ID]?.PrecisionValue).toBe(1.251);
	});
});
