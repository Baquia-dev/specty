---
kind: standard
follows:
  - 20261025-instalar-las-verificaciones-con-diff-y-confirmac
---

# El fin de turno del agente ejecuta specty check

## Objetivo

Cuando Claude Code, Cursor o Codex terminan su turno, un hook ejecuta `specty check --changed` (y las verificaciones del plan si hay un cambio aprobado) y, si falla, les devuelve el informe para que sigan corrigiendo en vez de dar la tarea por terminada. `specty check --install` lo añade, con diff y confirmación, a los agentes que ya tienen el guard de Specty. Para los demás, el respaldo es la regla escrita de AGENTS.md (corte 8).

## Fuera de alcance

- Gemini CLI (`AfterAgent`): Specty aún no instala ningún hook suyo; añadirlo es un instalador nuevo.
- OpenCode (`session.idle`), Windsurf (`post_cascade_response`, asíncrono), Copilot y Antigravity: sus documentaciones no confirman un evento de fin de turno que haga seguir al agente.
- La exclusión de ruido (archivos que el agente no debe leer): es el cambio siguiente.
- Instalarlo con `init`: es opcional y lo decide la persona con `specty check --install`.

## Supuestos

- A1: Según su documentación vigente, Claude Code y Codex tienen el evento `Stop`, sin matcher. Su entrada trae `stop_hook_active`, y la salida `{"decision":"block","reason":…}` les hace seguir con ese motivo. Cursor tiene `stop`: su entrada trae `status` y `loop_count`, y la salida `{"followup_message":…}` se envía como el siguiente mensaje, con 5 vueltas como máximo por defecto.
  - impacto: alto
- A2: Para no entrar en un bucle, con `stop_hook_active: true` (Claude Code, Codex) el hook deja terminar aunque siga fallando; en Cursor, el límite lo pone su `loop_limit`, y solo se actúa con `status: "completed"`.
  - impacto: alto
- A3: El hook vive en la entrada ligera de los hooks (`specty hook agent-stop <agente>`), como los de git, y fuera de un repositorio de Specty termina con 0 sin decir nada, porque el de Codex está en la configuración del usuario y corre en cualquier repositorio.
- A4: `check --install` solo lo añade donde el guard de Specty ya está, en el mismo archivo y con el mismo comando de Specty; si ya está, no hay nada que hacer.

## Criterios de aceptación

- AC1: CUANDO Claude Code o Codex terminan con un fallo en `specty check --changed` ENTONCES `specty hook agent-stop <agente>` imprime `{"decision":"block","reason":…}` con el informe y sale con 0; con `stop_hook_active: true` o sin fallos, no imprime nada.
- AC2: CUANDO Cursor termina con `status: "completed"` y hay fallos ENTONCES imprime `{"followup_message":…}` con el informe; con otro `status` o sin fallos, nada.
- AC3: CUANDO hay un cambio activo con la spec aprobada ENTONCES el hook incluye las verificaciones del plan (`--spec`); fuera de un repositorio de Specty termina con 0 sin salida.
- AC4: CUANDO la persona ejecuta `specty check --install` con el guard de Claude Code, Cursor o Codex instalado ENTONCES le ofrece, con su diff, añadir el hook de fin de turno al archivo de ese agente; una segunda vez no hay nada que añadir.
- AC5: CUANDO el idioma es inglés ENTONCES el motivo que recibe el agente está en inglés.

## Diseño

- `cli/src/enforce/agent-stop.ts`: `agentStop(sesión, agente, entrada)` decide si actuar según la entrada, ejecuta `check` en modo `changed` (con `--spec` si hay un cambio aprobado) y da la salida en el formato del agente.
- `cli/src/enforce/entry.ts`: `hookCommand` atiende `agent-stop <agente>` con la entrada estándar.
- `cli/src/check/install-agents.ts`: el paso de `check --install` que añade el hook al archivo del guard de cada agente (`.claude/settings.json` o `.claude/settings.local.json`, `.cursor/hooks.json`, el `hooks.json` de Codex del usuario), calculando el texto nuevo con `rewriteJson` en seco.
- `cli/src/check/install.ts` suma ese paso y escribe una ruta absoluta (la de Codex) tal cual.

## Archivos

- crear packages/cli/src/enforce/agent-stop.ts — el hook de fin de turno de cada agente
- modificar packages/cli/src/enforce/entry.ts — `specty hook agent-stop <agente>`
- crear packages/cli/src/check/install-agents.ts — añadir el hook a los archivos de los agentes
- modificar packages/cli/src/check/install.ts — sumar ese paso y aceptar rutas absolutas
- crear packages/cli/test/check-agent-stop.test.ts — el hook y su instalación de punta a punta
- modificar docs/formats.md — el hook de fin de turno en `specty check --install`
- modificar docs/ARCHITECTURE.md — el fin de turno de cada agente

## Tareas

- [x] T1: El hook de fin de turno
  - files: packages/cli/src/enforce/agent-stop.ts, packages/cli/src/enforce/entry.ts, packages/cli/test/check-agent-stop.test.ts
  - ac: AC1, AC2, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-agent-stop.test.ts test/hooks-entry.test.ts
- [x] T2: Instalarlo con `check --install`
  - files: packages/cli/src/check/install-agents.ts, packages/cli/src/check/install.ts, packages/cli/test/check-agent-stop.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-agent-stop.test.ts test/check-install.test.ts
- [x] T3: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm check

## Riesgos

- R1: Los tests del proyecto hacen lento cada fin de turno — el hook solo existe si la persona lo instala, y `checks.levels.tests` apaga los tests si estorban.
- R2: Un agente cambia el formato de su hook — cada formato vive en una función de `agent-stop.ts` con su test, y un `tool` desconocido no hace nada.
