export const toastState = $state({
    message: '',
    type: 'success' as 'success' | 'error' | 'info',
    visible: false,
    show(message: string, type: 'success' | 'error' | 'info' = 'success') {
        this.message = message;
        this.type = type;
        this.visible = true;
        setTimeout(() => {
            this.visible = false;
        }, 3000);
    }
});
