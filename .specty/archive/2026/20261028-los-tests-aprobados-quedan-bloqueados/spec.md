---
kind: standard
follows:
  - 20261028-los-tests-de-una-feature-se-ven-fallar-y-se-apru
---

# Los tests aprobados quedan bloqueados

## Objetivo

Con `policy.tests: contract`, la persona ya aprueba los tests de una feature antes del código, pero después nada impide que el agente los cambie para que pasen. Este cambio, el primero del corte C3 de la épica «Tests como contrato», los bloquea:
- al aprobarlos, `state.json` guarda el hash de cada test enviado;
- el guard rechaza editar o borrar un test bloqueado, con un SIGUIENTE que pide parar y explicárselo al usuario;
- la comprobación nueva `tests-locked` falla si un test bloqueado ya no coincide con su hash. Corre con `specty check` aunque no lleve `--spec`, así que también la ve la CI de un PR.

Desbloquear un test, que solo decide la persona, llega con el cambio siguiente, el corte C3.

## Fuera de alcance

- Pedir y decidir el desbloqueo de un test, y que la aceptación lo muestre: el corte C3, que sigue a este.
- Bloquear los tests de un bug o de un ajuste (C4) y mostrar los bloqueos en la UI (C6).
- Bloquear caso a caso dentro de un archivo: el bloqueo es del archivo entero (A3 de la épica).

## Supuestos

- A1: Se bloquean los archivos del último envío de los tests (`tests.proposed`), con el hash de su contenido al aprobarlos; uno borrado en ese envío no se bloquea.
- A2: `tests-locked` mira todos los cambios abiertos de la carpeta, por sus `state.json`, sin depender de la rama: en la CI de un PR, la rama del cambio suele estar sin nombre.
  - impacto: alto
- A3: Un test bloqueado que falta en el disco cuenta como cambiado.

## Criterios de aceptación

- AC1: CUANDO la persona aprueba los tests enviados ENTONCES `state.json` guarda en `lockedTests` el hash de cada uno.
- AC2: CUANDO el agente intenta editar o borrar un test bloqueado ENTONCES el guard lo rechaza con la regla `locked`, y su SIGUIENTE le pide no cambiarlo y explicárselo al usuario si cree que está mal.
- AC3: CUANDO un test bloqueado no coincide con su hash o falta ENTONCES `specty check` falla con `tests-locked` y nombra el archivo, con `--spec` y sin él.
- AC4: CUANDO ningún cambio abierto tiene tests bloqueados ENTONCES `tests-locked` no señala nada.
- AC5: CUANDO se leen docs/formats.md, docs/ARCHITECTURE.md, docs/checks.md y docs/checks.en.md ENTONCES dicen qué se bloquea, la regla del guard y `tests-locked`.
  - test: manual

## Diseño

- `state.json` gana `lockedTests`, ruta → hash. `approveTests` lo llena con los archivos del último `tests.proposed`.
- `GuardChange.locked` lleva las rutas bloqueadas, y la regla `locked` las rechaza al escribir o borrar en cualquier fase, antes del alcance de la tarea. Sus textos van en `guard/testing.ts`.
- `check/locked.ts` define `tests-locked` y entra en las comprobaciones comunes. Lee los cambios abiertos con `listOpenChanges` y compara con `context.read`, así que con `--staged` mira lo preparado.

## Archivos

- modificar packages/core/src/schema/state.ts — `lockedTests`
- modificar packages/core/src/guard/decide.ts — la regla `locked`
- modificar packages/core/src/guard/testing.ts — los textos de la regla `locked`
- modificar packages/cli/src/commands/tests.ts — guarda los hashes al aprobar los tests
- modificar packages/cli/src/enforce/guard.ts — las rutas bloqueadas para el guard
- crear packages/cli/src/check/locked.ts — la comprobación `tests-locked`
- modificar packages/cli/src/check/common.ts — `tests-locked` entre las comprobaciones comunes
- crear packages/cli/test/test-locks.test.ts — el bloqueo, el guard y `tests-locked`
- modificar docs/formats.md — `lockedTests` y `tests-locked`
- modificar docs/ARCHITECTURE.md — §4: el bloqueo de los tests aprobados
- modificar docs/checks.md — `tests-locked`
- modificar docs/checks.en.md — `tests-locked`

## Tareas

- [x] T1: El estado guarda los tests aprobados y el guard los protege
  - files: packages/core/src/schema/state.ts, packages/core/src/guard/decide.ts, packages/core/src/guard/testing.ts, packages/cli/src/commands/tests.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/test-locks.test.ts
  - ac: AC1, AC2
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/schema test/guard && pnpm --filter @baquia-dev/specty exec vitest run test/test-locks.test.ts
- [x] T2: tests-locked compara los tests bloqueados con su hash
  - files: packages/cli/src/check/locked.ts, packages/cli/src/check/common.ts, packages/cli/test/test-locks.test.ts, docs/formats.md, docs/ARCHITECTURE.md, docs/checks.md, docs/checks.en.md
  - ac: AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/test-locks.test.ts test/check-docs.test.ts test/check.test.ts

## Riesgos

- R1: Hasta el cambio siguiente, un test aprobado que está mal no se puede corregir sin cancelar el cambio. Mitigación: `contract` es opcional y nadie lo usa todavía; el corte C3, que sigue a este, añade el desbloqueo.

## Cierre

### Resumen

Al aprobar los tests, `state.json` guarda en `lockedTests` el hash de cada test del último envío. El guard rechaza escribir o borrar un test bloqueado en cualquier fase, con la regla `locked` y textos en `guard/testing.ts`: no cambiarlo, explicárselo al usuario, y los tests nuevos en archivos nuevos. La comprobación común `tests-locked` (`check/locked.ts`) compara cada test bloqueado de los cambios abiertos de la carpeta con su hash, con `--spec` y sin él, así que también la ve la CI de un PR. checks, formats y ARCHITECTURE §4 lo documentan.

### Desviaciones

- `packages/cli/src/check/provider.ts` (S1): una comprobación puede responder `inapplicable` y queda fuera del informe, como una apagada. `tests-locked` lo hace donde no hay tests bloqueados. Contarla en todos los proyectos cambiaba la salida de cualquier `specty check` sin `contract` y rompía 52 tests que fijan el recuento.
- `packages/cli/test/check-docs.test.ts` (S2): como `tests-locked` solo aparece con tests bloqueados, la lista de comprobaciones documentadas la añade a mano, igual que `secrets`.

### Decisiones

- El bloqueo es del archivo entero y vale en cualquier fase: lo comprueba el guard antes que la fase y el alcance de la tarea, y solo la incorporación de la rama principal decide antes que él.

### Pendientes

- Pedir y decidir el desbloqueo de un test (solo la persona), que el hash nuevo sustituya al aprobado al completar la tarea, y que la aceptación lo muestre: el corte C3, que sigue a este. Allí el SIGUIENTE del guard nombrará la solicitud de desbloqueo.
