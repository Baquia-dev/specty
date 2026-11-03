---
kind: quick
---

# La exclusión anclada de Vite y Metro vale con cualquier ruta

## Objetivo

`doctor` pide hoy a Vite ``server.watch.ignored: [`${import.meta.dirname}/.worktrees/**`]`` y a Metro ``resolver.blockList: [new RegExp(`^${__dirname}/\\.worktrees/`)]``, que meten la ruta del proyecto sin escapar en un glob o en una expresión regular. Medido el 2026-11-03 con Vite 8.3.5 y Metro 0.87.2 en `app (copia) [1] {x} a+b$`: con esas formas, la carpeta principal sigue observando `.worktrees/` y Vite recarga la página. Ahora `doctor` pide una forma que no depende de los caracteres de la ruta: para Vite, una función que compara el principio de la ruta, con las barras invertidas de Windows pasadas a `/` como hace chokidar; para Metro, la expresión con la ruta escapada y cualquiera de los dos separadores. Las dos se midieron desde la carpeta principal y dentro del cambio, también con una barra invertida en el nombre de la carpeta, y se comprobaron con rutas de Windows simuladas. Si la ruta del proyecto tiene esos caracteres, `doctor` ya no da por buena la forma de antes.

## Archivos

- modificar packages/cli/src/detect/worktree-tools.ts — las dos exclusiones nuevas, y la de antes solo cuenta si la ruta no tiene caracteres especiales
- modificar packages/cli/test/doctor-watchers.test.ts — las formas nuevas, y la de antes en una ruta con paréntesis y corchetes
- modificar docs/decisions/0018-worktrees-dentro-del-repositorio.md — las exclusiones de la tabla, la medición con rutas especiales y la consecuencia que ya no aplica

## Tareas

- [x] T1: Vite y Metro, con una exclusión que vale con cualquier ruta
  - files: packages/cli/src/detect/worktree-tools.ts, packages/cli/test/doctor-watchers.test.ts, docs/decisions/0018-worktrees-dentro-del-repositorio.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-watchers.test.ts
  - type: fix

## Cierre

### Resumen

doctor pide a Vite una función que compara el principio de la ruta y a Metro la expresión con la carpeta escapada y los dos separadores; la forma de antes no cuenta si la ruta tiene caracteres especiales; ADR 0018 con la medición
