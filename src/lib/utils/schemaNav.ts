import {
	Bot,
	Car,
	Gauge,
	HardDrive,
	Map as MapIcon,
	Monitor,
	Package,
	Palette,
	ToggleLeft,
	Wind,
	Wrench
} from 'lucide-svelte';

import type { Panel, SettingsSchema } from '$lib/types/schema';

export type NavIcon = typeof HardDrive;

export interface SchemaNavItem {
	id: string;
	label: string;
	href: string;
	icon: NavIcon;
	order: number;
}

const SCHEMA_ICON_MAP: Record<string, NavIcon> = {
	cruise_control: Wind,
	developer: Wrench,
	device: HardDrive,
	display: Monitor,
	models: Bot,
	software: Package,
	steering_wheel: Gauge,
	toggles: ToggleLeft,
	visuals: Palette
};

const FALLBACK_ICON_BY_PANEL_ID: Record<string, NavIcon> = {
	cruise: Wind,
	developer: Wrench,
	device: HardDrive,
	display: Monitor,
	models: Bot,
	software: Package,
	steering: Gauge,
	toggles: ToggleLeft,
	vehicle: Car,
	visuals: Palette,
	osm: MapIcon,
	maps: MapIcon
};

const LEGACY_NAV_ITEMS: SchemaNavItem[] = [
	{
		id: 'device',
		label: 'Device',
		href: '/dashboard/settings/device',
		icon: HardDrive,
		order: 0
	},
	{
		id: 'toggles',
		label: 'Toggles',
		href: '/dashboard/settings/toggles',
		icon: ToggleLeft,
		order: 1
	},
	{
		id: 'models',
		label: 'Models',
		href: '/dashboard/models',
		icon: Bot,
		order: 2
	},
	{
		id: 'steering',
		label: 'Steering',
		href: '/dashboard/settings/steering',
		icon: Gauge,
		order: 3
	},
	{
		id: 'cruise',
		label: 'Cruise',
		href: '/dashboard/settings/cruise',
		icon: Wind,
		order: 4
	},
	{
		id: 'visuals',
		label: 'Visuals',
		href: '/dashboard/settings/visuals',
		icon: Palette,
		order: 5
	},
	{
		id: 'display',
		label: 'Display',
		href: '/dashboard/settings/display',
		icon: Monitor,
		order: 6
	},
	{
		id: 'osm',
		label: 'Maps',
		href: '/dashboard/osm',
		icon: MapIcon,
		order: 7.5
	},
	{
		id: 'vehicle',
		label: 'Vehicle',
		href: '/dashboard/settings/vehicle',
		icon: Car,
		order: 8
	},
	{
		id: 'software',
		label: 'Software',
		href: '/dashboard/settings/software',
		icon: Package,
		order: 9
	},
	{
		id: 'developer',
		label: 'Developer',
		href: '/dashboard/settings/developer',
		icon: Wrench,
		order: 10
	}
];

export function getPanelIcon(panel: Pick<Panel, 'id' | 'icon'>): NavIcon {
	return SCHEMA_ICON_MAP[panel.icon] ?? FALLBACK_ICON_BY_PANEL_ID[panel.id] ?? HardDrive;
}

function panelHref(panelId: string): string {
	if (panelId === 'models') return '/dashboard/models';
	return `/dashboard/settings/${panelId}`;
}

function panelToNavItem(panel: Panel): SchemaNavItem {
	return {
		id: panel.id,
		label: panel.label,
		href: panelHref(panel.id),
		icon: getPanelIcon(panel),
		order: panel.order
	};
}

export function getBuiltinNavItems(): SchemaNavItem[] {
	return LEGACY_NAV_ITEMS;
}

export function getCustomSchemaNavItems(schema: SettingsSchema | undefined): SchemaNavItem[] {
	if (!schema?.panels?.length) return [];

	const builtInHrefs = new Set(LEGACY_NAV_ITEMS.map((item) => item.href));

	return schema.panels
		.map(panelToNavItem)
		.filter((item) => !builtInHrefs.has(item.href))
		.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function getDashboardNavItems(schema: SettingsSchema | undefined): SchemaNavItem[] {
	return [...getBuiltinNavItems(), ...getCustomSchemaNavItems(schema)];
}
