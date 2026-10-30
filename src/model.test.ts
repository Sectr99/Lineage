import { describe, expect, it } from "vitest";
import { importDynasty, normalize, parentsOf, propagateDisorders, wouldCycle, newCharacter, type Union } from "./model";
import { computeLayout, NODE_H, NODE_W, PARTNER_GAP } from "./layout";

const LEGACY = {
  treeName: "The Varne Dynasty",
  chars: [
    { id: "c1", name: "Aldric", color: "#e05c7a", x: 1, y: 2, disorders: [{ name: "Grey Rot", hereditary: true, status: "Affected" }] },
    { id: "c2", name: "Seraphine" },
    { id: "c3", name: "Dorian" },
    { id: "c4", name: "Lyra" },
    { id: "c5", name: "Cael" },
    { id: "c6", name: "Mira" },
    { id: "c7", name: "Kit" },
  ],
  rels: [
    { id: "r1", from: "c1", to: "c2", type: "Spouse" },
    { id: "r2", from: "c1", to: "c3", type: "Parent" },
    { id: "r3", from: "c2", to: "c3", type: "Parent" },
    { id: "r4", from: "c4", to: "c1", type: "Child" },   // Lyra is Aldric's child (stored the "Child" way)
    { id: "r5", from: "c3", to: "c5", type: "Rival" },
    { id: "r6", from: "c3", to: "c6", type: "Spouse" },
    { id: "r7", from: "c3", to: "c7", type: "Sibling" },
    { id: "r8", from: "c3", to: "ghost", type: "Ally" },  // dangling ref is dropped
  ],
};

describe("legacy import", () => {
  const d = importDynasty(JSON.stringify(LEGACY));
  const byName = (n: string) => d.chars.find(c => c.name === n)!.id;

  it("builds unions from parent, child, spouse and sibling links", () => {
    expect(parentsOf(d.unions, byName("Dorian")).sort()).toEqual([byName("Aldric"), byName("Seraphine")].sort());
    expect(parentsOf(d.unions, byName("Lyra"))).toEqual([byName("Aldric")]);
    expect(parentsOf(d.unions, byName("Kit")).sort()).toEqual(parentsOf(d.unions, byName("Dorian")).sort());
    expect(d.unions.some(u => u.partners.includes(byName("Mira")) && u.partners.includes(byName("Dorian")))).toBe(true);
  });

  it("keeps social links, drops dangling ones, maps colours to palette indices", () => {
    expect(d.links.map(l => l.type)).toEqual(["Rival"]);
    expect(d.chars.find(c => c.name === "Aldric")!.colorIndex).toBe(1);
  });

  it("propagates hereditary disorders", () => {
    expect(d.chars.find(c => c.name === "Dorian")!.disorders).toEqual([{ name: "Grey Rot", hereditary: true, status: "Carrier", source: "inherited" }]);
  });

  it("rejects garbage", () => {
    expect(() => importDynasty("nope")).toThrow("isn't JSON");
    expect(() => importDynasty("{}")).toThrow("Lineage export");
    expect(() => importDynasty(JSON.stringify({ version: 2, chars: "x" }))).toThrow("damaged");
  });

  it("round-trips the v2 format with a fresh id", () => {
    const again = importDynasty(JSON.stringify(d));
    expect(again.id).not.toBe(d.id);
    expect(again.chars).toEqual(d.chars);
  });
});

describe("integrity", () => {
  const [a, b, c] = [newCharacter({ id: "a" }), newCharacter({ id: "b" }), newCharacter({ id: "c" })];
  const unions: Union[] = [{ id: "u1", partners: ["a"], children: ["b"] }, { id: "u2", partners: ["b"], children: ["c"] }];

  it("detects cycles", () => {
    expect(wouldCycle(unions, "c", "a")).toBe(true);
    expect(wouldCycle(unions, "a", "c")).toBe(false);
  });

  it("normalize drops cycles and double parentage", () => {
    const n = normalize({ version: 2, id: "d", name: "x", chars: [a, b, c], links: [], offsets: {},
      unions: [...unions, { id: "u3", partners: ["c"], children: ["a", "b"] }] });
    expect(n.unions.find(u => u.id === "u3")).toBeUndefined();
  });

  it("never overwrites manual disorder entries", () => {
    const parent = { ...a, disorders: [{ name: "X", hereditary: true, status: "Affected" as const, source: "manual" as const }] };
    const child = { ...b, disorders: [{ name: "X", hereditary: true, status: "Affected" as const, source: "manual" as const }] };
    expect(propagateDisorders([parent, child], unions)[1].disorders[0].status).toBe("Affected");
  });
});

describe("layout", () => {
  it("puts children below parents and spouses on the same row", async () => {
    const d = importDynasty(JSON.stringify(LEGACY));
    const pos = await computeLayout(d);
    const y = (n: string) => pos.get(d.chars.find(c => c.name === n)!.id)!.y;
    expect(y("Aldric")).toBe(y("Seraphine"));
    expect(y("Dorian")).toBeGreaterThan(y("Aldric") + NODE_H);
    expect(y("Dorian")).toBe(y("Mira"));
    expect(y("Dorian")).toBe(y("Kit"));
  });

  it("puts characters with only social links on the row of whoever they're linked to", async () => {
    const d = importDynasty(JSON.stringify(LEGACY));
    const pos = await computeLayout(d);
    const p = (n: string) => pos.get(d.chars.find(c => c.name === n)!.id)!;
    expect(p("Cael").y).toBe(p("Dorian").y);
    expect(Math.abs(p("Cael").x - p("Dorian").x)).toBe(NODE_W + PARTNER_GAP); // right beside him
  });
});
