import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
import type { Dynasty, Union } from "./model";

export const NODE_W = 180, NODE_H = 92, UNION_SIZE = 1, PARTNER_GAP = 48;

export type Point = { x: number; y: number };

// ELK is ~1.5 MB, so it loads after first paint.
// ponytail: runs on the main thread; move to elkjs's web worker if trees reach thousands of characters.
const elk = import("elkjs/lib/elk.bundled.js").then(m => new m.default());

const OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.spacing.nodeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "70",
  "elk.spacing.componentComponent": "90",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  // Keep siblings in insertion order so the tree doesn't reshuffle on every edit.
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
};

/** Key that only changes when the family structure changes (not on text edits). */
export const structureKey = (d: Pick<Dynasty, "chars" | "unions" | "links">) =>
  d.chars.map(c => c.id).join(",") + "#" + d.unions.map(u => u.id + ":" + u.partners.join("+") + ">" + u.children.join("+")).join(";")
  + "#" + d.links.map(l => l.from + "-" + l.to).join(";");

/**
 * Groups partners into rows ("units") so couples always sit side by side.
 * A chain of remarriages (A–B, B–C) becomes one row ordered A, B, C.
 */
export function buildUnits(chars: { id: string }[], unions: Union[]): string[][] {
  const adj = new Map<string, string[]>(chars.map(c => [c.id, []]));
  unions.forEach(u => { if (u.partners.length === 2) { const [a, b] = u.partners; adj.get(a)?.push(b); adj.get(b)?.push(a); } });
  const seen = new Set<string>(), units: string[][] = [];
  for (const c of chars) {
    if (seen.has(c.id)) continue;
    // Collect the component, then start the row from its least-connected member so chains read left to right.
    const comp: string[] = [], stack = [c.id], inComp = new Set([c.id]);
    while (stack.length) { const id = stack.pop()!; comp.push(id); adj.get(id)!.forEach(n => { if (!inComp.has(n)) { inComp.add(n); stack.push(n); } }); }
    const start = comp.reduce((a, b) => (adj.get(b)!.length < adj.get(a)!.length ? b : a));
    const row: string[] = [];
    const dfs = (id: string) => { seen.add(id); row.push(id); adj.get(id)!.forEach(n => { if (!seen.has(n)) dfs(n); }); };
    dfs(start);
    units.push(row);
  }
  return units;
}

/** Where a union's dot sits, given the current character positions. */
export function unionPoint(u: Union, pos: (id: string) => Point | undefined, fallback?: Point): Point {
  const ps = u.partners.map(pos).filter((p): p is Point => !!p);
  if (ps.length === 2) {
    const [a, b] = ps[0].x <= ps[1].x ? ps : [ps[1], ps[0]];
    return { x: (a.x + NODE_W + b.x) / 2 - UNION_SIZE / 2, y: (a.y + b.y) / 2 + NODE_H / 2 - UNION_SIZE / 2 };
  }
  if (ps.length === 1) return { x: ps[0].x + NODE_W / 2 - UNION_SIZE / 2, y: ps[0].y + NODE_H + 18 };
  return fallback ?? { x: 0, y: 0 };
}

/**
 * Auto-layout. Each unit is one ELK node with fixed ports: a south port under every
 * union it owns, a north port above every member. Edges run union port → child port,
 * so generations line up and children fan out under their parents.
 * Social links stay out of ELK so they never distort the family tree; characters with
 * no family join the row of whoever they're linked to, right beside them.
 */
export async function computeLayout(d: Pick<Dynasty, "chars" | "unions" | "links">): Promise<Map<string, Point>> {
  const attached = attachOrder(d);
  const units = buildUnits(d.chars.filter(c => !attached.has(c.id)), d.unions);
  attached.forEach((anchor, id) => {
    const row = units.find(r => r.includes(anchor))!, i = row.indexOf(anchor);
    // Beside the anchor, on the outside so couples stay together.
    if (i === 0) row.unshift(id); else if (i === row.length - 1) row.push(id); else row.splice(i < row.length / 2 ? 0 : row.length, 0, id);
  });
  const unitOf = new Map<string, { id: string; index: number }>();
  units.forEach((row, ui) => row.forEach((id, index) => unitOf.set(id, { id: "unit" + ui, index })));
  const memberX = (index: number) => index * (NODE_W + PARTNER_GAP);

  const nodes: ElkNode[] = units.map((row, ui) => ({
    id: "unit" + ui,
    width: memberX(row.length - 1) + NODE_W,
    height: NODE_H,
    layoutOptions: { "elk.portConstraints": "FIXED_POS" },
    ports: row.map((id, i) => ({ id: "in:" + id, x: memberX(i) + NODE_W / 2, y: 0, width: 1, height: 1, layoutOptions: { "elk.port.side": "NORTH" } })),
  }));
  const edges: ElkExtendedEdge[] = [];

  for (const u of d.unions) {
    if (!u.children.length) continue;
    let source: string;
    if (u.partners.length) {
      const owner = unitOf.get(u.partners[0])!;
      const xs = u.partners.map(p => memberX(unitOf.get(p)!.index) + NODE_W / 2);
      const node = nodes.find(n => n.id === owner.id)!;
      source = "out:" + u.id;
      node.ports!.push({ id: source, x: xs.reduce((a, b) => a + b) / xs.length, y: NODE_H, width: 1, height: 1, layoutOptions: { "elk.port.side": "SOUTH" } });
    } else {
      source = u.id; // parents unknown: the union is its own small node above the siblings
      nodes.push({ id: u.id, width: UNION_SIZE, height: UNION_SIZE });
    }
    u.children.forEach(c => edges.push({ id: u.id + ">" + c, sources: [source], targets: ["in:" + c] }));
  }

  const res = await (await elk).layout({ id: "root", layoutOptions: OPTIONS, children: nodes, edges });
  const out = new Map<string, Point>();
  for (const n of res.children ?? []) {
    const x = n.x ?? 0, y = n.y ?? 0;
    const ui = n.id.startsWith("unit") ? Number(n.id.slice(4)) : -1;
    if (ui < 0) { out.set(n.id, { x, y }); continue; }
    units[ui].forEach((id, i) => out.set(id, { x: x + memberX(i), y }));
  }
  return out;
}

/**
 * Characters outside every union but socially linked (directly or via a chain) to someone
 * in the tree, mapped to the character they sit beside. Map order = placement order.
 */
function attachOrder(d: Pick<Dynasty, "chars" | "unions" | "links">): Map<string, string> {
  const inTree = new Set(d.unions.flatMap(u => [...u.partners, ...u.children]));
  const out = new Map<string, string>(), queue = [...inTree];
  while (queue.length) {
    const id = queue.shift()!;
    for (const l of d.links) {
      const other = l.from === id ? l.to : l.to === id ? l.from : null;
      if (other && !inTree.has(other) && !out.has(other)) { out.set(other, id); queue.push(other); }
    }
  }
  return out;
}
