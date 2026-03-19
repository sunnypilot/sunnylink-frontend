let deviceSelectorOpen = $state(false);

export const deviceSelectorState = {
	get isOpen() {
		return deviceSelectorOpen;
	},
	set isOpen(value: boolean) {
		deviceSelectorOpen = value;
	},
	toggle() {
		deviceSelectorOpen = !deviceSelectorOpen;
	}
};
