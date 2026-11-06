---
kind: standard
epic: 20261106-los-agentes-siempre-esperan-la-decision-de-la
slice: C3
---

# `specty wait` deja su marca y aguanta en cada herramienta

## Objetivo

Hoy nadie sabe si un agente sigue esperando con `specty wait`, y Gemini CLI corta un `wait` que pasa 300 s sin escribir nada. Con este cambio, `specty wait` deja una marca del cambio mientras espera a la persona y la termina con su razón, y una función la lee para que el fin de turno (C2) y después la UI sepan si hay un `wait` vivo o cómo terminó el último. Sin `--timeout`, `wait` decide su duración (una hora, que aguantan todas las herramientas medidas), y en Gemini CLI escribe una línea de latido cada minuto.

## Fuera de alcance

- Leer la marca en el fin de turno o en el guard: es el corte C2.
- El aviso de la UI cuando nadie retoma una decisión de la persona: es el cambio `20261106-la-ui-avisa-cuando-ningun-agente-espera-su`, que no se toca aquí aunque su tarea T1 pide esta misma marca.
- Borrar las marcas de los cambios archivados en `archive` o `prune`: son un archivo pequeño por cambio y se ignoran.
- Cambiar cómo espera cada herramienta (`waitStep`) o la tarjeta de tiempo agotado: son del corte C1.

## Supuestos

- A1: La marca es la del supuesto A6 de la épica, en `.git/common/specty/waits/<id>.json`, visible desde todas las carpetas del clon: `pid`, `tool` si se sabe la herramienta, `since`, `intervalMs` y, además, `timeoutSec`, para que se vea cuánto va a esperar. Al terminar se reescribe con `ended: { at, reason }`, con `decided` o `timeout`. Se escribe entera en un archivo aparte que luego la reemplaza, así que quien la lee nunca la ve a medias. Si dos `wait` esperan el mismo cambio, cuenta el último que escribió, y uno no termina la marca que ya escribió otro.
  - impacto: alto
- A2: Las horas de la marca (`since`, `ended.at`) y la de su archivo son las del reloj real, y la lectura recibe la hora con la que juzgar, como la cola del turno (`store/turn-queue.ts`). Así una marca cortada usa la hora de su archivo como su fin, en la misma escala que las demás.
  - impacto: medio
- A3: Gemini CLI ejecuta los comandos en una pseudoterminal, donde la salida de errores y la normal llegan juntas, así que la línea de latido va por la salida de errores, como la nota de `new` mientras prepara la carpeta, y deja limpia la tarjeta de la salida normal. Solo Gemini CLI la necesita: las demás herramientas no cortan un comando por pasar un rato sin escribir.
  - impacto: medio
- A4: El latido sale cuando la siguiente vuelta pasaría de 60 s sin él, así que nunca hay más de 60 s entre dos líneas. Las pruebas acortan ese plazo con una opción interna de `wait` que commander no ofrece.
  - impacto: bajo
- A5: Un `wait` que falla con un error no termina la marca: su proceso acaba enseguida y la lectura la da por cortada.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `specty wait` espera a la persona ENTONCES existe en `.git/common/specty/waits/<id>.json` una marca viva del cambio con su proceso, su herramienta, cuándo empezó, su intervalo y su tiempo máximo, y la hora del archivo se renueva en cada vuelta. CUANDO nada esperaba a la persona ENTONCES `wait` no deja marca.
- AC2: CUANDO la persona decide mientras `wait` espera ENTONCES la marca termina como `decided` con su hora. CUANDO se agota el tiempo ENTONCES termina como `timeout`. CUANDO la marca no tiene `ended` y su proceso ya no existe, o lleva más de max(30 s, 3 × intervalo) sin renovarse ENTONCES su lectura la da por cortada (`stopped`), con la hora del archivo como su fin. CUANDO no hay marca ENTONCES la lectura no da nada.
- AC3: CUANDO un agente ejecuta `specty wait` sin `--timeout` ENTONCES espera una hora.
- AC4: CUANDO `specty wait` espera a la persona en Gemini CLI ENTONCES escribe una línea de latido, con el cambio y los minutos que lleva, sin que pasen más de 60 s entre dos. CUANDO espera en otra herramienta ENTONCES no la escribe.
- AC5: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- Core, `cards/wait.ts`: la tabla de cómo espera cada herramienta dice también cuál necesita latido (Gemini CLI). `waitHeartbeat(id, waitedSec, timeoutSec, ctx)` da la línea en español o en inglés, o nada si la herramienta del agente no la necesita. Se exporta en `cards/index.ts`.
- CLI, `store/waits.ts`, nuevo, con la forma de `store/turn-queue.ts`: `markWait(git, id, holder)` escribe la marca y devuelve `renew()`, que renueva la hora del archivo, y `end(reason)`, que la termina si sigue siendo suya. `readWait(git, id, now)` da la última marca del cambio: viva, o terminada con su fin y su razón (`decided`, `timeout` o `stopped`). Comprueba si el proceso vive con `alive` de `store/lock.ts`.
- CLI, `commands/wait.ts`: tras ver que el cambio espera a la persona, escribe la marca con `session.tool`, la renueva en cada vuelta y la termina con `decided` o `timeout`. Sin `--timeout`, espera 3600 s, una constante con su motivo. Escribe el latido con `io.err` cuando toca. `commands/agent-commands.ts` quita el valor por defecto de `--timeout`.
- Docs: `waits/<id>.json` en la estructura de `.git/common/specty/` de `docs/formats.md` §1, junto a `messages/`, y la marca y el latido donde `docs/ARCHITECTURE.md` describe `wait`.

## Archivos

- modificar packages/core/src/cards/wait.ts — qué herramienta necesita latido y la línea de latido, en español y en inglés
- modificar packages/core/src/cards/index.ts — exporta `waitHeartbeat`
- modificar packages/core/test/cards/wait.test.ts — la línea de latido en Gemini CLI, en los dos idiomas, y nada en las demás herramientas
- crear packages/cli/src/store/waits.ts — la marca de un `specty wait` que espera a la persona: escribirla, renovarla, terminarla y leerla
- crear packages/cli/test/waits.test.ts — la lectura de la marca: viva, terminada, cortada por proceso muerto o sin renovar, y sin marca
- modificar packages/cli/src/commands/wait.ts — deja la marca mientras espera, la termina con su razón, espera una hora por defecto y escribe el latido
- modificar packages/cli/src/commands/agent-commands.ts — `--timeout` sin valor por defecto en commander
- modificar packages/cli/test/wait.test.ts — la marca de `wait` (viva, `decided`, `timeout`, sin marca), la hora por defecto y el latido
- modificar docs/formats.md — `waits/<id>.json` en la estructura de `.git/common/specty/`
- modificar docs/ARCHITECTURE.md — la marca de `wait`, su duración por defecto y el latido de Gemini CLI

## Tareas

- [x] T1: La línea de latido de Gemini CLI, en español y en inglés
  - files: packages/core/src/cards/wait.ts, packages/core/src/cards/index.ts, packages/core/test/cards/wait.test.ts
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/wait.test.ts
  - type: feat
- [ ] T2: `specty wait` deja su marca y la termina con su razón
  - files: packages/cli/src/store/waits.ts, packages/cli/test/waits.test.ts, packages/cli/src/commands/wait.ts, packages/cli/test/wait.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/waits.test.ts test/wait.test.ts
  - type: feat
- [ ] T3: Sin `--timeout`, `wait` espera una hora y en Gemini CLI escribe su latido
  - files: packages/cli/src/commands/wait.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/test/wait.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/wait.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [ ] T4: La documentación cuenta la marca de `wait` y su latido
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm typecheck && pnpm lint && pnpm sources && pnpm knip
  - type: docs

## Riesgos

- R1: Una marca con un `pid` que el sistema reutilizó tras morir su proceso parecería viva. La hora del archivo sin renovar la da por cortada a los 30 s como mucho (o a los tres intervalos).
- R2: Si Gemini CLI solo contara la salida normal para su límite de 300 s, el latido por la salida de errores no lo evitaría. La red de fin de turno de C2 lo devuelve a esperar igual, y la línea es fácil de mover a la salida normal.
