---
kind: quick
---

# El fin de turno del plugin de OpenCode salta las sesiones hijas de los subagentes

## Objetivo

Resuelve P92. Con `specty check --install` (`STOP`), el plugin de OpenCode ejecuta el fin de turno en cada `session.idle`, y OpenCode 1.19.5 lo publica también cuando termina la sesión hija de un subagente. Con `specty check --changed` en rojo, el plugin le devuelve el turno al subagente cuando `task` ya respondió a la sesión principal, que no ve ese trabajo. Con este cambio, en OpenCode 1 el plugin pide la sesión con `client.session.get` y salta el fin de turno de una sesión con `parentID`, como Claude Code, donde Specty no engancha `SubagentStop`: el informe le llega a la sesión principal en su propio fin de turno. Si OpenCode no da la sesión (la petición falla o responde con un error), el plugin comprueba el fin de turno como hoy y nunca lanza. En OpenCode 2 (beta) el fin de turno sigue como está, porque no consta cómo da su API la sesión de un evento; su comprobación queda con la de los subagentes de OpenCode 2 en P93.

## Archivos

- modificar packages/cli/src/install/opencode.ts — el plugin salta en OpenCode 1 el fin de turno de las sesiones con `parentID`
- modificar packages/cli/test/opencode.test.ts — el fin de turno de una sesión hija, el de la principal y el de una sesión que OpenCode no da
- modificar docs/ARCHITECTURE.md — el fin de turno de OpenCode y sus subagentes
- modificar docs/formats.md — el plugin ejecuta el hook en cada `session.idle` salvo el de una sesión hija

## Tareas

- [x] T1: El plugin de OpenCode 1 salta el fin de turno de las sesiones hijas
  - files: packages/cli/src/install/opencode.ts, packages/cli/test/opencode.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode.test.ts test/opencode-install.test.ts && pnpm typecheck
  - type: fix

## Cierre

### Resumen

En OpenCode 1, el plugin pide la sesión de cada session.idle con client.session.get y salta el fin de turno de una sesión hija (con parentID); si no la obtiene, la comprueba como hoy. OpenCode 2 sigue igual (P93). Docs en ARCHITECTURE §10 y formats.
