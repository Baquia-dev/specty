---
kind: standard
---

# La auditoría anota el nombre de la persona y el modelo y el esfuerzo del agente

## Objetivo

El Historial dice «Persona» o «Agente · Claude Code» porque `audit.jsonl` no guarda más: ni quién es la persona ni con qué modelo y esfuerzo trabajaba el agente. Cada línea pasa a llevar el nombre de la persona (`by`), y las del agente, cuando la herramienta lo deja saber, su modelo (`model`) y su esfuerzo (`effort`). La UI los enseñará en el cambio siguiente.

## Fuera de alcance

- Enseñarlos en el Historial de la UI o en el informe de `specty audit`.
- El modelo y el esfuerzo de otros agentes que Claude Code: de momento no los dicen en ningún sitio que Specty lea.
- Rellenar las líneas ya escritas.

## Supuestos

- A1: El nombre de la persona es su `user.name` de git, el mismo que `state.json` guarda al aprobar; una decisión que el agente toma en modo delegado lleva también `by`, la persona por la que decide.
- A2: Claude Code pasa a sus comandos el esfuerzo (`CLAUDE_EFFORT`) y el id de la sesión (`CLAUDE_CODE_SESSION_ID`), pero no el modelo; el modelo es el de la última respuesta en el transcript de la sesión (`projects/*/<sesión>.jsonl`, bajo `CLAUDE_CONFIG_DIR` o `~/.claude`), del que Specty solo lee el final y solo ese campo.
  - impacto: alto
- A3: Lo que el agente dice de sí mismo es contexto, no prueba, como `tool`; si no se encuentra, la línea va sin ello.

## Criterios de aceptación

- AC1: CUANDO una persona toma una decisión, o el agente la toma por ella en modo delegado ENTONCES su línea de `audit.jsonl` lleva `by` con el `user.name` de git.
- AC2: CUANDO el agente que ejecuta un comando es Claude Code ENTONCES sus líneas llevan `effort` (de `CLAUDE_EFFORT`) y `model` (el de la última respuesta del transcript de su sesión), y van sin ellos si no se encuentran.

## Diseño

- `agents/run.ts`: `agentRun(tool, env)` da `{ model?, effort? }`; hoy solo de Claude Code: valida el id de la sesión y el esfuerzo, busca `<sesión>.jsonl` en las carpetas de `projects/` y lee sus últimos 64 KB.
- `auditEntry` (`flow/active.ts`) pasa a ser asíncrona: añade `by` a las líneas de la persona y a las delegadas, y `model` y `effort` a las del agente; `flow/finish.ts` y `flow/verified.ts` la esperan.
- `AuditEntry` (`store/changes.ts`) gana `by`, `model` y `effort`.
- `testEnv` de los tests deja fuera `CLAUDE_EFFORT`, `CLAUDE_CODE_SESSION_ID` y `CLAUDE_CONFIG_DIR`, como ya hace con `CLAUDECODE`: así un test no lee el transcript de quien lo ejecuta.

## Archivos

- crear packages/cli/src/agents/run.ts — el modelo y el esfuerzo que dice cada agente
- modificar packages/cli/src/flow/active.ts — `auditEntry` con `by`, `model` y `effort`
- modificar packages/cli/src/flow/finish.ts — espera `auditEntry`
- modificar packages/cli/src/flow/verified.ts — espera `auditEntry`
- modificar packages/cli/src/store/changes.ts — los campos nuevos de `AuditEntry`
- modificar packages/cli/test/support.ts — `testEnv` sin las variables de la sesión de Claude Code
- crear packages/cli/test/audit-who.test.ts — el nombre, el modelo y el esfuerzo en la auditoría
- modificar docs/formats.md — `by`, `model` y `effort` en `audit.jsonl`

## Tareas

- [x] T1: La persona, el modelo y el esfuerzo en cada línea de la auditoría
  - files: packages/cli/src/agents/run.ts, packages/cli/src/flow/active.ts, packages/cli/src/flow/finish.ts, packages/cli/src/flow/verified.ts, packages/cli/src/store/changes.ts, packages/cli/test/support.ts, packages/cli/test/audit-who.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/audit-who.test.ts && pnpm lint
- [x] T2: Documentar los campos nuevos
  - files: docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs
