
import { AlertRenderer } from './AlertRenderer';
import { HudRenderer } from './HudRenderer';
import { ModelRenderer } from './ModelRenderer';
import { CALIB_INITIAL, INTRINSICS, matMul, rpyToMatrix } from './math';

export class AugmentedRoadView {
    device_camera: any = null;
    view_from_calib = CALIB_INITIAL; // copy
    _last_calib_time = 0;
    _last_rect_dims = { width: 0, height: 0 };
    _cached_matrix: any = null;
    _content_rect = { x: 0, y: 0, width: 0, height: 0 };

    model_renderer = new ModelRenderer();
    hud_renderer = new HudRenderer();
    alert_renderer = new AlertRenderer();

    ctx: CanvasRenderingContext2D | null = null;
    sm: any = null; // Submaster / state object

    BORDER_SIZE = 8;
    BORDER_COLORS = {
        DISENGAGED: { r: 18, g: 40, b: 57, a: 255 },
        OVERRIDE: { r: 137, g: 146, b: 141, a: 255 },
        ENGAGED: { r: 22, g: 127, b: 64, a: 255 }
    };

    render(rect: any, state: any, ctx: CanvasRenderingContext2D, isMetric: boolean) {
        this.sm = state;
        this.ctx = ctx;
        this._update_calibration();

        // Calculate aspect ratio / content rect
        const W = rect.width - 2 * this.BORDER_SIZE;
        const H = rect.height - 2 * this.BORDER_SIZE;

        // Default to tici if unknown
        const camera = this.device_camera || INTRINSICS.tici;
        const camW = camera.fcam.width;
        const camH = camera.fcam.height;

        const screenAspect = W / H;
        const camAspect = camW / camH;

        let viewW = W;
        let viewH = H;
        let x = rect.x + this.BORDER_SIZE;
        let y = rect.y + this.BORDER_SIZE;

        if (screenAspect > camAspect) {
            viewW = H * camAspect;
            x += (W - viewW) / 2;
        } else {
            viewH = W / camAspect;
            y += (H - viewH) / 2;
        }

        this._content_rect = { x, y, width: viewW, height: viewH };

        this._draw_border(rect);

        ctx.save();
        ctx.beginPath();
        ctx.rect(Math.floor(rect.x), Math.floor(rect.y), Math.floor(rect.width), Math.floor(rect.height));
        ctx.clip();

        this._calc_frame_matrix(state);
        this.model_renderer.render(this._content_rect, state, ctx);

        ctx.restore();

        this.hud_renderer.render(rect, state, ctx, isMetric);
        this.alert_renderer.render(rect, state, ctx);
    }

    _update_calibration() {
        const state = this.sm;
        if (!this.device_camera && state.seen?.roadCameraState && state.seen?.deviceState) {
            const type = state.deviceState?.deviceType || 'tici';
            if (type === 'mici') this.device_camera = INTRINSICS.mici;
            else this.device_camera = INTRINSICS.tici;
        }

        if (!state.liveCalibration) return;
        const cal = state.liveCalibration;
        if (!cal.rpyCalib || cal.rpyCalib.length !== 3) return;

        // Only update if calibrated or forcing it? app.js has strict check
        // Simplified: always update if available
        const rpy = cal.rpyCalib;
        const rpyMat = rpyToMatrix(rpy);
        this.view_from_calib = matMul(CALIB_INITIAL, rpyMat);
        this._cached_matrix = null;
    }

    _calc_frame_matrix(state: any) {
        // Caching logic from app.js omitted for brevity - recomputing is safer for now
        const camera = this.device_camera || INTRINSICS.tici;
        const intrinsics = camera.fcam.intrinsics;
        const camW = camera.fcam.width;
        const camH = camera.fcam.height;
        const viewFromCalib = this.view_from_calib;
        const zoom = 1.1; // Default zoom

        const width = this.ctx?.canvas.width || 1000;
        const height = this.ctx?.canvas.height || 1000;

        // Ratio mapping logic from app.js "b = Math.max..."
        const b = Math.max(width / camW, height / camH);

        // This math needs to match exactly or things drift
        // app.js: const A = intrinsics[0][0] * b * h; (h=zoom)
        const A = intrinsics[0][0] * b * zoom;

        // Matrix E
        const E = [
            [-A, 0, width / 2],
            [0, -A, height / 2],
            [0, 0, 1]
        ];

        const transform = matMul(E, viewFromCalib);
        this.model_renderer.set_transform(transform);
        this._cached_matrix = transform;
    }

    _draw_border(rect: any) {
        if (!this.ctx) return;
        let status = "DISENGAGED";
        const sd = this.sm.selfdriveState;
        if (sd) {
            if (sd.enabled) status = "ENGAGED";
            else if (sd.activeOverride) status = "OVERRIDE";
        }

        const c = this.BORDER_COLORS[status as keyof typeof this.BORDER_COLORS] || this.BORDER_COLORS.DISENGAGED;
        this.ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a / 255})`;
        this.ctx.lineWidth = this.BORDER_SIZE;
        this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
}
