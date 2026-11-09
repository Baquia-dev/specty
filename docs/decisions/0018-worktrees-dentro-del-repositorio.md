# 0018 · Las worktrees de los cambios, dentro del repositorio

- Estado: aceptada
- Fecha: 2026-11-03
- Nota: Gemini CLI, que se nombra aquí, se retiró el 2026-11-10 en favor de Antigravity.

## Contexto

Cada cambio vive en su propia worktree, que `specty new` crea junto a la carpeta principal: `<carpeta>.worktrees/<id>`, fuera del repositorio, para que las herramientas y los tests de la carpeta principal no la vean (ARCHITECTURE §9).

Muchos agentes y editores solo dejan trabajar dentro de la carpeta del proyecto. Antigravity en Zed (ACP, con cuenta personal) niega toda herramienta fuera de la carpeta de la sesión y de las que le pasa el editor (`additionalDirectories`), y los permisos que le da el guard no saltan ese límite: así se bloqueó un cambio de Frecu el 2026-11-03. Para otros agentes, Specty escribe hoy un permiso por herramienta que abre la carpeta de las worktrees: `writable_roots` en Codex, `permission.external_directory` en OpenCode, `context.includeDirectories` en Gemini CLI, los scopes de Devin y los `permissionOverrides` de Antigravity. Donde no hay forma, como en Antigravity, la persona tiene que abrir la carpeta del cambio o añadirla al proyecto del editor.

Una worktree dentro del proyecto, en una carpeta oculta e ignorada por git, está al alcance de todos sin configurar nada. Claude Code ya crea las suyas así, en `.claude/worktrees/`. El riesgo es el contrario: que las herramientas de la carpeta principal vean las copias del proyecto que hay dentro.

## Medición

El 2026-11-03 se creó, para cada herramienta, un repositorio con un archivo y su test, `.worktrees/` en `.gitignore` y una worktree en `.worktrees/c1` con un test que falla, un error de tipos o código mal formateado. Después se ejecutó la herramienta desde la carpeta principal, sin configurarla, para ver si encontraba los fallos de la worktree.

| Herramienta | Versión | ¿Ve `.worktrees/`? | Qué la excluye |
|---|---|---|---|
| `tsc` (tsconfig sin `include`) | 7.0.2 | no | sus comodines no entran en carpetas ocultas |
| Prettier | 3.9.10 | no, si la carpeta está en `.gitignore`; sí, si solo está en `.git/info/exclude` | la línea en `.gitignore` |
| Biome | 2.5.15 | sí; no con `vcs.useIgnoreFile` | `useIgnoreFile` o `!.worktrees` en `files.includes`, como ya se pide para `.specty` |
| Vitest | 5.0.5 | sí: ejecuta sus tests | `exclude: [...configDefaults.exclude, "**/.worktrees/**"]` |
| Jest | 30.5.2 | sí: ejecuta sus tests y avisa de una colisión de nombres de paquete | `testPathIgnorePatterns` y `modulePathIgnorePatterns` con `<rootDir>/.worktrees/` |
| ESLint | 9.39.5 | sí | `ignores: [".worktrees/"]` en su configuración |
| `dart analyze` y `dart format` | Dart 3.12.2 | no | no entran en carpetas ocultas |
| `dotnet build` | .NET 10.0.401 | no | el SDK excluye las carpetas ocultas |
| pytest, Ruff y mypy | pytest 8.4.2, Ruff 0.17.3, mypy 1.19.1 | no | carpetas ocultas o `.gitignore` |
| RSpec | 3.13.2 | no | solo busca en `spec/` |
| `git clean -fdx` | git 2.50.1 | no: «Would skip repository .worktrees/c1» | solo `-ffdx` la borraría |
| `go test`, `go vet` y `go build` (`./...`) | Go 1.27.3 | no | ignora las carpetas que empiezan por `.` o `_` |
| `gofmt -l .` | Go 1.27.3 | sí | Specty no lo ejecuta; `golangci-lint run` usa `./...` |
| `mvn test` | Maven 3.9.16 | no | solo lee `src/main` y `src/test` |
| `gradle test` | Gradle 9.8.2 | no | solo lee sus conjuntos de fuentes |
| `swift build` | Swift 6.2.3 | no | solo lee `Sources/` y `Tests/` |
| `cargo test`, `cargo fmt --check` y `cargo clippy`, también en un workspace | Cargo 1.99.1 | no | solo lee los miembros y sus fuentes |
| `flutter analyze` y `flutter test` | Flutter (Dart 3.12.2) | no | el analizador no entra en carpetas ocultas; los tests, solo en `test/` |
| Vite, servidor de desarrollo | 8.3.5 | sí: observa sus archivos y recarga la página cuando cambia o se crea un `tsconfig.json` en un cambio (al crearlo, por ejemplo); el `index.html` de un cambio emite una recarga que el navegador ignora, porque no es su página | ``server.watch.ignored: [(file) => file.startsWith(`${import.meta.dirname.replaceAll("\\", "/")}/.worktrees/`)]`` |
| Metro, sin Watchman | 0.87.2 | sí: rastrea sus archivos (el doble, con `node_modules` instalado en el cambio) y, por cada archivo que cambia, envía a la app una actualización vacía: React Native muestra «Refreshing...» y borra LogBox | ``resolver.blockList: [new RegExp(`^${__dirname.replace(/[\\^$.*+?()[\]{}\|]/g, "\\$&")}[/\\\\]\\.worktrees[/\\\\]`)]`` |
| Astro, servidor de desarrollo | 7.4.5 (Vite 8.3.5) | sí: recarga la página cuando cambia el `tsconfig.json` de un cambio, y se reinicia cuando cambia su `astro.config.*` o se crea una worktree (`shouldRestartContainer` compara con una expresión sin anclar) | la función de Vite en `vite.server.watch.ignored` de `astro.config.*` |
| SvelteKit | kit 3.1.1 (Vite 8.3.5) | sí, por su Vite: recarga la página con el `tsconfig.json` de un cambio; sus propios observadores de rutas van anclados a `src/routes` | la de Vite, en `vite.config.*` |
| Nuxt | 4.6.4 | no: su observador y el de Vite miran `app/` y los archivos de configuración de la raíz | — |
| webpack con webpack-dev-server | 5.112.2, 6.1.0 | no: watchpack solo observa las dependencias del build | — |
| fork-ts-checker-webpack-plugin | 9.1.0 | sí: observa las carpetas del `include` del tsconfig y recompila, sin recargar la página, cuando se crea un archivo en un cambio; un `npm install` en la worktree provoca decenas de recompilaciones | `"exclude": ["node_modules", ".worktrees"]` en `tsconfig.json`, o en su `configOverwrite`: compara con `path.relative` desde la carpeta del tsconfig |
| Next.js, con Turbopack y con webpack | 16.4.4 | no: su observador va anclado a `app/`, `pages/` y los archivos de la raíz; dentro del cambio, `find-root` se detiene en el límite de la worktree | — |
| Angular CLI, `ng serve` | 22.2.5 | no: desactiva el observador de Vite, y el de la raíz descarta lo que no es del build; con `NG_BUILD_WATCH_ROOT=1` recompila con cada cambio y no hay opción para excluirlo | — |
| Parcel | 2.16.4 | no: recibe los eventos pero no invalida nada | — |
| Rsbuild (Rspack) | 2.3.1 | no | — |
| `@rsbuild/plugin-type-check` | 1.6.1 | sí: recompila cuando se crea un archivo en un cambio o una worktree nueva; su `exclude` no coincide con caracteres especiales en la ruta | ``tools.rspack.watchOptions.ignored: (file) => file.replaceAll("\\", "/").startsWith(`${import.meta.dirname.replaceAll("\\", "/")}/.worktrees/`)`` |
| nodemon, `node --watch` y `tsx watch` | 3.1.14, Node 24.16.0, 4.23.15 | no: nodemon ignora las carpetas ocultas; los otros dos, todo lo que no importa el programa | — |
| CLI de Nest, `nest start --watch` | 12.0.11 | no: los comodines de TypeScript no entran en carpetas ocultas | — |
| Nx | 24.0.3 | no, con la carpeta ignorada en `.gitignore`, `.git/info/exclude` (lo escribe `new`) o `.nxignore`; sin ignorar, falla porque los proyectos se definen dos veces | la línea que escribe `new` |
| Turborepo | 2.11.10 | no con `packages/*`; con un patrón `**` en `pnpm-workspace.yaml`, sí: falla porque los paquetes del cambio ya existen | `"!.worktrees/**"` en `packages` de `pnpm-workspace.yaml` |
| Workspaces de pnpm y npm | pnpm 11.5.2, npm 11.13.0 | no, tampoco pnpm con `**`: sus comodines no entran en carpetas ocultas | — |
| Deno | 2.7.4 | `deno fmt` y `deno lint`, no: leen `.gitignore`; `deno test` y `deno check`, sí; `deno run --watch`, no | `"exclude": [".worktrees/"]` en `deno.json` |
| Django, `runserver` | 6.1.2 (Python 3.13) | no: solo observa los módulos que importa | — |
| Flask, `flask run --debug` | 3.1.3 (Werkzeug 3.1.9) | sí: reinicia el servidor cuando cambia un `.py` de un cambio, con su recargador y con watchdog 6.0.0; con watchdog 7.0.0 su recargador no reacciona a nada, tampoco a la carpeta principal | `--exclude-patterns` con la ruta absoluta (ver abajo) |
| Uvicorn, `--reload` | 0.54.0 (watchfiles 1.3.0) | sí: reinicia con cada `.py` de un cambio y con una worktree nueva, también sin watchfiles | `--reload-dir` con la carpeta del código (ver abajo) |
| flake8 | 7.5.0 | sí | `extend-exclude = .worktrees` en `[flake8]` |
| Black | 26.10.1 | no; sí cuando `[tool.black]` fija su propio `exclude`, porque entonces no lee `.gitignore` | `extend-exclude = '^/\.worktrees/'` en `[tool.black]` |
| Pyright | 1.1.414 | no: excluye `**/.*` aunque el proyecto fije su `exclude` | — |
| Pylint, `pylint --recursive=y .` | 4.1.3 | sí | `ignore = ["CVS", ".worktrees"]` en `[tool.pylint.main]` |
| isort | 9.0.2 | sí | `extend_skip = [".worktrees"]` en `[tool.isort]` |
| `dotnet watch run`, `dotnet test` y `dotnet format` | .NET 10.0.401 | no: el SDK excluye las carpetas ocultas (`**/.*/**`) | — |
| Spring Boot con devtools, `mvn spring-boot:run` | 4.1.2 | no: solo observa su classpath | — |
| RuboCop | 1.50.2 (Ruby 2.6) | no: no entra en carpetas ocultas si no se incluyen | — |

Las exclusiones de la tabla se midieron también en una carpeta `(copia) [1] {x}`: todas funcionan desde la principal y dentro del cambio. Un patrón sin anclar (`"**/.worktrees/**"`) deja sin observar sus propios archivos, dentro del cambio, a webpack y a Rsbuild, como a Vite. Las de webpack en `watchOptions.ignored` no se recomiendan: su esquema no acepta funciones, y fork-ts-checker compara con la ruta nativa y watchpack con `/`.

Flask y Uvicorn se configuran en la línea de comandos. Para Flask, `--exclude-patterns "$PWD/.worktrees/*"` funciona desde la principal y dentro del cambio con su recargador. Werkzeug compara con fnmatch, así que, si la ruta tiene corchetes, hay que escribir `[` como `[[]`; en Windows, fnmatch pasa los dos lados a minúsculas y a `\`, y los corchetes siguen pidiendo ese escape. Con watchdog 6 hace falta un patrón por profundidad (`$PWD/.worktrees/*/*:$PWD/.worktrees/*/*/*`…), porque su `*` no cruza carpetas. Para Uvicorn, la opción que funciona en las dos carpetas es observar solo la carpeta del código (`--reload-dir app`). `--reload-exclude .worktrees` no tiene efecto, porque compara una ruta relativa con las absolutas; con la ruta absoluta, Uvicorn no arranca dentro del cambio («Non-relative patterns are unsupported»); y sin watchfiles, `--reload-exclude` se ignora.

Dentro de la worktree, cada una de estas herramientas trabaja con la copia del cambio, también Cargo en un workspace y Gradle con su `settings`. Vitest 5.1.0, con `"**/.worktrees/**"` en `test.exclude`, ejecuta allí sus tests: compara rutas relativas a su raíz, como Jest, ESLint y Biome con sus exclusiones. Vite y Metro comparan rutas absolutas: con un patrón sin anclar (`"**/.worktrees/**"`, `/\/\.worktrees\/.*/`), dentro de la worktree Vite deja de observar sus propios archivos y Metro responde 404 al bundle; anclado a la carpeta de la configuración, funcionan en las dos carpetas.

El ancla no puede meter la ruta de la carpeta tal cual en un glob o en una expresión regular. Medido el 2026-11-03 con Vite 8.3.5 y Metro 0.87.2 en una carpeta `app (copia) [1] {x} a+b$`: con ``[`${import.meta.dirname}/.worktrees/**`]`` Vite sigue observando `.worktrees/` y recarga la página cuando cambia el `tsconfig.json` de un cambio, y con ``new RegExp(`^${__dirname}/\\.worktrees/`)`` Metro sigue rastreando sus archivos; con una barra invertida en el nombre de la carpeta, igual. Las formas de la tabla no dependen de esos caracteres, y en esas carpetas funcionan desde la principal y dentro del cambio. Vite entrega a una función de `ignored` la ruta con `/` (chokidar 3 la normaliza con anymatch), así que basta comparar su principio con la carpeta de la configuración, también con `/`; Metro compara su expresión con la ruta nativa (`metro-file-map`), así que la expresión escapa la carpeta y acepta los dos separadores. En Windows no se ejecutaron; se comprobaron evaluando las dos expresiones con rutas de Windows. `doctor` ya no da por buena la forma de antes si la ruta del proyecto tiene alguno de esos caracteres.

La excepción es Go con un `go.work` sin versionar en la carpeta principal. Medido con Go 1.27.3 en un workspace de dos módulos, donde uno importa al otro: dentro del proyecto, Go encuentra al subir de carpeta el `go.work` de la carpeta principal, que no lista los módulos de la worktree, y falla («current directory is contained in a module that is not one of the workspace modules listed in go.work»), igual en `.worktrees/` que en `.claude/worktrees/`, donde crea las suyas Claude Code. En la ubicación de antes, fuera del proyecto, no encuentra ninguno y falla con otro error («no required module provides package»): el problema es que el archivo no llega a la worktree, no dónde está. `GOWORK=off` solo sirve si los módulos no se importan entre sí. Con `go.work` versionado, o copiado a la worktree, compila en las tres ubicaciones.

Sin medir, por cómo se organizan: Mix solo lee sus carpetas de fuentes y de tests. Tampoco se midieron Metro con Watchman (no estaba instalado), las herramientas de PHP, las versiones actuales de RuboCop (piden un Ruby más nuevo que el del sistema) ni la vista de control de código de VS Code, que puede listar cada worktree como un repositorio.

La carpeta tiene que ignorarse en `.gitignore`: Prettier no lee `.git/info/exclude`.

## Resultado

Fuera del ecosistema de JavaScript, las herramientas medidas no ven una worktree en una carpeta oculta e ignorada, salvo en Python: flake8, Pylint, isort, Black con un `exclude` propio y los recargadores de Flask y Uvicorn. En JavaScript y TypeScript, Vitest, Jest, ESLint y Biome sin `useIgnoreFile` sí la ven, y Vitest y Jest ejecutan sus tests. Solo ocurre con los comandos que la persona ejecuta en la carpeta principal mientras hay cambios abiertos: la verificación de cada tarea corre en la carpeta de su cambio, y el CI trabaja con un clon limpio. Los servidores de desarrollo Vite (también el de Astro y SvelteKit) y Metro que la persona tiene abiertos en la carpeta principal reaccionan a lo que hace el agente en los cambios, y los comprobadores de tipos de webpack y Rsbuild recompilan cuando crea un archivo. Next.js, Angular CLI, Parcel, Nuxt, nodemon y la CLI de Nest no reaccionan.

## Decisión

- Para todos los proyectos, sin clave para volver a la ubicación de antes: sin los permisos por agente, las herramientas con sandbox no la alcanzarían.
- `specty new` crea la worktree en `.worktrees/<id>`, dentro del proyecto, y la ignora en el clon (`.git/info/exclude`); `init` añade además `/.worktrees/` a `.gitignore`, que es lo que lee Prettier. Así cualquier agente o editor que solo trabaje en la carpeta del proyecto alcanza la del cambio, sin que la persona haga nada.
- En los proyectos de JavaScript y TypeScript, `doctor` dice qué herramienta de la raíz (Vitest, Jest, ESLint, Biome, Vite, Astro, Metro, fork-ts-checker, el comprobador de tipos de Rsbuild, Turborepo con un patrón `**`, Deno) no excluye `.worktrees/`, en qué archivo y qué añadir, como ya pide las exclusiones de `.specty`; para Vite, Astro, Metro y Rsbuild, la exclusión anclada a la carpeta de su configuración. No edita esas configuraciones: son código de la persona, en formatos que Specty no puede reescribir con seguridad.
- En los de Python, `doctor` hace lo mismo con flake8, Pylint, isort y Black con un `exclude` propio. Las opciones de Flask y Uvicorn quedan en este ADR: van en la línea de comandos, que `doctor` no ve.
- Specty detecta, el agente corrige y la persona aprueba (2026-11-04). Esas exclusiones no las escribe Specty: un editor de cada configuración se rompería con cada forma y versión de la herramienta, cada una tiene sus trampas (el `exclude` de `tsconfig.json` anula sus valores por defecto) y `uninstall` tendría que deshacerlo. Las muestran, además de `doctor`, dos tarjetas:
  - la de `next` sin cambio activo, que es la del inicio de cada sesión;
  - la de `init`, antes del primer cambio.

  Lo hacen con la petición del cambio que las corrige: el agente edita la configuración, tenga la forma que tenga, y la persona aprueba el diff en el flujo de Specty. Claude Code tiene el mismo problema con `.claude/worktrees/` y no escribe exclusiones.
- `specty new` copia a la worktree `go.work` y `go.work.sum` si la carpeta principal los tiene sin versionar y, si nada los ignora, los ignora en el clon (`.git/info/exclude`) para que no entren en el cambio. Es una excepción concreta de Go: entre las herramientas medidas, es la única que necesita un archivo sin versionar que solo está en la carpeta principal.
- Los cambios abiertos antes se quedan en `<carpeta>.worktrees/<id>` hasta cerrarse: `specty enter`, `EnterWorktree` por nombre y la protección de `WorktreeRemove` los buscan también allí.
- Los permisos que abrían la carpeta de fuera a cada herramienta (Codex, OpenCode, Gemini CLI, Devin, Cursor y Antigravity) se quitaron, y `init` y `uninstall` borran los que quedaron de antes. Se mantienen los de la carpeta común de git, donde hacen sus commits los comandos de Specty.

## Consecuencias

- Antigravity en Zed, y cualquier editor que hable ACP, entra en un cambio desde la conversación de la carpeta principal.
- Mientras hay cambios abiertos, las herramientas de JavaScript y de Python sin su exclusión ven las copias del proyecto si la persona las ejecuta en la carpeta principal, y los recargadores de Flask y Uvicorn sin su opción reinician el servidor con lo que hace el agente.
- Hasta que se añaden esas exclusiones, cada sesión empieza con su aviso. Hace falta un cambio por proyecto, una sola vez, y su calidad depende del agente: le ayudan la línea exacta de cada herramienta y las comprobaciones del cambio.
- Un proyecto de Go con `go.work` sin versionar trabaja dentro de la worktree con la copia que hace `new`. Para versionarlo después hay que quitar su línea de `.git/info/exclude`, si `new` la añadió. Un `go.work` en una subcarpeta, o con rutas `use` fuera del repositorio, sigue sin llegar a la worktree, como en la ubicación de antes.
- La exclusión anclada de Vite y Metro vale con cualquier ruta del proyecto, también con paréntesis, corchetes o las barras invertidas de Windows, a cambio de ser más larga que un patrón.
