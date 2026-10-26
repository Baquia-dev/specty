---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C7
---

# OpenCode sigue un guion con un modelo simulado

## Objetivo

Claude Code tiene una prueba que lo ejecuta de verdad contra un modelo simulado y comprueba qué le devuelve Specty. OpenCode pasa a tener la suya: OpenCode real, con el plugin que escribe `specty init` y un servidor local que imita la API de chat de OpenAI con un guion de llamadas a herramientas. Cubre el guard, el aviso tras un comando, la tarjeta tras compactar y el fin de turno. Sin OpenCode instalado, la prueba se salta, como la de Claude Code. En la tabla de capacidades, la prueba de extremo a extremo de OpenCode pasa a «sí».

## Fuera de alcance

- OpenCode 2, que aún no tiene versión publicada.
- Cambiar el código de Specty: este corte solo añade la prueba y su servidor.
- Ejecutarla en el CI, donde no hay OpenCode.

## Supuestos

- A1: Comprobado el 2026-10-26 con OpenCode 1.19.4: un proveedor `@ai-sdk/openai-compatible` con `baseURL` al servidor local y una clave falsa basta para que OpenCode le hable por streaming de chat completions; sus herramientas `write`, `bash` y `read` llegan como `tool_calls`, y sus resultados vuelven como mensajes `tool`. OpenCode instala ese paquete en su caché la primera vez.
  - impacto: alto
- A2: `opencode run` vale para el guard y el aviso; el fin de turno y la compactación necesitan `opencode serve` manejado por HTTP (`POST /session`, `/session/<id>/message` y `/session/<id>/summarize`), porque `opencode run` termina al quedar inactiva la sesión.
- A3: La configuración de OpenCode puede ir en su carpeta global aislada (`XDG_CONFIG_HOME`), sin tocar el `opencode.json` del repositorio de la prueba.

## Criterios de aceptación

- AC1: CUANDO OpenCode, sin cambio activo, intenta escribir código gobernado, hacer `git commit` y ejecutar `specty approve` ENTONCES cada herramienta vuelve con el motivo del guard y su SIGUIENTE, y el repositorio no cambia.
- AC2: CUANDO OpenCode, con una tarea activa, escribe un archivo de su alcance y otro de fuera ENTONCES el primero se escribe y el segundo vuelve con `specty scope add`.
- AC3: CUANDO un comando de OpenCode cambia un archivo fuera de la tarea por un camino que el análisis de shell no prevé ENTONCES su resultado trae el aviso del guard.
- AC4: CUANDO OpenCode compacta la sesión de un cambio ENTONCES la siguiente petición al modelo trae la tarjeta de la tarea.
- AC5: CUANDO, con el fin de turno que activa `check --install`, OpenCode termina un turno y `specty check --changed` falla ENTONCES el modelo recibe el informe como mensaje y, tras ese turno, la sesión puede terminar.
- AC6: CUANDO OpenCode no está instalado ENTONCES la prueba se salta; y la tabla de capacidades marca su prueba de extremo a extremo con «sí».

## Diseño

- `fake-chat.ts`: el servidor de la API de chat de OpenAI, con streaming. Responde a cada petición con herramientas la siguiente llamada del guion, contando los mensajes `tool` que trae, y con un texto cuando el guion se acaba. Guarda cada petición para la prueba.
- `opencode-e2e.test.ts`: busca OpenCode en `SPECTY_E2E_OPENCODE` o en el PATH. Prepara el repositorio con `specty init --tools opencode` y aísla OpenCode con `HOME` y `XDG_*` temporales, aunque su caché de paquetes se comparte entre pruebas para no descargarlo cada vez. Usa `opencode run` para AC1 a AC3, y `opencode serve`, en un puerto libre, para AC4 y AC5.

## Archivos

- crear packages/cli/test/fake-chat.ts — el modelo simulado con la API de chat de OpenAI
- crear packages/cli/test/opencode-e2e.test.ts — OpenCode de verdad con un guion (AC1 a AC6)
- modificar packages/core/src/capabilities.ts — la prueba de extremo a extremo de OpenCode pasa a «sí»
- modificar packages/core/test/capabilities.test.ts — la fila de OpenCode cambia (AC6)
- modificar docs/ARCHITECTURE.md — la prueba de OpenCode junto a la de Claude Code (§16) y la tabla
- modificar knip.json — `opencode` es una herramienta externa y opcional de la prueba, no una dependencia

## Tareas

- [x] T1: OpenCode sigue un guion contra un modelo simulado
  - files: packages/cli/test/fake-chat.ts, packages/cli/test/opencode-e2e.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode-e2e.test.ts
  - type: test
- [x] T2: La tabla de capacidades y ARCHITECTURE la cuentan
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts
- [x] T3: knip no toma OpenCode por una dependencia que falta
  - files: knip.json
  - ac: AC6
  - verify: pnpm knip
  - type: fix

## Riesgos

- R1: La primera ejecución descarga `@ai-sdk/openai-compatible` y tarda. Mitigación: la caché compartida en la carpeta temporal del sistema, y un tiempo límite amplio por prueba.
- R2: Una versión nueva de OpenCode cambia su API de servidor y la prueba falla sin que Specty haya cambiado. Mitigación: la prueba solo corre donde OpenCode está instalado, y su fallo nombra la versión.
