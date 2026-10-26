---
kind: quick
---

# Las tarjetas de core se exportan desde cards/index.ts

## Objetivo

`packages/core/src/index.ts`, la API pública de core, llegó a 306 líneas de código, por encima del aviso de 300, porque cada módulo de tarjetas que trae la serie de los textos de la CLI suma sus exportaciones, y faltan varios. Las exportaciones de `cards/` pasan a `cards/index.ts`, como ya hace `validate/index.ts`, y `index.ts` las reexporta con una línea. Cambia dónde se listan, no lo que exporta core.

## Archivos

- crear packages/core/src/cards/index.ts — las exportaciones de las tarjetas
- modificar packages/core/src/index.ts — reexportarlas desde cards/index.ts

## Tareas

- [x] T1: Las tarjetas se exportan desde cards/index.ts
  - files: packages/core/src/cards/index.ts, packages/core/src/index.ts
  - verify: pnpm check
  - type: refactor
