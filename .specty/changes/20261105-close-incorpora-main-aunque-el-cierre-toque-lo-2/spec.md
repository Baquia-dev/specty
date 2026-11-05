---
kind: standard
epic: 20261105-pendientes-de-las-unidades
slice: C5
---

# close incorpora main aunque el cierre toque lo mismo que main

## Objetivo

Al cerrar, el cierre que escribió el agente (la spec, el estado y el glosario) está sin commit cuando `close` incorpora main. Si main también cambió uno de esos archivos, como `docs/dominio.md` con otro término, git se niega a fusionar («Merge with strategy ort failed») y la salida pide un merge a mano que no deja la incorporación pendiente (P133). Con este cambio, `close` hace primero el commit del cierre y luego incorpora main: sin conflicto, cierra; con conflicto, el merge queda para `specty integrate` como cualquier otro. Es el corte C5 de la épica `20261105-pendientes-de-las-unidades` (AC6 de la épica).

## Fuera de alcance

- Otros archivos sin commit en la carpeta del cambio, como una corrección de `.specty/config.yaml`: si main también los cambió, el merge sigue negándose como hoy.
- Validar la configuración que llega con main: es el corte C6.
- El reintento de un cambio ya cerrado (`landClosed`) y la aceptación de un quick, que no tienen un cierre sin commit.

## Supuestos

- A1: El commit del cierre lleva la carpeta del cambio (spec, revisiones, estado y auditoría) y el glosario (`glossary`, por defecto `docs/dominio.md`) si existe, y nada más. Solo se hace cuando va a haber merge: main avanzó, la carpeta donde está main no tiene cambios sin commit y esas rutas tienen algo sin commit. Si main no avanzó, `close` sigue haciendo un solo commit, el de archivar.
  - impacto: alto
- A2: Si la incorporación se niega después de ese commit (el merge falla por otro motivo), el commit queda en la rama del cambio, que sigue en `closing` y con su carpeta. Repetir `close` no hace otro commit si nada cambió.
- A3: Su asunto es `docs(spec): cierre de <título>` (en inglés, `docs(spec): closing of <title>`), con recibo de `close` y los trailers de una decisión de la persona, como el de archivar.
- A4: Con conflicto, la incorporación queda para el agente como hoy: `specty integrate` hace el commit del merge sin `.specty/`, y la persona repite `close`, que archiva y lleva el cambio a main.

## Criterios de aceptación

- AC1: CUANDO el cierre sin commit cambia el glosario, main también lo cambió sin chocar con él, y la persona ejecuta `close` ENTONCES el cierre entra en su propio commit antes del merge, main se incorpora y el cambio se cierra y llega a main con los dos cambios del glosario.
- AC2: CUANDO el cierre sin commit y main cambian la misma parte del glosario ENTONCES `close` deja el merge en curso para `specty integrate`, con el glosario como conflicto, y tras resolverlo e integrar, `close` cierra y lleva el cambio a main.
- AC3: CUANDO sale el asunto del commit del cierre ENTONCES sale en español y en inglés.

## Diseño

- Core, `cards/close.ts`: `closingCommitSubject(title, lang)`, junto a `closeCommitSubject`, y en la lista de `cards/index.ts`.
- CLI, `flow/finish.ts`: `commitClosing(session, change, title)` hace el commit de la carpeta del cambio y del glosario con `commitWithReceipt`, solo si `git status --porcelain` da algo en esas rutas. La ruta del glosario, si existe, sale de un ayudante que también usa `commitArchive`.
- CLI, `flow/integrate.ts`: `absorbTarget` y `mergeTarget` admiten un `beforeMerge` opcional, que corre una vez se sabe que habrá merge (main avanzó y su carpeta está limpia) y antes de `git merge`.
- CLI, `commands/finish.ts`: `closeOnTurn` le pasa a `absorbTarget` el commit del cierre.
- Docs: ARCHITECTURE §9, paso 2 de la incorporación: en `close`, el commit del cierre va antes del merge.

## Archivos

- modificar packages/core/src/cards/close.ts — el asunto del commit del cierre
- modificar packages/core/src/cards/index.ts — exportar `closingCommitSubject`
- modificar packages/core/test/cards/close.test.ts — el asunto en español y en inglés
- modificar packages/cli/src/flow/finish.ts — `commitClosing` y la ruta del glosario compartida
- modificar packages/cli/src/flow/integrate.ts — `beforeMerge` en `absorbTarget` y `mergeTarget`
- modificar packages/cli/src/commands/finish.ts — `close` hace el commit del cierre antes del merge
- crear packages/cli/test/close-shared-file.test.ts — el cierre y main cambian el glosario: AC1 y AC2
- modificar docs/ARCHITECTURE.md — el commit del cierre antes del merge

## Tareas

- [x] T1: close hace el commit del cierre antes de incorporar main
  - files: packages/core/src/cards/close.ts, packages/core/src/cards/index.ts, packages/core/test/cards/close.test.ts, packages/cli/src/flow/finish.ts, packages/cli/src/flow/integrate.ts, packages/cli/src/commands/finish.ts, packages/cli/test/close-shared-file.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/close-shared-file.test.ts test/integrate.test.ts test/resolve.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/close.test.ts
  - type: fix

## Riesgos

- R1: Cada cierre con main avanzado y algo sin commit deja un commit más en la historia — solo se hace cuando va a haber merge, y su asunto dice que es el cierre.
