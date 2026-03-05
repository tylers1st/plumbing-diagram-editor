import { useMemo, useState } from "react";
import { Stage, Layer, Line, Rect, Text } from "react-konva";
import "./App.css";

const GRID = 25;
const CANVAS_W = 1100;
const CANVAS_H = 700;

function Grid() {
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

export default function App() {
  const [placed, setPlaced] = useState<{ x: number; y: number }[]>([]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", height: "100vh" }}>
      {/* Sidebar */}
      <div style={{ borderRight: "1px solid #ddd", padding: 12 }}>
        <h3 style={{ margin: "0 0 12px" }}>Parts</h3>

        <button
          style={{ width: "100%", padding: 10, cursor: "pointer" }}
          onClick={() => setPlaced((p) => [...p, { x: 100, y: 100 }])}
        >
          Add test part
        </button>

        <p style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
          Drag the blue part on the grid. It snaps when you release.
        </p>
      </div>

      {/* Canvas */}
      <div style={{ padding: 12 }}>
        <Stage width={CANVAS_W} height={CANVAS_H} style={{ border: "1px solid #ddd", background: "white" }}>
          <Layer>
            <Grid />
          </Layer>

          <Layer>
            {placed.map((p, i) => (
              <Rect
                key={i}
                x={p.x}
                y={p.y}
                width={GRID * 4}
                height={GRID}
                fill="#93c5fd"
                stroke="#1f2937"
                draggable
                onDragEnd={(e) => {
                  const nx = Math.round(e.target.x() / GRID) * GRID;
                  const ny = Math.round(e.target.y() / GRID) * GRID;
                  setPlaced((prev) => {
                    const copy = [...prev];
                    copy[i] = { x: nx, y: ny };
                    return copy;
                  });
                }}
              />
            ))}

            <Text x={10} y={10} text="Plumbing editor prototype: grid + snap" fontSize={14} fill="#111827" />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}