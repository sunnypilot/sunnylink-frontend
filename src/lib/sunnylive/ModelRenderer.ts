import { clamp, MAX_DRAW_DISTANCE, MIN_DRAW_DISTANCE } from './math';

export class ModelRenderer {
    _longitudinal_control = false;
    _experimental_mode = false;
    _blend_factor = 1;
    _prev_allow_throttle = true;
    _lead_vehicles: any[] = [{}, {}];
    _path_offset_z = 1.22;
    _use_simple_lines = true;

    // Geometry buffers
    _path = { raw_points: [] as number[][], projected_points: [] as number[][] };
    _lane_lines = Array(4).fill(null).map(() => ({ raw_points: [] as number[][], projected_points: [] as number[][] }));
    _road_edges = Array(2).fill(null).map(() => ({ raw_points: [] as number[][], projected_points: [] as number[][] }));

    _acceleration_x: Float32Array = new Float32Array(0);
    _lane_line_probs = new Float32Array(4);
    _road_edge_stds = new Float32Array(2);

    _transformCache = new Map();
    _pathCache = new Map();
    _pathCacheMaxSize = 30;

    // Caches for optimization
    _path_x_cache = new Float32Array(200);
    _path_x_length = 0;
    _car_space_transform = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    _transform_dirty = true;
    _rect = { x: 0, y: 0, width: 0, height: 0 };
    ctx: CanvasRenderingContext2D | null = null;

    set_transform(transform: number[][]) {
        this._car_space_transform = transform;
        this._transform_dirty = true;
        this._transformCache.clear();
        this._pathCache.clear();
    }

    clear_caches() {
        this._transformCache.clear();
        this._pathCache.clear();
    }

    render(rect: any, state: any, ctx: CanvasRenderingContext2D) {
        this._rect = rect;
        this.ctx = ctx;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (!state.liveCalibration || !state.modelV2) return;

        const liveCalibration = state.liveCalibration;
        if (liveCalibration && liveCalibration.height && liveCalibration.height.length > 0) {
            this._path_offset_z = liveCalibration.height[0] || 1.22;
        }

        this._experimental_mode = state.selfdriveState?.experimentalMode || false;

        // Check longitudinal control
        if (state.updated && state.updated.carParams) {
            this._longitudinal_control = state.carParams.openpilotLongitudinalControl || false;
        }

        const modelV2 = state.modelV2;
        const radarState = state.valid && state.valid.radarState ? state.radarState : null;
        const leadOne = radarState ? radarState.leadOne : null;
        const hasLongControl = this._longitudinal_control && radarState !== null;

        const modelUpdated = state.updated && state.updated.modelV2;

        if (modelUpdated || this._transform_dirty) {
            if (modelUpdated) this._update_raw_points(modelV2);
            if (this._path_x_length === 0) return;

            this._update_model(leadOne);
            if (hasLongControl) this._update_leads(radarState);
            this._transform_dirty = false;
        }

        if (state.selfdriveState && (state.selfdriveState.enabled || state.selfdriveState.activeOverride)) {
            this._draw_lane_lines();
            this._draw_path(state);
        }

        if (hasLongControl && radarState) {
            this._draw_lead_indicator();
        }
    }

    _update_raw_points(model: any) {
        if (model.position && model.position.x) {
            this._path.raw_points.length = 0;
            const len = model.position.x.length || 0;
            for (let i = 0; i < len; i++) {
                const x = model.position.x[i] ?? 0;
                const y = model.position.y?.[i] ?? 0;
                const z = model.position.z?.[i] ?? 0;
                this._path.raw_points.push([x, y, z]);
                this._path_x_cache[i] = x;
            }
            this._path_x_length = len;
        } else {
            this._path_x_length = 0;
        }

        if (model.laneLines) {
            model.laneLines.forEach((line: any, i: number) => {
                if (this._lane_lines[i] && line && line.x) {
                    this._lane_lines[i].raw_points.length = 0;
                    const lineLen = line.x.length || 0;
                    for (let j = 0; j < lineLen; j++) {
                        const x = line.x[j] ?? 0;
                        const y = line.y?.[j] ?? 0;
                        const z = line.z?.[j] ?? 0;
                        this._lane_lines[i].raw_points.push([x, y, z]);
                    }
                }
            });
        }

        if (model.roadEdges) {
            model.roadEdges.forEach((edge: any, i: number) => {
                if (this._road_edges[i] && edge && edge.x) {
                    this._road_edges[i].raw_points.length = 0;
                    const edgeLen = edge.x.length || 0;
                    for (let j = 0; j < edgeLen; j++) {
                        const x = edge.x[j] ?? 0;
                        const y = edge.y?.[j] ?? 0;
                        const z = edge.z?.[j] ?? 0;
                        this._road_edges[i].raw_points.push([x, y, z]);
                    }
                }
            });
        }

        const probs = model.laneLineProbs || [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) this._lane_line_probs[i] = probs[i] || 0;

        const stds = model.roadEdgeStds || [1, 1];
        for (let i = 0; i < 2; i++) this._road_edge_stds[i] = stds[i] || 1;
    }

    _update_model(leadOne: any) {
        let maxDist = clamp(this._path_x_cache[this._path_x_length - 1] || 0, MIN_DRAW_DISTANCE, MAX_DRAW_DISTANCE);

        this._update_line_projection(this._path, maxDist, 0.9, this._path_offset_z);

        this._lane_lines.forEach((line, i) => {
            const prob = this._lane_line_probs[i] ?? 0;
            this._update_line_projection(line, maxDist, 0.025 * prob, 0);
        });

        this._road_edges.forEach((line, i) => {
            this._update_line_projection(line, maxDist, 0.025, 0);
        });
    }

    _update_line_projection(line: any, maxDist: number, yOffset: number, zOffset: number) {
        const points = line.raw_points;
        const projected = [];

        for (const p of points) {
            const px: number = p[0] ?? 0;
            const py: number = p[1] ?? 0;
            const pz: number = p[2] ?? 0;

            if (px > maxDist) break;

            // Left edge
            const l = this._transform_point(px, py - yOffset, pz + zOffset);
            // Right edge
            const r = this._transform_point(px, py + yOffset, pz + zOffset);

            if (l.valid && r.valid) {
                projected.push({ l, r });
            }
        }

        // Build polygon
        const poly = [];
        // Walk forward on left
        for (let i = 0; i < projected.length; i++) poly.push([projected[i].l.x, projected[i].l.y]);
        // Walk backward on right
        for (let i = projected.length - 1; i >= 0; i--) poly.push([projected[i].r.x, projected[i].r.y]);

        line.projected_points = poly;
    }

    _transform_point(x: number, y: number, z: number) {
        const t = this._car_space_transform;
        // Defensive checks
        if (!t[0] || !t[1] || !t[2]) return { x: 0, y: 0, valid: false };

        const r0 = t[0];
        const r1 = t[1];
        const r2 = t[2];

        // Safe access
        const r00 = r0[0] ?? 0; const r01 = r0[1] ?? 0; const r02 = r0[2] ?? 0;
        const r10 = r1[0] ?? 0; const r11 = r1[1] ?? 0; const r12 = r1[2] ?? 0;
        const r20 = r2[0] ?? 0; const r21 = r2[1] ?? 0; const r22 = r2[2] ?? 0;

        const rx = r00 * x + r01 * y + r02 * z;
        const ry = r10 * x + r11 * y + r12 * z;
        const rz = r20 * x + r21 * y + r22 * z;

        if (Math.abs(rz) < 1e-6) return { x: 0, y: 0, valid: false };
        return { x: rx / rz, y: ry / rz, valid: true };
    }

    _update_leads(radarState: any) {
        this._lead_vehicles = [{}, {}];
        const leads = [radarState.leadOne, radarState.leadTwo];

        leads.forEach((lead, i) => {
            if (lead && lead.status) {
                const dRel: number = lead.dRel ?? 0;
                const vRel: number = lead.vRel ?? 0;
                const yRel: number = lead.yRel ?? 0;
                const pt = this._transform_point(dRel, -yRel, this._path_offset_z); // Approx z

                if (pt.valid) {
                    this._lead_vehicles[i] = this._update_lead_vehicle(dRel, vRel, [pt.x, pt.y], this._rect);
                }
            }
        });
    }

    _update_lead_vehicle(dRel: number, vRel: number, pt: number[], rect: any) {
        const ptx = pt[0] ?? 0;
        const pty = pt[1] ?? 0;

        const sz = clamp(750 / (dRel / 3 + 30), 15, 30) * 1.57;
        const x = clamp(ptx, 0, rect.width - sz / 2);
        const y = Math.min(pty, rect.height - sz * 0.6);

        // Chevron shape logic
        const r = sz / 2;
        return {
            chevron: [
                [x + r, y + r],
                [x, y],
                [x - r, y + r]
            ],
            // Simplified from app.js
            glow: [],
            fill_alpha: 255
        };
    }

    _draw_lane_lines() {
        this._lane_lines.forEach((line, i) => {
            if (line.projected_points.length === 0) return;
            const prob = this._lane_line_probs[i] ?? 0;
            const alpha = clamp(prob, 0, 0.7);
            this._draw_polygon(line.projected_points, `rgba(255, 255, 255, ${alpha})`);
        });

        this._road_edges.forEach((line, i) => {
            if (line.projected_points.length === 0) return;
            const std = this._road_edge_stds[i] ?? 1;
            const alpha = clamp(1 - std, 0, 1);
            this._draw_polygon(line.projected_points, `rgba(255, 0, 0, ${alpha})`);
        });
    }

    _draw_path(state: any) {
        if (this._path.projected_points.length === 0) return;

        if (this._experimental_mode) {
            this._draw_polygon(this._path.projected_points, "rgba(255, 255, 255, 0.12)");
        } else {
            // Green/White blend logic simplified
            this._draw_polygon(this._path.projected_points, "rgba(255, 255, 255, 0.4)");
        }
    }

    _draw_lead_indicator() {
        this._lead_vehicles.forEach((lead: any) => {
            if (lead.chevron) {
                this._draw_polygon(lead.chevron, `rgba(201, 34, 49, 1)`);
            }
        });
    }

    _draw_polygon(points: number[][], style: string) {
        if (points.length < 3 || !this.ctx) return;
        this.ctx.fillStyle = style;
        this.ctx.beginPath();
        // Defensive checking for point[0]
        const p0 = points[0];
        if (!p0) return;

        const p0x = p0[0] ?? 0;
        const p0y = p0[1] ?? 0;
        this.ctx.moveTo(p0x, p0y);

        for (let i = 1; i < points.length; i++) {
            const pi = points[i];
            if (pi) {
                const pix = pi[0] ?? 0;
                const piy = pi[1] ?? 0;
                this.ctx.lineTo(pix, piy);
            }
        }
        this.ctx.closePath();
        this.ctx.fill();
    }
}
