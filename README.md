# Lineage — Fantasy Family Tree App

A self-contained, single-file web application for building and visualizing family trees for tabletop RPG campaigns, worldbuilding, and fiction writing.

No installation required. Open `index.html` in any modern browser and start building.

---

## Features

- **Interactive Canvas** — Drag-and-drop character nodes on a zoomable, pannable canvas with smooth connector lines
- **Character Profiles** — Track name, gender, titles, species, age, role, faction, and status (Alive, Deceased, Undead, etc.)
- **12 Relationship Types** — Parent, Child, Spouse, Sibling, Adopted, Guardian, Rival, Ally, Enemy, Mentor, Apprentice, Other
- **Relationship Filtering** — Filter the canvas by relationship type to focus on specific connections
- **Character Search** — Quickly find characters by name across your dynasty
- **Genetic Trait Tracking** — Model hereditary disorders and conditions with automatic inheritance propagation across family lines
- **Dynasty Management** — Create and switch between multiple independent family trees in the same browser
- **5 Visual Themes** — Necromancer, Castlevania, Vampire, Dungeon, and The Escape (noir)
- **Sidebar Inline Editing** — Edit character details directly in the sidebar without opening a modal
- **Toast Undo** — Undo accidental deletions via a temporary toast notification
- **Keyboard Shortcuts** — Delete selected node with the `Delete` key; navigate with focus controls
- **Zoom Controls** — Zoom in/out buttons plus fit-to-screen, in addition to scroll-wheel zoom
- **Demo Mode** — Load a pre-built sample tree to explore the app before building your own

---

## Usage

1. Download or clone this repository
2. Open `index.html` in a browser — no server needed
3. Create a dynasty, add characters, and define their relationships

All data is saved automatically to your browser's `localStorage` — no account or internet connection required after the initial page load.

---

## Tech Stack

- [React 18](https://react.dev/) via CDN (no build step)
- Vanilla CSS with CSS custom properties for theming
- Browser `localStorage` for persistence
- Zero dependencies to install

---

## Species Presets

Human, Elf, Dwarf, Halfling, Orc, Tiefling, Dragonborn, Gnome, Half-Elf, Undead

---

## License

MIT — see [LICENSE](LICENSE) for details.
