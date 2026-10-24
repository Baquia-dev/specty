---
kind: quick
---

# El test del presupuesto usa los límites de split

## Objetivo

El test del presupuesto de la tarjeta de tarea arma la tarjeta más grande razonable con 8 tareas y 5 archivos escritos como números, que hoy coinciden con los valores por defecto de `split.maxTasks` y `split.taskMaxFiles`. Si alguien sube esos límites, la tarjeta puede dejar de caber sin que el test lo note. El test pasa a tomarlos de `DEFAULT_CONFIG.split`: subir un límite agranda la tarjeta del test, y si deja de caber en 1.500 tokens, el test falla.

## Archivos

- modificar packages/core/test/cards/budget.test.ts — las tareas y los archivos de la tarjeta salen de `DEFAULT_CONFIG.split`

## Tareas

- [ ] T1: La tarjeta del test del presupuesto usa los límites de split
  - files: packages/core/test/cards/budget.test.ts
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/budget.test.ts
  - type: test
