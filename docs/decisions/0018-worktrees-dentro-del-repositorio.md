# 0018 · Las worktrees de los cambios, dentro del repositorio

- Estado: aceptada
- Fecha: 2026-11-03

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
| Vite, servidor de desarrollo | 8.3.5 | sí: observa sus archivos y recarga la página cuando cambia o se crea un `tsconfig.json` en un cambio (al crearlo, por ejemplo); el `index.html` de un cambio emite una recarga que el navegador ignora, porque no es su página | ``server.watch.ignored: [`${import.meta.dirname}/.worktrees/**`]`` |
| Metro, sin Watchman | 0.87.2 | sí: rastrea sus archivos (el doble, con `node_modules` instalado en el cambio) y, por cada archivo que cambia, envía a la app una actualización vacía: React Native muestra «Refreshing...» y borra LogBox | ``resolver.blockList: [new RegExp(`^${__dirname}/\\.worktrees/`)]`` |

Dentro de la worktree, cada una de estas herramientas trabaja con la copia del cambio, también Cargo en un workspace y Gradle con su `settings`. Vitest 5.1.0, con `"**/.worktrees/**"` en `test.exclude`, ejecuta allí sus tests: compara rutas relativas a su raíz, como Jest, ESLint y Biome con sus exclusiones. Vite y Metro comparan rutas absolutas: con un patrón sin anclar (`"**/.worktrees/**"`, `/\/\.worktrees\/.*/`), dentro de la worktree Vite deja de observar sus propios archivos y Metro responde 404 al bundle; anclado a la carpeta de la configuración, funcionan en las dos carpetas.

La excepción es Go con un `go.work` sin versionar en la carpeta principal. Medido con Go 1.27.3 en un workspace de dos módulos, donde uno importa al otro: dentro del proyecto, Go encuentra al subir de carpeta el `go.work` de la carpeta principal, que no lista los módulos de la worktree, y falla («current directory is contained in a module that is not one of the workspace modules listed in go.work»), igual en `.worktrees/` que en `.claude/worktrees/`, donde crea las suyas Claude Code. En la ubicación de antes, fuera del proyecto, no encuentra ninguno y falla con otro error («no required module provides package»): el problema es que el archivo no llega a la worktree, no dónde está. `GOWORK=off` solo sirve si los módulos no se importan entre sí. Con `go.work` versionado, o copiado a la worktree, compila en las tres ubicaciones.

Sin medir, por cómo se organizan: Mix solo lee sus carpetas de fuentes y de tests. Tampoco se midieron otros servidores de desarrollo (webpack, Next.js, Angular CLI, Parcel), Metro con Watchman, ni la vista de control de código de VS Code, que puede listar cada worktree como un repositorio.

La carpeta tiene que ignorarse en `.gitignore`: Prettier no lee `.git/info/exclude`.

## Resultado

Fuera del ecosistema de JavaScript, ninguna herramienta medida ve una worktree en una carpeta oculta e ignorada. En JavaScript y TypeScript, Vitest, Jest, ESLint y Biome sin `useIgnoreFile` sí la ven, y Vitest y Jest ejecutan sus tests. Solo ocurre con los comandos que la persona ejecuta en la carpeta principal mientras hay cambios abiertos: la verificación de cada tarea corre en la carpeta de su cambio, y el CI trabaja con un clon limpio. Los servidores de desarrollo Vite y Metro que la persona tiene abiertos en la carpeta principal reaccionan a lo que hace el agente en los cambios.

## Decisión

- Para todos los proyectos, sin clave para volver a la ubicación de antes: sin los permisos por agente, las herramientas con sandbox no la alcanzarían.
- `specty new` crea la worktree en `.worktrees/<id>`, dentro del proyecto, y la ignora en el clon (`.git/info/exclude`); `init` añade además `/.worktrees/` a `.gitignore`, que es lo que lee Prettier. Así cualquier agente o editor que solo trabaje en la carpeta del proyecto alcanza la del cambio, sin que la persona haga nada.
- En los proyectos de JavaScript y TypeScript, `doctor` dice qué herramienta de la raíz (Vitest, Jest, ESLint, Biome, Vite, Metro) no excluye `.worktrees/`, en qué archivo y qué añadir, como ya pide las exclusiones de `.specty`; para Vite y Metro, la exclusión anclada a la carpeta de su configuración. No edita esas configuraciones: son código de la persona, en formatos que Specty no puede reescribir con seguridad.
- `specty new` copia a la worktree `go.work` y `go.work.sum` si la carpeta principal los tiene sin versionar y, si nada los ignora, los ignora en el clon (`.git/info/exclude`) para que no entren en el cambio. Es una excepción concreta de Go: entre las herramientas medidas, es la única que necesita un archivo sin versionar que solo está en la carpeta principal.
- Los cambios abiertos antes se quedan en `<carpeta>.worktrees/<id>` hasta cerrarse: `specty enter`, `EnterWorktree` por nombre y la protección de `WorktreeRemove` los buscan también allí.
- Los permisos que abrían la carpeta de fuera a cada herramienta (Codex, OpenCode, Gemini CLI, Devin, Cursor y Antigravity) se quitaron, y `init` y `uninstall` borran los que quedaron de antes. Se mantienen los de la carpeta común de git, donde hacen sus commits los comandos de Specty.

## Consecuencias

- Antigravity en Zed, y cualquier editor que hable ACP, entra en un cambio desde la conversación de la carpeta principal.
- Mientras hay cambios abiertos, las herramientas de JavaScript sin su exclusión ven las copias del proyecto si la persona las ejecuta en la carpeta principal.
- Un proyecto de Go con `go.work` sin versionar trabaja dentro de la worktree con la copia que hace `new`. Para versionarlo después hay que quitar su línea de `.git/info/exclude`, si `new` la añadió. Un `go.work` en una subcarpeta, o con rutas `use` fuera del repositorio, sigue sin llegar a la worktree, como en la ubicación de antes.
- Si la ruta del proyecto tiene caracteres especiales de glob o de expresiones regulares, o barras invertidas (Windows), la exclusión anclada de Vite y Metro no coincide, y siguen viendo `.worktrees/` sin romper nada.
