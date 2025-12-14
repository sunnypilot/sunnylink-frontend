
export class HudRenderer {
    is_cruise_set = false;
    is_cruise_available = false;
    set_speed = 255;
    speed = 0;
    v_ego_cluster_seen = false;
    ctx: CanvasRenderingContext2D | null = null;

    // Config
    P = { header_height: 150, border_size: 15, button_size: 96, set_speed_width_metric: 100, set_speed_width_imperial: 86, set_speed_height: 102 };
    K = { current_speed: 88, speed_unit: 33, max_speed: 20, set_speed: 45 };
    M = {
        white: "rgba(255, 255, 255, 1)",
        disengaged: "rgba(145, 155, 149, 1)",
        override: "rgba(145, 155, 149, 1)",
        engaged: "rgba(128, 216, 166, 1)",
        grey: "rgba(166, 166, 166, 1)",
        dark_grey: "rgba(114, 114, 114, 1)",
        black_translucent: "rgba(0, 0, 0, 0.65)",
        white_translucent: "rgba(255, 255, 255, 0.78)",
        border_translucent: "rgba(255, 255, 255, 0.29)",
        header_gradient_start: "rgba(0, 0, 0, 0.45)",
        header_gradient_end: "rgba(0, 0, 0, 0)"
    };
    J = { DISENGAGED: "DISENGAGED", OVERRIDE: "OVERRIDE", ENGAGED: "ENGAGED" };

    isMetric = false;

    render(rect: any, state: any, ctx: CanvasRenderingContext2D, isMetric = false) {
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;

        this.ctx = ctx;
        this.isMetric = isMetric;
        this._update_state(state);

        this._draw_header_gradient(rect);
        if (this.is_cruise_available) {
            this._draw_set_speed(rect);
        }
        this._draw_current_speed(rect);
    }

    _update_state(state: any) {
        if (!state.carState || !state.controlsState) {
            this.is_cruise_set = false;
            this.set_speed = 255;
            this.speed = 0;
            return;
        }

        const carState = state.carState;
        const controlsState = state.controlsState;

        // Speed
        const vEgo = carState.vEgoCluster || carState.vEgo || 0;
        const conversion = this.isMetric ? 3.6 : 2.236936;
        this.speed = Math.max(0, vEgo * conversion);

        // Max Speed
        const vCruise = carState.vCruiseCluster ?? 0;
        // fallback to deprecated if 0
        this.set_speed = vCruise === 0 ? (controlsState.vCruiseDEPRECATED || 0) : vCruise;

        this.is_cruise_set = this.set_speed > 0 && this.set_speed < 255;
        this.is_cruise_available = this.set_speed !== -1;

        if (this.is_cruise_set && !this.isMetric) {
            this.set_speed *= 0.621371; // kph to mph
        }
    }

    _draw_header_gradient(rect: any) {
        if (!this.ctx) return;
        const grad = this.ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + this.P.header_height);
        grad.addColorStop(0, this.M.header_gradient_start);
        grad.addColorStop(1, this.M.header_gradient_end);

        this.ctx.fillStyle = grad;
        this.ctx.fillRect(rect.x, rect.y, rect.width, this.P.header_height);
    }

    _draw_set_speed(rect: any) {
        if (!this.ctx) return;
        const w = this.isMetric ? this.P.set_speed_width_metric : this.P.set_speed_width_imperial;
        const x = rect.x + 30 + (this.P.set_speed_width_imperial - w) / 2;
        const y = rect.y + 22;

        // Bg
        this.ctx.fillStyle = this.M.black_translucent;
        this._draw_rounded_rect(x, y, w, this.P.set_speed_height, 10, true);

        this.ctx.strokeStyle = this.M.border_translucent;
        this.ctx.lineWidth = 3;
        this._draw_rounded_rect(x, y, w, this.P.set_speed_height, 10, false);

        // Text
        this.ctx.fillStyle = this.M.white; // Simplified logic for text color
        this.ctx.font = `600 ${this.K.max_speed}px Arial`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText("MAX", x + w / 2, y + 23);

        const speedStr = this.is_cruise_set ? Math.round(this.set_speed).toString() : "–";
        this.ctx.fillStyle = this.M.white;
        this.ctx.font = `bold ${this.K.set_speed}px Arial`;
        this.ctx.fillText(speedStr, x + w / 2, y + 61);
    }

    _draw_current_speed(rect: any) {
        if (!this.ctx) return;
        const speedStr = Math.round(this.speed).toString();
        this.ctx.fillStyle = this.M.white;
        this.ctx.font = `bold ${this.K.current_speed}px Arial`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(speedStr, rect.x + rect.width / 2, rect.y + 22 + this.K.current_speed / 2);

        const unit = this.isMetric ? "km/h" : "mph";
        this.ctx.fillStyle = this.M.white_translucent;
        this.ctx.font = `500 ${this.K.speed_unit}px Arial`;
        this.ctx.fillText(unit, rect.x + rect.width / 2, rect.y + 22 + this.K.current_speed + 15);
    }

    _draw_rounded_rect(x: number, y: number, w: number, h: number, r: number, fill: boolean) {
        if (!this.ctx) return;
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, w, h, r);
        if (fill) this.ctx.fill();
        else this.ctx.stroke();
    }

    _get_ui_status(state: any) {
        // ... implementation if needed
        return this.J.DISENGAGED;
    }
}
