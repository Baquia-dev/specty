---
kind: quick
follows:
  - 20261022-verificacion-completa-en-la-pestana-aceptacion
---

# La salida en vivo aparece con una animación

## Objetivo

El panel de la salida en vivo deja de aparecer de golpe. Al empezar una verificación, y al volver a mostrarlo con «Ver salida en vivo», el panel se abre desde arriba, ganando altura y opacidad, y la línea del reloj entra con un leve desvanecido. Usa los tiempos del sistema (`--duration-base` y `--ease-standard`), así que con movimiento reducido aparece sin animación. Es el mismo bloque en Aceptación y en Progreso. Lo pidió la persona al revisar «Verificación completa en la pestaña Aceptación».

## Archivos

- modificar packages/ui/src/progress/live-output.ts — la entrada animada del bloque y del panel
- modificar packages/ui/src/progress/live-output.test.ts — que el panel y la línea del reloj entran con transición
- modificar docs/ui.md — la animación de la salida en vivo

## Tareas

- [x] T1: La entrada animada de la salida en vivo
  - files: packages/ui/src/progress/live-output.ts, packages/ui/src/progress/live-output.test.ts, docs/ui.md
  - verify: pnpm check
  - notes: Comprobar en el navegador, a 390 y 1280 px, en claro y oscuro, en Aceptación y en Progreso: que el panel se abre al empezar y al mostrarlo de nuevo, y que con movimiento reducido aparece sin animación.

## Cierre

### Resumen

live-output.ts: el bloque en vivo entra desde un poco más arriba con un desvanecido (transition-[opacity,translate] con starting:) y el panel de la salida se abre desde arriba (transition-[height,opacity], starting:h-0 y opacity-0), con transition-duration var(--duration-base) y var(--ease-standard): con movimiento reducido el token vale 0 ms y aparece sin animación. Vale al empezar una verificación y al volver a mostrar la salida, en Aceptación y en Progreso. live-output.test.ts comprueba las clases y el tiempo. docs/ui.md lo describe. Medido en el navegador a 390 y 1280 px: de 22 a 288 px y de opacidad 0 a 1 en unos 200 ms; con movimiento reducido, 288 px y opacidad 1 desde el primer instante.
