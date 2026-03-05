import { useMemo, useState } from "react";
import { Stage, Layer, Line, Rect, Text, Group } from "react-konva";
import "./App.css";
import { PARTS } from "./catalog/parts";
import type { PartDef } from "./catalog/parts";

const GRID = 25;
const CANVAS_W = 1100;
const CANVAS_H = 700;

function Grid() {
  // Build the static grid lines once; the canvas dimensions are constants.
  const lines = useMemo(() => {
    const l: any[] = [];

    for (let x = 0; x <= CANVAS_W; x += GRID) {
      l.push(
        <Line
          key={`vx${x}`}
          points={[x, 0, x, CANVAS_H]}
          stroke="#e5e7eb"
          strokeWidth={1}
          listening={false}
        />
      );
    }
    for (let y = 0; y <= CANVAS_H; y += GRID) {
      l.push(
        <Line
          key={`hy${y}`}
          points={[0, y, CANVAS_W, y]}
          stroke="#e5e7eb"
          strokeWidth={1}
          listening={false}
        />
      );
    }
    return l;
  }, []);

  return <>{lines}</>;
}

type PlacedPart = {
  instanceId: string;
  partId: string;
  x: number;
  y: number;
  rotation: number;
  size: number; // nominal inches
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function getPartDef(partId: string): PartDef {
  const p = PARTS.find((x) => x.id === partId);
  if (!p) throw new Error(`Unknown partId: ${partId}`);
  return p;
}

export default function App() {
  // Each item represents a draggable part's position + metadata.
  const [placed, setPlaced] = useState<PlacedPart[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ? placed.find((p) => p.instanceId === selectedId) ?? null : null;
  const selectedDef = selected ? getPartDef(selected.partId) : null;

  const addPart = (def: PartDef) => {
    const newItem: PlacedPart = {
      instanceId: uid(),
      partId: def.id,
      x: 100,
      y: 100,
      rotation: 0,
      size: def.sizes[0] ?? 2,
    };
    setPlaced((prev) => [...prev, newItem]);
    setSelectedId(newItem.instanceId);
  };

  const updateSelected = (patch: Partial<PlacedPart>) => {
    if (!selectedId) return;
    setPlaced((prev) => prev.map((p) => (p.instanceId === selectedId ? { ...p, ...patch } : p)));
  };

  const deleteSelected = () => {
    if (!selected) return;
    setPlaced((prev) => prev.filter((p) => p.instanceId !== selected.instanceId));
    setSelectedId(null);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 280px", height: "100vh" }}>
      {/* Sidebar */}
      <div style={{ borderRight: "1px solid #ddd", padding: 12 }}>
        <h3 style={{ margin: "0 0 12px" }}>Parts</h3>

        {PARTS.map((p) => (
          <button
            key={p.id}
            style={{ width: "100%", padding: 10, cursor: "pointer", marginBottom: 8, textAlign: "left" }}
            onClick={() => addPart(p)}
          >
            {p.name}
          </button>
        ))}

        <p style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
          Click a part to place it. Click an object to select it.
        </p>
      </div>

      {/* Canvas */}
      <div style={{ padding: 12 }}>
        <Stage
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ border: "1px solid #ddd", background: "white" }}
          onMouseDown={(e) => {
            // Click empty space to deselect
            if (e.target === e.target.getStage()) setSelectedId(null);
          }}
        >
          <Layer>
            <Grid />
          </Layer>

          <Layer>
            {placed.map((p) => {
              const def = getPartDef(p.partId);
              const isSel = p.instanceId === selectedId;

              const wPx = def.w * GRID;
              const hPx = def.h * GRID;

              return (
                <Group
                  key={p.instanceId}
                  x={p.x}
                  y={p.y}
                  rotation={p.rotation}
                  draggable
                  onMouseDown={(e) => {
                    e.cancelBubble = true;
                    setSelectedId(p.instanceId);
                  }}
                  onDragEnd={(e) => {
                    // Snap to grid: convert px to grid units, round to nearest cell, then convert back to px.
                    const nx = Math.round(e.target.x() / GRID) * GRID;
                    const ny = Math.round(e.target.y() / GRID) * GRID;

                    setPlaced((prev) =>
                      prev.map((item) => (item.instanceId === p.instanceId ? { ...item, x: nx, y: ny } : item))
                    );
                  }}
                >
                  <Rect
                    width={wPx}
                    height={hPx}
                    fill="#93c5fd"
                    stroke={isSel ? "#ef4444" : "#1f2937"}
                    strokeWidth={isSel ? 3 : 1}
                  />
                  <Text x={6} y={6} text={`${def.name}\n${p.size}"`} fontSize={12} fill="#111827" />
                </Group>
              );
            })}

            <Text x={10} y={10} text="Plumbing editor prototype: catalog + select + snap" fontSize={14} fill="#111827" />
          </Layer>
        </Stage>
      </div>

      {/* Inspector */}
      <div style={{ borderLeft: "1px solid #ddd", padding: 12 }}>
        <h3 style={{ margin: "0 0 12px" }}>Inspector</h3>

        {!selected || !selectedDef ? (
          <p style={{ opacity: 0.8 }}>Select a part to edit its properties.</p>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Part</div>
              <div style={{ fontWeight: 600 }}>{selectedDef.name}</div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Nominal size</div>
              <select
                value={selected.size}
                onChange={(e) => updateSelected({ size: Number(e.target.value) })}
                style={{ width: "100%", padding: 8 }}
              >
                {selectedDef.sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}"
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Rotation</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ padding: 8, flex: 1 }} onClick={() => updateSelected({ rotation: (selected.rotation + 90) % 360 })}>
                  +90°
                </button>
                <button style={{ padding: 8, flex: 1 }} onClick={() => updateSelected({ rotation: (selected.rotation + 270) % 360 })}>
                  -90°
                </button>
              </div>
            </div>

            <button
              style={{ padding: 10, width: "100%", background: "#fee2e2", border: "1px solid #ef4444", cursor: "pointer" }}
              onClick={deleteSelected}
            >
              Delete part
            </button>

            <pre style={{ marginTop: 12, fontSize: 11, background: "#f9fafb", padding: 10, overflow: "auto" }}>
{JSON.stringify(selected, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}