// Ported from app.js

export const MIN_DRAW_DISTANCE = 10;
export const MAX_DRAW_DISTANCE = 100;

export const INTRINSICS = {
    tici: {
        fcam: {
            intrinsics: [
                [2648.0, 0.0, 964.0],
                [0.0, 2648.0, 604.0],
                [0.0, 0.0, 1.0]
            ],
            width: 1928,
            height: 1208
        }
    },
    mici: {
        fcam: {
            intrinsics: [
                [1141.5, 0.0, 672.0],
                [0.0, 1141.5, 380.0],
                [0.0, 0.0, 1.0]
            ],
            width: 1344,
            height: 760
        }
    }
};

export const CALIB_INITIAL = [
    [0, -1, 0],
    [0, 0, -1],
    [1, 0, 0]
];

// Matrix multiplication
export function matMul(a: number[][], b: number[][]): number[][] {
    const result = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
    ];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const row = a[i];
            const col = b; // b acts as columns

            const a0 = row?.[0] ?? 0;
            const a1 = row?.[1] ?? 0;
            const a2 = row?.[2] ?? 0;

            const b0 = col[0]?.[j] ?? 0;
            const b1 = col[1]?.[j] ?? 0;
            const b2 = col[2]?.[j] ?? 0;

            result[i][j] = a0 * b0 + a1 * b1 + a2 * b2;
        }
    }
    return result;
}

// Map point from car space to screen space
export function mapToScreen(
    transform: number[][],
    x: number,
    y: number,
    z: number
): { x: number; y: number; z: number; valid: boolean } {
    const row0 = transform[0] || [0, 0, 0];
    const row1 = transform[1] || [0, 0, 0];
    const row2 = transform[2] || [0, 0, 0];

    // Safe access with fallback to 0
    const r00 = row0[0] ?? 0; const r01 = row0[1] ?? 0; const r02 = row0[2] ?? 0;
    const r10 = row1[0] ?? 0; const r11 = row1[1] ?? 0; const r12 = row1[2] ?? 0;
    const r20 = row2[0] ?? 0; const r21 = row2[1] ?? 0; const r22 = row2[2] ?? 0;

    const rx = r00 * x + r01 * y + r02 * z;
    const ry = r10 * x + r11 * y + r12 * z;
    const rz = r20 * x + r21 * y + r22 * z;

    if (Math.abs(rz) < 1e-6) {
        return { x: 0, y: 0, z: 0, valid: false };
    }

    return { x: rx / rz, y: ry / rz, z: rz, valid: true };
}

export function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val || 0));
}

// Convert RPY calibration to rotation matrix
export function rpyToMatrix(rpy: number[]): number[][] {
    const roll = rpy[0] ?? 0;
    const pitch = rpy[1] ?? 0;
    const yaw = rpy[2] ?? 0;

    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    // Matches app.js Ye function logic
    return [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr]
    ];
}
