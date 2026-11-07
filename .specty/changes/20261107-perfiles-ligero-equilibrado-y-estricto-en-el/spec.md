---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C4
---

# Perfiles Ligero, Equilibrado y Estricto en el modo básico

## Objetivo

En la vista Flujo, en Básico, la persona ve los perfiles Ligero, Equilibrado, Estricto y Propio, cada uno con lo que fija, y marcado el que coincide con su configuración. Elegir uno muestra en la línea de fases y en sus frases cómo quedaría el flujo antes de guardar, y «Revisar y guardar» escribe solo las claves que cambian. Así arma un flujo razonable de un clic, sin conocer cada ajuste.

## Fuera de alcance

- Perfiles definidos por la persona, y guardar el nombre del perfil en `config.yaml`: el perfil se deduce de los valores.
- Que un perfil cambie `split`, `size`, `checks.levels`, comandos, rutas o garantías (A1).
- Decir qué ajustes difieren del perfil más cercano, como el «Perfil Estricto, con 2 ajustes propios» de la maqueta: si no coincide ninguno, es Propio.
- Los perfiles en la vista General y en Avanzado.
- Cambiar el diálogo «Revisar y guardar» o el servidor: se guarda con los de C10 y C2.

## Supuestos

- A1: Los perfiles fijan nueve claves: `policy.tests`, `lines.warn`, `lines.fail`, `lines.tests.warn`, `lines.tests.fail`, `checks.functions.maxLines`, `checks.functions.complexity`, `checks.coverage.warn` y `checks.coverage.error`. Equilibrado les da sus valores por defecto: `recommended`, 300, 500, 400, 600, 50, 10, 80 y ninguno.
  - impacto: alto
- A2: Ligero es para prototipos, donde el código cambia de forma antes de que sus tests compensen. Lleva `policy.tests: off`, así que Specty no pide tests ni avisa de una tarea sin ellos. Sus límites avisan donde Equilibrado bloquea y bloquean al doble: `lines.warn` 500 y `lines.fail` 1000, y en los tests `lines.tests.warn` 600 y `lines.tests.fail` 1200. Las funciones llegan a 100 líneas (`checks.functions.maxLines`, el doble) y a complejidad 20 (`checks.functions.complexity`), el máximo por defecto de la regla `complexity` de ESLint. La cobertura queda como en Equilibrado: solo avisa, y sin tests no hay informe que medir.
  - impacto: alto
- A3: Estricto endurece lo que comprueba que el código hace lo que dice, sus tests, y no el tamaño, que Equilibrado ya bloquea. Lleva `policy.tests: contract`, con los tests de cada feature aprobados antes del código y la fase Tests en la línea. La cobertura del diff falla por debajo del 80 % (`checks.coverage.error`, el aviso de Equilibrado pasa a suelo) y avisa por debajo del 90 % (`checks.coverage.warn`). Sus límites de líneas y de funciones son los de Equilibrado.
  - impacto: alto
- A4: Ningún perfil cambia `split`: un cambio de más de 8 tareas o 15 archivos ya sale XL por su puntuación (`size.L`, 18), así que subirlo en Ligero no haría nada sin tocar `size`, y bajarlo en Estricto partiría cortes que hoy caben. Tampoco cambian `checks.levels`, porque cada verificación ya es error por defecto y su nivel no convierte sus avisos en fallos. Ninguno toca comandos, rutas ni garantías.
  - impacto: medio
- A5: Un perfil coincide cuando cada una de las nueve claves tiene su valor en la configuración con las ediciones sin guardar, es decir, el del archivo o, sin él, el de por defecto. Las demás claves no cuentan. Si no coincide ninguno, se marca Propio, que no se elige: dice que es lo que se arma en Avanzado.
  - impacto: medio
- A6: Elegir un perfil son ediciones de la página, una por cada una de las nueve claves, y sustituyen a las que hubiera de esas claves. Cada clave toma el valor del perfil; si es el de por defecto, sale del archivo, y si el archivo ya tiene ese valor, se queda como está. Se guardan con el diálogo de C10, que pide confirmar aparte el cambio de `policy.tests` porque afecta permisos.
  - impacto: medio
- A7: Los perfiles van en la vista Flujo en Básico, encima de la línea de fases, como en la maqueta de la propuesta B. Equilibrado lleva la marca «Por defecto» y el que coincide, «Elegido». En solo lectura se ven con su marca pero no se eligen.
  - impacto: medio
- A8: Bajo la línea, tras las frases de hoy, tres frases más del core dicen los límites con los valores de la configuración. Son el límite de líneas por archivo, el de las funciones y la cobertura del diff. Así, elegir un perfil cambia las frases además de la línea.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona abre la vista Flujo en Básico ENTONCES ve, encima de la línea de fases, los perfiles Ligero, Equilibrado, Estricto y Propio, cada uno con lo que fija. Equilibrado lleva la marca «Por defecto», y el que coincide con la configuración lleva «Elegido»: Propio si no coincide ninguno.
- AC2: CUANDO las nueve claves de los perfiles tienen los valores de uno ENTONCES ese perfil sale elegido, aunque otras claves difieran de las de por defecto.
- AC3: CUANDO elige un perfil ENTONCES ese perfil sale elegido, y la línea de fases y sus frases muestran el flujo con sus valores antes de guardar.
- AC4: CUANDO está en Básico ENTONCES las frases bajo la línea dicen también el límite de líneas por archivo, el de las funciones y la cobertura del diff, con los valores de la configuración y las ediciones sin guardar.
- AC5: CUANDO, tras elegir un perfil, pulsa «Revisar y guardar» y guarda ENTONCES el diálogo lista solo los ajustes cuyo valor en el archivo cambia, y el archivo cambia solo en esas claves. Las que ya tenían el valor del perfil quedan como estaban.
- AC6: CUANDO elige otro perfil, o vuelve al que tiene el archivo ENTONCES sus ediciones sustituyen a las del anterior, y con el del archivo no queda nada por guardar.
- AC7: CUANDO se aplica cualquier perfil ENTONCES solo cambian `policy.tests` y los límites de `lines`, `checks.functions` y `checks.coverage`, nunca comandos, rutas ni garantías, y la configuración que resulta es válida.
- AC8: CUANDO la página es de solo lectura ENTONCES los perfiles se ven con sus marcas, pero no se pueden elegir. CUANDO está en Avanzado ENTONCES no se ven.
- AC9: CUANDO la UI está en inglés ENTONCES los perfiles, sus marcas, lo que fija cada uno y las frases de los límites salen en inglés.

## Diseño

- Core (`settings/presets.ts`, puro): `PRESETS` (`light`, `balanced` y `strict`), `PRESET_KEYS` (las nueve claves de A1, en el orden de la página), `presetValue(preset, key, fallback)` (su valor propio o el de por defecto), `presetOf(value, fallback)` (el perfil que coincide, o `custom`) y `presetEdits(preset, file, fallback)` (una edición por clave, según A6). `value`, `file` y `fallback` son `SettingValue` (`settings/pieces.ts`): el valor con las ediciones, el del archivo sin valores por defecto y el de por defecto.
- Textos (`cards/settings-presets.ts`): `presetText(preset, fallback, lang)` da el nombre y lo que fija cada perfil y Propio, con los números de sus valores, y `limitSentences(value, lang)` da las tres frases de A8, que `flowSentences` añade al final. Todo se exporta desde `light.ts`.
- UI: `settings/settings-presets.ts` (`sp-settings-presets`) recibe la configuración, el valor con las ediciones y si se puede editar. Dibuja una tarjeta por perfil, botones con `aria-pressed` si se puede editar, y emite las ediciones de `presetEdits` como las de una pieza. `sp-settings-flow` lo pone encima de la línea en Básico y pasa sus ediciones a la página por su salida `edit`, así que `settings-page.ts` no cambia.
- Tests: en el core, `test/settings/presets.test.ts` compara la lista exacta de claves y la tabla de valores de cada perfil, y comprueba la coincidencia, las ediciones, la validez con `resolveConfig` y los textos. `test/settings/pieces.test.ts` añade las frases de los límites a sus listas exactas de frases. En la UI, por la página como los de C3 y C10: `settings-presets.test.ts` (los perfiles, elegir, guardar, solo lectura, Avanzado e inglés) y la lista exacta de frases de `settings-flow.test.ts`.

## Archivos

- crear packages/core/src/settings/presets.ts — los perfiles, sus claves y valores, cuál coincide y las ediciones de elegir uno
- crear packages/core/src/cards/settings-presets.ts — el nombre y lo que fija cada perfil, y las frases de los límites, en español y en inglés
- modificar packages/core/src/cards/settings-pieces.ts — las frases del flujo terminan con las de los límites
- modificar packages/core/src/light.ts — exporta los perfiles y sus textos
- crear packages/core/test/settings/presets.test.ts — las claves, los valores, la coincidencia, las ediciones, la validez y los textos de los perfiles
- modificar packages/core/test/settings/pieces.test.ts — las listas exactas de frases con las de los límites
- crear packages/ui/src/settings/settings-presets.ts — las tarjetas de los perfiles y elegir uno
- crear packages/ui/src/settings/settings-presets.test.ts — los perfiles en Básico, elegir, guardar, solo lectura, Avanzado e inglés
- modificar packages/ui/src/settings/settings-flow.ts — los perfiles encima de la línea en Básico
- modificar packages/ui/src/settings/settings-flow.test.ts — la lista exacta de frases con las de los límites
- modificar docs/ui.md — los perfiles de la vista Flujo
- modificar docs/dominio.md — el término «Perfil»

## Tareas

- [x] T1: El core define los perfiles, cuál coincide, las ediciones de elegir uno y sus textos
  - files: packages/core/src/settings/presets.ts, packages/core/src/cards/settings-presets.ts, packages/core/src/light.ts, packages/core/test/settings/presets.test.ts, docs/dominio.md
  - ac: AC1, AC2, AC5, AC6, AC7, AC9
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/presets.test.ts
- [x] T2: Las frases del flujo dicen los límites de líneas, funciones y cobertura
  - files: packages/core/src/cards/settings-presets.ts, packages/core/src/cards/settings-pieces.ts, packages/core/test/settings/pieces.test.ts
  - ac: AC4, AC9
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/pieces.test.ts test/settings/presets.test.ts && pnpm --filter @baquia-dev/specty-core typecheck
- [ ] T3: La vista Flujo en Básico muestra los perfiles, marca el elegido y elegir uno cambia la línea y sus frases
  - files: packages/ui/src/settings/settings-presets.ts, packages/ui/src/settings/settings-presets.test.ts, packages/ui/src/settings/settings-flow.ts, packages/ui/src/settings/settings-flow.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3, AC4, AC5, AC6, AC8, AC9
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-presets.test.ts --include src/settings/settings-flow.test.ts && pnpm typecheck && pnpm lint && pnpm sources && pnpm knip

## Riesgos

- R1: C5 también cambia la vista Flujo y puede añadir frases. Mitigación: las de los límites van al final de la lista y en su propio archivo de textos; al incorporar main se conservan las dos partes.
- R2: `settings-page.ts` ya tiene unas 407 líneas de código (P292). Mitigación: no se toca; los perfiles viven en `settings-presets.ts`, dentro de `sp-settings-flow`.
- R3: `cards/settings-pieces.ts` está cerca del aviso de 300 líneas de código. Mitigación: las frases nuevas van en `cards/settings-presets.ts`, y `flowSentences` solo las añade.
