---
kind: standard
---

# La petición literal del usuario con new --request

## Objetivo

`specty new "<título>" --request "<petición literal>"` guarda la petición del usuario tal como la escribió, en la entrada `change.created` de la auditoría, y la tarjeta del borrador se la muestra al agente mientras redacta la spec. Hoy la spec solo guarda la paráfrasis del agente, y lo que el usuario pidió de verdad se pierde: en gentle-ai, las paráfrasis fallaron 13 de 26 comprobaciones ocultas, y pasar la petición literal fue su arreglo.

## Fuera de alcance

- Mostrar la petición en la UI junto al Objetivo: es el punto A6 de la sesión de la UI, que la lee de la auditoría que ya sirve `/api/changes`.
- Capturar la petición con un hook `UserPromptSubmit` de Claude Code, sin depender del agente.
- Leer la petición de la entrada estándar.

## Supuestos

- A1: `--request` es opcional: sin él, `new` funciona como hoy. La tarjeta que indica cómo crear un cambio lo pide siempre, porque es lo que lee el agente al empezar.
  - impacto: medio
- A2: La petición vive solo en la auditoría (`change.created.request`), que es de solo añadir y el agente no puede editar; no va a `state.json` ni a la spec, que el agente sí redacta.
  - impacto: medio
- A3: Solo la tarjeta del borrador muestra la petición; las de las tareas no, para no alargar cada tarjeta.
- A4: El texto se guarda tal cual, sin más recorte que los espacios de los extremos y sin límite de longitud; una petición vacía es un error de uso.

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `specty new "<título>" --request "<texto>"`, también con `--worktree`, ENTONCES la entrada `change.created` de `audit.jsonl` guarda `request` con el texto tal cual, saltos de línea incluidos.
- AC2: CUANDO el cambio está en borrador y tiene petición ENTONCES `specty next` la muestra en un bloque «PETICIÓN DEL USUARIO» antes de la guía de redacción, y sin petición el bloque no aparece.
- AC3: CUANDO no hay un cambio activo ENTONCES el SIGUIENTE de `specty next` es `specty new "<título>" --request "<petición literal del usuario>"`, en español y en inglés.
- AC4: CUANDO `--request` llega vacío ENTONCES `new` no crea nada, sale con código 1 y explica que falta el texto.
- AC5: CUANDO alguien lee formats.md y ARCHITECTURE ENTONCES encuentra `request` en `change.created` y la opción en la tabla de comandos.

## Diseño

- Core: `ChangeView.request` y un bloque en la tarjeta del borrador; el SIGUIENTE de la tarjeta sin cambio nombra `--request`.
- CLI: la opción en `program.ts`; `NewOptions.request`, comprobada antes de crear nada, y añadida a la entrada `change.created`; `changeView` la lee de la auditoría solo en borrador, con el mismo lector que ya usan los comentarios pedidos.

## Archivos

- modificar packages/core/src/cards/view.ts — `ChangeView.request`
- modificar packages/core/src/cards/next.ts — la petición en la tarjeta del borrador y `--request` en la de sin cambio
- modificar packages/core/test/cards.test.ts — las dos tarjetas
- modificar packages/cli/src/program.ts — la opción `--request`
- modificar packages/cli/src/commands/new.ts — guardar la petición en `change.created`
- modificar packages/cli/src/flow/views.ts — leer la petición de la auditoría
- crear packages/cli/test/request.test.ts — `new --request` de punta a punta
- modificar docs/formats.md — §4: `request` en `change.created`
- modificar docs/ARCHITECTURE.md — la tabla de comandos

## Tareas

- [x] T1: La petición en las tarjetas
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/next.ts, packages/core/test/cards.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts
- [x] T2: new --request guarda la petición
  - files: packages/cli/src/program.ts, packages/cli/src/commands/new.ts, packages/cli/src/flow/views.ts, packages/cli/test/request.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/request.test.ts
- [ ] T3: Documentar la petición literal
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm check
  - type: docs
