---
kind: standard
---

# El cierre vuelve a incorporar main si avanzó mientras tanto

## Objetivo

El cierre toma el turno de la verificación completa antes de incorporar main, pero lo espera como mucho `verify.timeoutSec` y después sigue sin él; con varias sesiones y la máquina cargada, una verificación tarda eso mismo, así que otra sesión integra mientras tanto. Main también avanza sin pasar por el turno (un `specty init` en la carpeta principal, un commit a mano). Hoy el cierre se queda en «main no avanzó» y hay que repetir `specty close`, a veces varias veces. Con este cambio, cuando main avanzó mientras el cambio se integraba, el cierre hace lo que haría ese `specty close`: incorpora main otra vez, verifica e integra, hasta dos veces más.

## Fuera de alcance

- Cambiar cuánto espera el turno.
- Un avance rápido que falla por otra causa (la carpeta de main con cambios, un error de git): sigue diciéndolo como hoy.
- Una nueva incorporación con conflictos o con la verificación en rojo: el cierre se queda sin integrar, como hoy, y `specty close` lo dice.

## Supuestos

- A1: Main avanzó cuando la rama del cambio, que ya lo incorporó, no lo contiene; solo entonces se reintenta.
  - impacto: alto
- A2: El reintento es el de `specty close` sobre un cambio ya cerrado (`landClosed`): lee el cambio archivado, incorpora main con su verificación y lo integra; vale igual tras `close`, tras su reintento y tras el `accept` del carril rápido.

## Criterios de aceptación

- AC1: CUANDO main avanza mientras `close` verifica la incorporación ENTONCES el cierre incorpora main otra vez, la verifica y el cambio llega a main, sin «main no avanzó» ni tener que repetir `specty close`.
- AC2: CUANDO main sigue avanzando en cada intento ENTONCES el cierre lo intenta como mucho tres veces en total y después dice, como hoy, que main no avanzó y que se vuelva a ejecutar `specty close`.

## Diseño

- `flow/land.ts`: `landRetrying(session, plan)` llama a `landChange`; mientras no integra, main avanzó (`contains(HEAD, target)` es falso) y quedan intentos (2), lee el cambio con `findChange`, llama a `absorbTarget(…, "close")` y vuelve a `landChange`. Devuelve un `Landed` con las líneas de cada incorporación antes de las del aterrizaje final; si una incorporación se rechaza, se queda con el último `Landed`.
- `commands/finish.ts` (`closeOnTurn`, `landClosed`) y `commands/accept.ts` (`closeQuickOnTurn`) usan `landRetrying` en vez de `landChange`.

## Archivos

- modificar packages/cli/src/flow/land.ts — volver a incorporar main e integrar cuando avanzó
- modificar packages/cli/src/commands/finish.ts — `close` y su reintento con `landRetrying`
- modificar packages/cli/src/commands/accept.ts — el carril rápido con `landRetrying`
- crear packages/cli/test/close-moved.test.ts — main que avanza durante el cierre, una vez y siempre
- modificar docs/ARCHITECTURE.md — el reintento al integrar

## Tareas

- [x] T1: El cierre vuelve a incorporar main si avanzó
  - files: packages/cli/src/flow/land.ts, packages/cli/src/commands/finish.ts, packages/cli/src/commands/accept.ts, packages/cli/test/close-moved.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/close-moved.test.ts test/integrate.test.ts test/close-turn.test.ts && pnpm typecheck && pnpm lint
  - type: fix
- [ ] T2: La documentación
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
