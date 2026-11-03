# 0018 · Las worktrees de los cambios, dentro del repositorio

- Estado: propuesta
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

Sin medir, por documentación o por cómo se organizan: Go ignora las carpetas que empiezan por `.` o `_`; Maven, Gradle, SwiftPM, Cargo, Mix y `flutter test` solo leen sus carpetas de fuentes y de tests. Tampoco se midieron los observadores de archivos de los servidores de desarrollo (Vite, Metro), que podrían ver los módulos repetidos como Jest, ni la vista de control de código de VS Code, que puede listar cada worktree como un repositorio.

La carpeta tiene que ignorarse en `.gitignore`: Prettier no lee `.git/info/exclude`.

## Resultado

Fuera del ecosistema de JavaScript, ninguna herramienta medida ve una worktree en una carpeta oculta e ignorada. En JavaScript y TypeScript, Vitest, Jest, ESLint y Biome sin `useIgnoreFile` sí la ven, y Vitest y Jest ejecutan sus tests. Solo ocurre con los comandos que la persona ejecuta en la carpeta principal mientras hay cambios abiertos: la verificación de cada tarea corre en la carpeta de su cambio, y el CI trabaja con un clon limpio.

## Propuesta

- `specty new` crea la worktree en `.worktrees/<id>`, dentro del repositorio, y `init` añade `.worktrees/` a `.gitignore`. Así cualquier agente o editor que solo trabaje en la carpeta del proyecto alcanza la del cambio, sin que la persona haga nada.
- En los proyectos de JavaScript y TypeScript, `init` añade la exclusión de `.worktrees/` a la configuración de Vitest, Jest, ESLint y Biome que detecta, y `doctor` avisa donde no pudo.
- La ubicación de antes sigue disponible con una clave de `git`, y los cambios abiertos se quedan donde están: Specty encuentra cada worktree con `git worktree list`, esté donde esté.
- Una vez que las worktrees nuevas estén dentro, los permisos que hoy abren la carpeta de fuera (Codex, OpenCode, Gemini CLI, Devin, Antigravity) sobran, y se quitan en un cambio aparte.

Queda por decidir si la ubicación dentro es la de todos los proyectos o solo la de los que instalan un agente que no sale de su carpeta, como Antigravity.
