---
kind: standard
epic: 20261105-unidades-de-mas-workspaces
slice: C7
---

# La documentación de las unidades propuestas en cada workspace

## Objetivo

Desde C1–C6, `specty init` propone las unidades de `verify.units` en los workspaces de pnpm, npm y yarn, Cargo, `go.work`, uv, Gradle y pub o melos, pero formats.md §6 y ARCHITECTURE §9 solo nombran los de JavaScript. Con este corte, la documentación de `verify.units` dice qué workspaces reciben la propuesta, en qué orden se prueban, cuándo no se propone nada, con qué comando se ejecutan los tests de cada paquete y qué archivos de la raíz comparten.

## Fuera de alcance

- Cambiar los detectores, la propuesta de core o la tarjeta de `init`: solo cambia la documentación.
- Documentar los detectores en otros sitios (README, PRODUCT.md, `docs/dominio.md`), que no describen la propuesta.

## Supuestos

- A1: La propuesta se documenta en dos sitios: formats.md §6, con lo que propone en cada workspace (cuándo lo encuentra, con qué comando, de qué depende cada paquete y qué archivos de la raíz comparten), y ARCHITECTURE §9, con por qué no se escriben y dónde está el código (`proposeUnits` en core, `detect/workspace-units.ts` y un `detect/units-<workspace>.ts` por tipo).
- A2: Lo documentado es lo que hacen hoy los detectores de main, tal cual: no hay decisiones nuevas.

## Criterios de aceptación

- AC7: CUANDO se lee la documentación de `verify.units` ENTONCES dice qué workspaces recibe la propuesta y con qué comando.
  - test: manual

## Diseño

- formats.md §6: el párrafo de la propuesta pasa a decir que `init` prueba un detector por workspace, en orden (pnpm, npm o yarn; Cargo; `go.work`; uv; Gradle; pub o melos), y propone con el primero que encuentra al menos dos paquetes con tests; para cada uno, qué cuenta como paquete con tests, su comando, cómo se sabe de qué paquetes depende y los archivos de la raíz que comparten, y que no propone nada cuando la carpeta de un paquete sería la raíz entera.
- ARCHITECTURE §9: la frase de la propuesta nombra todos los workspaces, que cada detector lee los manifiestos de su ecosistema y que la lista ordenada está en `DETECTORS`; el motivo para no escribirlas habla de los manifiestos en general, no solo de los `package.json`.

## Archivos

- modificar docs/formats.md — qué workspaces reciben la propuesta, cuándo y con qué comando (§6)
- modificar docs/ARCHITECTURE.md — la propuesta para todos los workspaces y dónde está cada detector (§9)

## Tareas

- [ ] T1: La documentación de las unidades propuestas en cada workspace
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC7
  - verify: pnpm lint
  - type: docs
