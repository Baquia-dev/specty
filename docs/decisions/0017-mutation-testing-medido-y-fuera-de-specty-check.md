# 0017 · Mutation testing, medido y fuera de `specty check`

- Estado: aceptada
- Fecha: 2026-10-30

## Contexto

`diff-coverage` dice qué líneas añadidas ejecutan los tests, pero no si los tests notarían que esas líneas cambian. Eso lo mide mutation testing: la herramienta altera el código, por ejemplo un `>` por `>=` o un `true` por `false`, y mira si algún test falla. Cada alteración es un mutante. Un mutante que ningún test detecta «sobrevive».

Antes de decidir si `specty check` debía tenerlo, se midió el 2026-10-30. La herramienta fue Stryker 10.1.1 con su runner de Vitest, en un Apple M4 Pro con cuatro procesos. Cada archivo se probó contra los tests de su tarea, como en `policy.tests: contract` ([ADR 0014](0014-los-tests-como-contrato.md)), y no contra toda la suite. La suite completa del CLI tarda minutos, porque casi cada test ejecuta `init`; repetida por cada mutante, un cambio tardaría horas.

| Archivo | Tests | Mutantes | Tiempo | Detectados | Sobreviven | Sin cobertura |
| --- | --- | --- | --- | --- | --- | --- |
| `cli/src/check/code-rules.ts` | 7 de integración | 195 | 45 s | 78 % | 31 | 12 |
| `cli/src/check/vulnerabilities.ts` | 6 de integración | 233 | 67 s | 66 % | 63 | 15 |
| `core/src/checks/functions-tree.ts` | 17 unitarios | 283 | 27 s | 80 % | 56 | 2 |

Los 43 mutantes no detectados de `code-rules.ts`, revisados uno a uno, se reparten así:

- 8 son huecos reales de los tests. Tres son de comportamiento:
  - una línea añadida antes de una coincidencia que no cambió;
  - una coincidencia en un archivo que no es de la ejecución;
  - un archivo dentro de una carpeta de reglas.
  Los otros cinco son menores, como el código de salida 1 o un mensaje que empieza con una línea en blanco.
- 23 están en la lectura defensiva del informe del escáner: resultados sin ruta, sin línea o sin regla, que la spec no pide.
- 8 son equivalentes: no cambian nada que se pueda observar, como el prefijo de la carpeta temporal.
- 3 están en el mensaje de reserva de un escáner que falla sin escribir nada.

En `vulnerabilities.ts` pasa lo mismo:

- 23 de los 78 no detectados son nombres de la lista de lockfiles que ningún test usa.
- Unos 30 están en la lectura defensiva.
- Entre los huecos reales están las vulnerabilidades repetidas, cuya deduplicación ningún test comprueba.

En `functions-tree.ts`, varios de los que sobreviven sí importan: las líneas de un string de varias líneas se pueden contar mal sin que falle ningún test.

El coste se midió antes con el instrumentador de Stryker: cerca de un mutante por línea añadida, con una mediana de 31 por cambio y un máximo de 380 en 25 cambios recientes. A entre 0,1 y 0,3 s por mutante, un cambio típico tardaría de 5 a 10 s más el arranque, y el mayor, cerca de dos minutos. La CPU usada es unas tres veces el tiempo de reloj.

Stryker tampoco funcionó directamente en Specty:

- Con TypeScript 7 se rompe al reescribir el `tsconfig`, porque llama a `ts.parseConfigFileTextToJson`, que la nueva API no tiene. Se esquiva apuntando `tsconfigFile` a un archivo que no existe.
- En un monorepo, su copia de trabajo solo lleva el paquete y pierde el `tsconfig.base.json` de la raíz. Se esquiva con `inPlace`, que muta los archivos del repositorio mientras corre y los restaura al final; un corte a medias los deja mutados.
- Cada stack tiene su herramienta, con su configuración y su informe: PIT, cargo-mutants, mutmut, Infection o Stryker.NET.

## Decisión

- `specty check` no tiene un check de mutation testing, ni con umbral ni como aviso.
  - Un umbral no separa los tests buenos de los malos. El código mejor probado de Specty queda entre el 66 % y el 80 %, y más de la mitad de lo que sobrevive es código defensivo o son mutantes equivalentes. Con un umbral, al agente le compensaría escribir tests para ramas defensivas, o borrar ese código, solo para subir la cifra.
  - Un aviso en cada `task done` costaría entre segundos y minutos de CPU. Además, el agente gastaría tokens en leer una lista en la que unos cuatro de cada cinco mutantes no merecen un test.
  - Haría falta un adaptador por stack, y el de JavaScript necesita hoy dos rodeos.
- Lo útil, unos pocos huecos reales que la cobertura no ve, queda como práctica manual. Quien revisa un cambio delicado puede ejecutar la herramienta de su stack solo sobre las líneas añadidas (en Stryker, `--mutate <archivo>:<líneas>`) y contra los tests de la tarea.

## Consecuencias

- `specty check` no gana dependencias ni tiempo.
- La medición dejó huecos concretos en los tests de `code-rules` y de `vulnerabilities`, que pueden cubrirse en un cambio propio.
- La decisión se revisará si se cumplen dos cosas:
  - hay herramientas que leen el diff sin rodeos en varios stacks, como `cargo-mutants --in-diff` o `infection --git-diff-lines`;
  - alguien pide los mutantes vivos de las líneas añadidas como información para la persona en la aceptación.
  Aun así, sería información para la persona y nunca un umbral.
