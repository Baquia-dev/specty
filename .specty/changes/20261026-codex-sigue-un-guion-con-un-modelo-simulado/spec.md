---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C4
---

# Codex sigue un guion con un modelo simulado

## Objetivo

El guard de Codex, su aviso tras cada comando y su fin de turno solo se prueban con eventos escritos a mano. Una prueba hace que Codex de verdad siga un guion contra un servidor que imita la API de respuestas de OpenAI, con los hooks que escribe `specty init`, como ya hacen Claude Code, OpenCode y Gemini CLI. Sin Codex, la prueba se salta. En la tabla de capacidades, la prueba de extremo a extremo de Codex pasa a «sí».

## Fuera de alcance

- La tarjeta tras compactar: `codex exec` no compacta a petición, y forzarlo pediría otra respuesta simulada para el resumen.
- Cambiar el guard o los hooks de Codex: esta prueba solo los ejercita.

## Supuestos

- A1: Comprobado con Codex 0.164.0 y un modelo simulado el 2026-10-26: `exec_command` llega a los hooks como `Bash` con `tool_input.command` y `tool_use_id`, y la salida 2 de `PreToolUse` bloquea («Command blocked by PreToolUse hook: …»). La salida 2 de `PostToolUse` sustituye la salida del comando por el aviso. `Stop` con `{"decision":"block","reason":…}` manda la razón como un mensaje `<hook_prompt>`, y en la vuelta siguiente `stop_hook_active` es `true`.
  - impacto: alto
- A2: Con `CODEX_HOME` en una carpeta temporal y un proveedor con `wire_api = "responses"`, `base_url` local y una clave falsa, Codex no usa nada de la persona. `-s workspace-write` le deja escribir en el repositorio, y `--dangerously-bypass-hook-trust` le ahorra revisar los hooks; la persona autorizó los dos el 2026-10-26, solo en repositorios desechables y con un modelo falso.
- A3: Codex 0.164 manda los parches como una herramienta `apply_patch` de texto libre, y sus hooks lo reciben en `tool_input.command`.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se ejecuta `pnpm check` en una máquina con Codex ENTONCES una prueba hace que Codex siga un guion con un modelo simulado y comprueba el guard (sin un cambio bloquea código, commits y comandos de la persona con el SIGUIENTE; con una tarea deja pasar sus archivos y para los demás), el aviso de lo que un comando cambió fuera de la tarea y el fin de turno, que le devuelve el turno una vez mientras `specty check --changed` falla; sin Codex, la prueba se salta.
- AC2: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES la prueba de extremo a extremo de Codex está en «sí».

## Diseño

- `test/fake-responses.ts` imita `POST /v1/responses` por streaming. Responde una llamada del guion (`exec_command` o `apply_patch`) por cada resultado de herramienta que trae la conversación, y guarda cada petición.
- `test/codex-e2e.test.ts` busca Codex en `SPECTY_E2E_CODEX` o recorriendo las carpetas del PATH, sin ejecutar nada para encontrarlo, y corre `codex exec --ephemeral -s workspace-write --dangerously-bypass-hook-trust` con un `CODEX_HOME` temporal que confía en el repositorio.

## Archivos

- crear packages/cli/test/fake-responses.ts — el servidor que imita la API de respuestas de OpenAI
- crear packages/cli/test/codex-e2e.test.ts — Codex con un modelo simulado (AC1)
- modificar packages/core/src/capabilities.ts — la prueba de extremo a extremo de Codex
- modificar packages/core/test/capabilities.test.ts — la fila de Codex (AC2)
- modificar docs/ARCHITECTURE.md — la prueba de Codex (§16) y la tabla

## Tareas

- [x] T1: Codex sigue un guion con un modelo simulado
  - files: packages/cli/test/fake-responses.ts, packages/cli/test/codex-e2e.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/codex-e2e.test.ts
- [ ] T2: La tabla de capacidades y la documentación lo cuentan
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: La prueba depende de la forma de la API de respuestas que lee Codex 0.164. Mitigación: se salta sin Codex, y ARCHITECTURE §16 dice con qué versión se comprobó.
- R2: Las dos opciones de Codex saltan controles suyos. Mitigación: solo se usan en repositorios temporales, con un modelo falso y sin la configuración de la persona, y los hooks de Specty siguen decidiendo cada acción.
