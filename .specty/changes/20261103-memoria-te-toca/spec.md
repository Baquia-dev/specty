---
kind: standard
follows:
  - 20261103-memoria-tarjeta-de-inicio-2
---

# «TE TOCA» en specty status con los recordatorios de la memoria

## Objetivo

Los recordatorios de la memoria de Specty ya salen en la tarjeta de inicio del agente, pero la persona no los ve en `specty status`, que es su vista de lo que espera. Con este cambio, `status` gana la sección «TE TOCA» con los recordatorios abiertos y cómo marcarlos hechos, como pide el AC7 de la épica. Además, la tarjeta de `status` pasa a su propio archivo, porque `cards/human.ts` ya superaba el aviso de tamaño. Resuelve la entrada P4 de la memoria.

## Fuera de alcance

- Las entradas propuestas para descartar en «TE TOCA»: llegan con `specty memory drop` y su motivo, en el corte C3.
- Los cambios que esperan la decisión de la persona en «TE TOCA»: ya los marca su línea («espera a ti») y el SIGUIENTE de `status`.
- Los recordatorios como datos aparte en `status --json`: la UI de la memoria va en el corte C7.
- Tomar la entrada P4 con `specty new --resolves` y cerrarla con el cambio: llega en el corte C3, así que se cita su id en la petición.
- Las demás entradas abiertas de la memoria (P1–P3, P5–P7) y los cortes C3–C7 de la épica.

## Supuestos

- A1: «TE TOCA» muestra los recordatorios abiertos, es decir, ni hechos ni descartados, por fecha y con el mismo formato que la tarjeta de inicio: su id y la primera línea de su texto, y al final cómo marcarlos hechos con `specty memory done <id>`. Los pendientes, las mejoras y las decisiones no salen en ella.
  - impacto: alto
- A2: Sin recordatorios abiertos, la sección no sale y la tarjeta de `status` queda exactamente como antes de este cambio. Su SIGUIENTE no cambia en ningún caso.
- A3: «TE TOCA» va entre «CAMBIOS ABIERTOS» y «MODO DELEGADO».
- A4: `status` lee la memoria con `readMemory`, como `next`, desde cualquier carpeta del clon. Son tres procesos de git, y `status` es un comando de la persona.
- A5: Trasladar la tarjeta de `status` a `cards/status.ts` no cambia nada de lo que imprime: los tests de `status` que ya existen siguen pasando sin tocarlos.

## Criterios de aceptación

- AC1: CUANDO la memoria tiene recordatorios abiertos ENTONCES `specty status`, desde cualquier carpeta del clon, muestra la sección «TE TOCA» (en inglés, «YOUR TURN») con cada uno, por fecha, y cómo marcarlos hechos con `specty memory done <id>`; y deja de mostrarlos cuando se marcan hechos.
- AC2: CUANDO la memoria no tiene recordatorios abiertos, aunque tenga pendientes, mejoras o decisiones ENTONCES la tarjeta de `specty status` es la de antes de este cambio, sin la sección «TE TOCA».

## Diseño

- Core:
  - `cards/status.ts` recibe de `cards/human.ts`, sin cambios, `StatusEntry`, la salida de `status` con sus datos, `statusCard` y sus funciones auxiliares (la línea de cada cambio, quién lo lleva, hace cuánto y el SIGUIENTE).
  - `statusCard(entries, ctx, memory = [])` gana la memoria leída y añade «TE TOCA» cuando hay recordatorios abiertos.
  - `cards/memory.ts` exporta `reminderLines(entries, ctx)`: los recordatorios abiertos por fecha y la línea para marcarlos hechos, o nada sin recordatorios. La usan la sección «RECORDATORIOS» de la tarjeta de inicio y «TE TOCA».
  - `cards/index.ts` exporta `statusCard` y `StatusEntry` desde `./status`.
- CLI: `commands/status.ts` lee la memoria con `readMemory(session.git, session.config.memory.branch)` y se la pasa a `statusCard`.

## Archivos

- crear packages/core/src/cards/status.ts — la tarjeta de `status`, trasladada desde `human.ts`, con «TE TOCA»
- modificar packages/core/src/cards/human.ts — sale la tarjeta de `status`
- modificar packages/core/src/cards/index.ts — exporta la tarjeta de `status` desde su archivo nuevo
- modificar packages/core/src/cards/memory.ts — las líneas de los recordatorios, compartidas con «TE TOCA»
- modificar packages/cli/src/commands/status.ts — lee la memoria y se la pasa a la tarjeta
- crear packages/core/test/cards/status-turn.test.ts — «TE TOCA» en la tarjeta de `status`, en español y en inglés
- crear packages/cli/test/memory-status.test.ts — `status` con la memoria real, desde otra carpeta
- modificar docs/ARCHITECTURE.md — `status` muestra «TE TOCA» con los recordatorios

## Tareas

- [x] T1: La tarjeta de `status` en su propio archivo, con «TE TOCA»
  - files: packages/core/src/cards/status.ts, packages/core/src/cards/human.ts, packages/core/src/cards/index.ts, packages/core/src/cards/memory.ts, packages/core/test/cards/status-turn.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/status-turn.test.ts test/cards/status-holder.test.ts test/cards/memory-start.test.ts test/cards/delegated.test.ts test/cards/testing.test.ts test/cards.test.ts && pnpm typecheck && pnpm lint
- [x] T2: `status` lee la memoria, y la documentación
  - files: packages/cli/src/commands/status.ts, packages/cli/test/memory-status.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-status.test.ts test/status-json.test.ts test/memory-start.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Leer la memoria frena `status`, que la extensión de VS Code ejecuta con `--json` — son tres procesos de git sea cual sea el número de entradas, los mismos que ya paga `next` sin cambio activo.
- R2: El traslado rompe una importación de la tarjeta de `status` en otro paquete — la CLI y los tests la importan desde el índice de core, que sigue exportándola.
