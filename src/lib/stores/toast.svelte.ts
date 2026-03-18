export type ToastAction = { label: string; onclick: () => void };

export const toastState = $state({
	message: '',
	type: 'success' as 'success' | 'error' | 'info' | 'warning',
	visible: false,
	action: undefined as ToastAction | undefined,
	show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success', action?: ToastAction) {
		this.message = message;
		this.type = type;
		this.action = action;
		this.visible = true;
		const duration = type === 'error' ? 5000 : 3000;
		setTimeout(() => {
			this.visible = false;
		}, duration);
	}
});
