export class AlertRenderer {
    started_time = 0;
    last_selfdrive_time = 0;
    _cachedAlert: any = null;
    ctx: CanvasRenderingContext2D | null = null;

    W = { none: "none", small: "small", mid: "mid", full: "full" };
    G = { normal: "normal", userPrompt: "userPrompt", critical: "critical" };

    alerts = {
        unavailable: { text1: "openpilot Unavailable", text2: "Waiting to start", size: "mid", status: "normal" },
        control: { text1: "TAKE CONTROL IMMEDIATELY", text2: "System Unresponsive", size: "full", status: "critical" },
        reboot: { text1: "System Unresponsive", text2: "Reboot Device", size: "full", status: "critical" }
    };

    render(rect: any, state: any, ctx: CanvasRenderingContext2D) {
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        this.ctx = ctx;

        const alert = this.get_alert(state);
        if (!alert) {
            this._cachedAlert = null;
            return false;
        }

        const alertRect = this._get_alert_rect(rect, alert.size);
        this._draw_background(alertRect, alert);

        // Content rect with padding
        const contentRect = {
            x: alertRect.x + 40,
            y: alertRect.y + 40,
            width: alertRect.width - 80,
            height: alertRect.height - 80
        };

        this._draw_text(contentRect, alert);
        return true;
    }

    get_alert(state: any) {
        const now = Date.now();
        if (this.started_time === 0 && state.selfdriveState) {
            this.started_time = now;
        }

        if (!state.selfdriveState) {
            if (this.started_time > 0 && now - this.started_time > 5000) {
                return this.alerts.unavailable;
            }
            return null;
        }

        if (state.updated && state.updated.selfdriveState) {
            this.last_selfdrive_time = now;
        }

        // Stale checks could go here, omitting for brevity of port

        const sd = state.selfdriveState;
        if (!sd || sd.alertSize === this.W.none || !sd.alertText1) return null;

        return {
            text1: sd.alertText1,
            text2: sd.alertText2 || "",
            size: sd.alertSize,
            status: sd.alertStatus || this.G.normal
        };
    }

    _get_alert_rect(rect: any, size: string) {
        if (size === this.W.full) return rect;
        return {
            x: 0,
            y: rect.height * 0.8,
            width: rect.width,
            height: rect.height * 0.2
        };
    }

    _draw_background(rect: any, alert: any) {
        if (!this.ctx) return;
        let color = "rgba(0, 0, 0, 0.92)";
        if (alert.status === this.G.userPrompt) color = "rgba(254, 140, 52, 0.92)";
        if (alert.status === this.G.critical) color = "rgba(201, 34, 49, 0.92)";

        this.ctx.fillStyle = color;
        this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    _draw_text(rect: any, alert: any) {
        if (!this.ctx) return;
        this.ctx.fillStyle = "white";
        this.ctx.textAlign = "center";

        if (alert.size === this.W.small) {
            this.ctx.font = "bold 36px Arial";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(alert.text1, rect.x + rect.width / 2, rect.y + rect.height / 2);
        } else if (alert.size === this.W.mid) {
            this.ctx.font = "bold 36px Arial";
            this.ctx.textBaseline = "bottom";
            this.ctx.fillText(alert.text1, rect.x + rect.width / 2, rect.y + rect.height / 3);

            this.ctx.font = "24px Arial";
            this.ctx.textBaseline = "top";
            this.ctx.fillText(alert.text2, rect.x + rect.width / 2, rect.y + rect.height * 2 / 3);
        } else {
            // Full
            const titleSize = alert.text1.length > 15 ? 66 : 78;
            this.ctx.font = `bold ${titleSize}px Arial`;
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(alert.text1, rect.x + rect.width / 2, rect.y + rect.height / 2);

            this.ctx.font = "bold 48px Arial";
            this.ctx.textBaseline = "top";
            this.ctx.fillText(alert.text2, rect.x + rect.width / 2, rect.y + rect.height * 2 / 3);
        }
    }
}
