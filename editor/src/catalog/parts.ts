export type PartSize = number; // inches (nominal), keep simple for now

export type Port = {
  id: string;
  x: number; // relative to part's top-left (in pixels)
  y: number; // relative to part's top-left (in pixels)
};

export type PartDef = {
  id: string;
  name: string;
  kind: "pipe" | "fitting" | "fixture";
  sizes: PartSize[];
  // simple default drawing size in grid units (not real scale yet)
  w: number; // width in grid cells
  h: number; // height in grid cells
  ports?: Port[]; // connection points for snap-to-port
  imageSrc?: string; // optional image URL for the part
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
    ports: [
      { id: "left", x: 0, y: 12.5 },    // center-left
      { id: "right", x: 100, y: 12.5 }, // center-right
    ],
    // imageSrc: "/images/pipe-stub.png", // Uncomment and add image path
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
      { id: "bottom", x: 25, y: 50 },   // bottom inlet
      { id: "right", x: 50, y: 25 },    // right outlet
    ],
    // imageSrc: "/images/elbow-90.png", // Uncomment and add image path
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
      { id: "bottom", x: 37.5, y: 50 },  // bottom inlet
      { id: "left", x: 0, y: 25 },       // left outlet
      { id: "right", x: 75, y: 25 },     // right outlet
    ],
    // imageSrc: "/images/tee.png", // Uncomment and add image path
    meta: { type: "sanitary" },
  },
];