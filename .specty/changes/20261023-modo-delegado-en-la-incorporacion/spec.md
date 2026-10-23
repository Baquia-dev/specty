---
kind: standard
---

# Modo delegado en la incorporación

## Objetivo

Con el modo delegado activo, la incorporación sigue sola. Si un cierre choca, la salida le pide al agente que la resuelva y repita el cierre, en lugar de pedirle que se lo pida al usuario y termine su turno. Y un agente que cierra desde dentro de su propia worktree no se queda en una carpeta borrada. Hoy los textos de la incorporación ignoran el modo delegado, que se hizo en paralelo, y un conflicto detiene el flujo autónomo.

## Fuera de alcance

- Borrar más tarde las carpetas que el agente deja al cerrar desde dentro: va en el cambio de limpieza de worktrees y ramas incorporadas.
- Que el agente resuelva el reintento de un cambio ya cerrado: sigue siendo a mano, y lo hace la persona.

## Supuestos

- A1: Con el modo delegado activo, los textos de la incorporación se dirigen al agente, como ya hacen las tarjetas del núcleo («modo delegado: … tú»). Al dejar el merge, o mientras espera, le piden resolverlo con `specty next` y terminarlo con `specty integrate`; tras `integrate`, o si el merge ya no está en curso, le piden repetir él `close` (o `accept` en un quick). El camino a mano sigue dirigido a la persona, porque el agente no puede hacer commits.
- A2: Si quien cierra es el agente y su carpeta de trabajo está dentro de la worktree del cambio, Specty incorpora el cambio pero no borra la carpeta. La salida le pide salir de ella (en Claude Code, `ExitWorktree`) y seguir en la carpeta principal. Desde fuera, o si cierra la persona, la carpeta se borra como antes.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO en modo delegado `close` deja el merge para el agente ENTONCES el SIGUIENTE le pide resolverlo con `specty next` y `specty integrate` y repetir el cierre, sin mencionar al usuario; si el merge sigue en curso al repetir `close`, le pide terminarlo con `specty integrate`.
- AC2: CUANDO en modo delegado `specty integrate` termina, o el merge ya no está en curso, ENTONCES el SIGUIENTE le pide repetir él `specty close` (o `specty accept` en un quick).
- AC3: CUANDO el agente cierra en modo delegado desde dentro de la worktree del cambio ENTONCES el cambio se incorpora a `main`, la carpeta no se borra, y la salida le pide salir de ella (en Claude Code, `ExitWorktree`) y seguir en la carpeta principal.
- AC4: CUANDO el modo delegado no está activo, o cierra la persona, ENTONCES los textos y el borrado de la carpeta son los de siempre.

## Diseño

- `flow/integrate.ts`: `askAgent` devuelve, con el modo delegado (`session.cards.delegated`), el texto dirigido al agente. Lo usan `leaveForAgent` y la espera de `close` y `accept`.
- `commands/integrate.ts`: el SIGUIENTE de un `integrate` terminado, o sin merge en curso, se dirige al agente en modo delegado.
- `flow/land.ts`: `landChange` no borra la worktree si quien cierra es el agente (`session.actor`) y la carpeta de trabajo del proceso (`environment.cwd`) está dentro de ella; lo dice en `Landed`. `withIntegration` cambia entonces el SIGUIENTE para pedirle salir.

## Archivos

- modificar packages/cli/src/flow/integrate.ts — textos dirigidos al agente en modo delegado
- modificar packages/cli/src/commands/integrate.ts — el SIGUIENTE de `integrate` en modo delegado
- modificar packages/cli/src/flow/land.ts — no borrar la carpeta en la que está el agente que cierra
- crear packages/cli/test/delegated-integration.test.ts — conflicto, integración y cierre en modo delegado
- modificar docs/ARCHITECTURE.md — §9: la incorporación en modo delegado

## Tareas

- [x] T1: La incorporación habla al agente en modo delegado
  - files: packages/cli/src/flow/integrate.ts, packages/cli/src/commands/integrate.ts, packages/cli/test/delegated-integration.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/delegated-integration.test.ts test/resolve.test.ts test/integrate.test.ts
- [x] T2: El agente que cierra desde dentro no pierde su carpeta
  - files: packages/cli/src/flow/land.ts, packages/cli/test/delegated-integration.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/delegated-integration.test.ts test/integrate.test.ts test/anywhere.test.ts
- [ ] T3: Documentar la incorporación en modo delegado
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Quedan carpetas de cambios ya cerrados mientras no llegue la limpieza — la salida las nombra, y el cambio de limpieza es el siguiente de la serie.
