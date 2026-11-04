---
kind: standard
---

# La página «Sesiones» de la UI

## Objetivo

El servidor de `specty ui` ya da en `GET /api/sessions` cada conversación de agente del repositorio, con su carpeta y su cambio, sus pasos, si sigue viva y lo que gastó (la primera mitad del panel de sesiones de la épica «Memoria de Specty»). Con este cambio, la UI tiene la página «Sesiones», con su enlace en el menú, que muestra cada sesión: su agente, el cambio o la carpeta de su último paso, desde cuándo trabaja, su último paso, si sigue viva y su consumo cuando lo hay.

## Fuera de alcance

- Parar una sesión, mandarle mensajes o tomar decisiones desde la página: solo muestra.
- Cambiar lo que da `GET /api/sessions`.

## Supuestos

- A1: La página pide las sesiones al abrirse y con cada aviso de cambios del servidor, como «Memoria», y sigue la estructura de documento de esa página.
- A2: Los tokens se muestran abreviados y el coste en dólares con el formato del idioma de la UI (`Intl.NumberFormat`); el tiempo, con el mismo «hace …» de la página «Memoria».

## Criterios de aceptación

- AC1: CUANDO la persona abre «Sesiones» desde el menú ENTONCES ve cada sesión, de la más reciente a la más antigua, con su agente, el cambio de su carpeta como enlace (o la carpeta, o «carpeta principal»), desde cuándo trabaja y su último paso, si sigue viva y, cuando lo hay, su consumo en tokens y en dólares, en español y en inglés.
- AC2: CUANDO no hay ninguna sesión ENTONCES la página lo dice con un estado vacío.

## Diseño

- `data/source.ts`: `sessions()`, sin nada por defecto; `data/server.ts`: `GET /api/sessions`, validado con `isSessionList` de `data/server-answers.ts`; `data/fixtures.ts`: unas sesiones de ejemplo (una viva de Claude Code en un cambio, con consumo, y una de Codex sin pasos recientes en otra carpeta).
- `sessions/sessions-page.ts`, nueva: el encabezado con el resumen («2 sesiones · 1 viva»), la lista y el estado vacío. `ago` de `memory/memory-lines.ts` se exporta para el «hace …».
- `app/routes.ts`: la ruta `/sessions`; `app/shell.ts`: su enlace, después de «Memoria».

## Archivos

- modificar packages/ui/src/data/source.ts — `sessions()`
- modificar packages/ui/src/data/server.ts — `sessions()` del servidor
- modificar packages/ui/src/data/server-answers.ts — `isSessionList`
- modificar packages/ui/src/data/fixtures.ts — sesiones de ejemplo
- crear packages/ui/src/sessions/sessions-page.ts — la página «Sesiones»
- crear packages/ui/src/sessions/sessions-page.test.ts — la página con sesiones y sin ellas
- modificar packages/ui/src/app/routes.ts — la ruta `/sessions`
- modificar packages/ui/src/app/shell.ts — el enlace del menú
- modificar packages/ui/src/memory/memory-lines.ts — exporta `ago`
- modificar docs/ARCHITECTURE.md — la página «Sesiones»

## Tareas

- [x] T1: La UI pide las sesiones
  - files: packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server-answers.ts, packages/ui/src/data/fixtures.ts
  - ac: —
  - verify: pnpm typecheck && pnpm lint
  - type: chore
- [ ] T2: La página «Sesiones»
  - files: packages/ui/src/sessions/sessions-page.ts, packages/ui/src/sessions/sessions-page.test.ts, packages/ui/src/app/routes.ts, packages/ui/src/app/shell.ts, packages/ui/src/memory/memory-lines.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/sessions/sessions-page.test.ts --include src/app/shell.test.ts --include src/memory/memory-lines.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [ ] T3: La documentación
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
