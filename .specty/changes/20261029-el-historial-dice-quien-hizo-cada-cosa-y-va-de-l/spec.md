---
kind: standard
---

# El Historial dice quién hizo cada cosa y va de lo más reciente a lo más antiguo

## Objetivo

El Historial pone «Persona» aunque la auditoría ya sabe su nombre, y del agente solo dice la herramienta, aunque sus líneas traen ahora el modelo y el esfuerzo. Pasa a nombrar a la persona y a decir el modelo y el esfuerzo del agente, y los eventos van del más reciente al más antiguo.

## Fuera de alcance

- Que los filtros «Quién» y «Tipo» no se pierdan al bajar: lo hace el cambio de pestañas fijas que lleva Antigravity (`20261029-pestanas-y-titulos-de-seccion-fijos-al-desplazar`), llevándolos a la barra de pestañas.
- Cambiar qué guarda la auditoría: ya lo hace el cambio anterior.
- El orden del informe de `specty audit` y de su exportación, que sigue del más antiguo al más reciente.

## Supuestos

- A1: Una línea anterior al cambio de la auditoría no trae el nombre: dice «Persona», como hasta ahora.
- A2: El modelo se muestra por su nombre corto cuando sigue el patrón de Claude (`claude-opus-5-5` como «Opus 5.5»); si no, tal cual. El esfuerzo se dice en palabras («esfuerzo alto», «esfuerzo muy alto» para `xhigh`), y uno desconocido, tal cual.

## Criterios de aceptación

- AC1: CUANDO un evento lo hizo una persona ENTONCES el Historial pone su nombre en lugar de «Persona», y «Persona» si la línea no lo trae.
- AC2: CUANDO un evento lo hizo el agente ENTONCES el Historial dice «Agente», su herramienta y, si la línea los trae, su modelo y su esfuerzo; una decisión que tomó en modo delegado dice además por quién.
- AC3: CUANDO se abre el Historial ENTONCES los días, y los eventos de cada día, van del más reciente al más antiguo.

## Diseño

- `AuditRecord` (`data/progress.ts`) e `HistoryEntry` (`data/history.ts`) ganan `by`, `model` y `effort`; `historyOf` los copia, y el detalle de una decisión delegada nombra a la persona cuando la línea la trae.
- `history-tab.ts`: la etiqueta de quién, con el nombre o el modelo y el esfuerzo, y los días y sus eventos al revés.
- `data/sample-history.ts`: las líneas de muestra del prototipo traen el nombre de la revisora, y el modelo y el esfuerzo del agente.

## Archivos

- modificar packages/ui/src/data/progress.ts — los campos nuevos de `AuditRecord`
- modificar packages/ui/src/data/history.ts — `HistoryEntry` con quién, y el detalle delegado con el nombre
- modificar packages/ui/src/data/sample-history.ts — la muestra dice quién hizo cada cosa
- crear packages/ui/src/data/history-who.test.ts — lo que `historyOf` guarda de quién, y la muestra
- modificar packages/ui/src/history/history-tab.ts — la etiqueta y el orden
- modificar packages/ui/src/history/history-tab.test.ts — el orden pasa a ser del más reciente al más antiguo
- crear packages/ui/src/history/history-who.test.ts — el nombre, el modelo y el esfuerzo en la pestaña
- modificar docs/ui.md — el Historial con quién y su orden

## Tareas

- [x] T1: Quién hizo cada cosa en los datos del Historial
  - files: packages/ui/src/data/progress.ts, packages/ui/src/data/history.ts, packages/ui/src/data/sample-history.ts, packages/ui/src/data/history-who.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/history-who.test.ts --include src/data/history.test.ts && pnpm lint
- [ ] T2: La pestaña dice quién y va del más reciente al más antiguo
  - files: packages/ui/src/history/history-tab.ts, packages/ui/src/history/history-tab.test.ts, packages/ui/src/history/history-who.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/history && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint
- [ ] T3: Documentar el Historial
  - files: docs/ui.md
  - ac: —
  - verify: pnpm lint
  - type: docs
