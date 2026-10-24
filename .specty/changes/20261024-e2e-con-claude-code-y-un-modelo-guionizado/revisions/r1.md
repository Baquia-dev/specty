---
kind: standard
---

# E2E con Claude Code y un modelo guionizado

## Objetivo

Una prueba de punta a punta con el agente real: Claude Code en modo headless habla con un servidor local que imita la API de Messages y responde una secuencia fija de llamadas a herramientas, en un repositorio preparado con `specty init`. La prueba comprueba lo que Claude Code devuelve al modelo: que los hooks de Specty corren de verdad, bloquean lo que deben con un SIGUIENTE válido y dejan pasar lo que está en el alcance. Es gratis, determinista y no necesita red; habría detectado los hooks del legacy que «probablemente nunca corrieron» (ARCHITECTURE §17).

## Fuera de alcance

- Codex y OpenCode: no están instalados en esta máquina; el mismo servidor falso, con la API compatible con OpenAI, irá en otro cambio.
- Medir latencias o fricción con el agente real: lo cubre el recorrido del cambio anterior.
- Instalar Claude Code: si no está, la prueba se salta y lo dice.

## Supuestos

- A1: La prueba busca Claude Code en `SPECTY_E2E_CLAUDE`, luego en el PATH y luego en las extensiones de VS Code, Cursor, Windsurf y Antigravity (`anthropic.claude-code-*/resources/native-binary/claude`), la versión más reciente; si no lo encuentra, se salta. La variable solo dice dónde está el binario: no concede nada.
  - impacto: alto
- A2: Claude Code corre aislado: `CLAUDE_CONFIG_DIR` y `HOME` temporales, una clave falsa, `ANTHROPIC_BASE_URL` al servidor local, `--setting-sources project`, `--strict-mcp-config`, solo las herramientas Write y Bash, y sin tráfico no esencial. Si no llegara al servidor, la prueba falla en vez de hablar con la API real, que rechazaría la clave falsa.
  - impacto: alto
- A3: Claude Code exige leer un archivo antes de sobrescribirlo, y lo comprueba antes de los hooks; por eso el guion escribe archivos nuevos.
- A4: Un hook que bloquea llega al modelo como un `tool_result` con `is_error` y el texto del guard, que incluye su SIGUIENTE.

## Criterios de aceptación

- AC1: CUANDO el modelo guionizado pide, sin un cambio activo, escribir código gobernado, hacer `git commit` con código gobernado sin commit y ejecutar `specty approve` ENTONCES Claude Code le devuelve tres errores del guard de Specty, cada uno con una línea SIGUIENTE cuyos comandos existen, y el repositorio no gana commits ni el archivo nuevo.
- AC2: CUANDO hay una tarea activa y el modelo pide escribir un archivo de su alcance y otro fuera de él ENTONCES el primero se escribe y el segundo llega como error del guard con `specty scope add` en su SIGUIENTE.
- AC3: CUANDO Claude Code no está instalado ENTONCES la prueba se salta con un motivo visible, y CUANDO no llama al servidor falso ENTONCES falla.
- AC4: CUANDO alguien lee ARCHITECTURE §16 ENTONCES encuentra la prueba con el modelo guionizado, cómo encuentra Claude Code y cómo lo aísla.

## Diseño

- `test/fake-model.ts`: un servidor `node:http` en 127.0.0.1 que responde a `POST /v1/messages` con la siguiente llamada del guion (por SSE si la petición es en streaming), cuenta los `tool_result` que ya trae la conversación para saber por dónde va y guarda cada petición; al acabar el guion responde texto con `end_turn`. `count_tokens` y lo demás reciben respuestas mínimas.
- `test/agent-e2e.test.ts`: encuentra Claude Code, prepara el repositorio con `specty init` (hooks con la ruta del bundle construido), arranca el servidor, ejecuta `claude -p` con el entorno aislado y comprueba los `tool_result` que recibió el servidor y el estado del repositorio.

## Archivos

- crear packages/cli/test/fake-model.ts — la API de Messages falsa que sirve un guion de herramientas
- crear packages/cli/test/agent-e2e.test.ts — Claude Code headless con el modelo guionizado
- modificar docs/ARCHITECTURE.md — §16: la prueba con el modelo guionizado

## Tareas

- [ ] T1: El modelo guionizado
  - files: packages/cli/test/fake-model.ts, packages/cli/test/agent-e2e.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/agent-e2e.test.ts
  - type: test
- [ ] T2: Documentar la prueba con el agente real
  - files: docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm check
  - type: docs
