---
kind: quick
---

# La UI dentro del paquete npm

## Objetivo

`specty ui` sirve la build de la UI desde `dist/ui`, junto al bundle, y si no está, desde la del monorepo (`packages/ui/dist/browser`); pero nada pone la UI en `dist/ui`, así que quien instale `@baquia-dev/specty` desde npm abre una página que le pide construirla. Ahora `node build.mjs --ui <carpeta>` copia esa build a `dist/ui` (y falla si no tiene `index.html`), y el `prepack` del paquete construye la UI y la copia, así que `npm pack` y la publicación la llevan dentro (unos 4,4 MB). Una build normal (`node build.mjs`, la de los tests y la de desarrollo) borra `dist/ui`, para que una copia vieja no tape la build del monorepo. `--outdir <carpeta>` deja el bundle en otra carpeta, para probarlo sin tocar `dist`.

## Archivos

- modificar packages/cli/build.mjs — `--ui <carpeta>` y `--outdir <carpeta>`
- modificar packages/cli/package.json — `prepack` construye la UI y la copia junto al bundle
- crear packages/cli/test/bundle.test.ts — el bundle con la UI la sirve; sin `--ui` no queda copia
- modificar docs/ARCHITECTURE.md — de dónde sirve la UI `specty ui` (§15)

## Tareas

- [x] T1: El bundle lleva la UI al empaquetar
  - files: packages/cli/build.mjs, packages/cli/package.json, packages/cli/test/bundle.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm check
  - type: build

## Cierre

### Resumen

build.mjs acepta --ui <carpeta> (copia la build de la UI a dist/ui y falla sin index.html) y --outdir; una build normal borra dist/ui. El prepack del paquete construye la UI y la copia: npm pack lleva 88 archivos (1,2 MB), con dist/ui/index.html. Test de punta a punta con el bundle sirviendo la UI. ARCHITECTURE §15.
