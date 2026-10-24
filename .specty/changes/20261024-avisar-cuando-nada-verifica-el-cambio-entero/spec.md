---
kind: quick
---

# Avisar cuando nada verifica el cambio entero

## Objetivo

Una tarea no se aprueba sin `verify` si no hay `verify.default` (`propose` ya lo impide), pero nada obliga a tener una verificación del cambio entero. Si `.specty/config.yaml` no tiene `verify.full` ni `verify.default`, como en un repositorio recién iniciado, `accept` no ofrece verificar nada, y `close` incorpora la rama principal sin comprobar el resultado; ninguno de los dos lo dice. Ahora `accept` le dice a la persona que solo se ejecutó el `verify` de cada tarea, y la línea de la incorporación al cerrar dice que el merge no se verificó y por qué. No cambia qué se ejecuta.

## Archivos

- modificar packages/cli/src/commands/accept.ts — el aviso al aceptar sin verificación del cambio entero
- modificar packages/cli/src/flow/integrate.ts — la incorporación dice que no se verificó
- crear packages/cli/test/unverified.test.ts — los dos avisos, y ninguno con `verify.default`

## Tareas

- [x] T1: Los avisos de `accept` y de la incorporación sin verificación
  - files: packages/cli/src/commands/accept.ts, packages/cli/src/flow/integrate.ts, packages/cli/test/unverified.test.ts
  - verify: pnpm check
  - type: feat
