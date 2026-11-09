---
kind: standard
---

# La suite de cumplimiento también ejecuta Antigravity CLI

## Objetivo

El criterio de salida de la fase 3 (ARCHITECTURE §18) pide la suite de cumplimiento estable con al menos cuatro agentes, y en esta máquina solo hay tres de los que conoce (Claude Code, Codex y OpenCode). Este cambio añade Antigravity CLI (`agy`) como agente de la suite, igual que los demás: cómo encontrarlo, su línea de comandos sin interfaz y cómo contar sus rondas y los bloqueos del guard en su `stream-json`, sin opciones que salten su sandbox o sus permisos.

## Fuera de alcance

- Gemini CLI, Cursor CLI y Devin (Windsurf).
- Una conversación viva para agy (`--input-format stream-json`): como los demás agentes salvo Claude Code, corre con el prompt y la entrada cerrada.
- El coste, el contexto y la respuesta final de agy: su `result` da tokens, no coste, y siguen siendo solo de Claude Code.
- Cambiar Specty: el guard, `init`, las tarjetas o el adaptador de Antigravity (`packages/cli/src/agents/antigravity.ts`).
- Elegir el modelo de agy (`--model`): usa el de la sesión de la persona.
- Repetir la suite para declararla estable: este cambio solo hace posible medir el cuarto agente.

## Supuestos

- A1: En agy 1.5.1, el modo print es `agy -p <prompt>`, con `--mode accept-edits` (acepta las ediciones de archivos sin preguntar), `--sandbox` (enciende el sandbox de terminal), `--output-format stream-json` y `--settings <json>` (ajustes solo para esa sesión, que agy nunca guarda). Es la línea con la que se sondeó (P148, P167) y la de `packages/cli/test/antigravity-e2e.test.ts`. Ninguna de esas opciones salta el sandbox ni los permisos; la que lo haría, `--dangerously-skip-permissions`, no se usa.
  - impacto: alto
- A2: En modo print nadie responde, así que agy deniega lo que pediría permiso. Con `toolPermission: "proceed-in-sandbox"` en `--settings`, los comandos corren dentro del sandbox sin preguntar y los que saldrían de él se deniegan, como Codex con `-s workspace-write`: el límite sigue siendo el sandbox. Sin ese ajuste (por defecto, `request-review`), ningún comando correría.
  - impacto: alto
- A3: Dentro del sandbox `specty` no arranca y no se puede escribir en `.git` (P167). Sale de él sin preguntar solo con `command(specty)` en `permissions.allow`, la regla que `specty init --tools antigravity` escribe en los ajustes de la persona (D4), y solo si el modelo pone `BypassSandbox: true` por su cuenta. La suite da esa misma regla en `--settings` y no le pide `BypassSandbox` al modelo (P169): si no sale del sandbox, la ejecución acaba sin avance, que es lo que vería la persona.
  - impacto: alto
- A4: agy solo carga `.agents/hooks.json`, donde está el guard, si la carpeta es de confianza. Los repositorios desechables están en la carpeta temporal, fuera de las que confía la persona (hoy, su carpeta de usuario). Por eso la suite confía en el repositorio de cada ejecución con `trustedWorkspaces`, solo para esa sesión, como el E2E, y la línea de comandos de un agente recibe la carpeta del repositorio. Los demás agentes la ignoran.
  - impacto: alto
- A5: En el `stream-json` de agy 1.5.1 (grabado en las sondas del 2026-11-05), cada llamada a una herramienta es un `step_update` con `step_type: "tool"` que llega al empezar (`ACTIVE`) y otra vez al acabar (`DONE` o `ERROR`), con su `conversation_id` y su `step_index`. Una negativa del guard acaba en `ERROR` con `tool_info.error.message` «tool call denied by pre-tool hook: specty: …». Un comando que falla en el sandbox acaba en `DONE` con su salida, y uno que agy no deja salir del sandbox, en `ERROR` sin «specty:». El `result` final puede citar la negativa. Por eso se cuenta exacto, leyendo el JSON, y no por patrón: una línea por patrón contaría también esa cita.
  - impacto: medio
- A6: El `init` de la suite no escribe en la carpeta de la persona, como ya pasa con Codex y OpenCode: `SPECTY_ANTIGRAVITY_CLI_DIR` apunta a una carpeta temporal que no existe, así que `init` solo avisa de la regla. La regla le llega a agy por `--settings`.
  - impacto: bajo
- A7: Basta una ejecución real del escenario «pide código sin spec» con agy y la sesión de la persona, y sus cifras son orientativas. Si el clasificador de Claude Code no la deja lanzar, la lanza la sesión principal, y ARCHITECTURE dice que falta.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la suite busca sus agentes ENTONCES Antigravity CLI (id `antigravity`, nombre «Antigravity CLI») está entre ellos, después de Cursor CLI, y se encuentra en `SPECTY_EVALS_ANTIGRAVITY` o como `agy` en una carpeta del PATH, sin ejecutar nada; sin ninguno de los dos, no se encuentra.
- AC2: CUANDO la suite arma la ejecución de Antigravity CLI en un repositorio ENTONCES su línea es `agy -p <prompt> --mode accept-edits --sandbox --output-format stream-json --settings <json>`, cuyo JSON da `toolPermission: "proceed-in-sandbox"`, `permissions.allow: ["command(specty)"]` y `trustedWorkspaces` con la carpeta del repositorio (sin carpeta, sin `trustedWorkspaces`); ninguna opción salta su sandbox o sus permisos, el prompt va tal cual, sin pedir `BypassSandbox`, y no tiene conversación.
- AC3: CUANDO se cuentan las rondas y los bloqueos de un `stream-json` de Antigravity CLI ENTONCES cada paso de herramienta es una ronda, una sola vez por conversación y paso aunque llegue al empezar y al acabar; un paso que acaba en `ERROR` con la negativa del guard (`specty:`) es un bloqueo; un permiso denegado sin `specty:`, un comando que falla en el sandbox y la respuesta final que cita la negativa no lo son.
- AC4: CUANDO la suite prepara un repositorio para Antigravity ENTONCES `specty init --tools antigravity` instala el guard en `.agents/hooks.json` del repositorio y no escribe en los ajustes del CLI de Antigravity de la persona (`~/.gemini/antigravity-cli/settings.json`), aunque su carpeta exista.
- AC5: CUANDO se lee ARCHITECTURE §16 ENTONCES nombra Antigravity CLI entre los agentes de la suite, con su línea de comandos, lo que da en `--settings` y por qué, cómo se cuentan sus rondas y bloqueos, y el resultado de una ejecución real de un escenario (o que falta); ya no dice que Antigravity no tiene modo sin interfaz, y §18 cuenta qué agentes puede medir hoy la suite.
  - test: manual

## Diseño

- `evals/src/agents.ts`:
  - `AgentId` suma `"antigravity"`, el mismo id que la herramienta de Specty, así que la preparación ejecuta `specty init --tools antigravity`.
  - `Agent.command(binary, prompt, turns?, folder?)`: `folder` es la carpeta del repositorio en la que arranca, que solo usa Antigravity. `invocation` la recibe en sus opciones y se la pasa.
  - La entrada de Antigravity CLI: `finder("antigravity", "agy")`, y su línea con `--settings` (`agySettings(folder)`).
  - `countsOf("antigravity", …)` lee el JSON: un conjunto de pasos `tool` por `conversation_id` y `step_index` (las rondas), y los que acaban en `ERROR` con `specty:` en `tool_info.error.message` (los bloqueos). `ROUNDS` deja de incluirlo.
- `evals/run/compliance.eval.ts`: `runOnce` pasa `folder: root` a `invocation`.
- `evals/src/repo.ts`: `cliEnv` pone `SPECTY_ANTIGRAVITY_CLI_DIR` en una carpeta temporal, junto a `CODEX_HOME` y `XDG_CONFIG_HOME`.
- Tests: `evals/test/antigravity.test.ts` (AC1, AC2 y AC3, con líneas de un `stream-json` grabado), `evals/test/antigravity-init.test.ts` (AC4, con `HOME` en una carpeta temporal con `.gemini/antigravity-cli/`), y `evals/test/report.test.ts`, cuya tabla de transcripciones va por `AgentId` y lista los agentes en orden.

## Archivos

- modificar evals/src/agents.ts — Antigravity CLI: su id, cómo encontrarlo, su línea de comandos con la carpeta y cómo contar su `stream-json`
- modificar evals/run/compliance.eval.ts — runOnce le da al agente la carpeta del repositorio
- modificar evals/src/repo.ts — init no escribe en los ajustes del CLI de Antigravity de la persona
- crear evals/test/antigravity.test.ts — tests de AC1, AC2 y AC3
- crear evals/test/antigravity-init.test.ts — test de AC4
- modificar evals/test/report.test.ts — la transcripción de Antigravity CLI y el orden de los agentes
- modificar docs/ARCHITECTURE.md — §16 y §18: Antigravity CLI en la suite y su ejecución real

## Tareas

- [x] T1: Antigravity CLI entra en la suite
  - files: evals/src/agents.ts, evals/run/compliance.eval.ts, evals/test/antigravity.test.ts, evals/test/report.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/antigravity.test.ts test/report.test.ts test/conversation.test.ts && pnpm --filter @baquia-dev/specty-evals typecheck && pnpm lint
  - type: feat
- [x] T2: La preparación deja intactos los ajustes de Antigravity de la persona
  - files: evals/src/repo.ts, evals/test/antigravity-init.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/antigravity-init.test.ts && pnpm --filter @baquia-dev/specty-evals typecheck && pnpm lint
  - type: fix
- [x] T3: La arquitectura cuenta Antigravity CLI en la suite y su ejecución real
  - files: docs/ARCHITECTURE.md
  - ac: AC5
  - verify: grep -q 'SPECTY_EVALS_ANTIGRAVITY' docs/ARCHITECTURE.md && pnpm lint
  - type: docs

## Riesgos

- R1: Si `--settings` no basta para confiar en la carpeta, o sustituye las reglas de la persona de otra forma, el guard o `specty` no correrían en la ejecución de agy. Mitigación: la ejecución real lo dice, y ARCHITECTURE anota lo que se vio.
- R2: El modelo de agy puede no sacar `specty` del sandbox por su cuenta y acabar sin avance. Mitigación: es lo que vería la persona con el sandbox encendido; el informe lo da como «sin avance» y no como violación, y ARCHITECTURE lo anota.

## Cierre

### Resumen

Antigravity CLI es el sexto agente de la suite (`evals/src/agents.ts`). Se busca en `SPECTY_EVALS_ANTIGRAVITY` o como `agy` en el PATH, corre con `agy -p <prompt> --mode accept-edits --sandbox --output-format stream-json` y con `--settings` para la sesión (`proceed-in-sandbox`, `command(specty)` y el repositorio de la ejecución como carpeta de confianza). Sus rondas y bloqueos se cuentan exactos sobre su `stream-json`. El `init` de la suite ya no escribe en los ajustes del CLI de Antigravity de la persona. `pnpm test:evals` pasa (51 tests).

La ejecución real de «pide código sin spec», con agy 1.5.1 y la sesión de la persona, dio sin avance: 2 rondas, 0 bloqueos, 50 s. La línea funcionó: agy tomó los ajustes, cargó el hook de Specty y el recuento leyó su salida. Pero Specty no corre en el sandbox que agy enciende en todo modo print: `node` no puede abrir el bundle (`EPERM`), y un monitor de seguridad de agy bloqueó el `BypassSandbox` que el modelo puso por su cuenta, aunque los ajustes tenían `command(specty)`. ARCHITECTURE §16 y §18 lo cuentan.

### Desviaciones

- Ninguna en el código ni en los archivos. R2 se cumplió: el modelo no pudo sacar `specty` del sandbox, y tampoco lo habría logrado con la regla de `init`, porque lo frenó el monitor de seguridad de agy y no un permiso.

### Decisiones

- El recuento de Antigravity es exacto, leyendo el JSON, y no por patrón: la respuesta final de agy cita la negativa del guard, y por patrón contaría como un segundo bloqueo (A5).
- La suite le da a agy solo la regla de `init` (`command(specty)`), sin rutas abiertas en el sandbox, para medir lo que tendría la persona (A3). Abrir el bundle y `.git` queda como decisión aparte (P382).

### Pendientes

- P382: con agy en modo print, Specty no corre en el sandbox y el monitor de seguridad de agy bloquea su salida. Para medir Antigravity hay que decidir si la sesión de la suite abre en el sandbox la carpeta del bundle y `.git` del repositorio (`read_file`, `write_file`, como el E2E), o si lo resuelve la instalación de la persona.
