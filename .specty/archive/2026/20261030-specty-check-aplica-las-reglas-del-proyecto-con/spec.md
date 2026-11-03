---
kind: standard
---

# specty check aplica las reglas del proyecto con Opengrep

## Objetivo

Un proyecto que escribe sus propias reglas de Semgrep (patrones que su equipo no quiere ver en el código) hoy solo las aplica si alguien recuerda ejecutar el escáner. `specty check` gana el check `code-rules`: cuando el repositorio tiene reglas en su raíz, se las pasa a Opengrep (o, sin él, a Semgrep) y falla con cada coincidencia en las líneas que el cambio añade; con `--all`, el modo de la CI, con todas.

Sigue el mismo patrón que `secrets` y `vulnerabilities` (ADR 0012): una herramienta externa, opcional, que trabaja sobre una copia de los archivos tal como los ve el modo. Solo usa las reglas del proyecto, nunca las del registro: así no sale nada hacia la red y no depende de reglas con licencia restringida.

## Fuera de alcance

- Reglas en otras rutas o una clave de configuración para nombrarlas (como `checks.rules`): solo las de la raíz con los nombres de Opengrep y Semgrep.
- Un paquete de reglas propio de Specty (por ejemplo, las de `core/src/scope/risk.ts` como reglas de árbol de sintaxis).
- Las reglas del registro (`--config auto`, `p/…`), Semgrep Pro y el inicio de sesión de Semgrep.
- Los `.semgrepignore` de subcarpetas que la ejecución no toca: la copia lleva el de la raíz y los que estén entre los archivos de la ejecución.
- Los arreglos automáticos de las reglas (`fix`, `--autofix`).
- Avisar de que falta el escáner en `specty check --install`, en `doctor` y en la plantilla de la CI.
- La prueba de mutation testing, que la misma petición pide: va en su propio cambio, después de este.

## Supuestos

- A1: Opengrep 1 acepta `opengrep scan --config <ruta>… --json --output <informe> --disable-version-check <carpeta>` (este último flag existe solo por compatibilidad), escribe un JSON con `results[]` (cada uno con `check_id`, `path`, `start.line`, `end.line`, `extra.message` y `extra.severity`), sale con 0 con o sin coincidencias (1 solo con `--error`) y con 2 a 14 en sus errores, y nunca con 127. Está verificado en el código fuente de la v1.33.1, no con el binario.
  - impacto: alto
- A2: Semgrep acepta la misma forma más `--metrics=off`, que Opengrep no tiene; con ese flag y solo reglas locales no envía nada a la red.
- A3: Los dos prefijan el id de cada regla con las carpetas de su archivo relativas a la carpeta en la que se ejecutan, sin puntos ni barras al principio: ejecutándolos en la raíz del repositorio con rutas relativas, una regla de `.semgrep.yml` conserva su id y una de `.semgrep/python.yml` sale como `semgrep.<id>`, igual que si el usuario los ejecuta en su repositorio.
- A4: Para una carpeta fuera de git, Opengrep toma esa misma carpeta como raíz del proyecto y lee de ella el `.semgrepignore`; sin él, aplica sus ignorados por defecto (que saltan, entre otros, `test/` y `tests/`), lo mismo que ejecutándolo en el repositorio.
- A5: Una coincidencia es del cambio si alguna de sus líneas, de `start.line` a `end.line`, es añadida; el hallazgo se ubica en `start.line`.

## Criterios de aceptación

- AC1: CUANDO el repositorio tiene reglas en su raíz (`.opengrep.yml`, `.opengrep.yaml`, `.opengrep/`, `.semgrep.yml`, `.semgrep.yaml` o `.semgrep/`) y una regla coincide con código que la ejecución añade ENTONCES `specty check` falla en el check `code-rules` con un hallazgo `<ruta>:<línea> <id de la regla>: <mensaje>`; las coincidencias que no tocan ninguna línea añadida no salen, y con `--all` salen todas las de los archivos que git sigue.
- AC2: CUANDO una coincidencia viene de una regla de gravedad `ERROR`, `CRITICAL` o `HIGH` ENTONCES su hallazgo hace fallar el check; CUANDO viene de cualquier otra gravedad (`WARNING`, `INFO`, `MEDIUM`, `LOW`…) ENTONCES el hallazgo sale como aviso y no lo hace fallar.
- AC3: CUANDO el escáner corre ENTONCES lo hace en la raíz del repositorio, con cada archivo de reglas que exista como `--config <ruta relativa>`, sobre una copia de los archivos de la ejecución tal como los ve el modo (con `--staged`, lo preparado), fuera del repositorio, sin los propios archivos de reglas y junto al `.semgrepignore` de la raíz; con Semgrep, además con `--metrics=off`.
- AC4: CUANDO el repositorio no tiene reglas en su raíz ENTONCES `code-rules` no sale en el informe.
- AC5: CUANDO ni Opengrep ni Semgrep están en el PATH ENTONCES `code-rules` sale como no ejecutado y el motivo dice que se instale Opengrep (o Semgrep); CUANDO el escáner falla (una regla inválida, por ejemplo) ENTONCES sale como no ejecutado con su último mensaje como motivo.

## Diseño

- `packages/cli/src/check/code-rules.ts`: el check `code-rules`.
  - Las fuentes de reglas, en este orden: `.opengrep.yml`, `.opengrep.yaml`, `.opengrep/`, `.semgrep.yml`, `.semgrep.yaml` y `.semgrep/`, las que existan en la raíz del disco. Sin ninguna, `inapplicable`; sin archivos en la ejecución, sin hallazgos.
  - En una carpeta temporal (con `realpath`, como `secrets`), `files/` con el `.semgrepignore` de la raíz y, encima, el texto de cada archivo de la ejecución según `context.read`, salvo los que son fuentes de reglas o están dentro de una; el informe va fuera de `files/`.
  - Ejecuta en la raíz del repositorio `opengrep scan --config <fuente>… --json --output <informe> --disable-version-check <files>`, con el entorno de la sesión y el límite `verify.timeoutSec`. Con 127, Opengrep no está y prueba `semgrep` con la misma forma más `--metrics=off`; con 127 otra vez, el check no corre y dice que se instale. Con 0 o 1 lee el informe; con cualquier otro código, el check no corre con el último mensaje del escáner.
  - Del informe toma cada resultado cuya ruta (relativa a `files/`) está entre los archivos de la ejecución y que, si el archivo tiene líneas añadidas, toca alguna de ellas entre `start.line` y `end.line`. El mensaje es `<check_id>: <primera línea del mensaje>`; con gravedad distinta de `ERROR`, `CRITICAL` o `HIGH`, el hallazgo lleva `severity: "warning"`.
- `packages/cli/src/check/common.ts`: añade `code-rules` a los checks comunes, después de `secrets`.
- Tests: un Opengrep y un Semgrep falsos, como los escáneres falsos del test de `secrets`, que leen de cada `--config` (archivo o carpeta) las reglas en una forma mínima (`id`, `pattern` como texto literal, `message`, `severity`), buscan ese texto en los archivos de su carpeta (una coincidencia va de su línea a la primera con `)`), respetan las rutas del `.semgrepignore`, prefijan los ids como A3 y registran cómo se les llamó; el de Semgrep rechaza la forma sin `--metrics=off`.
- El test de las guías cuenta `code-rules` entre los checks que su ejemplo no muestra, como `secrets` y `vulnerabilities`; los ejemplos por stack no tienen reglas, así que el check no aparece en ellos.

## Archivos

- crear packages/cli/src/check/code-rules.ts — el check `code-rules` con Opengrep o Semgrep
- modificar packages/cli/src/check/common.ts — añade el check a los comunes
- crear packages/cli/test/check-code-rules.test.ts — AC1 a AC5 con escáneres falsos
- modificar packages/cli/test/check-docs.test.ts — añade `code-rules` a los checks que su ejemplo no muestra
- modificar docs/checks.md — el check nuevo
- modificar docs/checks.en.md — el check nuevo, en inglés
- modificar docs/formats.md — el check en la lista de §6
- modificar docs/ARCHITECTURE.md — el check en la lista de `specty check`

## Tareas

- [x] T1: specty check aplica las reglas del proyecto con Opengrep o Semgrep
  - files: packages/cli/test/check-code-rules.test.ts, packages/cli/src/check/code-rules.ts, packages/cli/src/check/common.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-code-rules.test.ts test/check-secrets.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [x] T2: La documentación cuenta el check
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
- [x] T3: El test de las guías cuenta con code-rules
  - files: packages/cli/test/check-docs.test.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts && pnpm lint
  - type: test

## Riesgos

- R1: Un escáner lento en un repositorio grande haría esperar a cada `task done` — solo escanea los archivos de la ejecución, con el límite de `verify.timeoutSec`; al agotarse, el check sale como no ejecutado sin bloquear.
- R2: Una regla ruidosa bloquearía cambios ajenos a ella — solo cuentan las líneas añadidas, las de gravedad baja son avisos, y el check se baja a `warn` o se apaga con `checks.levels`.
- R3: Los tests que comprueban el resumen exacto de `specty check` en un repositorio con reglas verían un check más — hoy ningún fixture tiene archivos `.semgrep*` ni `.opengrep*`; se corre la suite completa del CLI antes de aceptar.

## Cierre

### Resumen

`specty check` tiene el check `code-rules`. Cuando la raíz del repositorio tiene reglas de Opengrep o Semgrep (`.opengrep.yml`, `.opengrep.yaml`, `.opengrep/`, `.semgrep.yml`, `.semgrep.yaml` o `.semgrep/`), Specty copia los archivos de la ejecución a una carpeta temporal, tal como los ve el modo y sin las propias reglas, junto al `.semgrepignore` de la raíz. Después ejecuta Opengrep en la raíz, con cada fuente de reglas como `--config` relativo; sin Opengrep, usa Semgrep con `--metrics=off`. Los hallazgos son las coincidencias que tocan una línea añadida, con el id de la regla y la primera línea de su mensaje. Las de gravedad `ERROR`, `CRITICAL` o `HIGH` hacen fallar el check y las demás solo avisan. Sin reglas en la raíz, el check no aparece; sin escáner, no corre y dice que se instale.

### Desviaciones

- La lectura del informe quedó en tres funciones pequeñas (`matchOf`, `lineOf` y `textOr`), porque en una sola superaba la complejidad máxima de 10.
- Un resultado sin `extra` cuenta como coincidencia de gravedad `ERROR` con el mensaje vacío, en vez de descartarse.

### Decisiones

- El escáner corre en la raíz con rutas relativas, y no en la copia, porque Opengrep prefija los ids de las reglas con las carpetas de su archivo relativas a donde corre. Con la ruta absoluta de una copia temporal, los ids saldrían con esa ruta.
- Una coincidencia de varias líneas cuenta si cualquiera de ellas es añadida, y el hallazgo se ubica en la primera.
- La copia de los archivos de la ejecución repite unas diez líneas de `secrets`; no se extrajo a un módulo común porque `secrets.ts` quedaba fuera del alcance.
- No se probó con el binario real de Opengrep, porque descargarlo y ejecutarlo se denegó en esta sesión. Los flags, el JSON, los códigos de salida, el prefijo de los ids y la raíz del proyecto salen del código fuente de la v1.33.1 (`Scan_CLI.ml`, `Exit_code.ml`, `Rule_fetching.ml` y `Project.ml`), y los tests usan escáneres falsos con esa forma.

### Pendientes

- Probar el check con Opengrep instalado (su `install.sh` de GitHub) o con `brew install semgrep`, sobre un repositorio con `.semgrep.yml`.
- Una clave de configuración para reglas en otras rutas.
- Un paquete de reglas propio de Specty, con las de `core/src/scope/risk.ts` como reglas de árbol de sintaxis.
- Avisar de que falta el escáner en `specty check --install`, en `doctor` y en la plantilla de la CI.
- Extraer la copia de los archivos de la ejecución que comparten `secrets` y `code-rules`.
