---
kind: standard
---

# La incorporación nombra los archivos sin commit que la detienen

## Objetivo

Si en la carpeta del cambio hay un archivo sin commit fuera del cierre, como una corrección de `.specty/config.yaml`, y main también lo cambió, git se niega a fusionar main al cerrar o al aceptar. La salida da hoy un genérico «Merge with strategy ort failed» y pide un `git merge main` a mano, que choca con lo mismo (P150, lo que quedó de P133). Con este cambio, la incorporación no empieza: la salida nombra esos archivos, dice quién puede hacer su commit o descartarlos y pide hacerlo y repetir el comando, en español y en inglés.

## Fuera de alcance

- Hacer el commit de esos archivos o descartarlos por la persona: la salida lo pide, no lo hace.
- Otros motivos por los que falla el merge: siguen con la línea de git y el merge a mano.
- La carpeta donde está main con cambios sin commit (el paso 1 de la incorporación), que ya los nombra.
- El guard con la configuración no válida en la carpeta del cambio (P154).

## Supuestos

- A1: La comprobación va justo antes del `git merge` de `mergeTarget`, después del commit del cierre de `close` (`beforeMerge`), así que cubre `close`, `accept` y el reintento de un cambio ya cerrado. Un archivo sin commit es uno con seguimiento distinto de HEAD (en el índice o en la carpeta) o uno sin seguimiento y no ignorado; lo que cambió main sale de `git diff --name-only --no-renames HEAD...<destino>`. Si alguno coincide, el merge no empieza y nada cambia, salvo el commit del cierre si ya se hizo (A2 de `20261105-close-incorpora-main-aunque-el-cierre-toque-lo-2`).
  - impacto: alto
- A2: Los archivos de la persona son los que gestiona Specty y el guard no deja editar al agente (`.specty/`, los hooks de los agentes y los de git), la misma lista del guard, que core exporta como `managedBySpecty`. Si alguno está entre ellos, otra línea dice que solo la persona puede hacer su commit o descartarlos.
- A3: El SIGUIENTE le pide a la persona hacer el commit de esos archivos o descartar sus cambios en la carpeta y repetir el comando; en modo delegado, le pide al agente que se lo pida al usuario, porque el agente no hace commits, y que repita él el comando.
- A4: Los archivos sin commit que main no cambió no detienen nada, como hoy.

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` tiene cambios sin commit en la carpeta del cambio, main también la cambió y la persona ejecuta `close` ENTONCES no se cierra ni empieza el merge (sin `MERGE_HEAD`, con la misma HEAD, el archivo como estaba y el cambio en `closing` sin incorporación pendiente), la salida nombra `.specty/config.yaml` bajo «SIN COMMIT», dice que solo la persona puede hacer su commit o descartar sus cambios, y el SIGUIENTE pide hacerlo y repetir `close`, sin `git merge`; tras descartarlos, `close` cierra y el cambio llega a main.
- AC2: CUANDO un archivo sin seguimiento de la carpeta del cambio coincide con uno que añadió main y la persona ejecuta `accept` ENTONCES no se acepta ni empieza el merge, la salida lo nombra bajo «SIN COMMIT» sin la línea de la persona, y el SIGUIENTE pide hacer su commit o descartarlo y repetir `accept`.
- AC3: CUANDO salen la línea de los archivos, la de la persona y el SIGUIENTE ENTONCES salen en español y en inglés, y en modo delegado el SIGUIENTE le pide al agente que se lo pida al usuario y repita él el comando.

## Diseño

- Core, `guard/spec.ts`: `managedBySpecty(path)`, la lista de `protectedDenial`, que la usa; en la lista de `index.ts`.
- Core, `cards/integration.ts`: `uncommittedOverlapLine(target, lang)`, `personOnlyLine(paths, lang)` y `commitOrDiscardNext(again, ctx)`, en la lista de `cards/index.ts`. El bloque de los archivos usa el título que ya existe, `incorporationTitle("uncommitted")` («SIN COMMIT»).
- CLI, `flow/uncommitted.ts` (nuevo, como `flow/merged-config.ts`): `uncommittedChangedBy(session, target, paths?)` da los archivos sin commit que cambió el destino, dentro de `paths` si se dan; `uncommittedRefusal(session, target, again)` da las líneas, el bloque y el SIGUIENTE, o nada si no hay ninguno.
- CLI, `flow/integrate.ts`: `mergeTarget` llama a `uncommittedRefusal` tras `beforeMerge` y antes del merge, y se niega con ella; `refused` admite varias líneas.
- CLI, `flow/finish.ts`: `commitClosing` usa `uncommittedChangedBy` con las rutas del cierre en lugar de su propia cuenta.
- Docs: ARCHITECTURE §9, paso 2 de la incorporación.

## Archivos

- modificar packages/core/src/guard/spec.ts — `managedBySpecty`, que usa `protectedDenial`
- modificar packages/core/src/index.ts — exportar `managedBySpecty`
- modificar packages/core/src/cards/integration.ts — las líneas y el SIGUIENTE de los archivos sin commit
- modificar packages/core/src/cards/index.ts — exportarlos
- modificar packages/core/test/cards/incorporation.test.ts — los textos en español, en inglés y en modo delegado
- crear packages/cli/src/flow/uncommitted.ts — los archivos sin commit que cambió el destino, y la negativa
- modificar packages/cli/src/flow/integrate.ts — `mergeTarget` se niega antes del merge
- modificar packages/cli/src/flow/finish.ts — `commitClosing` usa la cuenta compartida
- crear packages/cli/test/uncommitted-merge.test.ts — `close` y `accept` con archivos sin commit que main cambió
- modificar docs/ARCHITECTURE.md — la negativa en el paso 2 de la incorporación

## Tareas

- [x] T1: core da los textos de los archivos sin commit y qué gestiona Specty
  - files: packages/core/src/guard/spec.ts, packages/core/src/index.ts, packages/core/src/cards/integration.ts, packages/core/src/cards/index.ts, packages/core/test/cards/incorporation.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/incorporation.test.ts test/guard/decide.test.ts
  - type: fix
- [x] T2: la incorporación se niega y nombra los archivos sin commit que cambió main
  - files: packages/cli/src/flow/uncommitted.ts, packages/cli/src/flow/integrate.ts, packages/cli/src/flow/finish.ts, packages/cli/test/uncommitted-merge.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/uncommitted-merge.test.ts test/close-shared-file.test.ts test/invalid-config-merge.test.ts test/integrate.test.ts && pnpm typecheck
  - type: fix

## Riesgos

- R1: Se niega a un merge que git habría aceptado, como cuando el archivo sin commit ya tiene en el índice lo mismo que trae main — es raro, y la salida dice qué hacer para seguir.

## Cierre

### Resumen

Al cerrar o aceptar, si main cambió archivos que en la carpeta del cambio tienen cambios sin commit (como una corrección de `.specty/config.yaml` o un archivo sin seguimiento que main añadió), el merge ya no empieza para fallar con «Merge with strategy ort failed» y un SIGUIENTE de `git merge main` a mano (P150). `mergeTarget` lo comprueba justo antes del merge con `uncommittedRefusal` (`flow/uncommitted.ts`): nada cambia, la salida nombra esos archivos bajo «SIN COMMIT», dice que solo la persona puede hacer el commit de los que gestiona Specty o descartarlos, y pide hacer su commit o descartar sus cambios y repetir el comando; en modo delegado, le pide al agente que se lo pida al usuario (AC1, AC2). Core da `managedBySpecty`, la lista del guard, y los textos en español y en inglés (AC3). `commitClosing` usa la misma cuenta, `uncommittedChangedBy`. ARCHITECTURE §9 lo documenta en el paso 2 de la incorporación.

### Desviaciones

- Ninguna.

### Decisiones

- Los archivos se comprueban antes del merge con git (`diff --name-only HEAD`, `ls-files --others --exclude-standard` y `diff --name-only --no-renames HEAD...<destino>`), en lugar de leer el error de `git merge`, que cambia con el idioma de git.
- La comprobación va después de `beforeMerge`: si `close` ya hizo el commit del cierre, ese commit queda, como en A2 de `20261105-close-incorpora-main-aunque-el-cierre-toque-lo-2`.
- En modo delegado, el SIGUIENTE pide al agente que se lo pida al usuario para todos los archivos, también los que no gestiona Specty, porque el agente no hace commits y descartar cambios ajenos podría perder trabajo.

### Pendientes

- Ninguno.
