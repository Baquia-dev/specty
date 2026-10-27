---
kind: standard
epic: 20261026-las-funciones-de-specty-dentro-de-sus-limites
slice: C8
---

# El servidor local: acciones, eventos, http y ejecuciones

## Objetivo

Siete funciones del servidor local de `specty ui` pasan de los límites de Specty: la lectura de una acción en `parseAction` (complejidad 26), `runAction` (15), `handle` (52 líneas, complejidad 23), `act` (13), `changeEvents` (54), `changeRuns` (93) y su ejecución de la verificación completa (60). Cada una se divide en los pasos o las piezas que ya tiene, en el mismo orden, sin cambiar lo que acepta, rechaza, ejecuta, registra o responde.

## Fuera de alcance

- Cambiar una ruta, una respuesta, un código de estado, una comprobación de origen, sesión o CSRF, un evento o lo que se registra de una verificación.
- La UI y los exportadores, que son del corte C9.

## Supuestos

- A1: Los tests del servidor recorren las rutas de lectura y de acción, sus rechazos (host, origen, sesión, CSRF, solo lectura), los eventos y las verificaciones que se lanzan desde la UI, así que un cambio en lo que hacen los haría fallar.
  - impacto: alto
- A2: Las comprobaciones de acceso de `handle` y `act` conservan su orden y sus respuestas byte a byte: solo cambian de función.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se mide `packages/cli/src/server/` con `specty check --all` ENTONCES ninguna función pasa de 50 líneas ni de complejidad 10.
- AC2: CUANDO se ejecutan los tests de la CLI ENTONCES pasan sin cambiar lo que comprueban.

## Archivos

- modificar packages/cli/src/server/actions.ts — una tabla con la lectura de cada verbo, y las acciones sobre la spec en revisión
- modificar packages/cli/src/server/http.ts — el enlace con el token, las lecturas de la API y de un cambio, y por qué se rechaza una acción
- modificar packages/cli/src/server/events.ts — la vigilancia de la huella, aparte de quienes escuchan
- modificar packages/cli/src/server/runs.ts — la ejecución de la verificación completa, su salida en vivo y su final

## Tareas

- [ ] T1: Las acciones de la persona
  - files: packages/cli/src/server/actions.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [ ] T2: Las peticiones
  - files: packages/cli/src/server/http.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [ ] T3: Los eventos
  - files: packages/cli/src/server/events.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [ ] T4: Las verificaciones lanzadas desde la UI
  - files: packages/cli/src/server/runs.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
