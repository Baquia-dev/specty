---
kind: standard
follows:
  - 20261104-frentes-en-el-estado-y-el-inicio
---

# Los frenos de los frentes

## Objetivo

Último cambio de P33 (repartir el trabajo entre sesiones): que una sesión no tome el trabajo del frente de otra. El guard rechaza que la conversación de un agente cree con `specty new --resolves` el cambio de una entrada de un frente que lleva otra conversación viva, y `specty propose` avisa cuando los archivos de la spec caen en las rutas de un frente que lleva otra sesión. Lo primero es un freno; lo segundo, solo un aviso, como se acordó.

## Fuera de alcance

- Que una conversación nueva tras un `/clear` herede o libere el frente de la anterior (P58), y saber la conversación de los demás agentes cuando ejecutan un comando por su cuenta (P57): son cambios aparte.
- Frenar el código que toca las rutas de otro frente durante la implementación: el aviso de `propose` es el único, como se acordó.
- Que `specty new --resolves` tome el frente de la entrada para la conversación.
- Dividir `packages/core/src/cards/index.ts` (P2) o `packages/cli/src/enforce/guard.ts` (P56).

## Supuestos

- A1: El freno de `new --resolves` vive en el guard, como el de `front take`, porque solo el guard sabe qué conversación ejecuta el comando. Sin el guard (la terminal de la persona, o un agente sin los hooks de Specty), `new --resolves` no se frena, y la persona puede tomar cualquier entrada.
  - impacto: alto
- A2: Una entrada es de un frente si está en sus `items`. Se frena solo si ese frente tiene un dueño vivo (`memory.orphanAfterMin`) que no es la conversación que ejecuta el comando. Una entrada sin frente, o de un frente sin dueño vivo o del propio, pasa. También frena en modo delegado: tomar el trabajo de otra sesión no es una decisión que se delegue.
- A3: Los ids de `--resolves` son las palabras que siguen a la opción hasta la siguiente opción, como las lee commander, o el valor de `--resolves=<id>`, y se comparan sin distinguir mayúsculas.
- A4: El aviso de `propose` compara los archivos gobernados de la sección Archivos con las `paths` de cada frente que tiene un dueño vivo distinto de la conversación que ejecuta `propose`. Esa conversación solo se conoce cuando la herramienta la dice en el entorno, hoy Claude Code; si no se conoce, cuentan todos los frentes con dueño, y el aviso lo dice. No sale en el cierre, como los archivos compartidos.
- A5: Lo que una llamada a Specty pide al guard (`enter`, `front take|free` y ahora `new --resolves`) pasa de `guard/shell.ts` a un archivo propio, `guard/specty-calls.ts`, para que `shell.ts` (276 líneas de código) no pase de 300.

## Criterios de aceptación

- AC1: CUANDO la conversación de un agente con el guard ejecuta `specty new … --resolves <id>` y la entrada está en un frente cuyo dueño vivo es otra conversación ENTONCES el guard lo rechaza con la regla `memory`, y dice de qué frente es, quién lo lleva y desde cuándo, y que tome una entrada de su frente o sin frente, o que la persona libere ese frente.
- AC2: CUANDO la entrada no está en ningún frente, está en un frente sin dueño vivo, o en el que lleva la misma conversación ENTONCES el guard deja pasar `specty new --resolves`.
- AC3: CUANDO se ejecuta `specty propose` de un borrador cuyos archivos gobernados caen en las rutas de un frente que lleva otra sesión ENTONCES la salida añade la sección «FRENTES DE OTRAS SESIONES», con cada frente, quién lo lleva y desde cuándo, y los archivos que caen en él, y dice que no frena nada pero que se lo comente al usuario.
- AC4: CUANDO los archivos no caen en las rutas de ningún frente con dueño, o el frente es el de la conversación que ejecuta `propose` ENTONCES la sección no sale.
- AC5: CUANDO un comando de shell ejecuta `specty new` con `--resolves` ENTONCES el análisis del comando da los ids que nombra, en orden, también con `--resolves=<id>`, y ninguno para otros comandos.

## Diseño

- Core, `guard/specty-calls.ts` (nuevo): `spectyCalls(args)` y lo que lee de una llamada a Specty (`subcommand`, `entered`, `frontRequests` y el nuevo `resolvedIds`), movidos de `guard/shell.ts`. `ShellAnalysis.resolves`: los ids de cada `specty new --resolves`.
- Core, `cards/front-owners.ts`: `frontResolvesDenial(owner, id, lang, command)`, motivo y siguiente paso del rechazo, y `foreignFrontsBlock(fronts, ctx)`, la sección del aviso de `propose`, en español y en inglés.
- Core, `cards/index.ts`: exporta las dos.
- CLI, `enforce/fronts.ts`: `judgeFronts` también juzga `resolves`: con una decisión que deja pasar, busca el frente de cada id y rechaza el primero cuyo dueño vivo es otra conversación.
- CLI, `flow/shared.ts`: `foreignFronts(session, paths)`, los frentes con dueño vivo que no es `session.conversation` y los archivos gobernados que caen en sus rutas.
- CLI, `commands/propose.ts`: añade la sección tras los archivos compartidos.

## Archivos

- crear packages/core/src/guard/specty-calls.ts — lo que una llamada a Specty pide al guard, con los ids de `new --resolves`
- modificar packages/core/src/guard/shell.ts — `resolves` en el análisis; las llamadas a Specty, desde su archivo
- modificar packages/core/test/guard/shell.test.ts — los ids de `new --resolves` de un comando
- modificar packages/core/src/cards/front-owners.ts — el rechazo de `new --resolves` y el aviso de `propose`
- modificar packages/core/src/cards/index.ts — exporta el rechazo y el aviso
- crear packages/core/test/cards/front-brakes.test.ts — el rechazo y el aviso, en español y en inglés
- modificar packages/cli/src/enforce/fronts.ts — el guard ante `new --resolves` de una entrada de otro frente
- modificar packages/cli/src/flow/shared.ts — los frentes de otras sesiones en los que caen los archivos de una spec
- modificar packages/cli/src/commands/propose.ts — el aviso de los frentes de otras sesiones
- crear packages/cli/test/front-brakes.test.ts — el freno del guard y el aviso de `propose`, de punta a punta
- modificar docs/formats.md — los frenos de los frentes
- modificar docs/ARCHITECTURE.md — el freno del guard y el aviso de `propose`

## Tareas

- [x] T1: Los ids de `new --resolves` en el análisis de un comando
  - files: packages/core/src/guard/specty-calls.ts, packages/core/src/guard/shell.ts, packages/core/test/guard/shell.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/shell.test.ts && pnpm lint
- [x] T2: El rechazo y el aviso de los frentes de otras sesiones
  - files: packages/core/src/cards/front-owners.ts, packages/core/src/cards/index.ts, packages/core/test/cards/front-brakes.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/front-brakes.test.ts test/cards/front-owners.test.ts && pnpm lint
- [x] T3: El guard frena `new --resolves` de una entrada de otro frente, y `propose` avisa
  - files: packages/cli/src/enforce/fronts.ts, packages/cli/src/flow/shared.ts, packages/cli/src/commands/propose.ts, packages/cli/test/front-brakes.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/front-brakes.test.ts test/front-guard.test.ts test/memory-resolves.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T4: La documentación de los frenos de los frentes
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC3
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: El guard lee la rama de la memoria y los dueños en cada comando con `specty new --resolves` — solo en esos, como con `front take`.
- R2: Una sesión de un agente que no dice su conversación ve en `propose` el aviso de su propio frente — el aviso lo dice («si no es el tuyo») y no frena nada.

## Cierre

### Resumen

El guard rechaza, con la regla `memory`, que la conversación de un agente ejecute `specty new … --resolves <id>` con una entrada de un frente cuyo dueño vivo es otra conversación. Dice de qué frente es la entrada, quién lo lleva y desde cuándo, y que tome una entrada de su frente o sin frente, o que la persona libere ese frente. Una entrada sin frente, de un frente sin dueño vivo o del propio pasa. `specty propose` de un borrador añade «FRENTES DE OTRAS SESIONES» cuando sus archivos gobernados caen en las rutas de un frente que lleva otra sesión, con quién lo lleva y los archivos, y avisa sin frenar. Lo que una llamada a Specty pide al guard (`enter`, `front take|free` y los ids de `new --resolves`) vive ahora en `guard/specty-calls.ts`, y `shell.ts` bajó de 276 a 251 líneas de código. Con este cambio, P33 queda hecha.

### Desviaciones

- Ninguna respecto al plan.

### Decisiones

- El rechazo nombra la entrada con el id que guarda el frente («P2»), aunque el comando la escriba en minúsculas («p2»).
- `foreignFronts` no lee los dueños si ningún frente tiene rutas o la spec no tiene archivos gobernados, para que `propose` no pague nada sin frentes.
- `ShellAnalysis` extiende `SpectyCalls`, la interfaz de lo que una llamada a Specty pide, en vez de repetir sus campos.

### Pendientes

- P2: `packages/core/src/cards/index.ts` llega a 397 líneas de código con las dos exportaciones nuevas.
