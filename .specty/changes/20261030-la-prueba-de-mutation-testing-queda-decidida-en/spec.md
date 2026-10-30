---
kind: quick
---

# La prueba de mutation testing queda decidida en un ADR

## Objetivo

Se midió mutation testing con Stryker sobre tres cambios recientes de Specty, contra solo los tests de su tarea, para decidir si `specty check` debe tener un check de mutantes. El ADR 0017 deja las cifras, qué fracción de los mutantes que sobreviven son huecos reales de los tests y la decisión: no llevarlo a `specty check`, ni con umbral ni como aviso.

## Archivos

- crear docs/decisions/0017-mutation-testing-medido-y-fuera-de-specty-check.md — la medición y la decisión

## Tareas

- [x] T1: El ADR 0017 deja medido y decidido mutation testing
  - files: docs/decisions/0017-mutation-testing-medido-y-fuera-de-specty-check.md
  - ac: —
  - verify: pnpm lint
  - type: docs
