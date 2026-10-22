---
kind: quick
follows:
  - 20261022-revision-explicita-en-la-bandeja-el-delta-la-rev
---

# Barra compacta solo con los botones y sugerencia de esfuerzo oculta

## Objetivo

La barra compacta deja de mostrar el resumen «Supuestos 1/2 · Comentarios 2» y, a la derecha, solo quedan los botones de decisión. La sugerencia de esfuerzo para el agente se oculta por ahora: su lógica y el dato del esfuerzo se conservan, para volver a mostrarla cambiando una sola constante.

## Archivos

- modificar packages/ui/src/change/change-bar.ts — quitar el resumen de supuestos y comentarios
- modificar packages/ui/src/change/change-page.ts — ocultar la sugerencia de esfuerzo tras una constante
- modificar packages/ui/src/change/change-page.test.ts — tests de la barra y de la sugerencia oculta

## Tareas

- [x] T1: Barra compacta solo con los botones y sugerencia de esfuerzo oculta
  - files: packages/ui/src/change/change-bar.ts, packages/ui/src/change/change-page.ts, packages/ui/src/change/change-page.test.ts
  - verify: pnpm check
  - notes: Actualizar también docs/ui.md (barra compacta y sugerencia). Comprobar en el navegador a 390 y 1280 px.

## Cierre

### Resumen

Barra compacta sin el resumen de supuestos y comentarios: a la derecha solo la decisión. La sugerencia de esfuerzo queda oculta tras el token SHOW_EFFORT_HINT (false por defecto); su lógica y el esfuerzo derivado se conservan y un test la activa para comprobar su redacción. docs/ui.md actualizado. Comprobado a 390, 768, 1024 y 1280 px.
