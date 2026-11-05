---
kind: standard
epic: 20261105-pendientes-de-las-unidades
slice: C9
---

# La verificación fresca se ve en vivo y desde MCP

## Objetivo

Hoy `specty verify --fresh` corre a ciegas: la UI y la MCP App no ven nada hasta que termina, y un cliente MCP no puede pedirla. Con este cambio, en la carpeta de un cambio abierto, cada intento de cada unidad es la verificación en curso de ese cambio, y la UI y la MCP App la ven en vivo como la de `accept`. Además, el servidor MCP tiene la herramienta `specty_verify`, que la ejecuta y devuelve su tarjeta. Es el corte C9 de la épica `20261105-pendientes-de-las-unidades` (AC11, AC12 y AC13 de la épica).

## Fuera de alcance

- Mostrar en vivo la verificación fresca de una carpeta sin un cambio abierto, como la principal: la UI y la MCP App muestran la verificación de un cambio.
- Anotar su resultado en la auditoría del cambio (`change.verified`), o cambiar su tarjeta, el registro de unidades o lo que deja en la memoria.
- Cambiar la UI o la vista de la MCP App: ya muestran una verificación en curso sin tarea como la completa, en la sección «Verificación completa» de Aceptación.

## Supuestos

- A1: Solo hay dónde verla en la carpeta de un cambio abierto, el mismo que la verificación fresca ya toma como origen de lo que deja en la memoria. Allí, cada intento escribe la verificación en curso de ese cambio (`runs/<cambio>.json`), sin tarea, como la verificación completa de `accept`. Sin un cambio abierto en la carpeta, corre como hoy.
  - impacto: alto
- A2: Cada intento es una ejecución en vivo propia (`runLive` con `held`, porque la verificación fresca ya tiene el turno y todas las plazas), con el comando de la unidad y su salida según llega. Entre dos unidades, o entre los dos intentos de una, el archivo desaparece y vuelve, como entre las unidades de `accept`. Al terminar no queda ninguno.
  - impacto: alto
- A3: `specty_verify` no tiene más argumento que `folder`. Ejecuta `specty verify --fresh` en esa carpeta y devuelve su tarjeta, con `isError` si sale con 1, como las demás herramientas. Va tras `specty_check` en la lista. Con MCP Apps enlaza con la vista del cambio, a diferencia de `specty_check`, porque en la carpeta de un cambio la vista muestra su verificación en curso; sin cambio, la vista dice que no hay ninguno abierto.
  - impacto: alto
- A4: No hay textos nuevos para la persona: la tarjeta de la verificación fresca no cambia, y la descripción de `specty_verify` va en inglés, como la de las demás herramientas. El AC13 de la épica no pide nada en este corte.
- A5: Una verificación fresca larga puede pasar del tiempo que un cliente MCP espera a una herramienta. Si el cliente corta la llamada, la verificación sigue, como las de `task done` y `accept` (ARCHITECTURE §6).

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty verify --fresh` en la carpeta de un cambio abierto ENTONCES, mientras corre cada intento de cada unidad, la verificación en curso de ese cambio es la completa, sin tarea, con el comando de esa unidad y su salida según llega, y al terminar no queda ninguna.
- AC2: CUANDO se ejecuta `specty verify --fresh` en una carpeta sin un cambio abierto ENTONCES corre como antes y no deja ninguna verificación en curso.
- AC3: CUANDO la vista de la MCP App lee el cambio de la carpeta mientras `specty verify --fresh` corre en ella ENTONCES recibe esa verificación en curso y, cuando termina, ya no.
- AC4: CUANDO un cliente MCP llama a `specty_verify` ENTONCES se ejecuta `specty verify --fresh` en la carpeta de la llamada y la herramienta devuelve su tarjeta, con `isError` si alguna unidad falló dos veces.
- AC5: CUANDO el cliente MCP declara MCP Apps ENTONCES `specty_verify` enlaza con la vista del cambio, como las demás herramientas de un cambio.

## Diseño

- CLI: en `commands/verify.ts`, `attempt` recibe el cambio abierto de la carpeta, que `verify` ya calcula. Con él, corre el comando de la unidad con `runLive(session, change, undefined, command, { held: true })`, que escribe y borra el archivo de la verificación en curso. Sin él, lo corre con `execute`, como hoy. Las opciones de la ejecución (la carpeta, la shell, el entorno, `verify.timeoutSec` y la prioridad baja) son las mismas en los dos casos.
- MCP: `mcp/tools.ts` añade `specty_verify` tras `specty_check`, sin argumentos propios, con la línea `verify --fresh`.
- Docs: ARCHITECTURE §6 (la fila de `verify --fresh` y la lista de herramientas MCP) y §15 (las verificaciones en vivo), y docs/ui.md (la sección «Verificación completa» también muestra la fresca).

## Archivos

- modificar packages/cli/src/commands/verify.ts — cada intento corre en vivo en la carpeta de un cambio abierto
- modificar packages/cli/test/verify-fresh.test.ts — la verificación fresca en vivo, con y sin un cambio abierto
- modificar packages/cli/src/mcp/tools.ts — la herramienta `specty_verify`
- modificar packages/cli/test/mcp.test.ts — `specty_verify` en la lista y su llamada
- modificar packages/cli/test/mcp-app.test.ts — `specty_verify` enlaza con la vista, y la vista ve la verificación fresca en vivo
- modificar docs/ARCHITECTURE.md — la verificación fresca en vivo y la herramienta `specty_verify`
- modificar docs/ui.md — la sección «Verificación completa» también muestra la verificación fresca

## Tareas

- [x] T1: La verificación fresca corre en vivo en la carpeta de un cambio abierto
  - files: packages/cli/src/commands/verify.ts, packages/cli/test/verify-fresh.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/verify-fresh.test.ts test/live-run.test.ts
  - type: feat
- [x] T2: La herramienta specty_verify del servidor MCP
  - files: packages/cli/src/mcp/tools.ts, packages/cli/test/mcp.test.ts, packages/cli/test/mcp-app.test.ts
  - ac: AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/mcp.test.ts test/mcp-app.test.ts test/verify-fresh.test.ts && pnpm typecheck && pnpm lint && pnpm knip && pnpm sources
  - type: feat
- [x] T3: La documentación de la verificación fresca en vivo y de specty_verify
  - files: docs/ARCHITECTURE.md, docs/ui.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: La verificación fresca podría pisar el archivo en vivo de otra verificación del mismo cambio — corre en el turno de la verificación completa y con todas las plazas del clon, así que ni la de una tarea ni otra completa corren a la vez.
- R2: Los tests en vivo dependen del tiempo — cada unidad de prueba espera unos segundos mientras el test mira la verificación en curso, con un plazo amplio, como `live-run.test.ts`.

## Cierre

### Resumen

En la carpeta de un cambio abierto, `specty verify --fresh` corre cada intento de cada unidad como la verificación completa en curso de ese cambio (`runLive` con `held`, porque ya tiene el turno y todas las plazas). Lleva el comando de la unidad y su salida según llega, y el archivo se borra al terminar cada intento, así que la UI y la vista de la MCP App la ven en vivo en «Verificación completa», como la de `accept`. Sin un cambio abierto en la carpeta corre como antes, con `execute`. El servidor MCP tiene `specty_verify`, tras `specty_check`: ejecuta `specty verify --fresh` en la carpeta de la llamada y devuelve su tarjeta, con `isError` si alguna unidad falló dos veces. Con MCP Apps enlaza con la vista del cambio. ARCHITECTURE §6 y §15 y docs/ui.md lo describen.

### Desviaciones

- Ninguna.

### Decisiones

- La llamada a `execute` con la shell solo cambió de sitio dentro de `attempt` (el aviso CWE-78 de `verify.ts`): es la misma de antes, para la carpeta sin cambio abierto.
- El resultado de la verificación fresca no va a la auditoría del cambio: al terminar, la sección «Verificación completa» vuelve a mostrar el último resultado que tenía.
- No hubo textos nuevos para la persona: la descripción de `specty_verify` va en inglés, como la de las demás herramientas.

### Pendientes

- Ninguno.
