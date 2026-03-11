/**
 * PartEditor – a dedicated overlay panel for creating and editing part definitions.
 *
 * Features:
 *  - Metadata (name, kind, sizes, w/h)
 *  - Image upload/preview
 *  - Interactive canvas: click to add ports, drag to reposition, right-click to delete
 *  - Port list with id / x / y editable fields
 *  - Save → emits the completed PartDef back to the caller
 */

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Text, Image as KonvaImage, Line } from "react-konva";
import useImage from "use-image";
import type { PartDef, Port } from "./catalog/parts";

const GRID = 25;
const PREVIEW_W = 500;
const PREVIEW_H = 400;

// ---- small helpers -------------------------------------------------------

function uid() {
  return Math.random().toString(16).slice(2, 8);
}

function snapToGrid(v: number) {
  return Math.round(v / GRID) * GRID;
}

// ---- sub-components ------------------------------------------------------

function PreviewGrid({ isDark }: { isDark: boolean }) {
  const lines: React.ReactElement[] = [];
  const color = isDark ? "#3a3a3a" : "#e5e7eb";
  for (let x = 0; x <= PREVIEW_W; x += GRID) {
    lines.push(
      <Line key={`vx${x}`} points={[x, 0, x, PREVIEW_H]} stroke={color} strokeWidth={1} listening={false} />
    );
  }
  for (let y = 0; y <= PREVIEW_H; y += GRID) {
    lines.push(
      <Line key={`hy${y}`} points={[0, y, PREVIEW_W, y]} stroke={color} strokeWidth={1} listening={false} />
    );
  }
  return <>{lines}</>;
}

function PartPreviewImage({
  imageSrc,
  width,
  height,
}: {
  imageSrc: string | undefined;
  width: number;
  height: number;
}) {
  const [image] = useImage(imageSrc || "");
  if (imageSrc && image) {
    return <KonvaImage image={image} width={width} height={height} />;
  }
  return null;
}

// ---- main component ------------------------------------------------------

export type PartEditorProps = {
  /** The part to edit, or null to create a new one. */
  initialPart?: PartDef | null;
  isDark: boolean;
  onSave: (part: PartDef) => void;
  onClose: () => void;
};

export default function PartEditor({ initialPart, isDark, onSave, onClose }: PartEditorProps) {
  // ---- form fields -------------------------------------------------------
  const [name, setName] = useState(initialPart?.name ?? "New Part");
  const [kind, setKind] = useState<"pipe" | "fitting" | "fixture">(
    initialPart?.kind ?? "fitting"
  );
  const [sizesStr, setSizesStr] = useState(
    initialPart?.sizes.join(", ") ?? "2, 3, 4"
  );
  const [wCells, setWCells] = useState(initialPart?.w ?? 2);
  const [hCells, setHCells] = useState(initialPart?.h ?? 2);
  const [imageSrc, setImageSrc] = useState<string | undefined>(initialPart?.imageSrc);

  // ---- port state --------------------------------------------------------
  const [ports, setPorts] = useState<Port[]>(() => initialPart?.ports ?? []);

  // ---- canvas interaction ------------------------------------------------
  // "add" mode: next click places a port; "select" mode: drag to move
  const [tool, setTool] = useState<"add" | "select">("select");
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);

  // Part bounding box in canvas coords (top-left offset so the part is centered)
  const partW = Math.max(1, wCells) * GRID;
  const partH = Math.max(1, hCells) * GRID;
  const originX = Math.floor((PREVIEW_W - partW) / 2 / GRID) * GRID;
  const originY = Math.floor((PREVIEW_H - partH) / 2 / GRID) * GRID;

  // ---- image upload ------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageSrc(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // ---- canvas click → place port -----------------------------------------
  const handleStageClick = (e: any) => {
    if (tool !== "add") return;
    // Convert stage coords to part-local coords
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const localX = snapToGrid(pos.x - originX);
    const localY = snapToGrid(pos.y - originY);
    const newPort: Port = {
      id: `p${uid()}`,
      x: localX,
      y: localY,
    };
    setPorts((prev) => [...prev, newPort]);
  };

  // ---- delete port --------------------------------------------------------
  const deletePort = (portId: string) => {
    setPorts((prev) => prev.filter((p) => p.id !== portId));
    if (selectedPortId === portId) setSelectedPortId(null);
  };

  // ---- update port field --------------------------------------------------
  const updatePort = (portId: string, patch: Partial<Port>) => {
    setPorts((prev) => prev.map((p) => (p.id === portId ? { ...p, ...patch } : p)));
  };

  // ---- save ---------------------------------------------------------------
  const handleSave = () => {
    const sizes = sizesStr
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);

    if (!name.trim()) {
      alert("Part name is required.");
      return;
    }
    if (sizes.length === 0) {
      alert("At least one valid size is required.");
      return;
    }

    const part: PartDef = {
      id: initialPart?.id ?? `custom_${uid()}`,
      name: name.trim(),
      kind,
      sizes,
      w: Math.max(1, wCells),
      h: Math.max(1, hCells),
      ports,
      ...(imageSrc ? { imageSrc } : {}),
      meta: { ...(initialPart?.meta ?? {}), custom: true },
    };
    onSave(part);
  };

  // ---- keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedPortId) deletePort(selectedPortId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedPortId]);

  // ---- colours ------------------------------------------------------------
  const bg = isDark ? "#1e1e2e" : "#ffffff";
  const bgSecondary = isDark ? "#2a2a3d" : "#f3f4f6";
  const bgAccent = isDark ? "#1d4ed8" : "#3b82f6";
  const border = isDark ? "#444466" : "#d1d5db";
  const text = isDark ? "#e2e2f0" : "#111827";
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    border: `1px solid ${border}`,
    background: bgSecondary,
    color: text,
    boxSizing: "border-box",
    fontSize: 13,
  };

  // ---- render -------------------------------------------------------------
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        style={{
          background: bg,
          color: text,
          border: `1px solid ${border}`,
          borderRadius: 10,
          padding: 20,
          width: "min(96vw, 960px)",
          maxHeight: "94vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            {initialPart ? `Edit Part: ${initialPart.name}` : "Create New Part"}
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: text, fontSize: 20, cursor: "pointer", lineHeight: 1 }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Body: two columns */}
        <div style={{ display: "flex", gap: 20, flex: 1, overflow: "hidden", minHeight: 0 }}>

          {/* Left column: metadata + port list */}
          <div
            style={{
              width: 260,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            <label style={{ fontSize: 12, opacity: 0.7 }}>Name</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., T-Junction"
            />

            <label style={{ fontSize: 12, opacity: 0.7 }}>Kind</label>
            <select
              style={inputStyle}
              value={kind}
              onChange={(e) => setKind(e.target.value as any)}
            >
              <option value="pipe">Pipe</option>
              <option value="fitting">Fitting</option>
              <option value="fixture">Fixture</option>
            </select>

            <label style={{ fontSize: 12, opacity: 0.7 }}>Sizes (comma-separated, inches)</label>
            <input
              style={inputStyle}
              value={sizesStr}
              onChange={(e) => setSizesStr(e.target.value)}
              placeholder="2, 3, 4, 6"
            />

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>Width (cells)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  max={20}
                  value={wCells}
                  onChange={(e) => setWCells(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, opacity: 0.7 }}>Height (cells)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  max={20}
                  value={hCells}
                  onChange={(e) => setHCells(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            </div>

            {/* Image */}
            <label style={{ fontSize: 12, opacity: 0.7 }}>Image</label>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: 12,
                  cursor: "pointer",
                  background: bgSecondary,
                  border: `1px solid ${border}`,
                  color: text,
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                📁 Upload image
              </button>
              {imageSrc && (
                <button
                  style={{
                    padding: "6px 8px",
                    fontSize: 12,
                    cursor: "pointer",
                    background: bgSecondary,
                    border: `1px solid ${border}`,
                    color: text,
                  }}
                  onClick={() => setImageSrc(undefined)}
                  title="Remove image"
                >
                  ✕
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageUpload}
            />

            {/* Port list */}
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              Ports ({ports.length}) — click canvas to add, right-click to remove
            </div>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {ports.map((port) => (
                <div
                  key={port.id}
                  style={{
                    padding: 8,
                    background: selectedPortId === port.id ? bgAccent + "33" : bgSecondary,
                    border: `1px solid ${selectedPortId === port.id ? bgAccent : border}`,
                    borderRadius: 4,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedPortId(port.id)}
                >
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 11, opacity: 0.6, flex: 1 }}>id</span>
                    <input
                      style={{ ...inputStyle, width: "auto", flex: 1 }}
                      value={port.id}
                      onChange={(e) => updatePort(port.id, { id: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        fontSize: 14,
                        lineHeight: 1,
                        padding: "0 2px",
                      }}
                      onClick={(e) => { e.stopPropagation(); deletePort(port.id); }}
                      title="Delete port (Delete key)"
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <span style={{ fontSize: 11, opacity: 0.6, width: 14 }}>x</span>
                    <input
                      style={{ ...inputStyle, flex: 1 }}
                      type="number"
                      value={port.x}
                      onChange={(e) => updatePort(port.id, { x: parseFloat(e.target.value) || 0 })}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span style={{ fontSize: 11, opacity: 0.6, width: 14 }}>y</span>
                    <input
                      style={{ ...inputStyle, flex: 1 }}
                      type="number"
                      value={port.y}
                      onChange={(e) => updatePort(port.id, { y: parseFloat(e.target.value) || 0 })}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              ))}
              {ports.length === 0 && (
                <div style={{ fontSize: 12, opacity: 0.5, padding: 8 }}>
                  No ports yet. Switch to Add mode and click the canvas.
                </div>
              )}
            </div>
          </div>

          {/* Right column: interactive canvas */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            {/* Canvas toolbar */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              <button
                style={{
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  background: tool === "select" ? bgAccent : bgSecondary,
                  border: `1px solid ${tool === "select" ? bgAccent : border}`,
                  color: text,
                  borderRadius: 4,
                }}
                onClick={() => setTool("select")}
                title="Select / drag ports"
              >
                ↖ Select
              </button>
              <button
                style={{
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  background: tool === "add" ? "#16a34a" : bgSecondary,
                  border: `1px solid ${tool === "add" ? "#16a34a" : border}`,
                  color: text,
                  borderRadius: 4,
                }}
                onClick={() => setTool("add")}
                title="Click canvas to place a new port"
              >
                ＋ Add port
              </button>
              <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 6 }}>
                Right-click a port to delete it
              </span>
            </div>

            {/* Konva canvas */}
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                border: `1px solid ${border}`,
                borderRadius: 4,
                background: isDark ? "#141420" : "#f9fafb",
                cursor: tool === "add" ? "crosshair" : "default",
              }}
            >
              <Stage
                width={PREVIEW_W}
                height={PREVIEW_H}
                onClick={handleStageClick}
                onContextMenu={(e) => e.evt.preventDefault()}
              >
                <Layer>
                  <PreviewGrid isDark={isDark} />

                  {/* Part bounding box */}
                  <Rect
                    x={originX}
                    y={originY}
                    width={partW}
                    height={partH}
                    fill={imageSrc ? "transparent" : isDark ? "#2563eb33" : "#93c5fd44"}
                    stroke={isDark ? "#60a5fa" : "#3b82f6"}
                    strokeWidth={1.5}
                    strokeDash={imageSrc ? [4, 4] : []}
                    listening={false}
                  />

                  {/* Part image */}
                  {imageSrc && (
                    <PartPreviewImage imageSrc={imageSrc} width={partW} height={partH} />
                  )}

                  {/* Part label (no image fallback) */}
                  {!imageSrc && (
                    <Text
                      x={originX + 4}
                      y={originY + 4}
                      text={name || "Part"}
                      fontSize={11}
                      fill={isDark ? "#93c5fd" : "#1d4ed8"}
                      listening={false}
                    />
                  )}

                  {/* Origin cross-hair */}
                  <Line
                    points={[originX - 5, originY, originX + 5, originY]}
                    stroke="#ef4444"
                    strokeWidth={1}
                    listening={false}
                  />
                  <Line
                    points={[originX, originY - 5, originX, originY + 5]}
                    stroke="#ef4444"
                    strokeWidth={1}
                    listening={false}
                  />

                  {/* Ports */}
                  {ports.map((port) => {
                    const isSel = selectedPortId === port.id;
                    return (
                      <Circle
                        key={port.id}
                        x={originX + port.x}
                        y={originY + port.y}
                        radius={isSel ? 7 : 5}
                        fill={isSel ? "#facc15" : "#22c55e"}
                        stroke={isDark ? "#fff" : "#111"}
                        strokeWidth={1.5}
                        draggable={tool === "select"}
                        onMouseDown={(e) => {
                          e.cancelBubble = true;
                          setSelectedPortId(port.id);
                        }}
                        onDragEnd={(e) => {
                          // Translate back to part-local coords
                          const absX = e.target.x();
                          const absY = e.target.y();
                          const localX = snapToGrid(absX - originX);
                          const localY = snapToGrid(absY - originY);
                          e.target.position({ x: originX + localX, y: originY + localY });
                          setPorts((prev) =>
                            prev.map((p) =>
                              p.id === port.id ? { ...p, x: localX, y: localY } : p
                            )
                          );
                        }}
                        onContextMenu={(e) => {
                          e.evt.preventDefault();
                          e.cancelBubble = true;
                          deletePort(port.id);
                        }}
                      />
                    );
                  })}

                  {/* Port labels */}
                  {ports.map((port) => (
                    <Text
                      key={`lbl-${port.id}`}
                      x={originX + port.x + 8}
                      y={originY + port.y - 7}
                      text={port.id}
                      fontSize={10}
                      fill={isDark ? "#facc15" : "#15803d"}
                      listening={false}
                    />
                  ))}
                </Layer>
              </Stage>
            </div>

            {/* Pixel hint */}
            <div style={{ fontSize: 11, opacity: 0.5, flexShrink: 0 }}>
              Grid cell = {GRID}px. Red cross = part origin (0,0). Ports snap to grid.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              cursor: "pointer",
              background: bgSecondary,
              border: `1px solid ${border}`,
              color: text,
              borderRadius: 4,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              cursor: "pointer",
              background: bgAccent,
              border: `1px solid ${bgAccent}`,
              color: "#fff",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            💾 Save Part
          </button>
        </div>
      </div>
    </div>
  );
}
