---
kind: quick
---

# En aceptación delegada, la tarjeta muestra las observaciones de la revisión que el cierre no cita

## Objetivo

En modo delegado, el agente escribe en aceptación el cierre de un cambio `standard` o `spike` (`closingInAcceptance`), y la tarjeta de aceptación ya trae «OBSERVACIONES DE LA REVISIÓN» en su «CÓMO CERRAR», pero la vista solo lee esas observaciones en `closing`, así que en aceptación salen vacías y el cierre no puede citarlas (P247). Con este cambio, la vista también las lee en aceptación cuando se aplica `closingInAcceptance` con el modo delegado de la sesión: la tarjeta muestra las altas y medias de la última revisión del resultado que el cierre aún no cita, como en `closing`. Las que el cierre enviado no cita pasan a la memoria cuando el `accept` lo cierra, como ya hace. Sin modo delegado, la aceptación no las muestra, como hoy.

## Archivos

- modificar packages/cli/src/flow/views.ts — en aceptación con `closingInAcceptance` y el modo delegado de la sesión, la vista lee las observaciones que el cierre no cita (`closingRemarks`)
- modificar packages/cli/test/review-remarks.test.ts — en aceptación delegada, la tarjeta muestra las observaciones hasta que el cierre las cita y el `accept` que cierra deja en la memoria las que no cita; sin modo delegado, la aceptación no las muestra
- modificar docs/ARCHITECTURE.md — §4 y §7: la tarjeta de la aceptación delegada muestra las observaciones que el cierre aún no cita
- modificar docs/formats.md — §6: las observaciones salen también en la aceptación delegada, y pasan a la memoria con el `accept` que cierra

## Tareas

- [x] T1: En aceptación delegada, la tarjeta muestra las observaciones de la revisión que el cierre no cita
  - files: packages/cli/src/flow/views.ts, packages/cli/test/review-remarks.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/review-remarks.test.ts test/closing-ahead.test.ts && pnpm typecheck && pnpm lint
  - type: fix
