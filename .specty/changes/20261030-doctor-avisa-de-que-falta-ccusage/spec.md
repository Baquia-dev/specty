---
kind: quick
---

# doctor avisa de que falta ccusage

## Objetivo

`init` solo ofrece ccusage al crear la configuración, así que un proyecto ya configurado no se entera de que el cierre no mide su consumo. `specty doctor` lo avisa cuando el cierre no encontraría ccusage, ni en `node_modules/.bin` ni en el PATH, con el comando para instalarlo que daría `init`: el de su gestor de Node (con `-w` en la raíz de un workspace de pnpm) o `npm i -g ccusage@20.0.45` fuera de Node. Es un aviso, no un problema: doctor no se pone en rojo.

## Archivos

- modificar packages/core/src/cards/doctor.ts — la línea `no-ccusage` y su texto en español e inglés
- modificar packages/cli/src/install/usage.ts — si el cierre encontraría ccusage y el comando para instalarlo, también para doctor
- modificar packages/cli/src/commands/doctor.ts — el aviso, junto a los demás
- modificar packages/core/test/cards/doctor.test.ts — el texto del aviso en los dos idiomas
- modificar packages/cli/test/init-usage.test.ts — doctor avisa en un proyecto configurado sin ccusage y calla con él en `node_modules/.bin` o en el PATH
- modificar docs/ARCHITECTURE.md — §13 y la lista de `specty doctor` en §14

## Tareas

- [x] T1: doctor avisa de que falta ccusage
  - files: packages/core/src/cards/doctor.ts, packages/cli/src/install/usage.ts, packages/cli/src/commands/doctor.ts, packages/core/test/cards/doctor.test.ts, packages/cli/test/init-usage.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/init-usage.test.ts && pnpm lint
