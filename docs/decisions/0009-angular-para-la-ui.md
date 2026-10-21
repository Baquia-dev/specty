# 0009 · Angular para la UI

- Estado: aceptada
- Fecha: 2026-10-21
- Actualiza: [0003](0003-ui-web-local.md), que proponía React

## Contexto

- El [ADR 0003](0003-ui-web-local.md) fijó una UI web local nueva y propuso React + TypeScript; [ui.md](../ui.md) detallaba un stack de React (Radix, Motion, TanStack Query, cmdk).
- Al empezar la fase 2, la persona responsable eligió Angular 22.
- Angular 22 exige TypeScript `>=6.0 <6.1`, y el monorepo usa TypeScript 7.

## Decisión

- `packages/ui` (`@baquia-dev/specty-ui`) es una app Angular 22 standalone, sin zone.js, con signals, plantillas estrictas y el builder oficial (`@angular/build`).
- `packages/ui` fija TypeScript 6.0 solo para sí; `core` y `cli` siguen con TypeScript 7. Core se sigue compilando con ambas versiones.
- Equivalencias del stack de ui.md: Angular Aria + CDK en lugar de Radix; `animate.enter`/`animate.leave` y CSS en lugar de Motion; `resource()` y signals en lugar de TanStack Query; combobox y listbox de Angular Aria en lugar de cmdk; `@lucide/angular` para los iconos. Tailwind 4, CodeMirror 6 y Shiki no cambian.
- Los tests los ejecuta el builder de tests de Angular con Vitest, la misma herramienta que el resto del monorepo.

## Consecuencias

- Conviven dos versiones de TypeScript. Cada paquete comprueba sus tipos con la suya (`pnpm typecheck`), y la UI lo hace con `ngc` para cubrir las plantillas.
- Cuando Angular admita TypeScript 7, `packages/ui` se alinea con el resto y desaparece la excepción.
- El resto del ADR 0003 sigue vigente: servidor local, capa de datos independiente del transporte y bundle dentro del paquete npm.
