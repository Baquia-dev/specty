---
kind: standard
---

# El guard ve las lecturas y escrituras del CLI de Antigravity y su fin de turno corre

## Objetivo

En el CLI de Antigravity (`agy` 1.5.1), el agente lee con `read_file` (también para listar una carpeta), escribe con `write_file` y edita con `edit_file`, que el matcher de `.agents/hooks.json` y el guard no conocen: allí el guard solo ve `run_command` y `manage_task`. Además, su `Stop` llega con `terminationReason: "NO_TOOL_CALL"`, así que el fin de turno nunca corre. Con este cambio el guard juzga esas tres herramientas, `doctor` avisa del hook instalado sin ellas y el fin de turno corre cuando el modelo termina sin pedir herramienta, pero no mientras corren sus subagentes.

## Fuera de alcance

- Repartir los cortes de una épica entre subagentes de Antigravity: va en un cambio aparte.
- Los nombres de su editor (`write_to_file`, `view_file`…) y de los editores ACP (`client_*`): se quedan como están.
- `PostToolUse` sigue solo con `run_command`: el aviso tras cada comando no cambia.
- `Overwrite` y `Append` de `write_file` no cambian el juicio: es una escritura del archivo de `Path`.

## Supuestos

- A1: En el CLI, las herramientas de archivos son `read_file` (campo `Path`, archivo o carpeta), `write_file` (`Path`, `Content`, `Overwrite`, `Append`) y `edit_file` (`Path`, `Target`, `Replacement`), con la misma entrada que las demás (`toolCall.name` y `toolCall.args`). Sale de sondear `agy` 1.5.1 con Gemini 3.8 Flash y Claude Sonnet 5.5 el 2026-11-05 (P147).
  - impacto: alto
- A2: `read_file` sobre una carpeta es una lectura de esa carpeta, como `list_dir`: la conversación que entró en la carpeta de un cambio la lee dentro de ella.
- A3: `NO_TOOL_CALL` es el turno que el modelo terminó sin pedir herramienta, como `model_stop` en su editor; los demás motivos (un error, su límite de pasos) siguen sin devolver el turno.
- A4: Un `Stop` con `fullyIdle: false` llega mientras corren subagentes suyos, y después llega otro con `fullyIdle: true` (P148). Sin el campo, como en su editor, se actúa como hasta ahora. Ante `fullyIdle: false` el guard responde `{"decision":"stop"}` sin ejecutar `specty check --changed` y sin gastar la vuelta de esa conversación.
- A5: `doctor` distingue tres instalaciones antiguas por su matcher: sin las lecturas (`enter-outdated`), con ellas y sin las herramientas ACP (`antigravity-acp`), y con las ACP y sin las del CLI, que recibe una línea nueva (`antigravity-cli`). Todas piden `specty init --tools antigravity`.

## Criterios de aceptación

- AC1: CUANDO Antigravity escribe o edita un archivo con `write_file` o `edit_file` ENTONCES el guard lo juzga como cualquier escritura del archivo de `Path`: deniega `.specty/config.yaml` y lo que está fuera del alcance de la tarea, con el motivo y el SIGUIENTE, y deja pasar lo que la tarea permite.
- AC2: CUANDO una conversación de Antigravity que entró en la carpeta de un cambio lee con `read_file` un archivo o una carpeta de fuera de ella ENTONCES el guard lo deniega y le da la misma ruta dentro de esa carpeta; dentro de ella, o en otra conversación, lo deja pasar.
- AC3: CUANDO `specty init --tools antigravity` escribe el hook `specty` de `.agents/hooks.json` ENTONCES el matcher de `PreToolUse` lleva `read_file`, `write_file` y `edit_file` además de los nombres de su editor y de los editores ACP.
- AC4: CUANDO el matcher instalado tiene las herramientas ACP y no las del CLI ENTONCES `specty doctor` dice que el guard no ve lo que Antigravity lee, escribe y edita en su CLI, pide `specty init --tools antigravity` y sale con 1, en español y en inglés; tras `init`, el aviso desaparece.
- AC5: CUANDO el `Stop` de Antigravity llega con `terminationReason: "NO_TOOL_CALL"` y `fullyIdle: true` y `specty check --changed` falla ENTONCES responde `{"decision":"continue"}` con el informe, una vez por turno, como con `model_stop`.
- AC6: CUANDO el `Stop` llega con `fullyIdle: false` ENTONCES responde `{"decision":"stop"}` aunque `specty check --changed` falle, y el siguiente `Stop` de esa conversación con `fullyIdle: true` sí devuelve el turno.

## Diseño

- `agents/antigravity.ts`: `TOOLS` suma `CLI_TOOLS` (`read_file|write_file|edit_file`) tras los de su editor y los de ACP; `READS` suma `read_file` con `Path` y `WRITES`, `write_file` y `edit_file` con `Path`. `outdatedMatcher` da `antigravity-cli` a un matcher distinto del actual que ya tenía `client_view_file`, `antigravity-acp` al que tenía `view_file` y `enter-outdated` al resto. `stop.acts` actúa con `model_stop` o `NO_TOOL_CALL`, salvo con `fullyIdle === false`.
- Core: la línea de `doctor` `antigravity-cli` (con `file`) en `cards/doctor.ts` y su texto en español e inglés en `cards/doctor-agents.ts`.

## Archivos

- modificar packages/cli/src/agents/antigravity.ts — el guard juzga las herramientas del CLI, `doctor` avisa del hook sin ellas y el fin de turno acepta `NO_TOOL_CALL` sin actuar con `fullyIdle: false`
- modificar packages/cli/test/antigravity.test.ts — escrituras, lecturas, el matcher de `init` y el aviso de `doctor` con las herramientas del CLI
- modificar packages/cli/test/antigravity-turn.test.ts — el fin de turno con `NO_TOOL_CALL` y con `fullyIdle: false`
- modificar packages/core/src/cards/doctor.ts — la línea `antigravity-cli`
- modificar packages/core/src/cards/doctor-agents.ts — su texto en español e inglés
- crear packages/core/test/cards/doctor-antigravity-cli.test.ts — el texto de la línea en español y en inglés
- modificar docs/ARCHITECTURE.md — las herramientas del CLI de Antigravity y su fin de turno

## Tareas

- [x] T1: El guard juzga `read_file`, `write_file` y `edit_file` de Antigravity, e `init` los pone en su matcher
  - files: packages/cli/src/agents/antigravity.ts, packages/cli/test/antigravity.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity.test.ts -t "AC1|AC2|AC3|AC4: doctor names a hook from before its tools in ACP|writes the specty hook"
  - type: fix
- [x] T2: `doctor` avisa del hook de Antigravity sin las herramientas de su CLI
  - files: packages/core/test/cards/doctor-antigravity-cli.test.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/cli/src/agents/antigravity.ts, packages/cli/test/antigravity.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor-antigravity-cli.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/antigravity.test.ts test/doctor-enter.test.ts
  - type: fix
- [x] T3: El fin de turno de Antigravity corre con `NO_TOOL_CALL` y espera a que acaben sus subagentes
  - files: packages/cli/test/antigravity-turn.test.ts, packages/cli/src/agents/antigravity.ts
  - ac: AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity-turn.test.ts test/check-agent-stop.test.ts && pnpm typecheck && pnpm lint
  - type: fix
- [x] T4: La documentación
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Otra versión de `agy` cambia los nombres o los campos de sus herramientas — `doctor` solo mira el matcher; el guard deja pasar lo que no reconoce, como hoy. Se comprueba con `agy` real antes de aceptar si se puede.
- R2: Con `fullyIdle: false` el turno termina sin el check, y si el siguiente `Stop` no llegara, el fin de turno no correría — es lo que pasa hoy en el CLI con cualquier `Stop`; A4 sale del sondeo de P148.

## Cierre

### Resumen

En el CLI de Antigravity (`agy`), el guard ya ve lo que el agente lee, escribe y edita. El matcher de `PreToolUse` que escribe `specty init` en `.agents/hooks.json` suma `read_file|write_file|edit_file` tras los nombres de su editor y de los editores ACP. El guard juzga `read_file` como lectura de `Path` (un archivo o una carpeta, también para la conversación que entró en la carpeta de un cambio) y `write_file` y `edit_file` como escrituras de `Path`. `doctor` reconoce el hook instalado sin esas herramientas con la línea nueva `antigravity-cli` (en español y en inglés) y pide `specty init --tools antigravity`; los hooks anteriores conservan sus avisos (`antigravity-acp` y `enter-outdated`).

El fin de turno corre ahora con `terminationReason` `NO_TOOL_CALL` (el CLI) además de `model_stop` (el editor), y no actúa con `fullyIdle: false`, con el que el `Stop` llega mientras corren sus subagentes: responde `{"decision":"stop"}` sin el check y sin gastar la vuelta de esa conversación. ARCHITECTURE describe las herramientas del CLI y el fin de turno nuevo.

Comprobado con `agy` 1.5.1 de verdad (Gemini 3.8 Flash), con los hooks apuntando al bundle de esta rama en un repositorio temporal: sin cambio activo, `read_file` llegó al guard y pasó, `edit_file` sobre `src/app.ts` se denegó con el motivo y el modelo lo repitió; el `Stop` con `NO_TOOL_CALL` devolvió el turno una vez con el informe de `specty check --changed` y el siguiente dejó terminar. Con un subagente, el `Stop` del padre con `fullyIdle: false` respondió `stop`.

### Desviaciones

- Ninguna respecto al plan.

### Decisiones

- Sin el campo `fullyIdle`, como en su editor, el fin de turno actúa como antes: solo `fullyIdle: false` lo frena.
- `doctor` distingue el hook sin las herramientas del CLI por si su matcher ya tenía `client_view_file`, para que el aviso diga lo que falta de verdad.

### Pendientes

- P151: el `Stop` de un subagente de Antigravity (su propio `conversationId`, `fullyIdle: true`, `lastUserInput` vacío) corre el fin de turno, y con el check en rojo el subagente se pone a corregir lo que no era su encargo; decidirlo junto con los cortes en subagentes de Antigravity.
- P152: en modo print (`agy -p`), si el padre termina mientras su subagente corre, `agy` sale sin mandar el `Stop` con `fullyIdle: true`, y ese turno se queda sin el check.
- Los proyectos con Antigravity instalado antes de este cambio necesitan `specty init --tools antigravity`; `doctor` lo dice.
