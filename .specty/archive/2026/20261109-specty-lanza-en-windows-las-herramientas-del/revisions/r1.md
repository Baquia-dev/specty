---
kind: standard
---

# Specty lanza en Windows las herramientas del proyecto y sus tests las simulan allí

## Objetivo

Windows entra en la versión 0.1.0, y el run 42601745517 de la CI (main 2a1c7cc) deja 147 tests del CLI en rojo en `windows-latest`. Una de sus causas es cómo se lanzan los programas: en Windows, `spawn` sin shell solo encuentra `.exe` y `.com`, y lo que instalan npm y pnpm (ccusage, eslint, dependency-cruiser y, según cómo se instalen, Opengrep, Semgrep, Betterleaks, gitleaks u OSV-Scanner) son shims `.cmd`, así que Specty no los encuentra y la verificación correspondiente no corre. Con este cambio, Specty busca cada programa como lo hace Windows (PATH y PATHEXT, sin la carpeta actual) y lanza los `.cmd` por `cmd.exe` con sus argumentos escapados, y los tests del CLI simulan las herramientas falsas de forma que también corran en Windows, sin cambiar lo que comprueban.

## Fuera de alcance

- Las rutas que da git con `/` en Windows y lo que falla solo por ellas (otro cambio).
- La extensión de VS Code en Windows (otro cambio).
- Los comandos simulados de los tests que usan la sintaxis de `sh` (`$(git rev-parse …)`, `sleep`, `echo`) y la prioridad 15 que Windows lee como 10: van en el cambio siguiente, que sigue a este.
- Los comandos de verificación, preparación o `afterLanding` de `config.yaml`: siguen siendo líneas de la shell del sistema (`cmd.exe` en Windows), como hoy.
- Lanzar en Windows un script sin extensión por su línea `#!` (como hace cross-spawn): Windows no lo hace y npm y pnpm siempre dejan el `.cmd` al lado.
- `resolveInvocation` (`install/invocation.ts`): en Windows ya cae en `node "<script>"` cuando `specty` es un shim, y sigue así.
- Abrir el navegador (`io/browser.ts`) y `taskkill`, que ya usan programas de Windows.

## Supuestos

- A1: El fallo de Windows es el de libuv, que sin shell solo prueba el nombre con `.com` y `.exe` (y el nombre tal cual si ya trae extensión), y Node, desde el CVE-2024-27980, rechaza lanzar un `.cmd` o un `.bat` sin `shell: true`; por eso hoy `spawn git ENOENT` sale con un `git` sin extensión en el PATH de los tests, y `spawn …\node_modules\.bin\eslint ENOENT` con el ESLint de un proyecto.
  - impacto: alto
- A2: Escapar para `cmd.exe` como cross-spawn (MIT) es seguro: la ruta del programa con `^` delante de cada metacarácter, y cada argumento entre comillas con las reglas de Microsoft para `"` y `\`, y después con `^` delante de cada metacarácter dos veces, porque el `%*` del shim vuelve a pasar la línea por `cmd.exe`; así ningún argumento se ejecuta como comando (CWE-78) y llega igual al programa. Se escribe en el propio CLI, sin añadir cross-spawn como dependencia, porque son pocas líneas y el CLI no tiene dependencias en tiempo de ejecución.
  - impacto: alto
- A3: Doblar el escape vale para cualquier `.cmd` o `.bat` que se encuentre en el PATH, no solo los de `node_modules/.bin` como en cross-spawn: los shims de npm globales (`%APPDATA%\npm`) también pasan sus argumentos con `%*`, y Specty no lanza otros `.bat`.
  - impacto: medio
- A4: Buscar solo en las carpetas absolutas del PATH, y no en la carpeta actual como hacen `cmd.exe` y libuv, es lo correcto: un `git.exe` o un `ccusage.cmd` en la raíz de un repositorio clonado no debe ejecutarse. Si el programa no está en el PATH, Specty lo lanza como hoy y falla igual (código 127).
  - impacto: medio
- A5: En Windows, `env` puede traer `Path` y `PATH` a la vez (los tests ponen `PATH` sobre el `Path` del sistema), y Node se queda con la primera clave en orden de la tabla ASCII sin distinguir mayúsculas; Specty lee `PATH`, `PATHEXT` y `ComSpec` con esa misma regla para buscar lo mismo que lanzará Node. Sin `PATHEXT` usa `.COM;.EXE;.BAT;.CMD`, y de él solo cuentan esas cuatro extensiones, las que Specty sabe lanzar.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO Specty lanza sin la shell, en Windows, un programa por su nombre (`git`, `ccusage`, `opengrep`, `osv-scanner`…) o por su ruta sin extensión (`node_modules/.bin/eslint`) ENTONCES lo busca en las carpetas absolutas del PATH, nunca en la carpeta actual, con las extensiones de PATHEXT que sabe lanzar (`.com`, `.exe`, `.bat` y `.cmd`) en el orden de PATHEXT, y lanza el archivo que encuentra; si ya trae una de esas extensiones, lo busca tal cual; si no lo encuentra, falla como hoy, con el código 127; fuera de Windows, lo lanza como hoy.
- AC2: CUANDO el programa que encuentra es un `.cmd` o un `.bat`, como los shims de npm y pnpm ENTONCES lo lanza por `cmd.exe` (el `ComSpec` del entorno) con `/d /s /c` y los argumentos tal cual (`windowsVerbatimArguments`), con su ruta y cada argumento escapados, de modo que un argumento con espacios, comillas, barras invertidas al final o metacaracteres de `cmd.exe` (`&`, `|`, `<`, `>`, `^`, `%`, `!`, paréntesis) llega igual al programa y ninguno se ejecuta como comando (CWE-78); un `.exe` o un `.com` lo lanza directamente, sin shell.
- AC3: CUANDO `specty doctor` comprueba si ccusage o el comando `specty` están en el PATH ENTONCES los busca como AC1, sin ejecutar `sh`, así que en Windows encuentra el `.cmd` que instala npm aunque no haya `sh`; fuera de Windows solo cuenta un archivo ejecutable, como con `command -v`.
- AC4: CUANDO un test del CLI simula una herramienta (los escáneres, ccusage, ESLint, dependency-cruiser, Prisma, npm o pnpm) ENTONCES la escribe con un ayudante compartido que, en Windows, le pone al lado un `.cmd` que la ejecuta con el Node de los tests, y el PATH «solo con git, node y las herramientas falsas» lleva en Windows la carpeta de `git.exe` en vez de un enlace a git; lo que cada test comprueba no cambia.
  - test: manual
- AC5: CUANDO se lee ARCHITECTURE §9 ENTONCES explica cómo busca y lanza Specty los programas en Windows (PATH y PATHEXT sin la carpeta actual, los `.cmd` por `cmd.exe` con el escape doble) y por qué.
  - test: manual

## Diseño

- `io/programs.ts` (nuevo): `findProgram(name, env, system)` busca un programa en las carpetas absolutas del PATH (o la ruta dada) como AC1 y AC3: en Windows con las extensiones de PATHEXT que Specty lanza, fuera de él con el permiso de ejecución. `startOf(command, args, env, system)` dice cómo lanzarlo sin shell: fuera de Windows, tal cual; en Windows, el archivo encontrado, o `cmd.exe /d /s /c "<línea>"` con `verbatim` para un `.cmd` o un `.bat` (AC2). `system` (`{ platform, runnable }`, por defecto el de la máquina) deja a los tests simular Windows sin él. Las variables del entorno se leen como las lee Node en Windows (A5).
- `io/exec.ts`: `launch` usa `startOf` cuando no va por la shell, y `Launch` lleva `verbatim`, que `execute` pasa a `spawn` como `windowsVerbatimArguments`. `server/runs.ts` siempre lanza con la shell, así que no cambia.
- `commands/doctor.ts` y `install/usage.ts`: `findProgram` en vez de `sh -c "command -v …"`.
- Tests: `test/tools.ts` (nuevo) con `writeTool(folder, name, script)`, que escribe el script de Node y, en Windows, su `.cmd`, y `toolPath(bin)`, el PATH con solo esa carpeta, git y node (en Windows, la carpeta de `git.exe`, porque el lanzador de Git busca el resto de Git junto a él). Los tests de las herramientas falsas pasan a usarlos.
- `test/windows-programs.test.ts` (nuevo): AC1–AC3 con Windows simulado (`system` con un `runnable` que conoce unos archivos), y en Windows de verdad (solo allí) un shim `.cmd` como el de npm que devuelve sus argumentos, lanzado con argumentos difíciles en una carpeta con espacios y metacaracteres.

## Archivos

- crear packages/cli/src/io/programs.ts — buscar un programa como Windows y la línea de `cmd.exe` para un `.cmd`
- modificar packages/cli/src/io/exec.ts — `launch` y `execute` lanzan en Windows lo que encuentra `startOf`
- modificar packages/cli/src/commands/doctor.ts — el comando `specty` en el PATH con `findProgram`
- modificar packages/cli/src/install/usage.ts — ccusage en el PATH con `findProgram`
- crear packages/cli/test/windows-programs.test.ts — AC1, AC2 y AC3, con Windows simulado y en Windows de verdad
- crear packages/cli/test/tools.ts — el ayudante de las herramientas falsas y su PATH
- modificar packages/cli/test/check-code-rules.test.ts — Opengrep y Semgrep falsos con el ayudante
- modificar packages/cli/test/check-secrets.test.ts — Betterleaks y gitleaks falsos con el ayudante
- modificar packages/cli/test/check-vulnerabilities.test.ts — OSV-Scanner falso con el ayudante
- modificar packages/cli/test/check-install.test.ts — npm falso con el ayudante
- modificar packages/cli/test/check-typescript.test.ts — ESLint falso con el ayudante
- modificar packages/cli/test/check-layers.test.ts — dependency-cruiser falso con el ayudante
- modificar packages/cli/test/check-generated.test.ts — Prisma falso con el ayudante
- modificar packages/cli/test/usage.test.ts — ccusage falso con el ayudante
- modificar packages/cli/test/usage-projects.test.ts — ccusage falso con el ayudante
- modificar packages/cli/test/init-usage.test.ts — pnpm y ccusage falsos con el ayudante
- modificar packages/cli/test/server/sessions.test.ts — ccusage falso con el ayudante
- modificar docs/ARCHITECTURE.md — cómo lanza Specty los programas en Windows

## Tareas

- [ ] T1: Specty encuentra en Windows los programas por PATHEXT y lanza sus `.cmd` por `cmd.exe`, escapados
  - files: packages/cli/src/io/programs.ts, packages/cli/src/io/exec.ts, packages/cli/src/commands/doctor.ts, packages/cli/src/install/usage.ts, packages/cli/test/windows-programs.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/windows-programs.test.ts test/exec.test.ts test/exec-priority.test.ts test/init-usage.test.ts test/doctor-enter.test.ts && pnpm lint && pnpm typecheck && pnpm knip
  - type: fix
- [ ] T2: Las herramientas falsas de los escáneres, en Windows también
  - files: packages/cli/test/tools.ts, packages/cli/test/check-code-rules.test.ts, packages/cli/test/check-secrets.test.ts, packages/cli/test/check-vulnerabilities.test.ts, packages/cli/test/check-install.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-code-rules.test.ts test/check-secrets.test.ts test/check-vulnerabilities.test.ts test/check-install.test.ts && pnpm lint
  - type: test
- [ ] T3: ESLint, dependency-cruiser, Prisma y ccusage falsos, en Windows también
  - files: packages/cli/test/check-typescript.test.ts, packages/cli/test/check-layers.test.ts, packages/cli/test/check-generated.test.ts, packages/cli/test/usage.test.ts, packages/cli/test/usage-projects.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-typescript.test.ts test/check-layers.test.ts test/check-generated.test.ts test/usage.test.ts test/usage-projects.test.ts && pnpm lint
  - type: test
- [ ] T4: ccusage y pnpm falsos de init y del servidor, en Windows también, y la documentación
  - files: packages/cli/test/init-usage.test.ts, packages/cli/test/server/sessions.test.ts, docs/ARCHITECTURE.md
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-usage.test.ts test/server/sessions.test.ts && pnpm lint
  - type: test

## Riesgos

- R1: Aquí no hay Windows, y el escape de `cmd.exe` solo se comprueba de verdad en la CI de Windows. Mitigación: el algoritmo es el de cross-spawn, y el test que solo corre en Windows lanza un shim como el de npm con los argumentos difíciles; la sesión principal lee el siguiente run.
- R2: Un test falso que en Windows siga fallando por otra causa (las rutas de git con `/`) puede parecer de este cambio. Mitigación: el cierre nombra lo que queda y a qué causa va.
- R3: Buscar en cada lanzamiento cuesta unas comprobaciones de archivos por carpeta del PATH. Mitigación: solo en Windows y solo sin shell; es mucho menos que lanzar el proceso.
