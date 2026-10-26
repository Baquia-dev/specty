---
kind: standard
---

# El tamaño no cuenta lo generado y no bloquea el cierre

## Objetivo

Un cambio aprobado quedó atrapado en el cierre. Su *Files* tenía un glob sobre una carpeta ignorada (`android/app/src/main/res/**`). El cambio la llenó con unos 70 archivos generados, y al proponer el cierre el tamaño se recalculó con las coincidencias de ese momento. Salió XL, `split-required` rechazó el cierre, y `closing-outside` impide corregir *Files* en esa fase. Dos arreglos, para cualquier stack. Primero, el tamaño solo cuenta código escrito a mano: ni lo no gobernado, ni lo generado (`scope.generated` o una marca de generado en sus primeras líneas), ni los lockfiles, ni los binarios, como ya hacen los módulos, los archivos de código y `max-lines`. Segundo, el cierre no vuelve a exigir la división, porque el tamaño se decidió al aprobar.

## Fuera de alcance

- Congelar en `state.json` las coincidencias de cada glob al aprobar. Con los dos arreglos ya no puede atrapar un cierre: el cierre no mira el tamaño, y en `adjusting` la spec todavía se puede corregir. Guardarlas añadiría un campo del estado que mantener en sincronía.
- Cambiar los umbrales del tamaño, de `split` o del carril `quick`.
- Desbloquear el proyecto afectado, que está fuera de este repositorio: basta con la versión nueva de la CLI.

## Supuestos

- A1: Lo generado y lo binario se reconocen por su contenido, como en `max-lines`: una marca de generado en las 10 primeras líneas, o un byte nulo. La CLI lee cada ruta y cada coincidencia de los globs de *Files* que existe, y le pasa a core cuáles lo son; core no lee el disco. Un archivo que aún no existe cuenta como escrito a mano, salvo que caiga en `scope.generated`.
  - impacto: alto
- A2: Las marcas de generado añaden `DO NOT MODIFY` y `GENERATED CODE`, las que escriben build_runner y freezed en Dart (`GENERATED CODE - DO NOT MODIFY BY HAND`). Como la regla es la misma, `max-lines` tampoco mide ya esos archivos.
- A3: Lo no gobernado, como la documentación, deja de sumar también a la puntuación, no solo a los límites. Los tests siguen sumando a la puntuación, porque son código escrito a mano.
- A4: Al proponer el cierre, `propose` conserva en el estado el tamaño aprobado y no lo cambia por uno recalculado. Esa fase ya no mira el tamaño, así que guardar otro solo confundiría.

## Criterios de aceptación

- AC1: CUANDO una ruta o una coincidencia de un glob de *Files* no está gobernada, cae en `scope.generated`, es un lockfile, tiene una marca de generado o es binaria ENTONCES no suma al número de archivos, a las acciones, a la puntuación ni a los archivos de código.
- AC2: CUANDO un glob coincide con código gobernado escrito a mano ENTONCES cada coincidencia sigue sumando, y un cambio XL al proponerse sigue necesitando una épica.
- AC3: CUANDO se propone el cierre de un cambio aprobado, aunque su tamaño haya crecido ENTONCES `propose` no exige ni aconseja dividirlo, y el estado conserva el tamaño aprobado.
- AC4: CUANDO un cambio aprobado con un glob sobre una carpeta ignorada la llena con decenas de archivos ENTONCES el cierre se propone y `close` lo incorpora a main.
- AC5: CUANDO un cambio aprobado con un glob sobre código gobernado lo hace crecer hasta un tamaño XL ENTONCES el cierre igualmente se propone y se cierra.

## Archivos

- modificar packages/core/src/sizing/lines.ts — isGeneratedText, la regla de lo generado y lo binario que comparten el tamaño y max-lines, con las marcas de Dart
- modificar packages/core/src/sizing/size.ts — el tamaño solo cuenta código escrito a mano
- modificar packages/core/src/validate/quality.ts — checkSplit no corre en el cierre
- modificar packages/core/src/index.ts — exportar isGeneratedText
- crear packages/core/test/sizing/hand-written.test.ts — el tamaño de lo no gobernado, lo generado, los lockfiles y lo binario
- crear packages/core/test/validate/split-closing.test.ts — el cierre no exige dividir
- modificar packages/cli/src/flow/analysis.ts — decirle a core qué rutas y coincidencias son generadas o binarias
- modificar packages/cli/src/commands/propose.ts — el cierre conserva el tamaño aprobado
- crear packages/cli/test/closing-size.test.ts — el bloqueo, con una carpeta ignorada y con código gobernado
- modificar docs/formats.md — la regla del tamaño y los globs
- modificar docs/ARCHITECTURE.md — el tamaño y la división

## Tareas

- [x] T1: El tamaño solo cuenta código escrito a mano
  - files: packages/core/src/sizing/lines.ts, packages/core/src/sizing/size.ts, packages/core/src/index.ts, packages/core/test/sizing/hand-written.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: fix
- [ ] T2: El cierre no exige dividir
  - files: packages/core/src/validate/quality.ts, packages/core/test/validate/split-closing.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core test
  - type: fix
- [ ] T3: La CLI marca lo generado y el cierre no se atasca
  - files: packages/cli/src/flow/analysis.ts, packages/cli/src/commands/propose.ts, packages/cli/test/closing-size.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC3, AC4, AC5
  - verify: pnpm check
  - type: fix
