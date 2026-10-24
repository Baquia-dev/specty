---
kind: standard
---

# knip en pnpm check

## Objetivo

Primera parte del punto «CI en Linux, macOS y Windows, más knip y `npm publish --provenance`», dividido por tamaño: el CI y la publicación van en el cambio siguiente. El repositorio no tiene control de código muerto, y Specty instala hooks que se ejecutan en cada acción del agente: cuanto menos código sobre, menos hay que revisar. `pnpm check` ejecuta ahora knip, que falla si sobra un archivo, una dependencia o un binario, o si un import no se resuelve.

## Fuera de alcance

- El CI y la publicación: el cambio siguiente.
- Quitar las exportaciones sin usar que hoy encuentra knip (34 exportaciones y 13 tipos, en core, la CLI y la UI): tocan archivos de los tres carriles, y va como cambio aparte.

## Supuestos

- A1: knip va en `pnpm check` con sus reglas de exportaciones y tipos apagadas, así que hoy exige lo demás y pasa; las exportaciones se encienden cuando se limpien.
  - impacto: alto
- A2: Se usa knip 6.41.0, la última versión con más de dos semanas, fijada como las demás dependencias.
- A3: knip descubre solo los paquetes del workspace y sus entradas (los plugins de Vitest, Angular y esbuild); si hace falta, `knip.json` añade las que no ve.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `pnpm check` ENTONCES también ejecuta knip, después de los tipos y antes de los tests.
- AC2: CUANDO el repositorio está como hoy ENTONCES knip pasa.
- AC3: CUANDO sobra un archivo o una dependencia ENTONCES knip falla y lo nombra.

## Archivos

- crear knip.json — configuración de knip
- modificar package.json — knip como dependencia de desarrollo, el script `knip` y `check`
- modificar pnpm-lock.yaml — la dependencia nueva
- modificar AGENTS.md — `pnpm check` también ejecuta knip

## Tareas

- [x] T1: knip en `pnpm check`
  - files: knip.json, package.json, pnpm-lock.yaml, AGENTS.md
  - ac: AC1, AC2, AC3
  - verify: pnpm check
  - type: build

## Riesgos

- R1: knip lento o ruidoso en cada verificación — tarda alrededor de un segundo, y con las exportaciones apagadas hoy no dice nada.
- R2: Un falso aviso de knip bloquearía `pnpm check` de todas las sesiones — hoy pasa limpio, y `knip.json` puede ignorar un caso concreto con su motivo.

## Cierre

### Resumen

knip 6.41.0 es una dependencia de desarrollo fijada, y `pnpm check` lo ejecuta (`pnpm knip`) tras comprobar los tamaños y antes de los tests. `knip.json` apaga las reglas de exportaciones y tipos, así que hoy exige que no sobren archivos, dependencias ni binarios y que se resuelvan todos los imports, y pasa en un segundo. En un proyecto de prueba con un archivo y una dependencia de más, falla y los nombra. knip descubrió solo los tres paquetes y sus entradas, sin configurarlas.

### Desviaciones

- **El punto se dividió en dos cambios:** con los workflows de `.github/` (ruta sensible) y la dependencia nueva, la spec completa salió XL. Este cambio es knip; el CI y la publicación van en el siguiente.

### Decisiones

- **Las exportaciones sin usar, apagadas por ahora:** encenderlas obliga a tocar unos 35 archivos de los tres carriles, y es mejor un cambio aparte que choque menos.
- **Sin entradas a mano en `knip.json`:** los plugins de Vitest, Angular y esbuild ya las encuentran.

### Pendientes

- **Quitar las 34 exportaciones y los 13 tipos sin usar** que lista `pnpm exec knip --include exports,types`, y después encender esas reglas.
- **El CI y la publicación con procedencia:** el cambio siguiente.
