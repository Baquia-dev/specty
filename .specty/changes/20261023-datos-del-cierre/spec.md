---
kind: standard
follows:
  - 20261023-vista-cambios-en-aceptacion
---

# Datos del cierre

## Objetivo

La vista de cada cambio trae el cierre que redacta el agente, en sus partes (resumen, desviaciones, decisiones y pendientes), y la fuente de datos permite confirmarlo como `specty close`. La revisión deja de decir «cierre por confirmar» mientras el agente aún lo redacta.

## Fuera de alcance

- La sección Cierre y el botón «Confirmar y archivar»: van en el cambio siguiente.
- `specty close` en la CLI y el servidor local.
- Simular en el prototipo que el agente redacta el cierre.

## Supuestos

- A1: El cierre se lee de la sección «Cierre» de la spec (`spec.closing`, que ya da el core) y se parte por sus títulos de nivel 3: Resumen, Desviaciones, Decisiones y Pendientes, en español o en inglés. Lo que va antes del primer título o bajo otro título se conserva aparte, para no perder nada de lo que escriba el agente.
  - impacto: alto
- A2: La revisión dice «aceptada, en cierre» mientras el agente redacta el cierre y «cierre por confirmar» solo cuando lo envió (`closingSubmittedAt`), como ya hace la Bandeja con su decisión.
- A3: `SpectyData.confirmClosing(change)` confirma el cierre igual que `specty close`: solo si el cierre se envió; si no, la fuente explica por qué. En la fuente de ejemplo el cambio pasa a terminado y la auditoría registra `change.closed` por la persona.
- A4: El ejemplo «Recordatorios por correo», que espera la confirmación de su cierre, trae un cierre con sus cuatro partes.

## Criterios de aceptación

- AC1: CUANDO un cambio tiene la sección Cierre ENTONCES su vista trae el resumen, las desviaciones, las decisiones y los pendientes por separado, y aparte el texto que no encaja en ellos.
- AC2: CUANDO el cambio está en cierre y el agente aún no lo envió ENTONCES la revisión dice «aceptada, en cierre»; con el cierre enviado, «cierre por confirmar».
- AC3: CUANDO se confirma un cierre enviado ENTONCES el cambio pasa a terminado y la auditoría lo registra; sin cierre enviado, la fuente lo rechaza y explica por qué.

## Diseño

- **Cierre** (`data/closing.ts`): `closingOf(text)` devuelve las partes (`summary`, `deviations`, `decisions`, `pending` y `other`), cada una en markdown. Puro, corre en el worker.
- **Vista** (`data/records.ts`, `data/views.ts`): `ChangeView.closing`, con las partes y si el cierre se envió, y `SpectyData.confirmClosing`, de solo lectura por defecto.
- **Etiqueta** (`data/revision.ts`): el estado de la revisión en cierre mira si el cierre se envió.
- **Ejemplo** (`data/fixtures.ts`, `data/sample-specs.ts`): `confirmClosing` y el cierre de «Recordatorios por correo».

## Archivos

- crear packages/ui/src/data/closing.ts — el cierre en sus partes
- crear packages/ui/src/data/closing.test.ts — tests del cierre
- modificar packages/ui/src/data/records.ts — el cierre en la vista y `confirmClosing`
- modificar packages/ui/src/data/views.ts — el cierre de cada cambio
- modificar packages/ui/src/data/views.test.ts — test del cierre en la vista
- modificar packages/ui/src/data/revision.ts — «aceptada, en cierre» hasta que se envía
- modificar packages/ui/src/data/revision.test.ts — test de la etiqueta
- modificar packages/ui/src/data/fixtures.ts — `confirmClosing` en la fuente de ejemplo
- modificar packages/ui/src/data/fixtures.test.ts — tests de la confirmación
- modificar packages/ui/src/data/sample-specs.ts — el cierre de ejemplo en sus cuatro partes

## Tareas

- [x] T1: El cierre en sus partes
  - files: packages/ui/src/data/closing.ts, packages/ui/src/data/closing.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/closing.test.ts
- [x] T2: El cierre en la vista y su etiqueta
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/views.test.ts, packages/ui/src/data/revision.ts, packages/ui/src/data/revision.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/views.test.ts --include src/data/revision.test.ts
- [ ] T3: Confirmar el cierre en la fuente de ejemplo
  - files: packages/ui/src/data/fixtures.ts, packages/ui/src/data/fixtures.test.ts, packages/ui/src/data/sample-specs.ts
  - ac: AC3
  - verify: pnpm check
