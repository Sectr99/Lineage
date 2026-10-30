# Lineage — Fantasy Family Tree App

A self-contained, single-file web application for building and visualizing family trees for tabletop RPG campaigns, worldbuilding, and fiction writing.

No installation required. Open `index.html` in any modern browser and start building.

---

## Features

- **Interactive Family Tree** — Drag-and-drop character nodes on a zoomable canvas with color-coded relationship connectors
- **Character Profiles** — Track name, gender, titles, species, age, role, faction, and status (Alive, Deceased, Undead, etc.)
- **12 Relationship Types** — Parent, Child, Spouse, Sibling, Adopted, Guardian, Rival, Ally, Enemy, Mentor, Apprentice, Other
- **Genetic Trait Tracking** — Model hereditary disorders and conditions with automatic inheritance propagation across family lines
- **Dynasty Management** — Create and switch between multiple independent family trees in the same browser
- **5 Visual Themes** — Necromancer, Castlevania, Vampire, Dungeon, and The Escape (noir)

---

## Usage

```bash
npm install
npm run dev
```

Then open http://localhost:5173. To produce a static build you can host anywhere, run `npm run build`; the result is in `dist/`.

All data is saved in your browser (IndexedDB). No server or account is needed. To move a tree from the original app, export it there and use **Import** here; v1 `.lineage.json` files are converted automatically.

---

## Tech Stack

- React + TypeScript, built with Vite
- React Flow for the canvas, ELK for automatic layout
- Zustand + zundo for state and undo/redo
- Zod validation for imported files and stored data
- IndexedDB for local persistence

The original single-file version is kept in `legacy/index.html`.

---

## Species Presets

Human, Elf, Dwarf, Halfling, Orc, Tiefling, Dragonborn, Gnome, Half-Elf, Undead

---

## License

This project is free to use for personal and non-commercial purposes.
