---
kind: quick
---

# Los tests que esperan a un proceso tienen margen en una máquina cargada

## Objetivo

Resuelve P10 y P114. Con la máquina cargada por otras sesiones, tres tests que esperan a un proceso fallan por tiempo y tumban la verificación completa de cambios que no los tocan. El primero es «starting the UI > AC3» de `packages/vscode/test/specty.test.ts`: si Node tarda más de 2 s en arrancar el sustituto, lo para antes de que escuche la parada y nunca deja su marca. El segundo, los tests de `packages/vscode/test/extension.test.ts`, que esperan 4 s con el límite de 5 s de Vitest. El tercero, «AC2» de `packages/cli/test/fresh-session.test.ts`, que acepta tres cambios quick en un solo test con el límite de 60 s del paquete.

Con este cambio, la espera del enlace del test del sustituto mudo corre con un reloj falso que solo avanza cuando el sustituto ya anotó su llamada, y por tanto escucha la parada, sin depender de lo que tarde Node. El test sigue comprobando que, sin enlace a tiempo, `startUi` falla y para el proceso. Las esperas de los dos archivos de vscode pasan a 15 s, con un límite de 30 s por test. «AC2» de `fresh-session` pasa a tres tests, cada uno con su id `AC2:` y un solo cambio aceptado. Cada test comprueba lo mismo que antes y la verificación de la tarea los ejecuta en verde.

## Archivos

- modificar packages/vscode/test/specty.test.ts — la espera del enlace con reloj falso tras la llamada del sustituto, el test de AC3 sin enlace partido en dos y límites de 30 s
- modificar packages/vscode/test/extension.test.ts — esperas de 15 s y límite de 30 s por test
- modificar packages/cli/test/fresh-session.test.ts — AC2 en tres tests, uno por cambio aceptado

## Tareas

- [x] T1: Dar margen a los tests que esperan a un proceso
  - files: packages/vscode/test/specty.test.ts, packages/vscode/test/extension.test.ts, packages/cli/test/fresh-session.test.ts
  - verify: pnpm --filter specty-vscode exec vitest run test/specty.test.ts test/extension.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/fresh-session.test.ts
  - type: test
