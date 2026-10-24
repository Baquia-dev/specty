---
kind: standard
---

# El núcleo de specty check

## Objetivo

Primer corte de los quality gates (ADR 0012): `specty check` verifica, sin modelos ni agentes, lo que cambió (`--changed`, por defecto), lo preparado (`--staged`) o todo el repositorio (`--all`). Muestra solo los fallos, agrupados por verificación, con `ruta:línea` y una línea de mensaje, recortados a un máximo configurable, y termina en una línea de resumen como `OK 9/11 · FALLA: layers, max-lines`. `--verbose` da el detalle y `--json` sirve para la CI. Sale con un código distinto de 0 si falla una verificación de nivel error. Este corte trae el modelo de verificaciones y proveedores, la configuración `checks`, la selección de archivos, la salida y la primera verificación, `max-lines`, que reutiliza la regla `lines`. Los demás cortes añaden verificaciones y proveedores sobre esta base.

## Fuera de alcance

- Las demás verificaciones (tests enfocados, TODO, secretos), `--spec` y los proveedores por stack: son los cortes siguientes.
- Ejecutar `specty check` desde `task done`, el pre-commit, la CI o los hooks de los agentes.
- Arreglar el flujo de las épicas (su tarjeta en implementing y su sesión): irá en un cambio aparte.

## Supuestos

- A1: `--changed` compara con el merge-base entre HEAD y la rama destino (`git.target` o la principal) y añade los archivos nuevos sin seguir; sin rama destino, compara con HEAD. Los archivos borrados no se miran.
  - impacto: alto
- A2: Ninguna verificación mira lo que siempre se excluye: `checks.exclude`, que por defecto lista carpetas de dependencias y artefactos comunes a cualquier ecosistema (`node_modules`, `build`, `dist`, `out`, `target`, `coverage`, `.dart_tool`, `.next`, `.angular`, `.gradle`, `vendor`), lo ignorado por la configuración y lo generado.
  - impacto: alto
- A3: Cada verificación tiene un nivel en `checks.levels` (error, warn u off; por defecto error); con warn sus fallos se muestran como aviso y no cambian el código de salida, y con off no se ejecuta. Una verificación que no puede ejecutarse (falta su herramienta, por ejemplo) sale como «sin ejecutar» con su motivo y no falla.
  - impacto: alto
- A4: `max-lines` mide con la regla `lines`: por encima de `lines.fail` es un fallo y por encima de `lines.warn`, un aviso, con los mismos archivos excluidos; mide el estado actual del archivo, no lo que creció.
- A5: La salida de `check` no lleva la cabecera ni el SIGUIENTE de las demás salidas: termina en la línea de resumen, como pide el diseño, para gastar pocos tokens. Con la opción global `--json` da el resultado como JSON, con `exitCode`.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check` sin modo ENTONCES mira los archivos cambiados respecto al merge-base con la rama destino más los nuevos sin seguir; CUANDO se pasa `--staged` ENTONCES lo preparado; CUANDO `--all` ENTONCES lo que git sigue más lo nuevo no ignorado; en los tres, nunca lo excluido ni lo generado.
- AC2: CUANDO una ejecución tiene 3 fallos ENTONCES la salida ocupa menos de 15 líneas: un encabezado por verificación con fallos, una línea `ruta:línea mensaje` por fallo, hasta `checks.maxFindings` y «… y N más», y una línea final de resumen con las verificaciones que pasan, fallan, avisan o no se ejecutaron.
- AC3: CUANDO se pasa `--verbose` ENTONCES muestra todos los fallos, las verificaciones que pasan y por qué no se ejecutó alguna; CUANDO se pasa `--json` ENTONCES da cada verificación con su nivel, estado y fallos, el resumen y `exitCode`.
- AC4: CUANDO falla una verificación de nivel error ENTONCES el código de salida es 1; con solo avisos o todo en orden, 0; una verificación en off no se ejecuta.
- AC5: CUANDO un archivo del conjunto pasa de `lines.fail` líneas de código ENTONCES `max-lines` falla con su ruta y sus líneas, y CUANDO pasa de `lines.warn` ENTONCES avisa.
- AC6: CUANDO alguien lee el ADR 0012, ARCHITECTURE y formats.md ENTONCES encuentra el principio, los cortes previstos, el comando y la clave `checks`.

## Diseño

- Core, `schema/checks.ts`: `checks: { levels, maxFindings, exclude }`, con valores por defecto, y su lectura desde `config.ts`.
- Core, `checks/report.ts`: `Finding` (ruta, línea, mensaje, gravedad), `CheckResult` (id, nivel, fallos o motivo de no ejecutarse), el resumen, la salida compacta y la detallada en es y en, el JSON y el código de salida. Puro.
- Core, `sizing/lines.ts`: `fileSize(path, text, config)` expone la medida de un archivo con sus umbrales, la misma de `task done`.
- CLI, `check/provider.ts`: `Provider` (si aplica al repositorio y sus verificaciones) y `CheckDefinition` (id y `run(ctx)`), el registro y la ejecución con niveles; `check/files.ts`, la selección de archivos; `check/max-lines.ts`, el proveedor común con `max-lines`.
- CLI, `commands/check.ts` y `program.ts`: el comando y un camino de salida propio para informes, que respeta `--json`.

## Archivos

- crear docs/decisions/0012-lo-verificable-lo-verifica-specty.md — el principio y los cortes previstos
- crear packages/core/src/schema/checks.ts — la clave `checks`
- modificar packages/core/src/schema/config.ts — leer `checks`
- crear packages/core/src/checks/report.ts — el modelo de resultados y su salida
- modificar packages/core/src/sizing/lines.ts — la medida de un archivo con sus umbrales
- modificar packages/core/src/index.ts — exportar lo nuevo
- crear packages/core/test/checks/report.test.ts — salida compacta, detallada, JSON, niveles y código de salida
- crear packages/cli/src/check/provider.ts — proveedores, verificaciones y su ejecución
- crear packages/cli/src/check/files.ts — los archivos de cada modo
- crear packages/cli/src/check/max-lines.ts — el proveedor común con `max-lines`
- crear packages/cli/src/commands/check.ts — `specty check`
- modificar packages/cli/src/program.ts — el comando y la salida de informes
- crear packages/cli/test/check.test.ts — de punta a punta
- modificar docs/ARCHITECTURE.md — `specty check` en la tabla de comandos y su diseño
- modificar docs/formats.md — la clave `checks`

## Tareas

- [x] T1: El modelo de verificaciones, su configuración y su salida
  - files: packages/core/src/schema/checks.ts, packages/core/src/schema/config.ts, packages/core/src/checks/report.ts, packages/core/src/sizing/lines.ts, packages/core/src/index.ts, packages/core/test/checks/report.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks test/schema test/sizing
- [x] T2: specty check con sus modos y max-lines
  - files: packages/cli/src/check/provider.ts, packages/cli/src/check/files.ts, packages/cli/src/check/max-lines.ts, packages/cli/src/commands/check.ts, packages/cli/src/program.ts, packages/cli/test/check.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check.test.ts test/commands-named.test.ts
- [ ] T3: El ADR y la documentación
  - files: docs/decisions/0012-lo-verificable-lo-verifica-specty.md, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC6
  - verify: pnpm check
  - type: docs
