---
kind: quick
---

# Las dependencias de desarrollo sin vulnerabilidades conocidas

## Objetivo

Resuelve P63. La verificación `vulnerabilities` de `specty check --all` encuentra en `pnpm-lock.yaml` tres dependencias de desarrollo con avisos de OSV:
- `vite` 8.3.0 (de Angular y Vitest), corregida en 8.3.3;
- `@azure/msal-node` 6.0.1 (de `@azure/identity` 4.14.0, que trae `@vscode/vsce`), corregida en 7.1.0, la que pide `@azure/identity` 4.14.1;
- `minimatch` 10.2.6 (de `@vscode/vsce`), corregida solo en 11.0.1 (GHSA-g3hv-75wg-m249: denegación de servicio con patrones de glob).

`vite` y `@azure/identity` se actualizan dentro de los rangos que ya piden sus dependientes. `minimatch` no tiene una 10.x corregida, y hasta `@vscode/vsce` 4.1.0 pide ^10.2.6. Así que un override de `pnpm-workspace.yaml`, solo para `@vscode/vsce`, la sube a ^11.0.4, que admite Node ≥ 20. Se comprueba que `vsce` sigue empaquetando la extensión (`pnpm --filter specty-vscode package`). Ningún `package.json` cambia.

## Archivos

- modificar pnpm-workspace.yaml — el override de minimatch para @vscode/vsce, con su motivo
- modificar pnpm-lock.yaml — vite 8.3.3, @azure/identity 4.14.1 con @azure/msal-node 7 y minimatch 11 para vsce

## Tareas

- [x] T1: Las dependencias con avisos, actualizadas
  - files: pnpm-workspace.yaml, pnpm-lock.yaml
  - verify: pnpm install --frozen-lockfile --offline && pnpm --filter specty-vscode package && pnpm --filter @baquia-dev/specty-ui test
  - type: build
