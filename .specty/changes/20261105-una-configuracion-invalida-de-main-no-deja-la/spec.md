---
kind: standard
epic: 20261105-pendientes-de-las-unidades
slice: C6
---

# Una configuración inválida de main no deja la carpeta sin salida

## Objetivo

Una `.specty/config.yaml` inválida en main (una coma de más en `git.branchPerChange`) entró por el merge de `accept` en dos carpetas de cambio y las dejó sin Specty: `next`, `enter` y `propose` fallaban al leerla, y `next` pedía al agente corregirla, pero el guard no le deja editarla (P130, P131). Con este cambio, `accept` y `close` validan la configuración justo después de incorporar main: si no es válida, deshacen el merge, la carpeta sigue como estaba y la salida pide a la persona corregirla en main. Y si la configuración de una carpeta ya no es válida, `specty next` le dice al agente que la corrige la persona, con el error. Es el corte C6 de la épica `20261105-pendientes-de-las-unidades` (AC7, AC8 y AC13 de la épica).

## Fuera de alcance

- Que el guard reconozca la carpeta del cambio mientras su configuración no es válida (P131): con la configuración corregida, la reconoce de nuevo.
- Tomar la configuración de main, o de otra carpeta, cuando la de la carpeta no es válida.
- Validar la configuración en `specty integrate` o tras un merge a mano.
- Los archivos sin commit fuera del cierre que detienen el merge de `close` (P150).
- Reparar las carpetas que ya quedaron con una configuración inválida: la persona la corrige en esa carpeta.

## Supuestos

- A1: La validación ocurre en la incorporación (`mergeTarget`), justo después de `git merge --no-ff --no-commit` y antes de mirar los conflictos y de verificar. Lee `.specty/config.yaml` de la carpeta del cambio con el mismo cargador que los comandos. Si no es válida, también cuando el merge se detuvo con conflictos o cuando la propia configuración tiene marcadores de conflicto, aborta el merge con `git merge --abort` y nada cambia: ni la fase, ni la rama, ni `state.integration`.
  - impacto: alto
- A2: El merge se aborta también en un cambio abierto, aunque un merge con conflictos quedaría para el agente: con la configuración inválida en su carpeta, ni `specty next` ni el guard podrían leerla, y el agente no puede editarla.
- A3: La salida empieza como cualquier incorporación rechazada («No se aceptó y nada cambió.»), da el error de la configuración y pide corregir `.specty/config.yaml` en la rama destino y repetir el mismo comando. En modo delegado, quien lo lee es el agente: le dice que la corrige la persona, porque el guard no le deja editarla, y que se lo pida con el error.
- A4: Una carpeta con la configuración inválida distingue quién ejecuta el comando como el resto de Specty: sin terminal interactiva es un agente, y la salida le dice que la persona corrige `.specty/config.yaml` en esa carpeta, porque el guard no le deja editarla, y que se lo pida con el error. Con terminal interactiva, sigue pidiendo «corrige .specty/config.yaml». El código de salida no cambia.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO la persona ejecuta `accept` y la incorporación de main trae un `.specty/config.yaml` inválido ENTONCES no queda merge en curso, el cambio sigue en aceptación con la configuración que tenía, `specty next` funciona en su carpeta y la salida da el error y pide corregirla en main y repetir `accept`.
- AC2: CUANDO la persona ejecuta `close` y la incorporación de main trae un `.specty/config.yaml` inválido ENTONCES no queda merge en curso, el cambio sigue en cierre con la configuración que tenía, `specty next` funciona en su carpeta y la salida da el error y pide corregirla en main y repetir `close`.
- AC3: CUANDO un agente ejecuta `specty next` en una carpeta cuya configuración no es válida ENTONCES la salida da el error y dice que la corrige la persona, porque el guard no le deja editarla; a una persona le sigue pidiendo que la corrija.
- AC4: CUANDO salen los textos nuevos de este corte ENTONCES salen en español y en inglés.

## Diseño

- Core, `cards/integration.ts`: `mergedConfigInvalidLine(target, issues, lang)` y `mergedConfigNext(target, again, ctx)`, con la variante del modo delegado como `resolveIncorporationNext`; en la lista de `cards/index.ts`.
- CLI, `flow/merged-config.ts` (nuevo): `invalidMergedConfig(session, target, again)` carga la configuración de la carpeta (`loadConfig`); si no es válida, aborta el merge y devuelve el motivo y el SIGUIENTE. Va en su propio módulo porque `flow/integrate.ts` está cerca de las 300 líneas de código.
- CLI, `flow/integrate.ts`: `mergeTarget` lo llama tras `git merge` y, si hay motivo, devuelve `refused` con él.
- Core, `cards/refusals.ts`: `invalidConfigCard(issues, ctx, by)`, con `by: "person" | "agent"` (por defecto `"person"`, como hoy).
- CLI, `program.ts`: `sessionRunner` le pasa `"agent"` cuando la terminal no es interactiva.
- Docs: ARCHITECTURE §9, paso 2 de la incorporación; formats.md §6, qué pasa con una configuración inválida.

## Archivos

- crear packages/cli/src/flow/merged-config.ts — validar la configuración tras incorporar main y deshacer el merge
- modificar packages/cli/src/flow/integrate.ts — `mergeTarget` rechaza la incorporación con la configuración inválida
- modificar packages/core/src/cards/integration.ts — el motivo y el SIGUIENTE de una configuración inválida al incorporar
- modificar packages/core/src/cards/index.ts — exportar los textos nuevos
- crear packages/cli/test/invalid-config-merge.test.ts — `accept` y `close` con una configuración inválida de main: AC1, AC2 y AC4
- modificar packages/core/src/cards/refusals.ts — la tarjeta de configuración inválida para un agente
- modificar packages/cli/src/program.ts — un agente recibe la tarjeta del agente
- crear packages/cli/test/invalid-config.test.ts — `next` en una carpeta con la configuración inválida: AC3 y AC4
- modificar docs/ARCHITECTURE.md — la incorporación valida la configuración
- modificar docs/formats.md — quién corrige una configuración inválida

## Tareas

- [x] T1: accept y close deshacen la incorporación de main que trae una configuración inválida
  - files: packages/cli/src/flow/merged-config.ts, packages/cli/src/flow/integrate.ts, packages/core/src/cards/integration.ts, packages/core/src/cards/index.ts, packages/cli/test/invalid-config-merge.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/invalid-config-merge.test.ts test/integrate.test.ts test/close-shared-file.test.ts
  - type: fix
- [ ] T2: next le dice al agente que la persona corrige la configuración inválida
  - files: packages/core/src/cards/refusals.ts, packages/cli/src/program.ts, packages/cli/test/invalid-config.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/invalid-config.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor.test.ts && pnpm typecheck
  - type: fix
- [ ] T3: Documentar la configuración inválida al incorporar y en next
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1, AC2, AC3
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Un cambio cuya propia rama tocó `.specty/config.yaml` y choca con main en ella ya no deja ese conflicto al agente, sino que la incorporación se niega — el agente no puede editar ese archivo de todos modos, y la salida da el error para que lo resuelva la persona.
