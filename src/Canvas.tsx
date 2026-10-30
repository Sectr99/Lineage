import { memo, useEffect, useMemo, useState } from "react";
import {
  Controls, Handle, MiniMap, Position, ReactFlow, useNodesInitialized, useNodesState, useReactFlow,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import { computeLayout, NODE_H, NODE_W, structureKey, UNION_SIZE, unionPoint, type Point } from "./layout";
import { setOffset, useStore } from "./store";
import type { Character, Dynasty } from "./model";

type PersonData = { char: Character; dim: boolean };
type UnionData = { dim: boolean };

const hidden = { opacity: 0, pointerEvents: "none" as const };

/** Duration for camera moves; 0 when the viewer asked for reduced motion. */
export const beat = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300);

const PersonNode = memo(({ data, selected }: NodeProps<Node<PersonData>>) => {
  const { char: c, dim } = data;
  const sub = [c.titles || c.role, c.species].filter(Boolean).join(" · ");
  return (
    <div className={"person" + (selected ? " selected" : "") + (dim ? " dim" : "") + (c.status === "Deceased" ? " deceased" : "")} style={{ width: NODE_W, height: NODE_H }}>
      <Handle type="target" position={Position.Top} id="t" style={hidden} />
      <Handle type="target" position={Position.Left} id="lt" style={hidden} />
      <Handle type="source" position={Position.Left} id="ls" style={hidden} />
      <div className="person-name">{c.name}</div>
      {sub && <div className="person-sub">{sub}</div>}
      <div className="person-foot">
        <span>{c.status}</span>
        {c.disorders.length > 0 && <span>{c.disorders.length} {c.disorders.length === 1 ? "trait" : "traits"}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} id="b" style={hidden} />
      <Handle type="source" position={Position.Right} id="rs" style={hidden} />
      <Handle type="target" position={Position.Right} id="rt" style={hidden} />
    </div>
  );
});

const UnionNode = memo(({ data }: NodeProps<Node<UnionData>>) => (
  <div className={"union" + (data.dim ? " dim" : "")} style={{ width: UNION_SIZE, height: UNION_SIZE }}>
    <Handle type="target" position={Position.Top} id="t" style={hidden} />
    <Handle type="target" position={Position.Left} id="lt" style={hidden} />
    <Handle type="target" position={Position.Right} id="rt" style={hidden} />
    <Handle type="source" position={Position.Bottom} id="b" style={hidden} />
  </div>
));

const nodeTypes = { person: PersonNode, union: UnionNode };

/** Ancestors, descendants and partners of `id`. Everything else is dimmed. */
function lineageOf(d: Dynasty, id: string | null): Set<string> | null {
  if (!id) return null;
  const set = new Set<string>([id]);
  const walk = (start: string, up: boolean) => {
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const u of d.unions) {
        const from = up ? u.children : u.partners, to = up ? u.partners : u.children;
        if (!from.includes(cur)) continue;
        set.add(u.id);
        to.forEach(x => { if (!set.has(x)) { set.add(x); queue.push(x); } });
      }
    }
  };
  walk(id, true); walk(id, false);
  d.unions.forEach(u => { if (u.partners.includes(id)) { set.add(u.id); u.partners.forEach(p => set.add(p)); } });
  return set;
}

type Props = {
  selected: string | null;
  showSocial: boolean;
  onSelect: (id: string | null) => void;
};

export function Canvas({ selected, showSocial, onSelect }: Props) {
  const d = useStore(s => s.active);
  const { fitView } = useReactFlow();
  const [auto, setAuto] = useState<Map<string, Point>>(new Map());
  const key = structureKey(d);

  useEffect(() => {
    let live = true;
    computeLayout(d).then(pos => { if (live) setAuto(pos); });
    return () => { live = false; };
    // Only re-layout when the family structure changes, not on every text edit.
  }, [key]);


  const lineage = useMemo(() => lineageOf(d, selected), [d, selected]);

  // Character position = auto layout + manual offset. Union dots follow their partners.
  const pos = useMemo(() => {
    const m = new Map<string, Point>();
    d.chars.forEach(c => {
      const p = auto.get(c.id), o = d.offsets[c.id];
      if (p) m.set(c.id, o ? { x: p.x + o.x, y: p.y + o.y } : p);
    });
    d.unions.forEach(u => {
      const kids = u.children.map(c => m.get(c)).filter((p): p is Point => !!p);
      const above = kids.length ? { x: kids.reduce((a, p) => a + p.x, 0) / kids.length + NODE_W / 2 - UNION_SIZE / 2, y: Math.min(...kids.map(p => p.y)) - 40 } : undefined;
      m.set(u.id, unionPoint(u, id => m.get(id), above));
    });
    return m;
  }, [d, auto]);

  const nodes = useMemo<Node[]>(() => {
    if (!auto.size) return [];
    return [
      ...d.chars.map(c => ({
        id: c.id, type: "person", position: pos.get(c.id) ?? { x: 0, y: 0 }, selected: c.id === selected,
        data: { char: c, dim: !!lineage && !lineage.has(c.id) },
      })),
      ...d.unions.map(u => ({
        id: u.id, type: "union", position: pos.get(u.id) ?? { x: 0, y: 0 },
        draggable: false, selectable: false, focusable: false,
        data: { dim: !!lineage && !lineage.has(u.id) },
      })),
    ];
  }, [d, auto, pos, selected, lineage]);

  // React Flow owns positions while dragging; our computed nodes win whenever data changes.
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => setRfNodes(nodes), [nodes, setRfNodes]);

  // Fit the whole tree once React Flow has measured the cards of a newly opened dynasty.
  const measured = useNodesInitialized() && rfNodes.length > 0;
  useEffect(() => {
    if (measured) fitView({ padding: 0.12, duration: beat() });
  }, [d.id, measured, fitView]);

  const edges = useMemo<Edge[]>(() => {
    const dimmed = (a: string, b: string) => !!lineage && !(lineage.has(a) && lineage.has(b));
    const x = (id: string) => pos.get(id)?.x ?? 0;
    const base = { selectable: false, focusable: false };
    const family: Edge[] = d.unions.flatMap(u => {
      // Partners join the dot from the side (couples) or from above (single parent).
      const partners = u.partners.map(p => {
        const side = u.partners.length === 1 ? null : x(p) <= x(u.id) ? "left" : "right";
        return {
          ...base, id: p + ">" + u.id, source: p, target: u.id, type: "straight",
          sourceHandle: side === "left" ? "rs" : side === "right" ? "ls" : "b",
          targetHandle: side === "left" ? "lt" : side === "right" ? "rt" : "t",
          className: "e-partner" + (dimmed(p, u.id) ? " dim" : ""),
        };
      });
      const kids = u.children.map(c => ({
        ...base, id: u.id + ">" + c, source: u.id, target: c, type: "smoothstep", sourceHandle: "b", targetHandle: "t",
        pathOptions: { borderRadius: 0 }, className: "e-child" + (dimmed(u.id, c) ? " dim" : ""),
      }));
      return [...partners, ...kids];
    });
    if (!showSocial) return family;
    const social = d.links.map(l => {
      const [a, b] = x(l.from) <= x(l.to) ? [l.from, l.to] : [l.to, l.from];
      return {
        ...base, id: l.id, source: a, target: b, sourceHandle: "rs", targetHandle: "lt", type: "straight", label: l.type,
        className: "e-social" + (dimmed(a, b) ? " dim" : ""),
      };
    });
    return [...family, ...social];
  }, [d, pos, lineage, showSocial]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => n.type === "person" && onSelect(n.id)}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={(_, n) => {
        const a = auto.get(n.id);
        if (a) setOffset(n.id, Math.round(n.position.x - a.x), Math.round(n.position.y - a.y));
      }}
      deleteKeyCode={null}
      nodesConnectable={false}
      minZoom={0.1}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
    >
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="minimap" nodeColor={n => (n.type === "person" ? "var(--ink-3)" : "transparent")} />
    </ReactFlow>
  );
}
