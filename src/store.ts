import { create, useStore as useZustand } from "zustand";
import { temporal } from "zundo";
import { entries, set as idbSet, del as idbDel } from "idb-keyval";
import {
  DynastySchema, emptyDynasty, fromLegacy, importDynasty, newCharacter, newId, normalize, parentUnionOf, wouldCycle,
  type Character, type Dynasty, type Link,
} from "./model";
import { DEMO } from "./demo";

type Meta = { id: string; name: string };

type State = {
  ready: boolean;
  list: Meta[];
  active: Dynasty;
  saveError: string | null;
};

const store = create<State>()(
  temporal(() => ({ ready: false, list: [], active: emptyDynasty(), saveError: null } as State), {
    partialize: s => ({ active: s.active }),
    limit: 100,
    // One undo step per burst of edits (e.g. typing a name), not per keystroke.
    handleSet: handle => {
      let last = 0;
      return (...args: Parameters<typeof handle>) => { const now = Date.now(); if (now - last > 600) handle(...args); last = now; };
    },
  }),
);

export const useStore = store;
export const useHistory = () => useZustand(store.temporal);
const history = store.temporal;

const get = () => store.getState().active;
const toast = (msg: string) => window.dispatchEvent(new CustomEvent("lineage-toast", { detail: msg }));

/** The single funnel for every edit: integrity and inheritance are re-applied here. */
function commit(fn: (d: Dynasty) => Dynasty) {
  const next = normalize(fn(structuredClone(get())));
  store.setState(s => ({ active: next, list: s.list.map(m => (m.id === next.id ? { ...m, name: next.name } : m)) }));
}
const fail = (msg: string) => { toast(msg); return false; };

// ─── Characters ───────────────────────────────────────────────────────────────
export function addCharacter(partial: Partial<Character> = {}) {
  const c = newCharacter(partial);
  commit(d => ({ ...d, chars: [...d.chars, c] }));
  return c.id;
}

export function updateCharacter(id: string, patch: Partial<Character>) {
  if (patch.name !== undefined && !patch.name.trim()) return fail("A character needs a name.");
  commit(d => ({ ...d, chars: d.chars.map(c => (c.id === id ? { ...c, ...patch } : c)) }));
  return true;
}

export function deleteCharacter(id: string) {
  commit(d => ({
    ...d,
    chars: d.chars.filter(c => c.id !== id),
    unions: d.unions.map(u => ({ ...u, partners: u.partners.filter(p => p !== id), children: u.children.filter(c => c !== id) })),
  }));
}

export function duplicateCharacter(id: string) {
  const orig = get().chars.find(c => c.id === id);
  if (!orig) return;
  return addCharacter({ ...orig, id: undefined, name: orig.name + " (Copy)", disorders: orig.disorders.filter(x => x.source !== "inherited") });
}

// ─── Family structure ─────────────────────────────────────────────────────────
// Each takes an existing character id, or omits it to create a new relative in the same undo step.
const withNew = (d: Dynasty, id: string | undefined, name: string): [Dynasty, string] => {
  if (id) return [d, id];
  const c = newCharacter({ name });
  return [{ ...d, chars: [...d.chars, c] }, c.id];
};
const sameCouple = (a: string[], b: string[]) => [...a].sort().join("|") === [...b].sort().join("|");

export function addParent(childId: string, parentId?: string) {
  const u = parentUnionOf(get().unions, childId);
  if (parentId && wouldCycle(get().unions, parentId, childId)) return fail("That would make them their own ancestor.");
  if (parentId && u?.partners.includes(parentId)) return fail("They are already a parent of this character.");
  if (u && u.partners.length >= 2) return fail("This character already has two parents.");
  commit(d => {
    const [n, pid] = withNew(d, parentId, "New Parent");
    return { ...n, unions: u
      ? n.unions.map(x => (x.id === u.id ? { ...x, partners: [...x.partners, pid] } : x))
      : [...n.unions, { id: newId("u"), partners: [pid], children: [childId] }] };
  });
  return true;
}

/** Adds a child to the union of `parentId` and `coParentId` (or `parentId` alone). */
export function addChild(parentId: string, coParentId: string | null, childId?: string) {
  const partners = coParentId ? [parentId, coParentId] : [parentId];
  if (childId && partners.some(p => wouldCycle(get().unions, p, childId))) return fail("That would make them their own ancestor.");
  if (childId && parentUnionOf(get().unions, childId)) return fail("That character already has parents. Unlink them first.");
  commit(d => {
    const [n, cid] = withNew(d, childId, "New Child");
    const u = n.unions.find(x => sameCouple(x.partners, partners));
    return { ...n, unions: u
      ? n.unions.map(x => (x.id === u.id ? { ...x, children: [...x.children, cid] } : x))
      : [...n.unions, { id: newId("u"), partners, children: [cid] }] };
  });
  return true;
}

export function addSpouse(aId: string, bId?: string) {
  if (aId === bId) return fail("A character can't be their own partner.");
  if (bId && get().unions.some(u => sameCouple(u.partners, [aId, bId]))) return fail("They are already partners.");
  commit(d => {
    const [n, id] = withNew(d, bId, "New Spouse");
    return { ...n, unions: [...n.unions, { id: newId("u"), partners: [aId, id], children: [] }] };
  });
  return true;
}

export function addSibling(aId: string, bId?: string) {
  if (aId === bId) return fail("A character can't be their own sibling.");
  if (bId && parentUnionOf(get().unions, bId)) return fail("That character already has parents. Unlink them first.");
  const u = parentUnionOf(get().unions, aId);
  commit(d => {
    const [n, id] = withNew(d, bId, "New Sibling");
    return { ...n, unions: u
      ? n.unions.map(x => (x.id === u.id ? { ...x, children: [...x.children, id] } : x))
      : [...n.unions, { id: newId("u"), partners: [], children: [aId, id] }] };
  });
  return true;
}

/** Removes a character from a union, as a partner or as a child. */
export function leaveUnion(unionId: string, charId: string) {
  commit(d => ({
    ...d,
    unions: d.unions.map(u => (u.id === unionId
      ? { ...u, partners: u.partners.filter(p => p !== charId), children: u.children.filter(c => c !== charId) } : u)),
  }));
}

// ─── Social links ─────────────────────────────────────────────────────────────
export function addLink(from: string, to: string, type: Link["type"]) {
  if (from === to) return fail("A character can't have a relationship with themselves.");
  if (get().links.some(l => sameCouple([l.from, l.to], [from, to]))) return fail("They already have a relationship. Change its type instead.");
  commit(d => ({ ...d, links: [...d.links, { id: newId("l"), from, to, type }] }));
  return true;
}
export const updateLink = (id: string, type: Link["type"]) => commit(d => ({ ...d, links: d.links.map(l => (l.id === id ? { ...l, type } : l)) }));
export const deleteLink = (id: string) => commit(d => ({ ...d, links: d.links.filter(l => l.id !== id) }));

// ─── Layout overrides ─────────────────────────────────────────────────────────
export const setOffset = (id: string, x: number, y: number) => commit(d => ({ ...d, offsets: { ...d.offsets, [id]: { x, y } } }));
export const clearOffsets = () => commit(d => ({ ...d, offsets: {} }));
export const renameActive = (name: string) => name.trim() && commit(d => ({ ...d, name: name.trim() }));

// ─── Dynasties & persistence ──────────────────────────────────────────────────
const KEY = (id: string) => "dyn:" + id;
const ACTIVE_KEY = "lineage_active_dynasty";

function activate(d: Dynasty) {
  try { localStorage.setItem(ACTIVE_KEY, d.id); } catch { /* per-viewer convenience only */ }
  store.setState(s => ({ active: d, list: s.list.some(m => m.id === d.id) ? s.list : [...s.list, { id: d.id, name: d.name }] }));
  history.getState().clear();
}

async function persist(d: Dynasty) {
  try {
    await idbSet(KEY(d.id), d);
    if (store.getState().saveError) store.setState({ saveError: null });
  } catch (e) {
    store.setState({ saveError: "Changes could not be saved: " + (e instanceof Error ? e.message : String(e)) });
  }
}

const loaded = new Map<string, Dynasty>();

export async function boot() {
  let all: Dynasty[] = [];
  try {
    for (const [k, v] of await entries()) {
      if (typeof k !== "string" || !k.startsWith("dyn:")) continue;
      const r = DynastySchema.safeParse(v);
      if (r.success) all.push(normalize(r.data));
    }
  } catch (e) {
    store.setState({ saveError: "Storage is unavailable; changes will not be saved." });
  }
  if (!all.length) all = migrateLocalStorage();
  if (!all.length) all = [fromLegacy(DEMO)];
  all.forEach(d => { loaded.set(d.id, d); void persist(d); });
  let activeId: string | null = null;
  try { activeId = localStorage.getItem(ACTIVE_KEY); } catch { /* ignore */ }
  store.setState({ ready: true, list: all.map(d => ({ id: d.id, name: d.name })) });
  activate(all.find(d => d.id === activeId) ?? all[0]);

  // Debounced autosave of the active dynasty.
  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe((s, prev) => {
    if (s.active === prev.active) return;
    loaded.set(s.active.id, s.active);
    clearTimeout(timer);
    timer = setTimeout(() => persist(s.active), 300);
  });
}

/** One-time pickup of v1 data when the new app is served from the same origin as the old one. */
function migrateLocalStorage(): Dynasty[] {
  try {
    const raw = localStorage.getItem("lineage_dynasties_v1");
    if (!raw) return [];
    return Object.values(JSON.parse(raw) as Record<string, unknown>).flatMap(v => {
      try { return [fromLegacy(v)]; } catch { return []; }
    });
  } catch { return []; }
}

export function switchDynasty(id: string) {
  const d = loaded.get(id);
  if (d && id !== get().id) activate(d);
}

export function createDynasty(d: Dynasty = emptyDynasty()) {
  loaded.set(d.id, d);
  void persist(d);
  activate(d);
}

export function deleteDynasty(id: string) {
  const { list } = store.getState();
  if (list.length <= 1) return fail("This is the only dynasty. Make another before deleting it.");
  loaded.delete(id);
  void idbDel(KEY(id)).catch(() => {});
  store.setState({ list: list.filter(m => m.id !== id) });
  if (id === get().id) activate(loaded.get(store.getState().list[0].id)!);
  return true;
}

export function importFile(text: string) {
  try { const d = importDynasty(text); createDynasty(d); toast(`Imported ${d.name}.`); }
  catch (e) { toast("Couldn't import. " + (e instanceof Error ? e.message : "The file could not be read.")); }
}

export function exportActive() {
  const d = get();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
  a.download = d.name.replace(/[^\w-]+/g, "_") + ".lineage.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
