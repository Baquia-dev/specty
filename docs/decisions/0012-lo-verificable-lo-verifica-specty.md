# 0012 · Lo verificable lo verifica Specty

- Estado: aceptada
- Fecha: 2026-10-24

## Contexto

Las reglas del archivo del agente (AGENTS.md y sus punteros) dependen de que el agente las lea y las cumpla, y un agente con prisa, con el contexto lleno o tras compactar puede saltarse cualquiera. Muchas de esas reglas las puede comprobar una herramienta: el formato, el lint, los tipos, los tests, el tamaño de los archivos, las capas de la arquitectura, los secretos o el alcance del plan aprobado.

## Decisión

- **Una regla no negociable que una herramienta puede verificar la verifica Specty.** El archivo de reglas del agente solo conserva lo que no se puede verificar.
- **`specty check`** ejecuta las verificaciones sobre lo que cambió (`--changed`, por defecto: el merge-base con la rama destino más lo nuevo), lo preparado (`--staged`) o todo (`--all`). Muestra solo los fallos, agrupados por verificación con `ruta:línea` y una línea de mensaje, y termina en una línea de resumen. `--verbose` da el detalle, `--json` sirve para la CI, y sale con código 1 si falla una verificación de nivel error.
- **Es determinista:** no llama a modelos (ADR 0001) ni depende de ningún agente, IDE o modelo.
- **Un núcleo agnóstico y proveedores por stack.** El modelo de verificaciones, la selección de archivos, la salida y las verificaciones transversales valen para cualquier lenguaje. Lo propio de cada stack (sus herramientas y su configuración) vive en proveedores aislados con una interfaz común. Añadir un stack es añadir un proveedor.
- **Cada verificación tiene su nivel** en `checks.levels`: `error`, `warn` u `off`. Una que no puede ejecutarse, porque falta su herramienta, sale como «sin ejecutar» con su motivo.
- **La ejecutan las compuertas que ya existen:** `task done`, el pre-commit, la CI y, donde el agente tiene un hook de fin de turno documentado, ese hook.
- **Las herramientas externas** se añaden al proyecto destino solo con la aprobación de la persona y con versiones exactas. Specty no gana dependencias por ello.

Decisiones del usuario del 2026-10-24:

- El tamaño de los archivos avisa en 300 líneas de código y bloquea en 500 (regla `lines`), con su nivel configurable.
- Los secretos se buscan con un adaptador único para gitleaks y Betterleaks, que prefiere Betterleaks.
- En TypeScript, las capas se verifican con dependency-cruiser.
- En Dart, la complejidad y las líneas por función se miden con dart_code_linter si cubre las dos, y con un contador propio para lo que no.

## Cortes

Cada corte es un cambio de Specty, encadenado al anterior con `--follows`:

1. El núcleo de `specty check`: modelo, configuración `checks`, selección de archivos, salida y `max-lines`.
2. Las verificaciones transversales: tests enfocados o deshabilitados, TODO sin referencia y secretos.
3. Las verificaciones del plan con `--spec`: aprobado, alcance, dependencias permitidas (`allowedDependencies`), un test en cada `fix` y aviso si bajan los tests.
4. El proveedor de TypeScript, Angular y NestJS.
5. El proveedor de Flutter y Dart.
6. La instalación con diff y confirmación por archivo, el pre-commit y la plantilla de CI.
7. Los hooks de fin de turno de los agentes y las exclusiones de ruido.
8. `task done` usa `specty check` y el archivo de reglas se reduce.
9. La documentación de las verificaciones en español e inglés.

Primero se abrió una épica, que se canceló: en Specty una épica abierta no deja que la misma sesión trabaje sus cortes («una sesión, una worktree»). Además, su tarjeta en `implementing` pide un `accept` que se rechaza. Los dos problemas quedan para un cambio aparte.

## Consecuencias

- Una regla verificable deja de depender de la memoria del agente, y la misma salida sirve al agente, a la persona en su terminal y a la CI.
- Las herramientas externas cambian sus opciones con cada versión, así que cada proveedor se apoya en su documentación vigente y sus tests usan salidas grabadas, además de las herramientas reales cuando están instaladas.
- La salida de `specty check` no tiene la cabecera ni el SIGUIENTE de las demás salidas: termina en su resumen, para gastar pocos tokens.
