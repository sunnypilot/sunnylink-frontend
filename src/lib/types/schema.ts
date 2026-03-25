/**
 * Settings Schema Types
 *
 * These types describe the device-generated settings schema that drives
 * the sunnylink-frontend settings UI. The schema is generated at runtime
 * on the device by generate_settings_schema.py and served as the
 * SettingsSchema param via the getParams RPC.
 */

export type Rule =
	| OffroadOnlyRule
	| CapabilityRule
	| ParamRule
	| ParamCompareRule
	| NotRule
	| AnyRule
	| AllRule;

export interface OffroadOnlyRule {
	type: 'offroad_only';
}

export interface CapabilityRule {
	type: 'capability';
	field: string;
	equals: unknown;
}

export interface ParamRule {
	type: 'param';
	key: string;
	equals: unknown;
}

export interface ParamCompareRule {
	type: 'param_compare';
	key: string;
	op: '>' | '<' | '>=' | '<=';
	value: number;
}

export interface NotRule {
	type: 'not';
	condition: Rule;
}

export interface AnyRule {
	type: 'any';
	conditions: Rule[];
}

export interface AllRule {
	type: 'all';
	conditions: Rule[];
}

export interface Capabilities {
	has_longitudinal_control: boolean;
	has_icbm: boolean;
	icbm_available: boolean;
	torque_allowed: boolean;
	brand: string;
	pcm_cruise: boolean;
	alpha_long_available: boolean;
	steer_control_type: string;
	enable_bsm: boolean;
	is_release: boolean;
	is_sp_release: boolean;
	is_development: boolean;
	tesla_has_vehicle_bus: boolean;
	has_stop_and_go: boolean;
	stock_longitudinal: boolean;
}

export type WidgetType = 'toggle' | 'option' | 'multiple_button' | 'button' | 'info';

export interface SchemaOption {
	value: number | string;
	label: string;
	enablement?: Rule[];
}

export interface SchemaItem {
	key: string;
	widget: WidgetType;
	title?: string;
	description?: string;
	options?: SchemaOption[];
	min?: number;
	max?: number;
	step?: number;
	unit?: string | { metric: string; imperial: string };
	value_map?: Record<string, number>;
	visibility?: Rule[];
	enablement?: Rule[];
	sub_items?: SchemaItem[];
	action?: string;
	needs_onroad_cycle?: boolean;
	blocked?: boolean;
	title_param_suffix?: {
		param: string;
		values: Record<string, string>;
	};
}

export interface SubPanel {
	id: string;
	label: string;
	trigger_key: string;
	trigger_condition?: Rule;
	items: SchemaItem[];
}

export interface PanelSection {
	id: string;
	title: string;
	description?: string;
	order?: number;
	items: SchemaItem[];
	sub_panels?: SubPanel[];
	enablement?: Rule[];
	visibility?: Rule[];
}

export interface Panel {
	id: string;
	label: string;
	icon: string;
	order: number;
	description?: string;
	remote_configurable: boolean;
	sections?: PanelSection[];
	items?: SchemaItem[];
	sub_panels?: SubPanel[];
}

export interface VehicleBrandSettings {
	title: string;
	description?: string;
	items: SchemaItem[];
}

export interface SettingsSchema {
	schema_version: string;
	generated_at?: string;
	panels: Panel[];
	vehicle_settings: Record<string, VehicleBrandSettings>;
	capability_fields?: string[];
	capability_labels?: Record<string, string>;
	capabilities?: Capabilities;
}
