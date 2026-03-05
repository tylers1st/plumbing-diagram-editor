import { useMemo, useState, useEffect } from "react";
import { Stage, Layer, Line, Rect, Text, Group } from "react-konva";
import "./App.css";
import { PARTS } from "./catalog/parts";
import type { PartDef } from "./catalog/parts";

const GRID = 25;
const CANVAS_W = 1100;
const CANVAS_H = 700;

// Hook to detect dark mode
function useDarkMode() {
  const [isDark, setIsDark] = useState(() => 
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return isDark;
}

function Grid({ isDark }: { isDark: boolean }) {
  // Build the static grid lines once; the canvas dimensions are constants.
  const lines = useMemo(() => {
    const l: any[] = [];
    const gridColor = isDark ? "#404040" : "#e5e7eb";

    for (let x = 0; x <= CANVAS_W; x += GRID) {
      l.push(
        <Line
          key={`vx${x}`}
          points={[x, 0, x, CANVAS_H]}
          stroke={gridColor}
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
          stroke={gridColor}
          strokeWidth={1}
          listening={false}
        />
      );
    }
    return l;
  }, [isDark]);

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
  const isDark = useDarkMode();
  
  // Each item represents a draggable part's position + metadata.
  const [placed, setPlaced] = useState<PlacedPart[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // History stack for undo (stores previous states)
  const [history, setHistory] = useState<PlacedPart[][]>([]);

  const selected = selectedId ? placed.find((p) => p.instanceId === selectedId) ?? null : null;
  const selectedDef = selected ? getPartDef(selected.partId) : null;

  // Save current state to history before making changes
  const saveHistory = () => {
    setHistory((prev) => [...prev, placed].slice(-20)); // Keep last 20 states
  };

  // Undo: restore previous state
  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setPlaced(previous);
  };

  const addPart = (def: PartDef) => {
    saveHistory();
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
    saveHistory();
    setPlaced((prev) => prev.map((p) => (p.instanceId === selectedId ? { ...p, ...patch } : p)));
  };

  const deleteSelected = () => {
    if (!selected) return;
    saveHistory();
    setPlaced((prev) => prev.filter((p) => p.instanceId !== selected.instanceId));
    setSelectedId(null);
  };

  // Rotate selected part 90 degrees clockwise
  const rotateSelected = () => {
    if (!selected) return;
    updateSelected({ rotation: (selected.rotation + 90) % 360 });
  };

  // Export current diagram to JSON file
  const exportToFile = () => {
    const data = JSON.stringify(placed, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plumbing-diagram-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import diagram from JSON file
  const importFromFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          saveHistory(); // Save current state before loading
          setPlaced(data);
          setSelectedId(null);
        } catch (err) {
          alert("Failed to load file. Make sure it's a valid JSON file.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
      // R for rotate
      else if (e.key === "r" || e.key === "R") {
        rotateSelected();
      }
      // Delete or Backspace for delete
      else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        // Redo functionality could be implemented here by maintaining a separate redo stack
        // For simplicity, it's not implemented in this prototype.
      }
      else if (e.key === "Escape") {
        setSelectedId(null);
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        // Copy functionality could be implemented here by storing the selected part in a clipboard state
        // For simplicity, it's not implemented in this prototype.
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        // Paste functionality could be implemented here by creating a new part based on the clipboard state
        // For simplicity, it's not implemented in this prototype.
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === "x") {
        e.preventDefault();
        // Cut functionality could be implemented here by copying the selected part to clipboard and then deleting it
        // For simplicity, it's not implemented in this prototype.
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, history]); // Dependencies ensure handlers have current state

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 280px", height: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Sidebar */}
      <div style={{ borderRight: "1px solid var(--border-primary)", padding: 12 }}>
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

        <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--border-primary)" }} />

        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{ flex: 1, padding: 10, cursor: "pointer", background: "var(--bg-accent)", border: "1px solid var(--border-accent)", color: "var(--text-primary)" }}
            onClick={exportToFile}
            title="Export diagram to JSON file"
          >
            💾 Export
          </button>
          <button
            style={{ flex: 1, padding: 10, cursor: "pointer", background: "var(--bg-accent)", border: "1px solid var(--border-accent)", color: "var(--text-primary)" }}
            onClick={importFromFile}
            title="Import diagram from JSON file"
          >
            📂 Import
          </button>
        </div>

        <p style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
          Click a part to place it. Click an object to select it.
        </p>
      </div>

      {/* Canvas */}
      <div style={{ padding: 12 }}>
        <Stage
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ border: "1px solid var(--border-primary)", background: "var(--canvas-bg)" }}
          onMouseDown={(e) => {
            // Click empty space to deselect
            if (e.target === e.target.getStage()) setSelectedId(null);
          }}
        >
          <Layer>
            <Grid isDark={isDark} />
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
                  onDragStart={() => {
                    // Save state before drag for undo
                    saveHistory();
                  }}
                  onDragEnd={(e) => {
                    // Snap to grid: convert px to grid units, round to nearest cell, then convert back to px.
                    const nx = Math.round(e.target.x() / GRID) * GRID;
                    const ny = Math.round(e.target.y() / GRID) * GRID;

                    // Immediately update the visual position to prevent async state update delay
                    e.target.position({ x: nx, y: ny });

                    setPlaced((prev) =>
                      prev.map((item) => (item.instanceId === p.instanceId ? { ...item, x: nx, y: ny } : item))
                    );
                  }}
                >
                  <Rect
                    width={wPx}
                    height={hPx}
                    fill={isDark ? "#2563eb" : "#93c5fd"}
                    stroke={isSel ? "#ef4444" : (isDark ? "#e5e7eb" : "#1f2937")}
                    strokeWidth={isSel ? 3 : 1}
                  />
                  <Text x={6} y={6} text={`${def.name}\n${p.size}"`} fontSize={12} fill={isDark ? "#e5e7eb" : "#111827"} />
                </Group>
              );
            })}

            <Text x={10} y={10} text="Plumbing editor prototype: catalog + select + snap" fontSize={14} fill={isDark ? "#e5e7eb" : "#111827"} />
          </Layer>
        </Stage>
      </div>

      {/* Inspector */}
      <div style={{ borderLeft: "1px solid var(--border-primary)", padding: 12 }}>
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
              style={{ padding: 10, width: "100%", background: "var(--bg-danger)", border: "1px solid var(--border-danger)", cursor: "pointer", color: "var(--text-primary)" }}
              onClick={deleteSelected}
            >
              Delete part
            </button>

            <pre style={{ marginTop: 12, fontSize: 11, background: "var(--bg-secondary)", padding: 10, overflow: "auto", color: "var(--text-primary)" }}>
{JSON.stringify(selected, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}