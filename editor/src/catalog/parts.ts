export type PartSize = number; // inches (nominal), keep simple for now

export type PartDef = {
  id: string;
  name: string;
  kind: "pipe" | "fitting" | "fixture";
  sizes: PartSize[];
  // simple default drawing size in grid units (not real scale yet)
  w: number; // width in grid cells
  h: number; // height in grid cells
  // metadata fields you want to track
  meta?: Record<string, string | number | boolean>;
};

export const PARTS: PartDef[] = [
  {
    id: "pipe_stub",
    name: "Pipe (stub)",
    kind: "pipe",
    sizes: [1.5, 2, 3, 4],
    w: 4,
    h: 1,
    meta: { material: "PVC", schedule: 40 },
  },
  {
    id: "elbow_90",
    name: "90° Elbow",
    kind: "fitting",
    sizes: [1.5, 2, 3, 4],
    w: 2,
    h: 2,
    meta: { type: "hub-hub" },
  },
  {
    id: "tee",
    name: "Tee",
    kind: "fitting",
    sizes: [1.5, 2, 3, 4],
    w: 3,
    h: 2,
    meta: { type: "sanitary" },
  },
];