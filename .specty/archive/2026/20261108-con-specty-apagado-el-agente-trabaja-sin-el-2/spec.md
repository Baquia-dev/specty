---
kind: standard
epic: 20261108-interruptor-para-encender-y-apagar-el-flujo-de
slice: C1
---

# Con Specty apagado, el agente trabaja sin el flujo y el registro guarda cada cambio de estado

## Objetivo

Primer corte de la épica del interruptor: lo que hace Specty apagado y el registro que guarda cada apagado y cada encendido. Con Specty apagado, nada de lo que hace el agente pasa por Specty: el guard deja pasar todas sus acciones, `pre-commit` no bloquea commits, el fin de turno no revisa nada y `specty next` le dice que trabaje sin el flujo. El estado vive en un registro local de solo añadir, `.git/common/specty/switch.jsonl`, con quién y cuándo, que el guard protege con la regla `bypass`. El interruptor de la UI que lo cambia llega en C2.

## Fuera de alcance

- El interruptor de la UI, `GET /api/switch` y `POST /api/switch`, y su aviso a las demás pestañas (C2).
- Un comando de terminal para encender o apagar Specty: solo la UI de la persona lo cambiará.
- Apagar Specty para el equipo o en la CI: `specty ci` y los clones de otras personas siguen igual.
- Mostrar el estado del interruptor en `specty status`, `specty doctor`, la extensión de VS Code o la MCP App.
- Deshacer en el guard un apagado que haga un comando de shell sin nombrar el registro (R1).

## Supuestos

- A1: El registro vale para el clon y todas sus worktrees, como el modo delegado: vive en `.git/common/specty/switch.jsonl`, sin versionar, y es de solo añadir. Cada línea es `{ "on": boolean, "by": string, "at": ISO }`; una línea que no tiene esa forma no cuenta. El estado es el de la última línea válida, y sin archivo o sin ninguna línea válida Specty está encendido, así que borrar el registro solo puede encenderlo.
  - impacto: alto
- A2: «Nada pasa por Specty» significa que el guard responde a cualquier agente como fuera de un repositorio de Specty: sin juzgar sus acciones, sin fotos del árbol antes de sus comandos, sin tarjetas ni mensajes y sin anotar sus pasos en `activity/`. Los hooks de carpetas de Claude Code (`WorktreeCreate` y `WorktreeRemove`) siguen respondiendo, porque sin ellos `EnterWorktree` no funcionaría.
  - impacto: alto
- A3: Los comandos de Specty que alguien ejecute a propósito con Specty apagado siguen funcionando, y sus commits llevan su recibo y sus trailers, porque `pre-commit` atiende los recibos antes de mirar el interruptor. Los cambios abiertos se quedan en su fase y siguen al volver a encenderlo.
- A4: Con Specty apagado el guard no juzga nada, tampoco un comando que nombre el registro: un agente podría volver a encenderlo, pero no apagarlo mientras está encendido.
  - impacto: bajo
- A5: `turnSwitch` se escribe como `delegated.json`: quita el solo lectura, añade la línea y lo deja en `0o444`. En este corte solo lo usan los tests; el servidor de la UI lo usará en C2.

## Criterios de aceptación

- AC1: CUANDO se apaga o se enciende Specty con `turnSwitch` ENTONCES se añade a `.git/common/specty/switch.jsonl` una línea `{ "on", "by", "at" }` con el estado nuevo, quién y cuándo, y el archivo queda en solo lectura; pedir el estado que ya tiene no añade ninguna línea; sin archivo o sin ninguna línea válida, `readSwitch` lo da encendido, y `switchLog` da las entradas válidas, de la más reciente a la más antigua.
- AC2: CUANDO Specty está apagado ENTONCES el guard de cualquier agente deja pasar todas sus acciones, antes y después, sin rechazos, avisos ni tarjetas y sin anotar sus pasos en `activity/`; los hooks de carpetas de Claude Code siguen creando y quitando carpetas.
- AC3: CUANDO Specty está apagado ENTONCES `pre-commit` deja pasar un commit de código gobernado que encendido bloquearía, y el fin de turno del agente (`agent-stop` y `memory-stop`) le deja terminar sin revisar nada; un commit de Specty con su recibo sigue llevando su trailer `Specty-Change`.
- AC4: CUANDO Specty está apagado ENTONCES `specty next` dice que está apagado, desde cuándo y quién lo apagó, que nada de lo que haga el agente pasa por Specty y que los cambios abiertos siguen como están, y como SIGUIENTE que haga lo que pide el usuario sin spec ni comandos de Specty, en español y en inglés.
- AC5: CUANDO el agente ejecuta un comando de shell que nombra el registro (`common/specty/switch.jsonl`) ENTONCES el guard lo rechaza con la regla `bypass`, como hace con el interruptor del modo delegado.
- AC6: CUANDO la persona vuelve a encender Specty ENTONCES el guard, `pre-commit` y `specty next` vuelven a actuar como antes, y los cambios abiertos siguen en la fase en que estaban.

## Diseño

- **`packages/cli/src/store/switch.ts`** (nuevo, junto a `store/local.ts`): `SwitchEntry` es `{ on, by, at }`. `switchLog(git)` lee el registro y da sus líneas válidas, de la más reciente a la más antigua. `readSwitch(git)` da la más reciente o, sin ninguna, `{ on: true }`. `turnSwitch(git, entry)` añade la línea solo si cambia el estado, con `appendLine` y los permisos de `delegated.json`, y dice si la añadió.
- **Guard** (`enforce/guard.ts`): los eventos `worktree` se responden como hoy, antes de mirar el interruptor. Después de `guardSession`, si Specty está apagado responde como fuera de un repositorio de Specty (`agent.reply(ALLOW, …)`), antes de `enteredSession` y de `noted`: sin fotos de shell, sin tarjetas y sin mensajes.
- **Hooks** (`enforce/entry.ts`): con Specty apagado, `agent-stop` y `memory-stop` responden como fuera de Specty (`stopPass` para `agent-stop`). `enforce/hook.ts`: `pre-commit` atiende primero los recibos de Specty, que dejan su marca para los trailers, y, si está apagado, deja pasar el resto. `prepare-commit-msg` no cambia: solo actúa con la marca de un recibo o de una edición manual.
- **`next`**: `NextView` (`core/src/cards/next.ts`) gana `off?: { by, at }`, y `nextCard` da con él la tarjeta de Specty apagado antes que ninguna otra. La tarjeta va en `core/src/cards/off.ts` (nuevo, como `idle.ts`). `commands/next.ts` lee el registro al empezar, antes de buscar el cambio activo.
- **Regla `bypass`**: `SENSITIVE_SPECTY` (`core/src/guard/shell.ts`) también reconoce `common/specty/switch.jsonl`, como `common/specty/delegated.json`.
- **Documentación**: `switch.jsonl` en `docs/formats.md` §1, y qué deja de actuar con Specty apagado en `docs/ARCHITECTURE.md` §10.

## Archivos

- crear packages/cli/src/store/switch.ts — el registro del interruptor: leerlo, su estado y añadir un cambio de estado
- modificar packages/core/src/guard/shell.ts — la regla `bypass` reconoce el registro
- crear packages/cli/test/switch-log.test.ts — el registro (líneas, permisos, estado por defecto y orden) y el guard que rechaza un comando que lo nombra
- modificar packages/cli/src/enforce/guard.ts — con Specty apagado, responde como fuera de Specty salvo a los hooks de carpetas
- modificar packages/cli/src/enforce/entry.ts — con Specty apagado, el fin de turno responde como fuera de Specty
- modificar packages/cli/src/enforce/hook.ts — con Specty apagado, `pre-commit` deja pasar lo que no es un recibo
- crear packages/cli/test/specty-off-hooks.test.ts — el guard, `pre-commit` y el fin de turno apagados y al volver a encender
- crear packages/core/src/cards/off.ts — la tarjeta de Specty apagado
- modificar packages/core/src/cards/next.ts — `NextView.off` y la tarjeta antes que ninguna otra
- crear packages/core/test/cards/off.test.ts — la tarjeta en español y en inglés, antes que las demás, y sin `off` las de siempre
- modificar packages/cli/src/commands/next.ts — lee el registro al empezar
- crear packages/cli/test/specty-off-next.test.ts — `specty next` apagado y al volver a encender, con un cambio abierto
- modificar docs/formats.md — §1: `switch.jsonl`
- modificar docs/ARCHITECTURE.md — §10: qué deja de actuar con Specty apagado

## Tareas

- [x] T1: El registro del interruptor y la regla `bypass` que lo protege
  - files: packages/cli/src/store/switch.ts, packages/core/src/guard/shell.ts, packages/cli/test/switch-log.test.ts
  - ac: AC1, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/switch-log.test.ts
- [x] T2: Con Specty apagado, el guard, `pre-commit` y el fin de turno dejan pasar todo
  - files: packages/cli/src/enforce/guard.ts, packages/cli/src/enforce/entry.ts, packages/cli/src/enforce/hook.ts, packages/cli/test/specty-off-hooks.test.ts
  - ac: AC2, AC3, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/specty-off-hooks.test.ts
- [x] T3: La tarjeta de Specty apagado va antes que ninguna otra en `next`
  - files: packages/core/src/cards/off.ts, packages/core/src/cards/next.ts, packages/core/test/cards/off.test.ts
  - ac: AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/off.test.ts
- [x] T4: `specty next` lee el registro y, apagado, da esa tarjeta sin tocar el cambio abierto
  - files: packages/cli/src/commands/next.ts, packages/cli/test/specty-off-next.test.ts
  - ac: AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/specty-off-next.test.ts && pnpm typecheck
- [x] T5: La documentación cuenta el registro y lo que deja de actuar con Specty apagado
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - type: docs

## Riesgos

- R1: Un comando de shell que apaga Specty sin nombrar el registro (un script que calcula la ruta) escapa a la regla `bypass`. Mitigación: el archivo queda en solo lectura y cada cambio queda en el registro con quién y cuándo, que la UI enseñará en C2.
- R2: El guard lee el registro en cada acción del agente. Mitigación: es un archivo local pequeño, que solo crece cuando la persona cambia el estado.

## Cierre

### Resumen

Con Specty apagado, el agente trabaja sin el flujo. El estado vive en `.git/common/specty/switch.jsonl`, un registro local de solo añadir con una línea `{ "on", "by", "at" }` por cada cambio de estado (`store/switch.ts`: `switchLog`, `readSwitch` y `turnSwitch`, que solo añade si el estado cambia y deja el archivo en `0o444`). Apagado, el guard responde a cualquier agente como fuera de Specty, salvo a los hooks de carpetas de Claude Code. `pre-commit` solo atiende los recibos de Specty, cuyos commits conservan sus trailers, y deja pasar lo demás. `agent-stop` y `memory-stop` dejan terminar el turno, y `specty next` da la tarjeta de Specty apagado (`cards/off.ts`, en español y en inglés) antes que ninguna otra, sin tocar el cambio abierto. Al volver a encenderlo todo actúa como antes. La regla `bypass` rechaza un comando de shell que nombre el registro. Documentado en formats.md §1, ARCHITECTURE.md §10 y el glosario.

### Desviaciones

- Este cambio rehace el corte C1 tras cancelar `20261108-con-specty-apagado-el-agente-trabaja-sin-el` en su fase de tests. Allí T1 y T3 encadenaban con `&&` los tests de core y de la CLI: el primer rojo cortaba la cadena, el envío no nombraba todos los tests nuevos y la spec estaba bloqueada (P190). Aquí cada verificación ejecuta un solo paquete de tests: la tarjeta (T3, core) y `next` (T4, CLI) van en tareas aparte, y AC5 se prueba con el guard de punta a punta en `switch-log.test.ts`, sin tocar `core/test/guard/shell.test.ts`.
- El test de AC6 de `specty-off-hooks.test.ts` esperaba que, encendido, `pre-commit` bloqueara `src/app.ts` con un cambio en revisión. Pero ese archivo está en el alcance del cambio, y un retoque manual dentro del alcance pasa también encendido. El desbloqueo S1, que decidió la persona, lo cambió por un archivo fuera del alcance.
- La rama de `next` sin cambio activo pasó a su propia función, `withoutChange`, para que `next` no pase el límite de complejidad con la comprobación del interruptor.
- La documentación fue a una tarea propia (T5) y se añadió el término al glosario.

### Decisiones

- `readSwitch` da la última entrada válida o `{ on: true }`, así que apagado siempre trae quién y cuándo, y `NextView.off` los exige.
- El guard mira el interruptor justo después de abrir la sesión y antes de `enteredSession`: apagado, tampoco ata la conversación a una carpeta ni la anota en `activity/`.
- La regla `bypass` reconoce `common/specty/switch.jsonl`, así que también un comando que arma la ruta con `$(git rev-parse --git-common-dir)/common/specty/switch.jsonl`.

### Pendientes

- `packages/cli/src/enforce/guard.ts` sube a 320 líneas de código (aviso desde 300): sigue abierta la propuesta de pasar el contexto del guard a `enforce/guard-context.ts` (P218).
