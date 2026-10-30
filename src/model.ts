import { z } from "zod";

// ─── Vocabulary ───────────────────────────────────────────────────────────────
export const STATUS_OPTIONS = ["Alive", "Deceased", "Unknown", "Missing", "Undead", "Immortal"] as const;
export const SPECIES_PRESETS = ["Human", "Elf", "Dwarf", "Halfling", "Orc", "Tiefling", "Dragonborn", "Gnome", "Half-Elf", "Undead"];
// Family structure (Parent/Child/Spouse/Sibling) lives in unions; everything else is a social link.
export const SOCIAL_TYPES = ["Adopted", "Guardian", "Rival", "Ally", "Enemy", "Mentor", "Apprentice", "Other"] as const;
export const DISORDER_STATUS = ["Affected", "Carrier", "Unaffected", "Unknown"] as const;

// ─── Schemas (the trust boundary for imports and storage) ─────────────────────
const Id = z.string().regex(/^[\w-]{1,64}$/);
const Text = (max: number) => z.string().max(max).catch("");

export const DisorderSchema = z.object({
  name: z.string().trim().min(1).max(100),
  hereditary: z.boolean().catch(false),
  status: z.enum(DISORDER_STATUS).catch("Unknown"),
  source: z.enum(["manual", "inherited"]).catch("manual"),
});

export const CharacterSchema = z.object({
  id: Id,
  name: z.string().trim().min(1).max(200),
  species: Text(100),
  age: Text(50),
  gender: Text(50),
  status: z.enum(STATUS_OPTIONS).catch("Unknown"),
  role: Text(100),
  titles: Text(200),
  faction: Text(100),
  notes: Text(5000),
  colorIndex: z.number().int().min(0).max(11).catch(0),
  disorders: z.array(DisorderSchema).max(50).catch([]),
});

// A union is a couple (or a single/unknown parent) and the children they share.
export const UnionSchema = z.object({
  id: Id,
  partners: z.array(Id).max(2),
  children: z.array(Id),
});

export const LinkSchema = z.object({ id: Id, from: Id, to: Id, type: z.enum(SOCIAL_TYPES) });

export const DynastySchema = z.object({
  version: z.literal(2),
  id: Id,
  name: z.string().trim().min(1).max(200),
  chars: z.array(CharacterSchema).max(5000),
  unions: z.array(UnionSchema).max(5000),
  links: z.array(LinkSchema).max(20000),
  // Manual drag offsets relative to the automatic layout, so they survive re-layout.
  offsets: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).catch({}),
});

export type Disorder = z.infer<typeof DisorderSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Union = z.infer<typeof UnionSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type Dynasty = z.infer<typeof DynastySchema>;

export const newId = (prefix: string) => prefix + "_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);

export function newCharacter(partial: Partial<Character> = {}): Character {
  return {
    id: newId("c"), name: "New Character", species: "Human", age: "", gender: "", status: "Alive",
    role: "", titles: "", faction: "", notes: "", colorIndex: 0, disorders: [], ...partial,
  };
}

export function emptyDynasty(name = "New Dynasty"): Dynasty {
  return { version: 2, id: newId("dyn"), name, chars: [], unions: [], links: [], offsets: {} };
}

// ─── Graph helpers ────────────────────────────────────────────────────────────
export const parentUnionOf = (unions: Union[], childId: string) => unions.find(u => u.children.includes(childId));
export const parentsOf = (unions: Union[], childId: string) => parentUnionOf(unions, childId)?.partners ?? [];

/** True if making `parentId` a parent of `childId` would create a loop. */
export function wouldCycle(unions: Union[], parentId: string, childId: string): boolean {
  if (parentId === childId) return true;
  const seen = new Set<string>(), queue = [childId];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === parentId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    unions.forEach(u => { if (u.partners.includes(id)) queue.push(...u.children); });
  }
  return false;
}

/**
 * Repairs referential integrity: drops refs to missing characters, empty unions,
 * duplicate/self links, children claimed by more than one union, and cycles.
 */
export function normalize(d: Dynasty): Dynasty {
  const ids = new Set(d.chars.map(c => c.id));
  const claimed = new Set<string>();
  const unions: Union[] = [];
  for (const u of d.unions) {
    const partners = [...new Set(u.partners.filter(id => ids.has(id)))];
    const union: Union = { id: u.id, partners, children: [] };
    unions.push(union);
    for (const c of u.children) {
      if (!ids.has(c) || claimed.has(c) || partners.includes(c)) continue;
      if (partners.some(p => wouldCycle(unions, p, c))) continue;
      claimed.add(c); union.children.push(c);
    }
  }
  const pairs = new Set<string>();
  const links = d.links.filter(l => {
    const key = [l.from, l.to].sort().join("|");
    if (l.from === l.to || !ids.has(l.from) || !ids.has(l.to) || pairs.has(key)) return false;
    pairs.add(key); return true;
  });
  const offsets = Object.fromEntries(Object.entries(d.offsets).filter(([id]) => ids.has(id)));
  return {
    ...d,
    unions: unions.filter(u => u.children.length || u.partners.length === 2),
    links, offsets,
    chars: propagateDisorders(d.chars, unions),
  };
}

// ─── Disorder inheritance ─────────────────────────────────────────────────────
// Walks parents before children. Only hereditary disorders propagate; manual entries are never overwritten.
export function propagateDisorders(chars: Character[], unions: Union[]): Character[] {
  const byId = new Map(chars.map(c => [c.id, { ...c, disorders: c.disorders.map(d => ({ ...d })) }]));
  const done = new Set<string>();
  const visit = (id: string, stack: Set<string>) => {
    if (done.has(id) || stack.has(id)) return;
    stack.add(id);
    const pids = parentsOf(unions, id);
    pids.forEach(p => visit(p, stack));
    const child = byId.get(id)!;
    if (pids.length) {
      const fromParents = new Map<string, boolean>(); // name → at risk
      pids.forEach(p => byId.get(p)?.disorders.forEach(d => {
        if (!d.hereditary) return;
        const atRisk = d.status === "Affected" || d.status === "Carrier";
        fromParents.set(d.name, (fromParents.get(d.name) ?? false) || atRisk);
      }));
      const kept = child.disorders.filter(d => d.source !== "inherited" || fromParents.has(d.name));
      fromParents.forEach((atRisk, name) => {
        const existing = kept.find(d => d.name === name);
        if (existing && existing.source !== "inherited") return;
        const status = atRisk ? "Carrier" : "Unaffected";
        if (existing) Object.assign(existing, { status, hereditary: true });
        else kept.push({ name, hereditary: true, status, source: "inherited" });
      });
      child.disorders = kept;
    }
    stack.delete(id); done.add(id);
  };
  chars.forEach(c => visit(c.id, new Set()));
  return chars.map(c => byId.get(c.id)!);
}

// ─── Import (new format or a v1 .lineage.json) ────────────────────────────────
const LEGACY_PALETTES = [
  ["#c9a227","#e05c7a","#5ca8d6","#9b6dca","#a3c27b","#cc4444","#f0c060","#d07030","#60a890","#c070a0","#7890c8","#888878"],
  ["#c070f8","#70b8f8","#f870c0","#a848e8","#60d8f8","#e840a8","#9058d8","#50c8e8","#d870e8","#7838c8","#40b8d8","#c850d0"],
  ["#ff3860","#f8c848","#e87898","#d84030","#f8a828","#c83860","#e85878","#d89030","#c85070","#e8a840","#f86878","#b82840"],
  ["#48b870","#90c878","#70d890","#38a858","#c8e870","#50c060","#a8d858","#60c878","#80e858","#40b868","#b8d840","#68d888"],
  ["#e8e8e8","#b8b8b8","#888888","#d0d0d0","#f0f0f0","#a0a0a0","#c8c8c8","#787878","#e0e0e0","#909090","#d8d8d8","#686868"],
];

const LegacySchema = z.object({
  treeName: z.string().max(200).catch("Imported Dynasty"),
  chars: z.array(z.looseObject({ id: z.string(), name: z.unknown() })).max(5000),
  rels: z.array(z.object({ from: z.string(), to: z.string(), type: z.string() })).max(20000),
});

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function fromLegacy(raw: unknown): Dynasty {
  const old = LegacySchema.parse(raw);
  // Old ids may contain anything; remap them all to fresh safe ids.
  const idMap = new Map(old.chars.map(c => [c.id, newId("c")]));
  const chars: Character[] = old.chars.map(c => {
    const color = str(c.color).toLowerCase();
    const colorIndex = Math.max(0, ...LEGACY_PALETTES.map(p => p.indexOf(color)));
    return CharacterSchema.parse({
      ...c, id: idMap.get(c.id), name: str(c.name).trim() || "Unnamed", colorIndex,
      disorders: Array.isArray(c.disorders)
        ? c.disorders.flatMap(d => { const r = DisorderSchema.safeParse(d); return r.success ? [r.data] : []; })
        : [],
    });
  });

  const rels = old.rels.filter(r => idMap.has(r.from) && idMap.has(r.to))
    .map(r => ({ ...r, from: idMap.get(r.from)!, to: idMap.get(r.to)! }));
  const parentSets = new Map<string, string[]>();
  for (const r of rels) {
    const [p, c] = r.type === "Child" ? [r.to, r.from] : [r.from, r.to];
    if (r.type === "Parent" || r.type === "Child") parentSets.set(c, [...(parentSets.get(c) ?? []), p]);
  }

  const unions: Union[] = [];
  const unionFor = (partners: string[]) => {
    const key = [...partners].sort().join("|");
    let u = unions.find(u => [...u.partners].sort().join("|") === key);
    if (!u) unions.push(u = { id: newId("u"), partners: [...partners], children: [] });
    return u;
  };
  parentSets.forEach((ps, child) => unionFor([...new Set(ps)].slice(0, 2)).children.push(child));
  rels.filter(r => r.type === "Spouse" || r.type === "Partner").forEach(r => unionFor([r.from, r.to]));
  rels.filter(r => r.type === "Sibling").forEach(r => {
    const u = parentUnionOf(unions, r.from) ?? parentUnionOf(unions, r.to);
    if (!u) unions.push({ id: newId("u"), partners: [], children: [r.from, r.to] });
    else for (const id of [r.from, r.to]) if (!parentUnionOf(unions, id)) u.children.push(id);
  });

  const links: Link[] = rels.flatMap(r => (SOCIAL_TYPES as readonly string[]).includes(r.type)
    ? [{ id: newId("l"), from: r.from, to: r.to, type: r.type as Link["type"] }] : []);

  return normalize({ version: 2, id: newId("dyn"), name: old.treeName.trim() || "Imported Dynasty", chars, unions, links, offsets: {} });
}

/** Parses an untrusted file. Always returns a dynasty with a fresh id, or throws a readable error. */
export function importDynasty(text: string): Dynasty {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("That file isn't JSON."); }
  if (raw && typeof raw === "object" && "version" in raw) {
    const r = DynastySchema.safeParse(raw);
    if (!r.success) throw new Error("That file is damaged or from a newer version of Lineage.");
    return normalize({ ...r.data, id: newId("dyn") });
  }
  const r = LegacySchema.safeParse(raw);
  if (!r.success) throw new Error("That file has no characters or relationships. Is it a Lineage export?");
  return fromLegacy(raw);
}
