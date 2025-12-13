let deviceSelectorOpen = $state(false);

export const deviceSelectorState = {
	get isOpen() {
		return deviceSelectorOpen;
	},
	set open(value: boolean) {
		deviceSelectorOpen = value;
	}
};
