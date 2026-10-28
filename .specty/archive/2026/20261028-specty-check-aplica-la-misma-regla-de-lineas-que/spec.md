---
kind: quick
---

# specty check aplica la misma regla de líneas que task done

## Objetivo

`task done` solo bloquea cuando la tarea lleva un archivo por encima de `lines.fail`, y avisa cuando hace crecer uno que ya pasaba de `lines.warn`. `specty check`, en cambio, falla con cualquier archivo cambiado que pase de `lines.fail`, aunque ya pasara antes del cambio: tocar una línea de un archivo heredado de 520 hace fallar la CI y empuja a dividirlo por el número. Desde este cambio, `specty check` aplica la misma regla que `task done`, comparando con el punto de partida del modo (la base con `--changed`, HEAD con `--staged`); con `--all` no hay punto de partida y cuenta cada archivo como hoy.

## Archivos

- modificar packages/cli/src/check/max-lines.ts — usar `longFiles` de core con el texto de partida
- modificar packages/cli/test/check.test.ts — un archivo que ya pasaba del máximo solo avisa si crece; uno que lo cruza falla
- modificar docs/checks.md — `max-lines`: cuándo falla y cuándo avisa
- modificar docs/checks.en.md — lo mismo en inglés

## Tareas

- [x] T1: specty check aplica la misma regla de líneas que task done
  - files: packages/cli/src/check/max-lines.ts, packages/cli/test/check.test.ts, docs/checks.md, docs/checks.en.md
  - verify: pnpm typecheck && pnpm lint && pnpm knip && pnpm --filter @baquia-dev/specty build && pnpm --filter @baquia-dev/specty exec vitest run test/check.test.ts test/check-examples-ts.test.ts test/check-examples-flutter.test.ts
  - type: feat

## Cierre

### Resumen

max-lines de specty check usa longFiles de core con el texto de partida del modo: solo falla lo que el cambio lleva por encima de lines.fail; --all cuenta todo; test visto en rojo; checks.md/en
