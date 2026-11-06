---
kind: standard
epic: 20261106-epica-en-la-bandeja-con-lineas-por-corte
slice: C3
---

# Cada línea dice quién lleva su corte y sus avisos

## Objetivo

En la tarjeta de una épica de la Bandeja, la línea de cada corte con un cambio abierto dice a la derecha qué agente lo lleva («Claude Code», «Codex»…), o «Sin conversación» si nadie lo lleva, y bajo su título los avisos de su fila: huérfano, conversación fuera de su carpeta y archivos que comparte con otro cambio, nombrando al otro por su corte si es de la misma épica. Así, con varios cortes corriendo en paralelo, cada uno con su agente, se ve quién lleva cada uno y dónde chocan. Para eso el servidor local da en el registro de cada cambio abierto quién lo lleva, como ya hace `status --json`.

## Fuera de alcance

- La cabecera de la épica (corte C4): su avance con el anillo, el recuento de cortes, «Ningún corte en marcha» y el aviso de huérfano de la propia épica.
- La fila de un cambio, su página (cómo retomarlo), `status` y `next` no cambian; la fila sigue nombrando con su id la herramienta de una conversación que salió de su carpeta.
- La línea no lleva los demás avisos de una fila («Nadie retoma tu decisión», «Sin carpeta», la configuración ilegible, los supuestos por confirmar, las solicitudes de alcance): están en la fila de la página del corte.
- Lo que la línea de un corte terminado dice a la derecha (cuánto tardó) no cambia: nada.

## Supuestos

- A1: Quién lleva un cambio es el `holder` de `status` (`openChanges`): la herramienta de la última conversación que dio un paso en la carpeta de su cambio, y hace cuántos minutos. El servidor lo da en el registro de cada cambio abierto en el que alguna conversación dio un paso, espere a la persona o al agente, y la vista del cambio lo copia.
  - impacto: alto
- A2: El nombre del agente sale de `AGENT_NAMES` de core, que pasa a exportar su entrada ligera; una herramienta que no está en esa lista sale con su id. Se muestra aunque ese paso sea antiguo, salvo si el cambio es huérfano: entonces la línea dice «Sin conversación», en el color de los avisos de una fila.
  - impacto: medio
- A3: A la derecha va una sola cosa, como en la maqueta elegida: el botón de la decisión si el cambio espera una (AC4); si no, el agente o «Sin conversación». Una línea sin cambio, terminada, o cuyo cambio solo llegó por la respuesta de la fuente y no está cargado (uno abierto siempre lo está), no dice agente ni lleva avisos.
  - impacto: medio
- A4: Bajo el título van los avisos de la fila, con su texto, su orden y su color (`--color-phase-review`): «Su conversación (Codex) salió de su carpeta» si su conversación dio su último paso en otra carpeta y, si no, «Ninguna conversación lo lleva» si es huérfano; después, «Comparte `ruta` con C5», con cada ruta que comparte. En la línea, la herramienta va con su nombre, como a la derecha.
  - impacto: bajo
- A5: «Comparte» nombra cada cambio con el que comparte archivos una sola vez: por el id de su corte si es un corte cargado de la misma épica, y si no, por su título entre comillas («…»), como la fila; varios, separados por comas.
  - impacto: bajo

## Criterios de aceptación

- AC5: CUANDO el cambio de un corte está abierto ENTONCES su línea dice a la derecha el agente que lo lleva («Claude Code», «Codex»…). Si es huérfano, dice «Sin conversación» y, bajo su título, «Ninguna conversación lo lleva». Si su conversación salió de su carpeta, lleva el aviso de una fila. Si comparte archivos con otro cambio abierto, «Comparte `ruta` con C5», con el id del corte si el otro es de la misma épica o su título si no.
- AC8: CUANDO el servidor local da un cambio abierto en el que alguna conversación dio un paso ENTONCES su registro trae `holder` con la herramienta y hace cuántos minutos, como `status --json`.

## Diseño

- Servidor: `holdsById` (`cli/src/server/records.ts`) da también el `holder` de cada entrada de `openChanges`, junto a `orphan`, `away` y `unattended`, y `ChangeRecord` lo declara.
- Vista: `ChangeRecord` y `ChangeView` (`ui/src/data/records.ts`) llevan `holder` (`tool` y `ago`), y `holdsOf` (`ui/src/data/views.ts`) lo copia.
- Core: `core/src/light.ts` exporta `AGENT_NAMES` (`agents.ts` solo importa tipos, así la entrada sigue ligera).
- `ui/src/inbox/lane-holds.ts` (puro): `laneHolds(id, loaded)` da, del cambio abierto `id` entre los cargados de la épica, el agente que lo lleva por su nombre (ninguno si es huérfano), si es huérfano, el agente de la conversación que salió de su carpeta y los archivos que comparte con quién (A5); nada para un cambio no cargado, terminado o cancelado.
- `ui/src/inbox/epic-lanes.ts`: `EpicLane` lleva `holds`, y `epicLanes` lo pone en cada línea con `laneHolds`.
- `sp-inbox-lane` (`ui/src/inbox/inbox-lane.ts`): la columna del título pasa a ser una columna con el título y, debajo, sus avisos; a la derecha, el botón de la decisión o, sin él, el agente (`text-text-muted`) o «Sin conversación» (`--color-phase-review`). Los colores salen de los tokens, como la fila.
- Docs: `docs/ARCHITECTURE.md` §15 (`holder` en los registros de `GET /api/changes`) y `docs/ui.md` (lo que la línea dice a la derecha y bajo su título).

## Archivos

- modificar packages/cli/src/server/records.ts — el registro de un cambio abierto lleva `holder`
- modificar packages/cli/test/server-holds.test.ts — AC8: el servidor da quién lleva cada cambio abierto
- modificar packages/core/src/light.ts — la entrada ligera exporta `AGENT_NAMES`
- modificar packages/core/test/light.test.ts — AC5: la entrada ligera da los nombres de los agentes del índice
- modificar packages/ui/src/data/records.ts — `holder` en `ChangeRecord` y `ChangeView`
- modificar packages/ui/src/data/views.ts — la vista copia `holder`
- modificar packages/ui/src/data/views.test.ts — AC8: la vista lleva quién lo lleva
- crear packages/ui/src/inbox/lane-holds.ts — quién lleva el cambio de una línea y sus avisos, puro
- crear packages/ui/src/inbox/lane-holds.test.ts — AC5 sobre quién lleva cada línea y sus avisos
- modificar packages/ui/src/inbox/epic-lanes.ts — cada línea lleva `holds`
- modificar packages/ui/src/inbox/inbox-lane.ts — la línea dice el agente o «Sin conversación» y sus avisos
- modificar packages/ui/src/inbox/inbox-lane.test.ts — AC5 sobre la línea dibujada
- modificar docs/ARCHITECTURE.md — §15: `holder` en los registros de los cambios abiertos
- modificar docs/ui.md — lo que la línea de un corte dice de quién lo lleva y sus avisos

## Tareas

- [x] T1: El servidor da quién lleva cada cambio abierto
  - files: packages/cli/src/server/records.ts, packages/cli/test/server-holds.test.ts
  - ac: AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server-holds.test.ts
- [ ] T2: La vista lleva quién lo lleva, y la entrada ligera de core los nombres de los agentes
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/views.test.ts, packages/core/src/light.ts, packages/core/test/light.test.ts
  - ac: AC5, AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/light.test.ts && pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/views.test.ts
- [ ] T3: Cada línea sabe quién lleva su cambio y qué avisa
  - files: packages/ui/src/inbox/lane-holds.ts, packages/ui/src/inbox/lane-holds.test.ts, packages/ui/src/inbox/epic-lanes.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/lane-holds.test.ts --include src/inbox/epic-lanes.test.ts
- [ ] T4: La línea dice el agente o «Sin conversación» y sus avisos bajo el título
  - files: packages/ui/src/inbox/inbox-lane.ts, packages/ui/src/inbox/inbox-lane.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-lane.test.ts --include src/inbox/inbox-epic.test.ts && pnpm typecheck && pnpm lint && pnpm knip
- [ ] T5: ARCHITECTURE y ui.md cuentan quién lleva cada línea
  - files: docs/ARCHITECTURE.md, docs/ui.md
  - ac: —
  - verify: grep -q "holder" docs/ARCHITECTURE.md && grep -q "Sin conversación" docs/ui.md
  - type: docs

## Riesgos

- R1: El corte C4 cambia en paralelo `epic-lanes.ts`, `inbox-epic.ts` y quizá la fila. Mitigación: la lógica nueva va en su propio archivo (`lane-holds.ts`), `epic-lanes.ts` solo cambia en `EpicLane` y en la última línea de `epicLanes`, y ni la tarjeta ni la fila cambian; un conflicto al incorporar main se resuelve con `specty integrate`.
- R2: Con su aviso debajo, una línea crece y sus tramos dejan de alinearse con los de las demás. Mitigación: la pista y la columna de la derecha siguen centradas en su fila de la cuadrícula compartida (`grid-cols-subgrid`), y los avisos solo ocupan la columna del título.
