---
kind: standard
---

# La matriz de aceptación cuenta los tests enviados en la fase de tests

## Objetivo

Con `policy.tests: contract`, los tests de los criterios se envían en la fase de tests, en un commit sin `Specty-Task`. La matriz de aceptación solo cuenta las líneas que añadieron los commits de las tareas, así que marca «sin test» todos esos criterios y avisa a la persona de un falso hueco, como pasó al aceptar el corte C1 de la épica de la fase 3. El commit de los tests pasa a llevar un trailer propio, y la matriz cuenta sus líneas.

## Fuera de alcance

- Los commits de tests hechos antes de este cambio, que no llevan el trailer: sus líneas siguen sin contar.
- Cambiar `criteria-tested`, que ya mira el diff de todo el cambio.
- La vista de la matriz en la UI, más allá de recibir la etiqueta nueva en lugar de una tarea.

## Supuestos

- A1: El commit de los tests se reconoce por un trailer `Specty-Tests: true`, y no por su asunto (`test(<módulo>)`), porque un commit manual también podría empezar así.
  - impacto: medio
- A2: En la matriz, una línea de ese commit lleva la etiqueta `tests` donde las demás llevan su tarea, en los dos idiomas.
- A3: Cuentan todos los commits de tests del cambio, no solo el último, porque reenviarlos solo cambia las líneas que tocan y las demás siguen siendo del envío anterior.
- A4: El commit con el que la persona aprueba los tests (`test(spec)`) no lleva el trailer: solo guarda el estado y no toca tests.

## Criterios de aceptación

- AC1: CUANDO un cambio con `policy.tests: contract` llega a aceptación y un test enviado en la fase de tests lleva el id de un criterio ENTONCES la matriz de aceptación lo muestra con su archivo, su línea, la etiqueta `tests` y el commit de los tests, y no avisa de ese criterio como «sin test».
- AC2: CUANDO Specty hace el commit de los tests en la fase de tests ENTONCES el commit lleva `Specty-Tests: true` junto a `Specty-Change` y `Specty-Spec`.

## Diseño

- `commands/tests.ts` añade `Specty-Tests: true` a los trailers del commit de los tests.
- `criteriaTests` recibe el id del cambio y busca, con `git log`, los commits con `Specty-Change` de ese cambio y `Specty-Tests`. Los añade a los de las tareas con la etiqueta `tests`, como pares etiqueta y commit, porque puede haber varios.
- `flow/acceptance.ts` y `server/records.ts` le pasan el id, así que la tarjeta de aceptación y la UI ven lo mismo.

## Archivos

- modificar packages/cli/src/commands/tests.ts — el trailer `Specty-Tests`
- modificar packages/cli/src/flow/criteria-tests.ts — los commits de tests cuentan en la matriz
- modificar packages/cli/src/flow/acceptance.ts — pasar el id del cambio
- modificar packages/cli/src/server/records.ts — pasar el id del cambio
- crear packages/cli/test/contract-matrix.test.ts — una feature con `contract` hasta la aceptación
- modificar docs/formats.md — §7: el trailer del commit de los tests
- modificar docs/ARCHITECTURE.md — §13: la matriz cuenta el commit de los tests

## Tareas

- [x] T1: La matriz cuenta los commits de tests del cambio
  - files: packages/cli/src/commands/tests.ts, packages/cli/src/flow/criteria-tests.ts, packages/cli/src/flow/acceptance.ts, packages/cli/src/server/records.ts, packages/cli/test/contract-matrix.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/contract-matrix.test.ts test/criteria-tests.test.ts test/testing-phase.test.ts test/server.test.ts
  - type: fix
- [x] T2: Documentar el trailer y la matriz
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - type: docs

## Cierre

### Resumen

El commit con el que Specty envía los tests en la fase de tests lleva `Specty-Tests: true`, y la matriz de aceptación cuenta sus líneas junto a las de las tareas, con la etiqueta `tests`. La tarjeta de aceptación y la UI dejan de avisar de criterios «sin test» cuando sus tests llegaron antes del código.

### Desviaciones

- La matriz de este mismo cambio aún marcó AC1 y AC2 «sin test»: su commit de tests lo hizo el CLI de main, anterior al arreglo, sin el trailer, como prevé «Fuera de alcance». La prueba nueva recorre el flujo completo con el CLI arreglado y lo comprueba.

### Decisiones

- `criteriaTests` recibe el id del cambio y busca sus commits de tests con `git log`; los commits se tratan como pares etiqueta y commit, porque puede haber varios envíos.

### Pendientes

- Ninguno.
