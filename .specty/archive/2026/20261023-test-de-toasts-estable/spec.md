---
kind: quick
---

# Test de toasts estable

## Objetivo

El test «leaves after 5 s unless hovered or focused» de `toast.test.ts` deja de fallar con la máquina cargada. Hoy falsifica `setTimeout` antes de `render()`, cuyo `fixture.whenStable()` espera la detección de cambios de Angular. Angular la dispara con el primero que llegue de `setTimeout(0)` y `requestAnimationFrame`, así que con `setTimeout` falso solo queda `requestAnimationFrame`, que bajo carga no llega en los 5 s del test. Falsificar los timers después de `render()`, justo antes del primer `show()`, lo hace determinista. Este test falló en varias verificaciones de `task done` de hoy.

## Archivos

- modificar packages/ui/src/components/toast.test.ts — falsificar los timers después de `render()`

## Tareas

- [x] T1: Falsificar los timers después de `render()`
  - files: packages/ui/src/components/toast.test.ts
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/toast.test.ts
  - type: fix

## Cierre

### Resumen

El test de toasts falsifica setTimeout después de render(): antes, whenStable() dependía solo de requestAnimationFrame (Angular corre la detección de cambios con el primero de setTimeout o rAF) y bajo carga se colgaba 5 s. Comprobado: falsificando también rAF antes de render() el test se cuelga siempre; después de render() pasa incluso con rAF falso
