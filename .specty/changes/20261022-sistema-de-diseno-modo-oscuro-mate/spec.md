---
kind: quick
follows:
  - 20261022-armazon-comun-area-de-contenido-posicionada-y-ma
---

# Sistema de diseño: modo oscuro mate

## Objetivo

El modo oscuro deja de cansar la vista: pasa de casi negro (`#0B0B0C`) y texto casi blanco (contraste 17,8:1) a los grises mate de Taiga UI (fondo `#222222`, superficie `#292929`, bordes al 12–14 % de blanco) con texto al 90 % (`#E8E8E8`, contraste 13:1) y colores de fase desaturados, como en la maqueta "Specty · Oscuro mate y diff". El modo claro no cambia, y todos los pares siguen cumpliendo WCAG AA.

## Archivos

- modificar packages/ui/src/styles.css — valores del tema oscuro mate
- modificar packages/ui/src/theme/tokens.test.ts — el oscuro no supera 14:1 entre texto y fondo
- modificar docs/ui.md — neutros del modo oscuro

## Tareas

- [x] T1: Tema oscuro mate
  - files: packages/ui/src/styles.css, packages/ui/src/theme/tokens.test.ts, docs/ui.md
  - verify: pnpm check
  - notes: Valores: fondo #222222, superficie #292929, borde #3a3a3a, texto #e8e8e8, secundario #a6a6a6, acento #e8e8e8 sobre #222222, foco #c8c8c8 y #4a4a4a sobre el acento; fases (texto / fondo) borrador #b8b8b8 / #333333, revisión #e2c07d / #3a3426, implementación y ajustes #9fb9e6 / #2d3442, aceptación y cierre #bba8e3 / #352f42, terminado #8fcaa8 / #2c3a31, cancelado #dfa29a / #3d2f2c; sombras más suaves. El test de contraste existente (AA) los cubre; el nuevo pone un techo de 14:1 al texto sobre el fondo en oscuro. Comprobar en el navegador la Bandeja, una revisión y su delta en oscuro.
