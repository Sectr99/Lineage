import { useEffect, useState } from "react";
import {
  addChild, addLink, addParent, addSibling, addSpouse, deleteCharacter, deleteLink, duplicateCharacter,
  leaveUnion, updateCharacter, updateLink, useStore,
} from "./store";
import {
  DISORDER_STATUS, parentUnionOf, SOCIAL_TYPES, SPECIES_PRESETS, STATUS_OPTIONS,
  type Character, type Disorder, type Link,
} from "./model";

type Props = { id: string; onSelect: (id: string | null) => void; onClose: () => void };

const NEW = "__new__";

/** Pick an existing character or create a new one. Calls back with undefined for "new". */
function Picker({ label, exclude, onPick }: { label: string; exclude: string[]; onPick: (id: string | undefined) => void }) {
  const chars = useStore(s => s.active.chars);
  return (
    <select className="picker" value="" aria-label={label} onChange={e => e.target.value && onPick(e.target.value === NEW ? undefined : e.target.value)}>
      <option value="">{label}</option>
      <option value={NEW}>New character</option>
      {chars.filter(c => !exclude.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}

function Person({ id, onSelect, onRemove }: { id: string; onSelect: (id: string) => void; onRemove?: () => void }) {
  const name = useStore(s => s.active.chars.find(c => c.id === id)?.name ?? "?");
  return (
    <li className="rel-row">
      <button className="name-link" onClick={() => onSelect(id)}>{name}</button>
      {onRemove && <button className="x" aria-label={"Unlink " + name} title="Unlink" onClick={onRemove}>✕</button>}
    </li>
  );
}

function Head({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="panel-head"><h2>{title}</h2>{children}</div>;
}

export function CharacterPanel({ id, onSelect, onClose }: Props) {
  const d = useStore(s => s.active);
  const c = d.chars.find(x => x.id === id);
  const [name, setName] = useState(c?.name ?? "");
  useEffect(() => setName(c?.name ?? ""), [id, c?.name]);
  if (!c) return null;

  const set = (patch: Partial<Character>) => updateCharacter(c.id, patch);
  const parentU = parentUnionOf(d.unions, c.id);
  const ownUnions = d.unions.filter(u => u.partners.includes(c.id));
  const siblings = parentU ? parentU.children.filter(x => x !== c.id) : [];
  const links = d.links.filter(l => l.from === c.id || l.to === c.id);
  const family = [c.id, ...(parentU?.partners ?? []), ...siblings, ...ownUnions.flatMap(u => [...u.partners, ...u.children])];
  const setDisorders = (fn: (ds: Disorder[]) => Disorder[]) => set({ disorders: fn(c.disorders) });

  return (
    <>
      <section aria-label={"Character: " + c.name}>
        <Head title="Record"><button className="btn-link" onClick={onClose}>Close</button></Head>
        <input className="name-input" value={name} aria-label="Name" maxLength={200}
          onChange={e => { setName(e.target.value); if (e.target.value.trim()) set({ name: e.target.value }); }}
          onBlur={() => setName(c.name)} />
        <div className="fields">
          <label><span className="eyebrow">Titles</span><input value={c.titles} onChange={e => set({ titles: e.target.value })} /></label>
          <label><span className="eyebrow">Role</span><input value={c.role} onChange={e => set({ role: e.target.value })} /></label>
          <label><span className="eyebrow">Faction</span><input value={c.faction} onChange={e => set({ faction: e.target.value })} /></label>
          <label><span className="eyebrow">Species</span><input value={c.species} list="species" onChange={e => set({ species: e.target.value })} /></label>
          <label><span className="eyebrow">Age</span><input value={c.age} onChange={e => set({ age: e.target.value })} /></label>
          <label><span className="eyebrow">Pronouns</span><input value={c.gender} onChange={e => set({ gender: e.target.value })} /></label>
          <label><span className="eyebrow">Status</span>
            <select value={c.status} onChange={e => set({ status: e.target.value as Character["status"] })}>
              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <datalist id="species">{SPECIES_PRESETS.map(s => <option key={s} value={s} />)}</datalist>
        <label className="notes"><span className="eyebrow">Notes</span><textarea rows={3} value={c.notes} onChange={e => set({ notes: e.target.value })} /></label>
        <div className="panel-foot">
          <button className="btn-link" onClick={() => { const n = duplicateCharacter(c.id); if (n) onSelect(n); }}>Duplicate</button>
          <button className="btn-link btn-danger" onClick={() => {
            deleteCharacter(c.id); onSelect(null);
            window.dispatchEvent(new CustomEvent("lineage-toast", { detail: { msg: c.name + " removed", undo: true } }));
          }}>Delete character</button>
        </div>
      </section>

      <section>
        <Head title="Family" />
        <h3 className="eyebrow">Parents</h3>
        <ul className="rows">{parentU?.partners.map(p => <Person key={p} id={p} onSelect={onSelect} onRemove={() => leaveUnion(parentU.id, p)} />)}</ul>
        {(parentU?.partners.length ?? 0) < 2 && <Picker label="Add parent" exclude={family} onPick={p => addParent(c.id, p)} />}

        <h3 className="eyebrow">Siblings</h3>
        <ul className="rows">{siblings.map(s => <Person key={s} id={s} onSelect={onSelect} onRemove={() => leaveUnion(parentU!.id, s)} />)}</ul>
        <Picker label="Add sibling" exclude={family} onPick={s => addSibling(c.id, s)} />

        <h3 className="eyebrow">Partners and children</h3>
        {ownUnions.map(u => {
          const partner = u.partners.find(p => p !== c.id);
          return (
            <div key={u.id} className="union-block">
              {partner ? <ul className="rows"><Person id={partner} onSelect={onSelect} onRemove={() => leaveUnion(u.id, partner)} /></ul>
                : <p className="hint">No partner</p>}
              <ul className="rows children">{u.children.map(ch => <Person key={ch} id={ch} onSelect={onSelect} onRemove={() => leaveUnion(u.id, ch)} />)}</ul>
              <Picker label="Add child" exclude={family} onPick={ch => addChild(c.id, partner ?? null, ch)} />
            </div>
          );
        })}
        <div className="pick-row">
          <Picker label="Add partner" exclude={family} onPick={p => addSpouse(c.id, p)} />
          {!ownUnions.some(u => u.partners.length === 1) && <button className="btn-small" onClick={() => addChild(c.id, null)}>Add child, no partner</button>}
        </div>
      </section>

      <section>
        <Head title="Relationships" />
        <ul className="rows">
          {links.map(l => {
            const other = l.from === c.id ? l.to : l.from;
            return (
              <li key={l.id} className="rel-row">
                <select value={l.type} aria-label="Relationship type" onChange={e => updateLink(l.id, e.target.value as Link["type"])}>
                  {SOCIAL_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <button className="name-link" onClick={() => onSelect(other)}>{d.chars.find(x => x.id === other)?.name}</button>
                <button className="x" aria-label="Remove relationship" title="Remove" onClick={() => deleteLink(l.id)}>✕</button>
              </li>
            );
          })}
        </ul>
        <SocialAdder id={c.id} exclude={[c.id, ...links.map(l => (l.from === c.id ? l.to : l.from))]} />
      </section>

      <section>
        <Head title="Traits" />
        <ul className="rows">
          {c.disorders.map((t, i) => (
            <li key={t.name + i} className="trait-row">
              <span className="trait-name">{t.name}{t.source === "inherited" && <em> inherited</em>}</span>
              {t.source === "inherited" ? <span className="eyebrow">{t.status}</span> : <>
                <select value={t.status} aria-label="Trait status"
                  onChange={e => setDisorders(ds => ds.map((x, j) => (j === i ? { ...x, status: e.target.value as Disorder["status"] } : x)))}>
                  {DISORDER_STATUS.map(s => <option key={s}>{s}</option>)}
                </select>
                <label className="check" title="Passes to children"><input type="checkbox" checked={t.hereditary}
                  onChange={e => setDisorders(ds => ds.map((x, j) => (j === i ? { ...x, hereditary: e.target.checked } : x)))} />Hereditary</label>
                <button className="x" aria-label={"Remove " + t.name} title="Remove" onClick={() => setDisorders(ds => ds.filter((_, j) => j !== i))}>✕</button>
              </>}
            </li>
          ))}
        </ul>
        {!c.disorders.length && <p className="hint">Hereditary traits pass to children as Carrier or Unaffected.</p>}
        <form className="pick-row" onSubmit={e => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem("trait") as HTMLInputElement;
          const n = input.value.trim();
          if (!n || c.disorders.some(x => x.name === n)) return;
          setDisorders(ds => [...ds, { name: n, hereditary: true, status: "Affected", source: "manual" }]);
          input.value = "";
        }}>
          <input name="trait" placeholder="Trait or condition" maxLength={100} aria-label="New trait" />
          <button className="btn-small">Add</button>
        </form>
      </section>
    </>
  );
}

function SocialAdder({ id, exclude }: { id: string; exclude: string[] }) {
  const [type, setType] = useState<Link["type"]>("Ally");
  const chars = useStore(s => s.active.chars);
  return (
    <div className="pick-row">
      <select value={type} aria-label="New relationship type" onChange={e => setType(e.target.value as Link["type"])}>
        {SOCIAL_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>
      <select className="picker" value="" aria-label="Relationship with" onChange={e => e.target.value && addLink(id, e.target.value, type)}>
        <option value="">of…</option>
        {chars.filter(c => !exclude.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}
