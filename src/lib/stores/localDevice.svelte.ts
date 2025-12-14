import { browser } from '$app/environment';

class LocalDeviceState {
    ip = $state('');
    port = '5088';
    isConnected = $state(false);

    constructor() {
        if (browser) {
            this.ip = localStorage.getItem('sunnylink_local_ip') || '';
        }
    }

    setIp(newIp: string) {
        this.ip = newIp;
        if (browser) {
            localStorage.setItem('sunnylink_local_ip', newIp);
        }
    }

    get baseUrl() {
        return `http://${this.ip}:${this.port}`;
    }
}

export const localDeviceState = new LocalDeviceState();
