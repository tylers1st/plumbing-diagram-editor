import { useMemo, useState, useEffect, useRef } from "react";
import { Stage, Layer, Line, Rect, Text, Group, Circle, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import "./App.css";
import { PARTS, evaluatePortExpr, getVariant } from "./catalog/parts";
import type { PartDef, Port } from "./catalog/parts";

const GRID = 25;
const CANVAS_H = 700;
const INSPECTOR_W = 280;

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

// Component to render a part with optional image
function PartImage({ imageSrc, width, height }: { imageSrc?: string; width: number; height: number }) {
  const [image] = useImage(imageSrc || "");
  
  if (imageSrc && image) {
    return <KonvaImage image={image} width={width} height={height} />;
  }
  
  return null; // No image, geometry is invisible
}

function Grid({ isDark, width }: { isDark: boolean; width: number }) {
  const lines = useMemo(() => {
    const l: any[] = [];
    const gridColor = isDark ? "#404040" : "#e5e7eb";

    for (let x = 0; x <= width; x += GRID) {
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
          points={[0, y, width, y]}
          stroke={gridColor}
          strokeWidth={1}
          listening={false}
        />
      );
    }
    return l;
  }, [isDark, width]);

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

/**
 * Get ports for a placed part, evaluating expressions if using new format.
 * Returns legacy Port[] format for consistent handling.
 */
function getResolvedPorts(placed: PlacedPart, def: PartDef): Port[] {
  // If part uses new portDefs format, evaluate expressions for selected variant
  if (def.portDefs && def.portDefs.length > 0 && def.variants && def.variants.length > 0) {
    const variant = getVariant(def, placed.size);
    if (variant) {
      // Evaluate port expressions to pixel coordinates
      // 1 inch = 50 pixels (conversion factor)
      const INCH_TO_PX = 50;
      return def.portDefs.map((pd) => ({
        id: pd.id,
        x: evaluatePortExpr(pd.xExpr, variant.dims) * INCH_TO_PX,
        y: evaluatePortExpr(pd.yExpr, variant.dims) * INCH_TO_PX,
      }));
    }
  }

  // Fall back to legacy hardcoded ports
  return def.ports || [];
}

// Calculate world coordinates of a port on a placed part
// accounting for position and rotation
function getPortWorldCoords(
  placed: PlacedPart,
  port: Port
): { x: number; y: number } {
  // Rotation in degrees
  const angleRad = (placed.rotation * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // Port coordinates are relative to the Group's origin (top-left)
  // Konva rotates around the origin, so we rotate the port coords around (0,0)
  const rotX = port.x * cos - port.y * sin;
  const rotY = port.x * sin + port.y * cos;

  // World coords = part position + rotated port offset
  return {
    x: placed.x + rotX,
    y: placed.y + rotY,
  };
}

// Find nearest port to a given position from all parts except the dragging one
function findNearestPort(
  x: number,
  y: number,
  placed: PlacedPart[],
  exceptInstanceId: string,
  getPartDefFn: (id: string) => PartDef,
  snapDistance: number = 100
): { partInstanceId: string; port: Port; distance: number } | null {
  let nearest: {
    partInstanceId: string;
    port: Port;
    distance: number;
  } | null = null;

  for (const part of placed) {
    if (part.instanceId === exceptInstanceId) continue;
    const def = getPartDefFn(part.partId);
    const ports = getResolvedPorts(part, def);
    if (!ports || ports.length === 0) continue;

    for (const port of ports) {
      const { x: px, y: py } = getPortWorldCoords(part, port);
      const dx = px - x;
      const dy = py - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < snapDistance && (!nearest || dist < nearest.distance)) {
        nearest = { partInstanceId: part.instanceId, port, distance: dist };
      }
    }
  }

  return nearest;
}

export default function App() {
  const isDark = useDarkMode();
  
  // Each item represents a draggable part's position + metadata.
  const [placed, setPlaced] = useState<PlacedPart[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // History stack for undo (stores previous states)
  const [history, setHistory] = useState<PlacedPart[][]>([]);
  
  // Clipboard for copy/cut/paste operations
  const [clipboard, setClipboard] = useState<PlacedPart | null>(null);
  
  // Reference to the Konva Stage for PNG export
  const stageRef = useRef<any>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  
  // Inspector panel visibility
  const [inspectorVisible, setInspectorVisible] = useState(true);

  // Stage width tracks available canvas container space
  const [canvasWidth, setCanvasWidth] = useState(0);
  
  // Panning state for canvas
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Zoom state (1 = 100%)
  const [zoom, setZoom] = useState(1);

  // Custom parts (user-created)
  const [customParts, setCustomParts] = useState<PartDef[]>([]);
  
  // Modal state for creating new parts
  const [showNewPartModal, setShowNewPartModal] = useState(false);
  const [newPartForm, setNewPartForm] = useState({
    name: "",
    kind: "fitting" as const,
    w: 2,
    h: 2,
    sizes: "2,3,4,6",
  });

  // Merge static and custom parts
  const allParts = [...PARTS, ...customParts];
  
  // Override getPartDef to search custom parts too
  const getPartDefEx = (partId: string): PartDef => {
    const p = allParts.find((x) => x.id === partId);
    if (!p) throw new Error(`Unknown partId: ${partId}`);
    return p;
  };

  const selected = selectedId ? placed.find((p) => p.instanceId === selectedId) ?? null : null;
  const selectedDef = selected ? getPartDefEx(selected.partId) : null;
  const stageWidth = Math.max(GRID * 8, canvasWidth);

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

  const createNewPart = () => {
    const sizes = newPartForm.sizes.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    
    const newPart: PartDef = {
      id: `custom_${uid()}`,
      name: newPartForm.name || "Unnamed Part",
      kind: newPartForm.kind,
      sizes: sizes.length > 0 ? sizes : [2],
      w: Math.max(1, newPartForm.w),
      h: Math.max(1, newPartForm.h),
      ports: [
        { id: "in", x: 0, y: newPartForm.h * GRID / 2 },
        { id: "out", x: newPartForm.w * GRID, y: newPartForm.h * GRID / 2 },
      ],
      meta: { custom: true },
    };
    
    setCustomParts((prev) => [...prev, newPart]);
    setShowNewPartModal(false);
    setNewPartForm({ name: "", kind: "fitting", w: 2, h: 2, sizes: "2,3,4,6" });
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

  // Copy selected part to clipboard
  const copySelected = () => {
    if (!selected) return;
    setClipboard(selected);
  };

  // Cut selected part (copy to clipboard and delete)
  const cutSelected = () => {
    if (!selected) return;
    copySelected();
    deleteSelected();
  };

  // Paste from clipboard (create new instance with offset)
  const pasteFromClipboard = () => {
    if (!clipboard) return;
    saveHistory();
    const newItem: PlacedPart = {
      ...clipboard,
      instanceId: uid(), // New unique ID
      x: clipboard.x + GRID * 2, // Offset by 2 grid cells
      y: clipboard.y + GRID * 2,
    };
    setPlaced((prev) => [...prev, newItem]);
    setSelectedId(newItem.instanceId);
  };

  // Duplicate selected part
  const duplicateSelected = () => {
    if (!selected) return;
    copySelected();
    pasteFromClipboard();
  };

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;

    const updateCanvasWidth = () => {
      // Subtract inner wrapper padding (12px on each side).
      setCanvasWidth(Math.max(0, el.clientWidth - 24));
    };

    updateCanvasWidth();

    const observer = new ResizeObserver(updateCanvasWidth);
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // Handle zooming
  const handleZoom = (direction: 'in' | 'out') => {
    setZoom((prevZoom) => {
      const newZoom = direction === 'in' ? prevZoom + 0.1 : prevZoom - 0.1;
      // Clamp zoom between 0.5 (50%) and 3 (300%)
      return Math.max(0.5, Math.min(3, newZoom));
    });
  };

  // Apply zoom to all layers when zoom state changes
  useEffect(() => {
    if (stageRef.current) {
      const layers = stageRef.current.getLayers();
      layers.forEach((layer: any) => {
        layer.scaleX(zoom);
        layer.scaleY(zoom);
        layer.draw();
      });
    }
  }, [zoom]);

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

  // Export current diagram to PNG image
  const exportToPng = () => {
    if (!stageRef.current) return;
    try {
      const dataURL = stageRef.current.toDataURL();
      const link = document.createElement("a");
      link.href = dataURL;
      link.download = `plumbing-diagram-${Date.now()}.png`;
      link.click();
    } catch (err) {
      alert("Failed to export PNG. Please try again.");
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
      // Ctrl+S or Cmd+S for export JSON
      else if ((e.ctrlKey || e.metaKey) && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        exportToFile();
      }
      // Ctrl+Shift+S or Cmd+Shift+S for export PNG
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
        e.preventDefault();
        exportToPng();
      }
      // Ctrl+C or Cmd+C for copy
      else if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        copySelected();
      }
      // Ctrl+X or Cmd+X for cut
      else if ((e.ctrlKey || e.metaKey) && e.key === "x") {
        e.preventDefault();
        cutSelected();
      }
      // Ctrl+V or Cmd+V for paste
      else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        pasteFromClipboard();
      }
      // Ctrl+D or Cmd+D for duplicate
      else if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        duplicateSelected();
      }
      // + or = for zoom in
      else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        handleZoom('in');
      }
      // - for zoom out
      else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoom('out');
      }
      // R for rotate
      else if (e.key === "r" || e.key === "R") {
        rotateSelected();
      }
      // Delete or Backspace for delete
      else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
      }
      else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, history, clipboard]); // Dependencies ensure handlers have current state

  return (
  <>
    {/* Base layout: Controls | Catalog | Canvas */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 260px 1fr",
        height: "100vh",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        overflow: "hidden",
      }}
    >
      {/* Controls Panel (left) */}
      <div
        style={{
          height: "100vh",
          background: "var(--bg-primary)",
          borderRight: "1px solid var(--border-primary)",
          padding: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          overflow: "auto",
          alignContent: "start",
        }}
      >
        <div style={{ gridColumn: "1 / -1", fontSize: 11, opacity: 0.8, marginBottom: 0 }}>
          Zoom: {(zoom * 100).toFixed(0)}%
        </div>

        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 4 }}>
          <button
            style={{
              flex: 1,
              padding: 6,
              fontSize: 12,
              cursor: "pointer",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
            }}
            onClick={() => handleZoom("out")}
            title="Zoom out (-)"
          >
            −
          </button>

          <button
            style={{
              flex: 1,
              padding: 6,
              fontSize: 12,
              cursor: "pointer",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
            }}
            onClick={() => setZoom(1)}
            title="Reset zoom to 100%"
          >
            Reset
          </button>

          <button
            style={{
              flex: 1,
              padding: 6,
              fontSize: 12,
              cursor: "pointer",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
            }}
            onClick={() => handleZoom("in")}
            title="Zoom in (+)"
          >
            +
          </button>
        </div>

        <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border-primary)", margin: "3px 0" }} />

        <button
          style={{
            padding: 8,
            fontSize: 12,
            cursor: "pointer",
            background: "var(--bg-accent)",
            border: "1px solid var(--border-accent)",
            color: "var(--text-primary)",
          }}
          onClick={exportToFile}
          title="Export diagram to JSON file (Ctrl+S)"
        >
          💾 JSON
        </button>

        <button
          style={{
            padding: 8,
            fontSize: 12,
            cursor: "pointer",
            background: "var(--bg-accent)",
            border: "1px solid var(--border-accent)",
            color: "var(--text-primary)",
          }}
          onClick={exportToPng}
          title="Export diagram to PNG image (Ctrl+Shift+S)"
        >
          🖼️ PNG
        </button>

        <button
          style={{
            gridColumn: "1 / -1",
            padding: 8,
            fontSize: 12,
            cursor: "pointer",
            background: "var(--bg-accent)",
            border: "1px solid var(--border-accent)",
            color: "var(--text-primary)",
          }}
          onClick={importFromFile}
          title="Import diagram from JSON file"
        >
          📂 Import
        </button>

        <button
          style={{
            gridColumn: "1 / -1",
            padding: 8,
            fontSize: 12,
            cursor: "pointer",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            color: "var(--text-primary)",
          }}
          onClick={() => setShowNewPartModal(true)}
          title="Create a new part definition"
        >
          ➕ New Part
        </button>

        <button
          style={{
            gridColumn: "1 / -1",
            padding: 8,
            fontSize: 12,
            cursor: "pointer",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            color: "var(--text-primary)",
          }}
          onClick={() => setInspectorVisible(!inspectorVisible)}
          title="Toggle inspector panel"
        >
          {inspectorVisible ? "Hide" : "Show"} Inspector
        </button>
      </div>

      {/* Catalog Panel (middle) */}
      <div
        style={{
          borderRight: "1px solid var(--border-primary)",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          background: "var(--bg-primary)",
        }}
      >
        <h3 style={{ margin: "0 0 12px", flexShrink: 0 }}>Parts</h3>

        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
          {allParts.map((p) => (
            <button
              key={p.id}
              style={{ width: "100%", padding: 10, cursor: "pointer", marginBottom: 8, textAlign: "left" }}
              onClick={() => addPart(p)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas (right) */}
      <div
        ref={canvasWrapRef}
        style={{ height: "100vh", background: "var(--canvas-bg)", overflow: "hidden", paddingRight: inspectorVisible ? INSPECTOR_W : 0 }}
      >
        {/* Prefer padding around the Stage rather than Stage margin */}
        <div style={{ padding: 12 }}>
          <Stage
            ref={stageRef}
            width={stageWidth}
            height={CANVAS_H}
            style={{
              border: "1px solid var(--border-primary)",
              cursor: isPanning ? "grabbing" : "default",
              background: "var(--canvas-bg)",
            }}
            onMouseDown={(e) => {
              if (e.evt.button === 1) {
                e.evt.preventDefault();
                setIsPanning(true);
                setPanStart({ x: e.evt.clientX, y: e.evt.clientY });
              } else if (e.target === e.target.getStage()) {
                setSelectedId(null);
              }
            }}
            onMouseMove={(e) => {
              if (isPanning && stageRef.current) {
                const dx = e.evt.clientX - panStart.x;
                const dy = e.evt.clientY - panStart.y;
                const layers = stageRef.current.getLayers();
                layers.forEach((layer: any) => layer.move({ x: dx, y: dy }));
                setPanStart({ x: e.evt.clientX, y: e.evt.clientY });
              }
            }}
            onMouseUp={() => setIsPanning(false)}
            onWheel={(e) => {
              if (e.evt.ctrlKey || e.evt.metaKey) {
                e.evt.preventDefault();
                handleZoom(e.evt.deltaY > 0 ? "out" : "in");
              }
            }}
          >
            <Layer>
              <Grid isDark={isDark} width={stageWidth} />
            </Layer>

            <Layer>
              {placed.map((p) => {
                const def = getPartDefEx(p.partId);
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
                    onDragStart={saveHistory}
                    onDragEnd={(e) => {
                      const dragX = e.target.x();
                      const dragY = e.target.y();
                      
                      const def = getPartDefEx(p.partId);
                      const ports = getResolvedPorts(p, def);
                      
                      // Find nearest port globally (excluding this part)
                      // Use the center of this part as the search origin
                      const nearest = findNearestPort(
                        dragX + (def.w * GRID) / 2,
                        dragY + (def.h * GRID) / 2,
                        placed,
                        p.instanceId,
                        getPartDefEx
                      );
                      
                      let finalX = dragX;
                      let finalY = dragY;
                      
                      if (nearest) {
                        // Find the closest port on this part to the target port
                        const targetPart = placed.find(
                          (part) => part.instanceId === nearest.partInstanceId
                        );
                        
                        if (targetPart) {
                          const targetPortWorld = getPortWorldCoords(
                            targetPart,
                            nearest.port
                          );
                          
                          // Find which of our ports is closest to the target
                          let bestOwnPort = ports[0];
                          let bestDistance = Infinity;
                          
                          for (const ownPort of ports) {
                            const ownPortWorld = getPortWorldCoords(
                              { ...p, x: dragX, y: dragY },
                              ownPort
                            );
                            const dist = Math.sqrt(
                              Math.pow(ownPortWorld.x - targetPortWorld.x, 2) +
                              Math.pow(ownPortWorld.y - targetPortWorld.y, 2)
                            );
                            if (dist < bestDistance) {
                              bestDistance = dist;
                              bestOwnPort = ownPort;
                            }
                          }
                          
                          if (bestOwnPort) {
                            // Get the port's position in world space with current drag position
                            const ownPortWorld = getPortWorldCoords(
                              { ...p, x: dragX, y: dragY },
                              bestOwnPort
                            );
                            
                            // Calculate the offset from the part's top-left position to the port in world space
                            // This offset is rotation-dependent, so we account for it properly
                            const portOffsetFromPartX = ownPortWorld.x - dragX;
                            const portOffsetFromPartY = ownPortWorld.y - dragY;
                            
                            // Position the part so that its port aligns with the target port
                            finalX = targetPortWorld.x - portOffsetFromPartX;
                            finalY = targetPortWorld.y - portOffsetFromPartY;
                          }
                        }
                      } else {
                        // Fall back to grid snap only if NO nearby ports
                        finalX = Math.round(dragX / GRID) * GRID;
                        finalY = Math.round(dragY / GRID) * GRID;
                      }

                      e.target.position({ x: finalX, y: finalY });

                      setPlaced((prev) =>
                        prev.map((item) => (item.instanceId === p.instanceId ? { ...item, x: finalX, y: finalY } : item))
                      );
                    }}
                  >
                    {/* Invisible bounding box for selection */}
                    <Rect
                      width={wPx}
                      height={hPx}
                      fill="transparent"
                      stroke={isSel ? "#ef4444" : "transparent"}
                      strokeWidth={isSel ? 2 : 0}
                    />
                    
                    {/* Part image (if available) */}
                    <PartImage imageSrc={def.imageSrc} width={wPx} height={hPx} />
                    
                    {/* Fallback: visible rect only if no image */}
                    {!def.imageSrc && (
                      <Rect
                        width={wPx}
                        height={hPx}
                        fill={isDark ? "#2563eb" : "#93c5fd"}
                        stroke={isDark ? "#e5e7eb" : "#1f2937"}
                        strokeWidth={1}
                      />
                    )}
                    
                    {/* Text label (only show if no image or when selected) */}
                    {(!def.imageSrc || isSel) && (
                      <Text
                        x={6}
                        y={6}
                        text={`${def.name}\n${p.size}"`}
                        fontSize={12}
                        fill={isDark ? "#e5e7eb" : "#111827"}
                        opacity={def.imageSrc ? 0.7 : 1}
                      />
                    )}
                    
                    {/* Ports - invisible but still functional for snapping */}
                    {getResolvedPorts(p, def).map((port) => (
                      <Circle
                        key={port.id}
                        x={port.x}
                        y={port.y}
                        radius={4}
                        fill={isDark ? "#60a5fa" : "#3b82f6"}
                        stroke={isDark ? "#ffffff" : "#1f2937"}
                        strokeWidth={1}
                        opacity={def.imageSrc ? 0 : 0.6}
                      />
                    ))}
                  </Group>
                );
              })}

              <Text
                x={10}
                y={10}
                text="Plumbing editor prototype: catalog + select + snap"
                fontSize={14}
                fill={isDark ? "#e5e7eb" : "#111827"}
              />
            </Layer>
          </Stage>
        </div>
      </div>
    </div>

    {/* Inspector - Overlay Panel (does not affect layout width) */}
    {inspectorVisible && (
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          width: 280,
          height: "100vh",
          background: "var(--bg-primary)",
          borderLeft: "1px solid var(--border-primary)",
          padding: 12,
          overflow: "auto",
          zIndex: 10,
        }}
      >
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

            {/* Show dimensional data if available */}
            {selectedDef.variants && selectedDef.variants.length > 0 && (() => {
              const variant = getVariant(selectedDef, selected.size);
              if (variant) {
                return (
                  <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.8 }}>
                    <div style={{ opacity: 0.75, marginBottom: 4 }}>Dimensions</div>
                    {Object.entries(variant.dims).map(([key, value]) => (
                      <div key={key} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{key}:</span>
                        <span style={{ fontFamily: "monospace" }}>{value.toFixed(2)}"</span>
                      </div>
                    ))}
                    {variant.weight && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span>Weight:</span>
                        <span style={{ fontFamily: "monospace" }}>{variant.weight.toFixed(1)} lbs</span>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}

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
    )}

    {/* New Part Modal */}
    {showNewPartModal && (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
        }}
        onClick={() => setShowNewPartModal(false)}
      >
        <div
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border-primary)",
            borderRadius: "8px",
            padding: 20,
            maxWidth: "400px",
            maxHeight: "90vh",
            overflow: "auto",
            color: "var(--text-primary)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 style={{ margin: "0 0 16px" }}>Create New Part</h2>
          
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
              Part Name
            </label>
            <input
              type="text"
              value={newPartForm.name}
              onChange={(e) => setNewPartForm({ ...newPartForm, name: e.target.value })}
              placeholder="e.g., T-Junction"
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid var(--border-primary)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
              Type
            </label>
            <select
              value={newPartForm.kind}
              onChange={(e) => setNewPartForm({ ...newPartForm, kind: e.target.value as any })}
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid var(--border-primary)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                boxSizing: "border-box",
              }}
            >
              <option value="pipe">Pipe</option>
              <option value="fitting">Fitting</option>
              <option value="fixture">Fixture</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
                Width (grid cells)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={newPartForm.w}
                onChange={(e) => setNewPartForm({ ...newPartForm, w: parseInt(e.target.value) || 2 })}
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid var(--border-primary)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
                Height (grid cells)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={newPartForm.h}
                onChange={(e) => setNewPartForm({ ...newPartForm, h: parseInt(e.target.value) || 2 })}
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid var(--border-primary)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
              Available Sizes (comma-separated)
            </label>
            <input
              type="text"
              value={newPartForm.sizes}
              onChange={(e) => setNewPartForm({ ...newPartForm, sizes: e.target.value })}
              placeholder="e.g., 2,3,4,6"
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid var(--border-primary)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={createNewPart}
              style={{
                flex: 1,
                padding: 10,
                background: "var(--bg-accent)",
                border: "1px solid var(--border-accent)",
                color: "var(--text-primary)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Create
            </button>
            <button
              onClick={() => setShowNewPartModal(false)}
              style={{
                flex: 1,
                padding: 10,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}