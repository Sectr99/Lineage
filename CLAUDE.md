# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Lineage is a local-only fantasy family-tree app for TTRPGs and worldbuilding, built with Vite, React and TypeScript. There is no backend: all data stays in the browser's IndexedDB. `legacy/index.html` is the original single-file v1 app. It's kept for reference until the new app matches it feature for feature.

## Commands

- `npm run dev`: dev server on http://localhost:5173
- `npm test`: Vitest. Run one test with `npx vitest run -t "legacy import"`
- `npm run typecheck`
- `npm run build`: type-checks, then builds to `dist/`. `npm run preview` serves the build.

## Architecture

- **`src/model.ts`** holds the data model and the trust boundary. Zod schemas are used for every import and every storage read. It also has `normalize` (integrity repair), `propagateDisorders` and `importDynasty`, which accepts both v2 files and v1 `.lineage.json` files.
- **Unions model the family structure.** A union is `{partners: 0–2 ids, children: ids}`. Parent, Child, Spouse and Sibling are not stored as links. A child belongs to at most one union, and `wouldCycle` blocks circular lineages. Every other relationship type is a `Link` (`SOCIAL_TYPES`).
- **`src/store.ts`** is a Zustand store with zundo undo/redo. **Every edit goes through `commit()`**, which runs `normalize` (and therefore disorder inheritance). Don't call `setState` on `active` directly. Structure helpers (`addParent`, `addChild`, `addSpouse`, `addSibling`) create a new relative in the same undo step when no id is passed. The store autosaves the active dynasty to IndexedDB (`dyn:<id>` keys, via idb-keyval) after a 300ms debounce. A failed save sets `saveError`, which the UI shows in a banner.
- **`src/layout.ts`** handles automatic layout with ELK (loaded lazily). `buildUnits` groups partners into rows, so couples and remarriage chains always sit side by side. Each row becomes one ELK node with fixed ports, and edges run from a union's port to each child's port. Social links are left out of the layout. A character with no family joins the row of the person they are socially linked to. Layout only reruns when `structureKey` changes, not on text edits.
- **`src/Canvas.tsx`** renders the tree with React Flow. A character's position is its auto-layout position plus `dynasty.offsets[id]`. Manual drags are stored as offsets relative to the layout, so they survive a re-layout, and "Arrange" clears them. Union join points are invisible and are placed from their partners' positions with `unionPoint`.
- **Styling** follows the DungeonTools style (the `dungeontools-style` skill; reference app is Dungeon Tracker). `src/tokens.css` and `src/components.css` are copied from the skill, so don't edit them. App-specific CSS goes in `src/styles.css`. Use only token colours: red (`--red`) is reserved for things that need attention. There's one look with Auto/Light/Dark appearance. Character `colorIndex` is kept in the data for compatibility but isn't shown.
- **Security**: a build-only CSP is injected by the plugin in `vite.config.ts`. Dev skips it because HMR needs inline scripts. If you add any external origin, add it to that CSP. Never render user text as HTML.
