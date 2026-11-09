---
kind: standard
---

# Los tests de la extensión de VS Code dejan de fallar con la máquina cargada

## Objetivo

Resuelve P104 y P113, y la parte de vscode de P118: con la máquina cargada, los tests de `packages/vscode` que lanzan un proceso de Node se cortaban por tiempo y tumbaban `pnpm check`, que `release.yml` ejecuta antes de publicar la v1. En main, los dos tests que nombran ya no tienen el problema: el cambio `20261105-los-tests-que-esperan-a-un-proceso-tienen` (525f9deeb, 2026-11-05) subió las esperas de `extension.test.ts` y `specty.test.ts` de 4 s a 15 s y dio a cada test de esos dos archivos 30 s, y `readStatus` ya espera al CLI hasta 30 s; P104 y P113 se anotaron antes de que llegara a main y nadie las marcó. Lo que queda es que el resto de los tests de vscode siguen con los 5 s de Vitest por defecto, y uno de ellos, «AC1» de `temp-dir.test.ts`, también arranca Node (`execFileSync`). Con este cambio, la configuración de Vitest de vscode da 30 s a cada test que no fija su propio límite, como la CLI da 60 s, y un test vigila ese margen.

## Fuera de alcance

- Los tests de la CLI de P117 y P118 (`init-usage` y los que hacen commits con init): los lleva otro cambio.
- Cambiar los tests ya aprobados de vscode (`extension.test.ts`, `specty.test.ts`, `temp-dir.test.ts`, `repo-junit.test.ts`): sus límites propios siguen como están.
- Abaratar el `specty` simulado: ya es un script de Node mínimo; lo que tarda con carga es arrancar Node.
- El límite de los hooks (`hookTimeout`): los de vscode solo reinician el VS Code simulado y no arrancan procesos.

## Supuestos

- A1: P104 y P113 ya están resueltas en el código de main por 525f9deeb, y este cambio las marca hechas al cerrarse. Sus fallos (2026-11-05, antes de las 10:49) son anteriores a ese commit, y la memoria no tiene fallos de vscode posteriores.
- A2: 30 s por test basta con la carga medida (40-66): `readStatus` corta al CLI a los 30 s y los dos archivos que esperan procesos ya usan ese límite; el paquete entero tarda 2,6 s con carga 11.
- A3: `vitest.config.ts` de vscode cambia la huella de la unidad `vscode`, que en la próxima verificación completa corre una vez de nuevo; el test nuevo solo lee archivos del paquete, así que no hace falta tocar los `paths` de ninguna unidad.

## Criterios de aceptación

- AC1: CUANDO un test de la extensión de VS Code no fija su propio límite de tiempo ENTONCES Vitest le da 30 s, y no los 5 s por defecto, antes de cortarlo.

## Diseño

- `packages/vscode/vitest.config.ts`: `test.testTimeout: 30_000`, con un comentario que dice por qué (los tests arrancan Node, que tarda segundos con la máquina cargada).
- `packages/vscode/test/repo-timeout.test.ts` (nuevo), como `repo-junit.test.ts`: importa la configuración del paquete y comprueba que `test.testTimeout` es 30 s.

## Archivos

- modificar packages/vscode/vitest.config.ts — 30 s por test que no fija su límite
- crear packages/vscode/test/repo-timeout.test.ts — vigila el margen de los tests de vscode: AC1

## Tareas

- [x] T1: Los tests de vscode tienen 30 s por defecto
  - files: packages/vscode/vitest.config.ts, packages/vscode/test/repo-timeout.test.ts
  - ac: AC1
  - verify: pnpm --filter specty-vscode exec vitest run test/repo-timeout.test.ts && pnpm --filter specty-vscode typecheck && pnpm lint
  - type: fix

## Cierre

### Resumen

Los tests de la extensión de VS Code que no fijan su propio límite tienen 30 s en lugar de los 5 s de Vitest: `packages/vscode/vitest.config.ts` fija `test.testTimeout: 30_000`, como la CLI fija 60 s, y `packages/vscode/test/repo-timeout.test.ts` lo vigila. P104 y P113 ya estaban resueltas en el código de main por 525f9deeb (2026-11-05: esperas de 15 s y 30 s por test en `extension.test.ts` y `specty.test.ts`); este cambio las marca hechas y cubre el resto del paquete, como `temp-dir.test.ts`, que también arranca Node.

### Desviaciones

- Ninguna: se siguió el plan aprobado.

### Decisiones

- El margen va en la configuración del paquete y no en los tests ya aprobados, que siguen bloqueados y sin cambios.
- El `specty` simulado no se abarata: ya es un script de Node mínimo, y lo que tarda con carga es arrancar Node.

### Pendientes

- Ninguno de vscode. Los tests de la CLI de P117 y P118 (`init-usage` y los que hacen commits con init) los lleva otro cambio.
