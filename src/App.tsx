import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { beat, Canvas, fitPadding } from "./Canvas";
import { CharacterPanel } from "./CharacterPanel";
import {
  addCharacter, clearOffsets, createDynasty, deleteDynasty, exportActive, importFile, renameActive,
  switchDynasty, useHistory, useStore,
} from "./store";
import { NODE_H, NODE_W } from "./layout";
import { parentsOf, type Dynasty } from "./model";

type Toast = { msg: string; undo?: boolean } | null;
type Appearance = "auto" | "light" | "dark";

const toast = (msg: string) => window.dispatchEvent(new CustomEvent("lineage-toast", { detail: msg }));

function load<T extends string>(key: string, allowed: T[], fallback: T): T {
  try { const v = localStorage.getItem(key) as T; if (allowed.includes(v)) return v; } catch { /* per-viewer pref only */ }
  return fallback;
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

/** Number of generations in the longest line of descent. */
function generations(d: Dynasty): number {
  const memo = new Map<string, number>();
  const depth = (id: string, seen: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 1;
    seen.add(id);
    const v = 1 + Math.max(0, ...parentsOf(d.unions, id).map(p => depth(p, seen)));
    memo.set(id, v);
    return v;
  };
  return Math.max(0, ...d.chars.map(c => depth(c.id, new Set())));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function App() {
  return <ReactFlowProvider><Shell /></ReactFlowProvider>;
}

function Shell() {
  const ready = useStore(s => s.ready);
  const active = useStore(s => s.active);
  const list = useStore(s => s.list);
  const saveError = useStore(s => s.saveError);
  const { undo, redo, pastStates, futureStates } = useHistory();
  const { setCenter, getNode, fitView } = useReactFlow();

  const [selected, setSelected] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<Appearance>(() => load("lineage_appearance", ["auto", "light", "dark"], "auto"));
  const [showSocial, setShowSocial] = useState(() => load("lineage_social", ["shown", "hidden"], "shown") === "shown");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toastState, setToast] = useState<Toast>(null);
  const [query, setQuery] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The panel floats over the tree. Phones always start with it collapsed, since it would cover most of
  // the tree; on wider screens the last choice is remembered.
  const phone = () => matchMedia("(max-width: 920px)").matches;
  const [panelOpen, setPanelOpen] = useState(() => !phone() && load("lineage_panel", ["open", "closed"], "open") === "open");
  useEffect(() => { if (!phone()) save("lineage_panel", panelOpen ? "open" : "closed"); }, [panelOpen]);

  useEffect(() => {
    if (appearance === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = appearance;
    save("lineage_appearance", appearance);
  }, [appearance]);
  useEffect(() => save("lineage_social", showSocial ? "shown" : "hidden"), [showSocial]);

  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const t = typeof detail === "string" ? { msg: detail } : detail;
      setToast(t);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), t.undo ? 6000 : 2800);
    };
    window.addEventListener("lineage-toast", on);
    return () => window.removeEventListener("lineage-toast", on);
  }, []);

  // Drop the selection if the character disappears (delete, undo, dynasty switch).
  useEffect(() => {
    if (selected && !active.chars.some(c => c.id === selected)) setSelected(null);
  }, [active, selected]);

  const select = (id: string | null) => {
    setSelected(id);
    if (id) setPanelOpen(true);
  };
  const jumpTo = (id: string) => {
    setSelected(id);
    const n = getNode(id);
    if (n) setCenter(n.position.x + NODE_W / 2, n.position.y + NODE_H / 2, { zoom: 1.1, duration: beat() });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
      else if (mod && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); redo(); }
      else if (e.key === "Escape") { setSettingsOpen(false); setSelected(null); }
      else if (e.key === "n" && !typing && !mod) { setSelected(addCharacter()); setPanelOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const gens = useMemo(() => generations(active), [active]);

  if (!ready) return null;

  const matches = query.trim()
    ? active.chars.filter(c => (c.name + " " + c.titles + " " + c.faction).toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];
  const families = active.unions.filter(u => u.partners.length === 2).length;

  return (
    <>
      <header className="masthead">
        <div className="masthead-plate">
          <div className="brand">
            <svg className="brand-mark" viewBox="0 0 100 100" aria-hidden="true">
              <polygon className="bm-edge" points="50,4 90,27 90,73 50,96 10,73 10,27" />
              <path className="bm-facet" d="M50,26 L10,27 M50,26 L50,4 M50,26 L90,27 M26,67 L10,27 M26,67 L10,73 M26,67 L50,96 M74,67 L90,27 M74,67 L90,73 M74,67 L50,96" />
              <polygon className="bm-face" points="50,26 74,67 26,67" />
            </svg>
            <div>
              <h1 className="mark">Lineage</h1>
              <p className="tagline">Family trees for campaigns and fiction</p>
            </div>
          </div>
          <nav className="bar-tools">
            <button className="tool" onClick={() => undo()} disabled={!pastStates.length} title="Undo (Ctrl+Z)" aria-label="Undo">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" fill="none" /></svg><span className="tool-label">Undo</span>
            </button>
            <button className="tool" onClick={() => redo()} disabled={!futureStates.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" fill="none" /></svg><span className="tool-label">Redo</span>
            </button>
            <button className="tool" onClick={() => setSettingsOpen(true)} aria-label="Settings">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="7" cy="18" r="2" /></svg><span className="tool-label">Settings</span>
            </button>
          </nav>
        </div>
        <p className="dateline">
          {active.name} · {plural(active.chars.length, "character")} · {plural(gens, "generation")} · {plural(families, "couple")}
        </p>
      </header>

      {saveError && <div className="save-alert" role="alert"><b>Not saved.</b> {saveError} Export the dynasty to keep a copy.</div>}

      <main className="stage">
        <div className="panel-head tree-head">
          <h2>Tree</h2>
          <div className="tree-tools">
            <div className="search">
              <input type="search" placeholder="Find a character" value={query} aria-label="Find a character"
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && matches[0]) { jumpTo(matches[0].id); setQuery(""); } }} />
              {matches.length > 0 && (
                <ul className="search-results">
                  {matches.map(c => <li key={c.id}><button onClick={() => { jumpTo(c.id); setQuery(""); }}>{c.name}<span>{c.titles || c.role}</span></button></li>)}
                </ul>
              )}
            </div>
            <button className="btn-small" onClick={() => { clearOffsets(); setTimeout(() => fitView({ padding: fitPadding(panelOpen), duration: beat() }), 50); }}
              title="Clear manual moves and lay the tree out again">Arrange</button>
          </div>
        </div>

        <div className={"canvas" + (panelOpen ? " panel-open" : "")}>
          {active.chars.length === 0 && (
            <div className="quiet empty">
              <p className="quiet-line">No one here yet.</p>
              <p className="quiet-meta">Add the first character, then their parents, partners and children.</p>
            </div>
          )}
          <Canvas selected={selected} panelOpen={panelOpen} showSocial={showSocial} onSelect={select} />

          {/* Floats over the tree. The wheel scrolls it when hovered and zooms the tree everywhere else. */}
          {panelOpen ? (
            <aside className="col-side float-panel" aria-label={selected ? "Character record" : "Characters and dynasty"}>
              <button className="btn-link panel-collapse" onClick={() => setPanelOpen(false)} aria-expanded="true">Hide panel</button>
              {selected
                ? <CharacterPanel id={selected} onSelect={id => (id ? jumpTo(id) : setSelected(null))} onClose={() => setSelected(null)} />
                : <>
                    <Roster d={active} onPick={jumpTo} />
                    <DynastyPanel active={active} list={list} onSwitch={() => setSelected(null)} />
                  </>}
              <footer className="panel-colophon">
                <p className="credit">Created by Sectr99 <span className="dim">· Set in Oswald and Crimson Pro</span></p>
                <p>Your trees are saved in this browser only. Export a dynasty to back it up or move it.</p>
              </footer>
            </aside>
          ) : (
            <button className="panel-tab" onClick={() => setPanelOpen(true)} aria-expanded="false">
              {selected ? active.chars.find(c => c.id === selected)?.name ?? "Characters" : "Characters"}
              <span className="dim">{active.chars.length}</span>
            </button>
          )}

          <div className="primary-float">
            <button className="btn btn-primary" onClick={() => select(addCharacter())}>Add character <kbd>N</kbd></button>
          </div>
        </div>
      </main>

      <div className={"overlay" + (settingsOpen ? " open" : "")} onClick={e => e.target === e.currentTarget && setSettingsOpen(false)}>
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="sheet-head"><h2 id="settings-title">Settings</h2></div>
          <div className="sheet-sec">
            <h3>Appearance</h3>
            <div className="seg">
              {(["auto", "light", "dark"] as const).map(a => (
                <button key={a} className={appearance === a ? "active" : ""} onClick={() => setAppearance(a)}>
                  {a}<small>{a === "auto" ? "Follow the system" : a === "light" ? "Ink on paper" : "Paper on ink"}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="sheet-sec">
            <h3>Other relationships on the tree</h3>
            <div className="seg">
              <button className={showSocial ? "active" : ""} onClick={() => setShowSocial(true)}>Shown<small>Rivals, allies, mentors</small></button>
              <button className={!showSocial ? "active" : ""} onClick={() => setShowSocial(false)}>Hidden<small>Family lines only</small></button>
            </div>
          </div>
          <div className="sheet-foot"><button className="btn-link" onClick={() => setSettingsOpen(false)}>Done</button></div>
        </div>
      </div>

      {toastState && (
        <div className={"toast" + (toastState.undo ? " has-action" : "")} role="status">
          {toastState.msg}
          {toastState.undo && <button onClick={() => { undo(); setToast(null); }}>Undo</button>}
        </div>
      )}
    </>
  );
}

function Roster({ d, onPick }: { d: Dynasty; onPick: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? d.chars : d.chars.slice(0, 8);
  return (
    <section>
      <div className="panel-head"><h2>Characters</h2><span className="eyebrow">{d.chars.length}</span></div>
      {d.chars.length === 0 && <p className="hint">Nobody yet.</p>}
      <ul className="rows roster">
        {shown.map(c => (
          <li key={c.id}>
            <button onClick={() => onPick(c.id)}>
              <span className="roster-name">{c.name}</span>
              <span className="roster-meta">{c.titles || c.role}</span>
              <span className="eyebrow">{c.status}</span>
            </button>
          </li>
        ))}
      </ul>
      {d.chars.length > 8 && <button className="btn-link" onClick={() => setAll(a => !a)}>{all ? "Show fewer" : `Show all ${d.chars.length}`}</button>}
    </section>
  );
}

function DynastyPanel({ active, list, onSwitch }: { active: Dynasty; list: { id: string; name: string }[]; onSwitch: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(active.name);
  useEffect(() => setName(active.name), [active.id, active.name]);
  return (
    <section>
      <div className="panel-head"><h2>Dynasty</h2></div>
      <div className="fields one">
        <label><span className="eyebrow">Open</span>
          <select value={active.id} onChange={e => { switchDynasty(e.target.value); onSwitch(); }}>
            {list.map(m => <option key={m.id} value={m.id}>{m.id === active.id ? active.name : m.name}</option>)}
          </select>
        </label>
        <label><span className="eyebrow">Name</span>
          <input value={name} maxLength={200} onChange={e => { setName(e.target.value); if (e.target.value.trim()) renameActive(e.target.value); }} onBlur={() => setName(active.name)} />
        </label>
      </div>
      <div className="pick-row">
        <button className="btn-small" onClick={() => { createDynasty(); onSwitch(); }}>New dynasty</button>
        <button className="btn-small" onClick={exportActive}>Export</button>
        <button className="btn-small" onClick={() => fileRef.current?.click()}>Import</button>
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async e => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        if (f.size > 5_000_000) { toast(`That file is ${(f.size / 1e6).toFixed(1)} MB. The limit is 5 MB.`); return; }
        importFile(await f.text());
        onSwitch();
      }} />
      <p className="hint">Import takes a Lineage export, old or new, and opens it as a new dynasty.</p>
      <div className="panel-foot">
        <button className="btn-link btn-danger" onClick={() =>
          confirm(`Delete ${active.name}? Its ${plural(active.chars.length, "character")} will be removed from this browser. This can't be undone.`) && deleteDynasty(active.id)}>
          Delete dynasty
        </button>
      </div>
    </section>
  );
}
