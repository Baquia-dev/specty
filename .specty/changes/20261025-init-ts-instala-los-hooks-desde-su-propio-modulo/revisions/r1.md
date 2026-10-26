---
kind: quick
---

# init.ts instala los hooks desde su propio módulo

## Objetivo

`packages/cli/src/commands/init.ts` llegó a 307 líneas de código, por encima del aviso de 300, porque mezcla dos responsabilidades. Una es preparar el proyecto: la configuración, AGENTS.md, PRODUCT.md, el commit y la salida. La otra es instalar los hooks que hacen cumplir el flujo, las capas 2 y 3 de ARCHITECTURE §10: el guard de cada herramienta del agente, los hooks de git y el aviso de que los hooks usan la ruta del script. Esto último pasa a `packages/cli/src/install/hooks.ts`, que devuelve lo que instaló, los avisos y los archivos que van al commit, como ya hace `install/commit.ts`. `init` hace lo mismo que antes, con los mismos textos y en el mismo orden.

## Archivos

- modificar packages/cli/src/commands/init.ts — preparar el proyecto y pedir los hooks a install/hooks.ts
- crear packages/cli/src/install/hooks.ts — el guard de cada herramienta, los hooks de git y el aviso del PATH

## Tareas

- [ ] T1: init instala los hooks desde install/hooks.ts
  - files: packages/cli/src/commands/init.ts, packages/cli/src/install/hooks.ts
  - verify: pnpm check
  - type: refactor
