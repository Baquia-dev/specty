---
kind: standard
epic: 20261105-verificacion-por-unidades
slice: C1
---

# La verificación completa de accept ejecuta solo las unidades que no pasaron ya

## Objetivo

Hoy la verificación completa de `accept` es un solo comando (`verify.full`), que corre entero aunque el cambio solo toque una parte del código, y nada recuerda de un cambio a otro qué partes ya pasaron con el mismo código. Con este cambio, `.specty/config.yaml` puede dividirla en unidades (`verify.units`), cada una con su comando y los archivos de los que depende. Un registro del clon recuerda las que pasaron con cada huella, y `accept` solo ejecuta las que faltan. Es el corte C1 de la épica `20261105-verificacion-por-unidades` (AC1, AC2, AC3, AC4 y AC10 de la épica).

## Fuera de alcance

- La incorporación de main, `specty integrate` y la verificación completa de la UI siguen ejecutando `verify.full`: es el corte C2.
- Configurar las unidades de este repositorio: es el corte C3.
- `specty verify --fresh` y los tests inestables (corte C4), y el aviso de los tests lentos (corte C5).
- Borrar archivos viejos del registro.
- Detectar las unidades solas, ejecutar varias a la vez o elegir tests sueltos, como dice la épica.

## Supuestos

- A1: Una unidad es `{ name, command, paths }` en `verify.units`, como en la épica. La lista necesita al menos una unidad, `name` no se repite, y `command` y cada glob de `paths` no están vacíos. Con unidades, la verificación completa de `accept` son las unidades aunque falte `verify.full`, que queda para el CI.
  - impacto: alto
- A2: La huella de una unidad es el hash de su comando y de las entradas de `git ls-tree -r` del árbol de trabajo (modo, blob y ruta) que casan con sus `paths`, sin `.specty/`, también lo que aún no está en un commit. Se toma con `treeWith`, como `codeTree`, y una sola lectura del árbol sirve para todas las unidades.
  - impacto: alto
- A3: El registro es `.git/common/specty/verified/<huella sin el prefijo sha256:>.json`, con `{ unit, command, change, at, ms }`, escrito de forma atómica solo cuando la unidad pasa. Una unidad se reutiliza si existe el archivo de su huella. En este corte los archivos no se borran.
  - impacto: alto
- A4: `accept` calcula las huellas antes de preguntar. Si todas las unidades ya pasaron, no pregunta ni toma el turno, su nota dice que no se repite ninguna y no anota `change.verified`, como hoy cuando la verificación ya pasó con este código. Si falta alguna, pregunta por las que faltan (sus comandos unidos con ` && `) y las ejecuta en orden en un solo turno con todas las plazas, mirando otra vez el registro antes de cada una, porque otra sesión pudo pasarla mientras esta esperaba.
  - impacto: alto
- A5: Con unidades, el comando de la verificación completa que usan `passedOnThisCode`, la nota de un cambio sin código y el `cmd` de `change.verified` son los comandos de todas las unidades unidos con ` && `. `change.verified` añade `units`: `reused`, `passed` (`{ name, ms }`), `failed` si una falló, y `skipped`, las que no corrieron tras el fallo. Su salida es la de la última unidad que corrió (la que falló, si falla una), y la tarjeta del modo delegado nombra el comando de la que falló.
- A6: Cada unidad corre en vivo como hoy la verificación completa (`runLive` y su archivo de `runs/` para la UI), pero sin pedir otra vez el turno ni las plazas, que ya tiene la verificación completa. El tiempo de `change.verified` cuenta desde el turno.
- A7: Hasta el corte C2, la incorporación de main dentro de `accept` sigue verificando con `verify.full`, y su `change.verified` no evita las unidades: si main avanzó, en este corte corren las dos.

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` da `verify.units` ENTONCES cada unidad necesita un `name` único, un `command` y unos `paths` no vacíos, y la verificación completa de `accept` ejecuta sus unidades en orden en lugar de `verify.full`.
- AC2: CUANDO una unidad ya pasó con la misma huella, en este cambio o en otro del clon ENTONCES la verificación completa de `accept` no la ejecuta y su nota dice qué unidades reutilizó y cuáles ejecutó; si ya pasaron todas, no pregunta y dice que no se repite ninguna.
- AC3: CUANDO cambia un archivo que casa con los `paths` de una unidad, o su comando ENTONCES esa unidad vuelve a correr y las demás no.
- AC4: CUANDO una unidad falla ENTONCES la verificación completa falla con su salida, no ejecuta las siguientes, su nota dice cuál falló y cuáles no corrieron, y el registro no anota la que falló.
- AC5: CUANDO salen las notas de las unidades ENTONCES salen en español y en inglés.

## Diseño

- Core: `verify.units` en `schema/config.ts`, con el tipo `VerifyUnit` en la API pública (`index.ts`). `cards/units.ts` (nuevo) da `unitsLines(outcome, lang)`, las líneas de lo que hicieron las unidades, y `unitsReusedNote(names, lang)`, la nota cuando ya pasaron todas, con el tipo `UnitsOutcome`. `duration` de `cards/audit.ts` se exporta para mostrar el tiempo de cada unidad.
- CLI: `flow/units.ts` (nuevo). `fullPlan(session)` da la verificación completa que toca: su comando o, con unidades, las que faltan y las reutilizadas. `runFull(session, change, plan, onStart)` ejecuta el comando o las unidades que faltan en un turno, y anota en el registro las que pasan. En `flow/verified.ts`, `codeTree` y las huellas comparten la lectura del árbol, y `FullRun` lleva `units`. En `flow/live-run.ts`, `runLive` recibe `{ onStart, held }`: con `held` no pide turno ni plazas. `commands/accept.ts` usa `fullPlan` y `runFull`.
- Docs: ARCHITECTURE §9 (las unidades y el registro); formats.md §1 (`verified/`), §4 (`units` en `change.verified`) y §6 (`verify.units`).

## Archivos

- modificar packages/core/src/schema/config.ts — `verify.units`
- modificar packages/core/src/index.ts — exportar `VerifyUnit`
- crear packages/core/test/schema/units.test.ts — la configuración de las unidades
- crear packages/core/src/cards/units.ts — las notas de las unidades, en español y en inglés
- modificar packages/core/src/cards/index.ts — exportar las notas
- modificar packages/core/src/cards/audit.ts — exportar `duration`
- crear packages/core/test/cards/units.test.ts — los textos de las notas
- crear packages/cli/src/flow/units.ts — huellas, registro y ejecución de las unidades
- modificar packages/cli/src/flow/verified.ts — la lectura del árbol compartida y `units` en `change.verified`
- modificar packages/cli/src/flow/live-run.ts — correr dentro de una verificación completa que ya tiene turno y plazas
- modificar packages/cli/src/commands/accept.ts — la verificación completa por unidades
- crear packages/cli/test/accept-units.test.ts — `accept` con unidades, de punta a punta
- modificar docs/ARCHITECTURE.md — las unidades y el registro
- modificar docs/formats.md — `verified/`, `units` en `change.verified` y `verify.units`

## Tareas

- [x] T1: verify.units en la configuración
  - files: packages/core/src/schema/config.ts, packages/core/src/index.ts, packages/core/test/schema/units.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema/units.test.ts test/schema/schema.test.ts
  - type: feat
- [x] T2: Las notas de las unidades
  - files: packages/core/src/cards/units.ts, packages/core/src/cards/index.ts, packages/core/src/cards/audit.ts, packages/core/test/cards/units.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/units.test.ts test/cards/audit.test.ts && pnpm --filter @baquia-dev/specty-core typecheck
  - type: feat
- [x] T3: accept ejecuta solo las unidades que no pasaron ya
  - files: packages/cli/src/flow/units.ts, packages/cli/src/flow/verified.ts, packages/cli/src/flow/live-run.ts, packages/cli/src/commands/accept.ts, packages/cli/test/accept-units.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/accept-units.test.ts test/reuse.test.ts test/accept-turn-time.test.ts test/accept-live.test.ts test/accept-coverage.test.ts test/live-run.test.ts test/unverified.test.ts && pnpm typecheck && pnpm lint && pnpm knip && pnpm sources
  - type: feat
- [x] T4: La documentación de las unidades y el registro
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Unos `paths` que no cubren lo que lee una unidad saltan tests que debían correr — es responsabilidad de quien los escribe (A4 de la épica); `specty verify --fresh` (corte C4) y el CI lo ejecutan todo.
- R2: El registro crece con cada unidad que pasa — es un archivo pequeño por huella; borrar los viejos queda como pendiente.
