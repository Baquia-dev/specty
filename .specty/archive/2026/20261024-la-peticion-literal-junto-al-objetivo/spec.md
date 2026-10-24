---
kind: standard
---

# La petición literal junto al Objetivo

## Objetivo

Cuando el cambio se creó con `specty new --request`, la revisión de la spec muestra la petición del usuario tal cual, junto al Objetivo que redactó el agente. Así la persona compara lo que pidió con lo que el agente entendió, sin buscarlo en la auditoría.

## Fuera de alcance

- Capturar la petición sin depender del agente (un hook `UserPromptSubmit`).
- Mostrarla en otras pantallas, como la Bandeja o el historial.

## Supuestos

- A1: La petición está en `data.request` de la entrada `change.created` de la auditoría, como la guarda `specty new --request`, y no cambia después.

## Criterios de aceptación

- AC1: CUANDO la auditoría de un cambio tiene la petición en `change.created` ENTONCES la vista del cambio la trae tal cual; sin ella, no trae nada.
- AC2: CUANDO la persona lee el Objetivo en la revisión de la spec ENTONCES ve debajo «Lo que pediste», con la petición entre comillas y en su propio tono, sin confundirse con lo que escribió el agente.
- AC3: CUANDO la persona abre el prototipo ENTONCES el cambio en revisión de ejemplo muestra una petición.
- AC4: CUANDO alguien lee el documento de la UI ENTONCES encuentra la petición junto al Objetivo.

## Diseño

- `data/asked.ts`: `requestOf(audit)` devuelve la petición de `change.created`, si es un texto no vacío; `deriveView` la pone en `ChangeView.request`.
- `review/user-request.ts`: el bloque «Lo que pediste», una cita con su icono y la petición en texto tal cual, no en Markdown. `SpecReview` lo muestra bajo el Objetivo cuando hay petición.
- `sample-history.ts`: el cambio en revisión de ejemplo se crea con una petición.

## Archivos

- modificar packages/ui/src/data/records.ts — `request` en la vista del cambio
- crear packages/ui/src/data/asked.ts — la petición de la auditoría
- crear packages/ui/src/data/asked.test.ts — tests de la petición
- modificar packages/ui/src/data/views.ts — la petición en la vista
- modificar packages/ui/src/data/sample-history.ts — una petición de ejemplo
- crear packages/ui/src/review/user-request.ts — el bloque «Lo que pediste»
- crear packages/ui/src/review/user-request.test.ts — tests del bloque
- modificar packages/ui/src/review/spec-review.ts — el bloque bajo el Objetivo
- modificar docs/ui.md — la petición junto al Objetivo

## Tareas

- [x] T1: La vista trae la petición literal
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/asked.ts, packages/ui/src/data/asked.test.ts, packages/ui/src/data/views.ts, packages/ui/src/data/sample-history.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data && pnpm sources
- [x] T2: La revisión la muestra bajo el Objetivo
  - files: packages/ui/src/review/user-request.ts, packages/ui/src/review/user-request.test.ts, packages/ui/src/review/spec-review.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review && pnpm sources
- [x] T3: Documentar la petición junto al Objetivo
  - files: docs/ui.md
  - ac: AC4
  - verify: pnpm check
  - type: docs

## Cierre

### Resumen

Cuando el cambio se creó con `specty new --request`, la revisión de la spec muestra «Lo que pediste» bajo el Objetivo: la petición del usuario tal cual, leída de `change.created` en la auditoría, entre comillas y en su propio tono. El cambio en revisión de ejemplo trae una, así que también se ve en el prototipo.

### Desviaciones

- Ninguna en el código. Al aceptar, la verificación completa falló dos veces en los tests de la CLI, con la carga de la máquina en 51 por las tres sesiones en paralelo. Pasó al lanzarla sola, y a la tercera también al aceptar.

### Decisiones

- La petición se muestra como texto, no como Markdown, para que se lea exactamente lo que escribió la persona.
- El bloque es un componente propio (`review/user-request.ts`) con su test, porque `spec-review.test.ts` ya tiene 300 líneas.

### Pendientes

- Encontrar el test de la CLI que falla bajo carga, en una sesión sin otras en paralelo, y hacerlo determinista.
