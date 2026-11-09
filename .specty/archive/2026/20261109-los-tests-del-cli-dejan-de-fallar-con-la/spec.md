---
kind: quick
---

# Los tests del CLI dejan de fallar con la máquina cargada

## Objetivo

Resuelve P117 y la parte de P118 de `packages/cli/test/init-usage.test.ts`, y da por hechas P80 y P103, que ya resolvieron otros cambios: P80 lo arregló `20261104-el-fin-de-una-verificacion-completa-de-la-ui` (P84: el aviso de fin sale tras soltar el turno, y AC2 de `runs-turn.test.ts` lo comprueba en el momento del aviso), y P103 `20261105-specty-new-no-deja-carpetas-a-medias` (`markBranch` reintenta `git config` tras 50, 100, 200, 400 y 800 ms con `lockWaits`). Hoy cada test del CLI tiene 60 s (`testTimeout` de `packages/cli/vitest.config.ts`), y con la máquina cargada los que hacen commits con `init` se pasan: en la última verificación completa (JUnit del 2026-11-08) AC4 de `init-usage` tardó 10,6 s y el test más lento del CLI 35 s, así que una carga como la de P118 (40-66 en 14 núcleos) los lleva por encima del límite. Los hooks de git de esos commits ya son baratos: en el commit de `init`, `pre-commit` toma el recibo y deja la marca, y `prepare-commit-msg` la toma y sale; cada uno es un proceso de `node` con la entrada ligera de los hooks (unos 80-100 ms de CPU y siete procesos de git), de los 1,2 s que tarda `init` a carga 11. Con este cambio, cada test del CLI tiene 300 s, que cubren esa carga con margen, y un test colgado sigue fallando por tiempo mucho antes del plazo de la verificación completa (`verify.timeoutSec`, 2000 s).

## Archivos

- modificar packages/cli/vitest.config.ts — cada test del CLI tiene 300 s, con el motivo en un comentario

## Tareas

- [x] T1: Cada test del CLI tiene 300 s
  - files: packages/cli/vitest.config.ts
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-usage.test.ts test/init-worktrees.test.ts test/mcp-install.test.ts test/opencode-install.test.ts test/session-resume.test.ts test/server/runs-turn.test.ts test/epic-subagents.test.ts && pnpm typecheck && pnpm lint
  - type: chore

## Cierre

### Resumen

testTimeout del CLI de 60 s a 300 s, con el motivo en un comentario; P80 y P103 ya estaban resueltas por otros cambios
