---
kind: standard
---

# La terminal muestra el parche y la evidencia al decidir un desbloqueo

## Objetivo

Hoy, al decidir en la terminal una solicitud de alcance con `approve --scope` o `reject --scope`, la nota previa solo muestra las rutas y el motivo, aunque la solicitud desbloquee un test aprobado y lleve el parche y la evidencia (corte C2 de la épica `20261106-tests-con-codigo-y-desbloqueo-explicado`). Con este cambio, la nota muestra también el cambio exacto al test y cada fragmento de código que lo sustenta, con su ruta y sus líneas, para que la persona sepa qué se hará antes de decidir. Resuelve P210.

## Fuera de alcance

- La UI: ya muestra el parche y la evidencia (corte C3).
- Qué guarda la solicitud o el `scope.decided`, y los límites y comprobaciones de `scope add`.
- Los caracteres de control en las demás notas y tarjetas de la terminal.

## Supuestos

- A1: Basta con las primeras 40 líneas del parche y las primeras 10 de cada evidencia en la terminal, porque la solicitud pendiente se ve entera en la UI (corte C3) y la nota lo dice cuando omite algo.
  - impacto: bajo
- A2: Las rutas y el motivo siguen arriba, como hoy, y debajo van el parche y la evidencia con los mismos títulos que la UI: «El cambio al test» y «El código que lo sustenta».
  - impacto: bajo
- A3: Un retorno de carro al final de una línea es el fin de línea de Windows (CRLF) y se quita; en medio de una línea puede tapar lo que hay antes, y se muestra con su código como los demás caracteres de control.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona decide en la terminal una solicitud que lleva parche y evidencia ENTONCES la nota, antes de preguntar, muestra las rutas y el motivo, el parche bajo «El cambio al test» y cada evidencia bajo «El código que lo sustenta», con su ruta y sus líneas (`<ruta>:<desde>-<hasta>`) y cada línea con su número, en español y en inglés.
- AC2: CUANDO el parche pasa de 40 líneas o una evidencia de 10 ENTONCES la nota muestra solo las primeras, dice cuántas omite («… y N líneas más») y que la solicitud se ve entera en la UI.
- AC3: CUANDO la solicitud no lleva parche ni evidencia (de un CLI anterior, o de un archivo que no es un test aprobado) ENTONCES la nota es la de hoy: las rutas y el motivo.
- AC4: CUANDO las rutas, el motivo, el parche o la evidencia traen caracteres de control (como el escape de los colores o un retorno de carro a media línea) o de dirección del texto ENTONCES la nota los muestra con su código (`\u001b`) en lugar de dejar que la terminal los interprete.

## Diseño

- `cards/approve.ts`: `scopeRequestNote(request, ctx)` arma el cuerpo de la nota. Sin parche ni evidencia es el de hoy (`<rutas>\n— <motivo>`). Con ellos añade, tras una línea en blanco, «El cambio al test:» y las líneas del parche (sin la última vacía), y «El código que lo sustenta:» con `<ruta>:<desde>-<hasta>` y cada línea como `<número> │ <línea>`, con los números alineados. Si omite algo, termina con una línea que dice que la solicitud se ve entera en la UI (`<comando> ui`). Cada línea pasa por un filtro que cambia los caracteres de control C0 (menos el tabulador) y C1, y los de dirección (U+202A–U+202E, U+2066–U+2069), por `\uXXXX`, tras quitar el retorno de carro final.
- `cards/text.ts`: `cappedLines(lines, max, lang)` corta unas líneas y dice cuántas omite. Sale de `capped` en `cards/unlock-check.ts`, que la usa para sus diferencias con el mismo texto.
- `commands/scope-decision.ts`: pasa la solicitud a `scopeRequestNote` en lugar de armar el cuerpo.

## Archivos

- modificar packages/core/src/cards/approve.ts — `scopeRequestNote`, el cuerpo de la nota de la decisión de alcance
- modificar packages/core/src/cards/text.ts — `cappedLines`, el corte de líneas que comparten la nota y las diferencias de `task done`
- modificar packages/core/src/cards/unlock-check.ts — usa `cappedLines` en lugar de su `capped`
- modificar packages/core/src/cards/index.ts — exporta `scopeRequestNote` para la CLI
- modificar packages/core/test/cards/approve.test.ts — la nota con y sin parche, el corte y los caracteres de control
- modificar packages/cli/src/commands/scope-decision.ts — la nota sale de `scopeRequestNote`
- modificar packages/cli/test/test-locks.test.ts — la persona ve el parche y la evidencia al aprobar un desbloqueo
- modificar docs/ARCHITECTURE.md — cuenta qué muestra la terminal antes de decidir un desbloqueo

## Tareas

- [x] T1: Los textos arman la nota de una solicitud de alcance con su parche y su evidencia
  - files: packages/core/src/cards/approve.ts, packages/core/src/cards/text.ts, packages/core/src/cards/unlock-check.ts, packages/core/src/cards/index.ts, packages/core/test/cards/approve.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/approve.test.ts test/cards/unlock-check.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [x] T2: `approve --scope` y `reject --scope` muestran esa nota antes de preguntar
  - files: packages/cli/src/commands/scope-decision.ts, packages/cli/test/test-locks.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/test-locks.test.ts test/unlock-again.test.ts test/retro-into.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [x] T3: La arquitectura cuenta qué ve la persona antes de decidir un desbloqueo
  - files: docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm sources
  - type: docs
