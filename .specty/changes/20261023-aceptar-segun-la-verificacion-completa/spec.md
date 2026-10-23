---
kind: quick
follows:
  - 20261022-verificacion-completa-en-la-pestana-aceptacion
---

# Aceptar según la verificación completa

## Objetivo

La decisión de aceptar tiene en cuenta la verificación completa (`verify.full`), como hace `specty accept` en la terminal. Bajo «Aceptar resultado», en la cabecera, una línea dice cómo está: «La verificación completa aún no se ha ejecutado.» (atenuada), «… está corriendo.», «… es correcta.» (en verde) o «… falló.» (en rojo). El diálogo «Aceptar» lo repite: sin ejecutar, ofrece «Ejecutarla antes», que cierra el diálogo y la lanza; si falló, lo explica y el botón pasa a «Aceptar de todos modos». El diálogo sigue el estado mientras está abierto. Sin `verify.full` en el proyecto, no se muestra nada de esto.

## Archivos

- modificar packages/ui/src/acceptance/acceptance-actions.ts — el estado de la verificación completa en la cabecera y en el diálogo de aceptar
- modificar packages/ui/src/acceptance/acceptance-actions.test.ts — tests de cada estado y de «Ejecutarla antes»
- modificar docs/ui.md — aceptar según la verificación completa

## Tareas

- [x] T1: Aceptar según la verificación completa
  - files: packages/ui/src/acceptance/acceptance-actions.ts, packages/ui/src/acceptance/acceptance-actions.test.ts, docs/ui.md
  - verify: pnpm check
  - notes: Las acciones siguen la ejecución en vivo con `watchRun` (una ejecución sin tarea es la completa) y pasan ese estado vivo al diálogo. La línea va solo en la cabecera, no en la barra compacta. Comprobar en el navegador, a 390 y 1280 px, en claro y oscuro: sin ejecutar, corriendo, correcta y fallida (con el interruptor de la paleta), y «Ejecutarla antes» desde el diálogo.
