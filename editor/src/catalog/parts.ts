export type PartSize = number; // inches (nominal)

/**
 * Dimensional variant for a specific size of a part.
 * Stores real measurements from manufacturer specs.
 */
export type PartVariant = {
  size: number; // Primary size (e.g., 2" for a 2" tee)
  sizeB?: number; // Secondary size for reducer fittings (e.g., 4x3 reducer)
  dims: Record<string, number>; // D, E, F, G, H, etc. in inches
  weight?: number; // Weight in pounds
};

/**
 * Port definition using expressions for flexible positioning.
 * Expressions reference dimension keys from PartVariant.dims
 */
export type PortDef = {
  id: string;
  xExpr: string; // e.g., "0", "D", "D/2", "D+E"
  yExpr: string; // e.g., "0", "D", "D/2"
  dir: 0 | 90 | 180 | 270; // Direction facing (0=right, 90=down, 180=left, 270=up)
  kind?: "hub" | "spigot"; // Connection type
};

/**
 * Legacy port format (hardcoded coordinates).
 * Used by simple placeholder parts for backward compatibility.
 */
export type Port = {
  id: string;
  x: number; // relative to part's top-left (in pixels)
  y: number; // relative to part's top-left (in pixels)
};

/**
 * Updated PartDef supporting real dimensional data.
 */
export type PartDef = {
  id: string;
  name: string;
  kind: "pipe" | "fitting" | "fixture";
  sizes: PartSize[];
  // Drawing dimensions in grid cells for visualization
  w: number;
  h: number;
  // Real dimensional data from manufacturer specs
  variants?: PartVariant[];
  // Port definitions (new format with expressions)
  portDefs?: PortDef[];
  // Legacy port format (hardcoded coordinates)
  ports?: Port[];
  imageSrc?: string;
  icon?: string;
  meta?: Record<string, any>;
};

/**
 * Helper function to evaluate port expressions.
 * Solves simple mathematical expressions like "D/2", "D+E", etc.
 */
export function evaluatePortExpr(expr: string, dims: Record<string, number>): number {
  let result = expr;
  
  // Replace all dimension keys with their values
  for (const [key, value] of Object.entries(dims)) {
    result = result.replace(new RegExp(`\\b${key}\\b`, "g"), String(value));
  }
  
  try {
    // Safe evaluation using Function (simple math only)
    // eslint-disable-next-line no-new-function
    return Function('"use strict"; return (' + result + ')')();
  } catch (e) {
    console.error(`Failed to evaluate port expression "${expr}":`, e);
    return 0;
  }
}

/**
 * Get the variant for a specific size.
 */
export function getVariant(part: PartDef, size: number): PartVariant | undefined {
  return part.variants?.find((v) => v.size === size);
}

export const PARTS: PartDef[] = [
  {
    id: "pipe_stub",
    name: "Pipe (stub)",
    kind: "pipe",
    sizes: [1.5, 2, 3, 4],
    w: 4,
    h: 1,
    ports: [
      { id: "left", x: 0, y: 12.5 },
      { id: "right", x: 100, y: 12.5 },
    ],
    meta: { material: "PVC", schedule: 40 },
  },
  {
    id: "elbow_90",
    name: "90° Elbow",
    kind: "fitting",
    sizes: [1.5, 2, 3, 4],
    w: 2,
    h: 2,
    ports: [
      { id: "bottom", x: 25, y: 50 },
      { id: "right", x: 50, y: 25 },
    ],
    meta: { type: "hub-hub" },
  },
  {
    id: "tee",
    name: "Tee",
    kind: "fitting",
    sizes: [1.5, 2, 3, 4],
    w: 3,
    h: 2,
    ports: [
      { id: "bottom", x: 37.5, y: 50 },
      { id: "left", x: 0, y: 25 },
      { id: "right", x: 75, y: 25 },
    ],
    meta: { type: "sanitary" },
  },
  {
    id: "ci_quarter_bend_90",
    name: "Cast Iron Quarter Bend 90° Ell",
    kind: "fitting",
    sizes: [1.5, 2, 3, 4, 5, 6, 8],
    w: 2,
    h: 2,
    // Real dimensional data from Charlotte Pipe catalog
    variants: [
      { size: 1.5, dims: { D: 4.25, E: 4.25 }, weight: 1.6 },
      { size: 2, dims: { D: 4.5, E: 4.5 }, weight: 2.3 },
      { size: 3, dims: { D: 5, E: 5 }, weight: 4.4 },
      { size: 4, dims: { D: 5.5, E: 5.5 }, weight: 7.3 },
      { size: 5, dims: { D: 6.5, E: 6.5 }, weight: 9.9 },
      { size: 6, dims: { D: 7, E: 7 }, weight: 13.7 },
      { size: 8, dims: { D: 8.5, E: 8.5 }, weight: 20.6 },
    ],
    // Port definitions using dimensional expressions
    portDefs: [
      {
        id: "inlet",
        xExpr: "0",
        yExpr: "D",
        dir: 180,
        kind: "hub",
      },
      {
        id: "outlet",
        xExpr: "D",
        yExpr: "0",
        dir: 90,
        kind: "hub",
      },
    ],
    icon: "/images/ci-quarter-bend.svg",
    meta: { 
      material: "cast-iron",
      type: "quarter-bend",
      standard: "ASTM A74",
    },
  },
];