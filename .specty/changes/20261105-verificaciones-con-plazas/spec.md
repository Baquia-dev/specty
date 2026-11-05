---
kind: standard
---

# Las verificaciones del clon comparten plazas por orden de llegada

## Objetivo

Solo la verificación completa espera su turno: las verificaciones de las tareas de varias sesiones corren todas a la vez, cada una con tantos procesos como núcleos, y junto a la completa. Hoy, con siete sesiones, la carga llegó a 40-66 en 14 núcleos, la suite del CLI tardó 599 s en lugar de unos 250, y cuatro verificaciones fallaron por tests que se cortaron por tiempo y pasan solos. Además, `specty integrate` ejecuta la verificación completa sin pedir el turno. Con este cambio, las verificaciones del clon comparten `verify.slots` plazas por orden de llegada: la de una tarea ocupa una, y la completa, todas; y `specty integrate` pide el turno como las demás.

## Fuera de alcance

- Bajar la prioridad de los comandos de verificación (punto 5 del plan, en otro cambio).
- Limitar los procesos que lanza cada verificación (los workers de Vitest, `-j` de make): depende de cada herramienta.
- Los comandos de `specty check` (`checks.commands`) y los de `review`, `git.setup` o `land`: no son verificaciones de una tarea ni la completa.
- Cambiar el turno de la verificación completa (`full-verification.json` y su cola), que sigue igual.

## Supuestos

- A1: Dos plazas por defecto: cada suite ya usa todos los núcleos, así que más de dos a la vez solo reparten la máquina; con una, las tareas de varias sesiones se esperarían demasiado. `verify.slots` lo cambia.
  - impacto: alto
- A2: Las plazas siguen la forma de la cola del turno: quien espera hace cola por orden de llegada en `locks/verify-slots.queue/`, y quien corre deja un archivo con su peso en `locks/verify-slots/`; un archivo cuyo proceso ya no existe no cuenta y se borra, y uno de la cola que lleva 30 s sin renovarse, tampoco.
  - impacto: alto
- A3: Nadie adelanta en la cola: si la primera es una verificación completa que espera a que acaben las de tarea en curso, las de tarea que llegan después esperan tras ella.
- A4: La verificación de la incorporación dentro del turno del cierre también pide sus plazas: el turno solo ordena las verificaciones completas entre sí, y ninguna verificación pide plazas teniendo ya otras.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO las `verify.slots` plazas están ocupadas por verificaciones vivas ENTONCES la verificación de una tarea espera, avisa una vez de quién las ocupa y corre en cuanto se libera una.
- AC2: CUANDO una verificación completa espera plazas ENTONCES espera a que acaben las verificaciones en curso, y una de tarea que llega después espera a que acabe la completa.
- AC3: CUANDO se ejecuta `specty integrate` con una verificación completa configurada ENTONCES espera el turno de otra sesión antes de verificar, como la de `accept`.
- AC4: CUANDO el aviso de espera de una plaza sale ENTONCES dice quién ocupa las plazas y cuántas sesiones esperan delante, en español y en inglés.
- AC5: CUANDO `.specty/config.yaml` da `verify.slots` ENTONCES debe ser un entero de 1 o más, y sin la clave son 2.

## Diseño

- `core/schema/config.ts`: `verify.slots` (entero ≥ 1, 2 por defecto).
- `core/cards/lock.ts`: `verifySlotsWaitNote(running, slots, lang, ahead)`.
- `cli/store/turn-queue.ts`: `joinQueue(git, name, holder)`, con la carpeta de la cola como parámetro; la del turno pasa a usarla.
- `cli/store/verify-slots.ts` (nuevo): `inSlots(session, weight, command, run)` hace cola y, siendo el primero, corre cuando el peso de los archivos vivos de `locks/verify-slots/` más el suyo cabe en `verify.slots` (uno que pide todas cabe cuando no corre nadie); escribe su archivo antes de dejar la cola y lo borra al terminar, también tras un fallo.
- `cli/flow/full-verification.ts`: `oneAtATime` corre dentro de `inSlots` con todas las plazas, también con el turno ya tomado; `flow/live-run.ts`, la verificación de una tarea, con una.
- `cli/commands/integrate.ts`: su verificación pasa por `oneAtATime`.

## Archivos

- modificar packages/core/src/schema/config.ts — `verify.slots`
- modificar packages/core/test/schema/schema.test.ts — AC5
- modificar packages/core/src/cards/lock.ts — el aviso de espera de una plaza
- modificar packages/core/src/cards/index.ts — exportar el aviso
- modificar packages/core/test/cards/lock.test.ts — AC4
- modificar packages/cli/src/store/turn-queue.ts — la cola con su carpeta como parámetro
- crear packages/cli/src/store/verify-slots.ts — las plazas de verificación
- crear packages/cli/src/store/verify-slots.test.ts — AC1 y AC2
- modificar packages/cli/src/flow/full-verification.ts — la completa ocupa todas las plazas
- modificar packages/cli/src/flow/live-run.ts — la de una tarea ocupa una
- modificar packages/cli/src/commands/integrate.ts — su verificación pide el turno
- crear packages/cli/test/integrate-turn.test.ts — AC3
- modificar docs/ARCHITECTURE.md — las plazas
- modificar docs/formats.md — `verify.slots` y las carpetas de las plazas

## Tareas

- [x] T1: verify.slots en la configuración y el aviso de espera de una plaza
  - files: packages/core/src/schema/config.ts, packages/core/test/schema/schema.test.ts, packages/core/src/cards/lock.ts, packages/core/src/cards/index.ts, packages/core/test/cards/lock.test.ts
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema/schema.test.ts test/cards/lock.test.ts && pnpm --filter @baquia-dev/specty-core typecheck
  - type: perf
- [x] T2: Las plazas de verificación del clon, por orden de llegada
  - files: packages/cli/src/store/turn-queue.ts, packages/cli/src/store/verify-slots.ts, packages/cli/src/store/verify-slots.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run src/store/verify-slots.test.ts src/flow/full-verification.test.ts && pnpm --filter @baquia-dev/specty typecheck
  - type: perf
- [x] T3: La verificación de una tarea ocupa una plaza, la completa todas, y la de integrate pide el turno
  - files: packages/cli/src/flow/full-verification.ts, packages/cli/src/flow/live-run.ts, packages/cli/src/commands/integrate.ts, packages/cli/test/integrate-turn.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate-turn.test.ts src/flow/full-verification.test.ts test/accept-turn-time.test.ts test/close-turn.test.ts test/integrate.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: perf
- [x] T4: La documentación de las plazas
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Una verificación de tarea larga hace esperar a las de otras sesiones más que hoy — el aviso dice quién ocupa las plazas, y `verify.slots` las amplía.
- R2: Un proceso que muere con su plaza no la bloquea — su pid deja de existir y el siguiente que mira borra su archivo.
