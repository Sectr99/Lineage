// The original demo tree, in the v1 format so it also exercises the legacy importer.
export const DEMO = {
  treeName: "The Varne Dynasty",
  chars: [
    { id: "c1", name: "Aldric the Grey", species: "Human", age: "72", gender: "Male", status: "Deceased", role: "King", titles: "High King", faction: "House Varne", color: "#c9a227", notes: "Founder of the realm. Ruled for 40 years with a steady hand." },
    { id: "c2", name: "Seraphine Varne", species: "Human", age: "68", gender: "Female", status: "Deceased", role: "Queen", titles: "Queen Consort", faction: "House Varne", color: "#e05c7a", notes: "Skilled diplomat who forged three alliances. Died of fever in winter." },
    { id: "c3", name: "Dorian Varne", species: "Human", age: "44", gender: "Male", status: "Alive", role: "Prince", titles: "Crown Prince", faction: "House Varne", color: "#5ca8d6", notes: "Exiled heir, whereabouts unknown." },
    { id: "c4", name: "Lyra Varne", species: "Half-Elf", age: "38", gender: "Female", status: "Alive", role: "Archmage", titles: "Archmage", faction: "Mages Circle", color: "#9b6dca", notes: "Rumored to be Aldric's illegitimate daughter." },
    { id: "c5", name: "Cael Thornwood", species: "Human", age: "40", gender: "Male", status: "Alive", role: "General", titles: "General", faction: "The Crown", color: "#cc4444", notes: "Dorian's childhood friend, now his bitter rival." },
    { id: "c6", name: "Mira", species: "Elf", age: "120", gender: "Female", status: "Unknown", role: "Rogue", titles: "", faction: "None", color: "#a3c27b", notes: "Dorian's estranged wife. Last seen in the eastern wilds." },
  ],
  rels: [
    { from: "c1", to: "c2", type: "Spouse" }, { from: "c1", to: "c3", type: "Parent" },
    { from: "c2", to: "c3", type: "Parent" }, { from: "c1", to: "c4", type: "Parent" },
    { from: "c3", to: "c5", type: "Rival" }, { from: "c3", to: "c6", type: "Spouse" },
  ],
};
