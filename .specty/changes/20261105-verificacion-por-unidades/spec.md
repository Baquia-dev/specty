---
kind: epic
---

# La verificación completa solo repite lo que cambió, y vigila sus tests

## Objetivo

La verificación completa (`verify.full`, aquí `pnpm check`) es un solo comando: `accept` la ejecuta entera, y el cierre otra vez cada vez que main avanzó, aunque lo que cambió sea un paquete que no toca la mitad de los tests. En este repositorio tarda de 250 a 600 s, los tests del CLI son la mayor parte, y con siete sesiones las verificaciones completas hacen cola. Nada recuerda, de un cambio a otro, qué partes ya pasaron con el mismo código, ni qué tests son inestables o lentos. Con esta épica, la verificación completa se divide en unidades (`verify.units`), cada una con su comando y los archivos de los que depende. Un registro del clon recuerda las que pasaron con cada huella, y la verificación completa solo ejecuta las que faltan, en `accept`, en la incorporación, en `specty integrate` y en la UI. Además, `specty verify --fresh` lo ejecuta todo sin registro y anota en la memoria los tests inestables, y una comprobación avisa de los tests que pasan de un tiempo.

## Fuera de alcance

- Elegir tests sueltos por cobertura (test impact analysis): la unidad es la menor parte que se salta.
- Detectar las unidades solo: las escribe la persona o el agente en `.specty/config.yaml`; `init` no las propone.
- Ejecutar varias unidades a la vez: corren en orden, dentro de las plazas de la verificación completa.
- Cambiar la verificación de cada tarea (`verify.default` y el `verify` de la tarea).
- El CI, que sigue ejecutando `verify.full` entero.

## Supuestos

- A1: Una unidad es `{ name, command, paths }` en `verify.units`. Su huella es el hash de su comando y de las rutas y los contenidos de los archivos del árbol de trabajo que casan con `paths`, también los que aún no están en un commit. Se toma como `codeTree`, pero con `paths` en lugar de `ignored`: una unidad puede contar un documento que leen sus tests (aquí, `capabilities.test.ts` lee `docs/ARCHITECTURE.md`).
  - impacto: alto
- A2: El registro vive en `.git/common/specty/verified/<huella>.json`, compartido por todas las worktrees del clon. Una unidad que pasó con esa huella en cualquier cambio no se repite, y solo se anotan las que pasan.
  - impacto: alto
- A3: Con `verify.units`, Specty ejecuta las unidades en lugar de `verify.full` en toda verificación completa. Corren en el orden de la configuración, y la primera que falla para las siguientes. Sin `verify.units`, todo sigue como hoy.
  - impacto: alto
- A4: Unos `paths` que no cubren lo que lee una unidad harían saltar tests que debían correr. Es responsabilidad de quien los escribe, y `specty verify --fresh` y el CI lo ejecutan todo.
  - impacto: alto
- A5: `change.verified` anota qué unidades corrieron y cuáles se reutilizaron, y `passedOnThisCode` y la reutilización sin código de hoy siguen igual.
- A6: `specty verify --fresh` lo puede ejecutar el agente o la persona: no concede nada. Ejecuta todas las unidades (o `verify.full` sin unidades) sin mirar el registro, en el turno y con todas las plazas, y repite una vez la que falla. Si pasa al repetirla, es inestable y queda en la memoria como lección de sus `paths`. Si falla las dos veces, queda como pendiente. Las que pasan se anotan en el registro.
- A7: Los tiempos de los tests salen de informes JUnit XML, que escriben casi todas las herramientas de tests. `checks.testTime` da `reports` (globs) y `maxMs`, y solo avisa, también en la aceptación.
- A8: Este repositorio configura sus unidades (estático, core, exporters, vscode, cli y ui). Cada una lleva su paquete, los paquetes de los que depende y los archivos de la raíz que leen sus tests y su herramienta.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` da `verify.units` ENTONCES cada unidad necesita un `name` único, un `command` y unos `paths` no vacíos, y la verificación completa de `accept` ejecuta sus unidades en orden en lugar de `verify.full`.
- AC2: CUANDO una unidad ya pasó con la misma huella, en este cambio o en otro del clon ENTONCES la verificación completa no la ejecuta, y su nota dice qué unidades reutilizó y cuáles ejecutó.
- AC3: CUANDO cambia un archivo que casa con los `paths` de una unidad, o su comando ENTONCES esa unidad vuelve a correr y las demás no.
- AC4: CUANDO una unidad falla ENTONCES la verificación completa falla con su salida, no ejecuta las siguientes y no anota la que falló.
- AC5: CUANDO la incorporación de main, `specty integrate` o la UI ejecutan la verificación completa ENTONCES usan las unidades y el registro como `accept`.
- AC6: CUANDO se ejecuta `specty verify --fresh` ENTONCES corre todas las unidades sin mirar el registro, repite una vez la que falla, y la salida da el resultado y el tiempo de cada una.
- AC7: CUANDO en `specty verify --fresh` una unidad falla y pasa al repetirla ENTONCES queda en la memoria como lección de inestabilidad de sus `paths`; si falla las dos veces, como pendiente.
- AC8: CUANDO `checks.testTime` da `reports` y `maxMs` y un informe JUnit tiene tests más lentos ENTONCES `specty check` avisa de cada uno con su archivo, su nombre y su tiempo, y la aceptación lo muestra.
- AC9: CUANDO se acepta en este repositorio un cambio que solo toca `packages/ui` ENTONCES la verificación completa no ejecuta los tests del CLI.
- AC10: CUANDO salen la nota de las unidades, la salida de `specty verify --fresh` o el aviso de los tests lentos ENTONCES salen en español y en inglés.

## Diseño

- Core: `verify.units` y `checks.testTime` en el esquema (`schema/config.ts`). La nota de las unidades reutilizadas y ejecutadas, la salida de `verify --fresh` y el aviso de tests lentos, en `cards/`. El lector de JUnit XML en `checks/`, puro.
- CLI: `flow/units.ts` (nuevo) calcula la huella de cada unidad, lee y escribe el registro y ejecuta las que faltan. `flow/full-verification.ts` le da paso en toda verificación completa (`accept`, `flow/integrate.ts`, `commands/integrate.ts`, `server/runs.ts`). `commands/verify.ts` (nuevo) es `specty verify --fresh`, registrado como comando del agente, y anota en la memoria como `close` hace con los pendientes. La comprobación `test-time` va en `check/`.
- Este repositorio: `.specty/config.yaml` con sus unidades y `checks.testTime`; Vitest escribe JUnit en cada paquete.
- Docs: ARCHITECTURE §9 (unidades y registro) y §6 (`verify --fresh`); formats.md §1 (`verified/`), §4 (`change.verified`) y §6 (`verify.units`, `checks.testTime`); checks.md (`test-time`).

## Cortes

- C1: La verificación completa de accept ejecuta solo las unidades que no pasaron ya
  - ac: AC1, AC2, AC3, AC4, AC10
- C2: La incorporación, integrate y la UI verifican por unidades
  - ac: AC5
  - depends: C1
- C3: Este repositorio verifica por unidades
  - ac: AC9
  - depends: C2
- C4: Una verificación fresca encuentra los tests inestables y los anota en la memoria
  - ac: AC6, AC7
  - depends: C1
- C5: La verificación avisa de los tests que pasan de un tiempo
  - ac: AC8
