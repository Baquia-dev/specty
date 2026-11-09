---
kind: standard
---

# `specty wait` deja su latido y `specty new` deja de proponer Gemini CLI

## Objetivo

La persona decidió el 2026-11-10 retirar Gemini CLI, porque Antigravity lo reemplaza: se quitan su código, sus tests, sus instaladores, sus textos y su documentación, no basta con deshabilitarlo. El retiro no cabe en un cambio (toca cuatro módulos y sale XL), así que va en cinco cambios consecutivos, cada uno con main en verde; este es el primero. `specty wait` deja de escribir su línea de latido por la salida de errores, que solo existía porque Gemini CLI corta un comando que pasa 300 s sin escribir nada (P215), y con ella se va el ajuste `internal.waits.heartbeatSec`; y la salida de `specty new` deja de proponer `gemini` para abrir la carpeta del cambio.

## Fuera de alcance

- El resto del retiro de Gemini CLI, en los cambios que siguen a este: los instaladores de MCP y de exclusiones y los tests del CLI que lo usan (2.º); la UI, la suite de cumplimiento y los tests de core que lo ponen de ejemplo (3.º); su módulo de agente, su fila de capacidades, su detección y su documentación (4.º); sus textos de `doctor`, `init` y `uninstall` y la protección de `.gemini/settings.json` en el guard (5.º).
- Cómo espera cada herramienta (`waitStep`): las frases que reciben los agentes no cambian.
- Lo de Antigravity que comparte nombre con Gemini (`~/.gemini/antigravity-cli/`, `ANTIGRAVITY_GEMINI_DIR`, los modelos `gemini-…`), que se queda.

## Supuestos

- A1: Ninguna otra herramienta necesita el latido: en `WAIT_HABITS` (`cards/wait.ts`) solo Gemini CLI tiene `beats`; Claude Code, Cursor, OpenCode, Antigravity, Codex y Devin dejan `specty wait` en segundo plano o consultan su salida, y Copilot no tiene guard. Por eso se quita entero y no se deja para otro agente.
  - impacto: alto
- A2: Sin `heartbeatSec` en el esquema, un `config.yaml` que la traiga es un error, como cualquier clave que no existe bajo `internal` (formats.md §6). Specty aún no está publicado y la configuración de este repositorio no la tiene, así que no hay configuraciones que migrar.
  - impacto: medio
- A3: Hasta el 4.º cambio, Gemini CLI sigue en la tabla de `specty wait` como una herramienta que lo ejecuta en primer plano, ya sin latido; P215 (comprobar el latido en un Gemini CLI real) deja de tener objeto y queda resuelto con este cambio.

## Criterios de aceptación

- AC1: CUANDO `specty wait` espera la decisión de la persona en cualquier herramienta, Gemini CLI incluido ENTONCES no escribe ninguna línea de latido por la salida de errores.
- AC2: CUANDO `config.yaml` no trae `internal.waits.heartbeatSec` ENTONCES la configuración resuelta no tiene esa clave y la página «Configuración» de `specty ui` no la muestra en «Interno»; CUANDO la trae ENTONCES es un error de `config.yaml` con su clave, como cualquier clave que no existe bajo `internal`.
- AC3: CUANDO `specty new` crea un cambio en su carpeta y el agente es Gemini CLI ENTONCES su salida dice que entre con `specty enter <id>` y no propone `gemini` para abrir la carpeta; Codex, OpenCode, Cursor y Antigravity conservan su orden para abrirla.
- AC4: CUANDO se leen formats.md §6 y ARCHITECTURE ENTONCES no hablan del latido de `specty wait` ni de `internal.waits.heartbeatSec`.
  - test: manual

## Diseño

- core `cards/wait.ts`: sin `beats` en `WaitHabit` ni `waitHeartbeat`; Gemini CLI queda con `FOREGROUND` hasta el 4.º cambio. `cards/index.ts` deja de exportar `waitHeartbeat`.
- cli `commands/wait.ts`: sin `heartbeat`, sin la opción `beatMs` y sin leer `heartbeatSec`.
- core `schema/internal-waits.ts`: sin `heartbeatSec` en el tipo, los valores por defecto, la forma de zod ni la resolución. `settings/catalog.ts` y `cards/settings-internal.ts`: sin su ajuste ni sus textos.
- core `cards/new.ts`: `OPEN_IN` sin Gemini CLI, así que `specty new` le dice lo mismo que a Devin, que no tiene orden para abrirlo.
- Tests: los del latido se van; queda uno que comprueba que `wait` no escribe nada por la salida de errores mientras espera.

## Archivos

- modificar packages/core/src/cards/wait.ts — sin `beats` ni `waitHeartbeat`
- modificar packages/core/src/cards/index.ts — deja de exportar `waitHeartbeat`
- modificar packages/cli/src/commands/wait.ts — sin el latido ni `beatMs`
- modificar packages/core/test/cards/wait.test.ts — sin los casos del latido; el ejemplo de primer plano pasa a Copilot
- modificar packages/cli/test/wait.test.ts — sin los tests del latido; `wait` no escribe por la salida de errores
- modificar packages/core/src/schema/internal-waits.ts — sin `heartbeatSec`
- modificar packages/core/test/schema/schema.test.ts — los valores y límites de `internal.waits` sin `heartbeatSec`, y esa clave como error
- modificar packages/core/src/settings/catalog.ts — sin el ajuste `internal.waits.heartbeatSec`
- modificar packages/core/src/cards/settings-internal.ts — sin sus textos
- modificar packages/core/test/settings/catalog.test.ts — «Interno» sin el latido
- modificar packages/core/test/settings/internal-life.test.ts — el nombre del test ya no habla del latido
- modificar packages/ui/src/settings/settings-page.test.ts — «Interno» sin el latido
- modificar packages/core/src/cards/new.ts — `OPEN_IN` sin Gemini CLI
- modificar packages/core/test/cards/new.test.ts — Gemini CLI sin orden para abrir la carpeta
- modificar docs/formats.md — §6 sin `internal.waits.heartbeatSec`
- modificar docs/ARCHITECTURE.md — `specty wait` sin el latido

## Tareas

- [x] T1: `specty wait` deja de escribir el latido
  - files: packages/core/src/cards/wait.ts, packages/core/src/cards/index.ts, packages/cli/src/commands/wait.ts, packages/core/test/cards/wait.test.ts, packages/cli/test/wait.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/wait.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/wait.test.ts
  - type: chore
- [x] T2: `config.yaml` deja de tener `internal.waits.heartbeatSec`
  - files: packages/core/src/schema/internal-waits.ts, packages/core/test/schema/schema.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema/schema.test.ts
  - type: chore
- [x] T3: La página «Configuración» deja de mostrar el latido
  - files: packages/core/src/settings/catalog.ts, packages/core/src/cards/settings-internal.ts, packages/core/test/settings/catalog.test.ts, packages/core/test/settings/internal-life.test.ts, packages/ui/src/settings/settings-page.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings && pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-page.test.ts
  - type: chore
- [x] T4: `specty new` deja de proponer Gemini CLI, y la documentación sin el latido
  - files: packages/core/src/cards/new.ts, packages/core/test/cards/new.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/new.test.ts && pnpm lint && pnpm typecheck && pnpm knip
  - type: chore

## Riesgos

- R1: El cambio paralelo «La primera versión solo ofrece Claude Code y Antigravity» toca ARCHITECTURE y puede chocar al incorporar main. Mitigación: se resuelve conservando las dos intenciones.

## Cierre

### Resumen

`specty wait` ya no escribe la línea de latido por la salida de errores: `WaitHabit` pierde `beats`, `waitHeartbeat` desaparece de `cards/wait.ts` y de la API de core, y `commands/wait.ts` pierde `heartbeat` y la opción `beatMs`. Gemini CLI queda en la tabla de `specty wait` como una herramienta en primer plano hasta que se retire del todo. El ajuste `internal.waits.heartbeatSec` sale del esquema (una clave así es ahora un error de `config.yaml`), del catálogo de ajustes y de sus textos, así que la página «Configuración» ya no lo muestra. `specty new` deja de proponer `cd … && gemini` para abrir la carpeta del cambio. formats.md §6 y ARCHITECTURE ya no describen el latido. P215 queda sin objeto.

### Desviaciones

- Las cuatro tareas pasaron de `refactor` a `chore` con un ajuste (revisión 2): retiran una función con sus tests, y con `policy.tests: contract` un refactor no puede quitar aserciones. Las quitadas son las del latido (T1, T2), y quedan anotadas.
- La `verify` de T3 se corrigió con otro ajuste (revisión 3): los tests de la UI corren con `ng test`, no con `vitest run`.
- El test de AC3 no nombra a Gemini CLI: recorre todos los agentes y comprueba que ninguno recibe la orden `gemini`, para que el retiro de su tipo no lo obligue a cambiar.

### Decisiones

- El latido se quita entero y no se deja para otro agente: solo Gemini CLI lo tenía (A1).
- La prueba de la UI usa `internal.waits.queueStaleSec` como ejemplo de ajuste nuevo sin modificar, en lugar del latido.

### Pendientes

- El resto del retiro de Gemini CLI, en cambios consecutivos que siguen a este: los instaladores de MCP y de exclusiones y los tests del CLI que lo usan; la UI, la suite de cumplimiento y los tests de core que lo ponen de ejemplo; su módulo de agente, su fila de capacidades, su detección y su documentación; sus textos de `doctor`, `init` y `uninstall` y la protección de `.gemini/settings.json` en el guard.
