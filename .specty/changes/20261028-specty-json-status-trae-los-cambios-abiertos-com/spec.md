---
kind: quick
---

# specty --json status trae los cambios abiertos como datos

## Objetivo

La extensión de VS Code lee el estado de `specty --json status`, pero hoy esa salida solo trae la tarjeta en texto, así que la extensión avisa de que hay que actualizar Specty. La salida pasa a traer también `changes` (cada cambio abierto con su id, tipo, fase, título, a quién espera, si es el de esta carpeta y, si no, su carpeta) y `delegated`. El texto de `specty status` no cambia.

## Archivos

- modificar packages/core/src/cards/human.ts — `statusCard` trae los cambios abiertos y el modo delegado como datos
- crear packages/cli/test/status-json.test.ts — los datos de `specty --json status`, desde la carpeta del cambio y desde la principal
- modificar docs/ARCHITECTURE.md — el contrato de salida dice qué datos trae `status --json`

## Tareas

- [x] T1: El estado como datos en `specty --json status`
  - files: packages/core/src/cards/human.ts, packages/cli/test/status-json.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/status-json.test.ts && pnpm lint
