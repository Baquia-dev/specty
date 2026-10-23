---
kind: quick
---

# Test de toasts estable

## Objetivo

El test «leaves after 5 s unless hovered or focused» de `toast.test.ts` deja de fallar con la máquina cargada. Hoy falsifica `setTimeout` antes de `render()`, cuyo `fixture.whenStable()` espera la detección de cambios de Angular. Angular la dispara con el primero que llegue de `setTimeout(0)` y `requestAnimationFrame`, así que con `setTimeout` falso solo queda `requestAnimationFrame`, que bajo carga no llega en los 5 s del test. Falsificar los timers después de `render()`, justo antes del primer `show()`, lo hace determinista. Este test falló en varias verificaciones de `task done` de hoy.

## Archivos

- modificar packages/ui/src/components/toast.test.ts — falsificar los timers después de `render()`

## Tareas

- [ ] T1: Falsificar los timers después de `render()`
  - files: packages/ui/src/components/toast.test.ts
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/toast.test.ts
  - type: fix
