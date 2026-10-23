---
kind: standard
---

# Heredocs en el guard

## Objetivo

El guard analiza solo lo que bash ejecuta: deja de leer el cuerpo de los heredocs como si fueran comandos. Hoy falla en las dos direcciones. Un `=>` dentro del cuerpo se toma por una redirección y bloquea ediciones legítimas, con un `SIGUIENTE:` que propone un `scope add` inútil. Y un apóstrofo en el cuerpo abre una comilla que se traga el resto del comando, así que un `git commit` posterior pasa el guard; solo lo paran después los recibos del `pre-commit`.

## Fuera de alcance

- Analizar sustituciones de comandos (`$(…)` y comillas invertidas): hoy no se analizan en ningún sitio.
- Las escrituras que hacen intérpretes y scripts (`python3 script.py …`): son otra mejora pendiente.
- Cambiar las decisiones del guard (`decideGuard`) o sus mensajes.
- Una gramática completa de shell: el análisis sigue siendo de mejor esfuerzo, y la garantía son los hooks de git y el CI.

## Supuestos

- A1: Trato también los comentarios de shell, porque son el mismo fallo en la misma función: una palabra que empieza por `#` fuera de comillas convierte el resto de la línea en comentario, y hoy `echo hi # > src/a.ts` cuenta como una escritura en `src/a.ts`.
  - impacto: alto
- A2: Un heredoc sin línea de cierre se trata como lo trata bash: el resto del comando es su cuerpo y no se analiza, porque bash tampoco lo ejecuta.
- A3: Ignorar el cuerpo no pierde nada que hoy se detecte: en un heredoc sin comillas bash expande las sustituciones (`$(…)`), pero el guard no analiza sustituciones en ningún sitio.
- A4: Las comillas o la barra del delimitador (`'EOF'`, `"EOF"`, `\EOF`) solo deciden si bash expande el cuerpo; para el guard el delimitador es la palabra sin comillas y el cuerpo se ignora igual.

## Criterios de aceptación

- AC1: CUANDO un comando lleva un heredoc (`<<EOF`, `<< EOF`, `<<'EOF'`, `<<"EOF"` o `<<\EOF`) ENTONCES sus líneas no se leen como comandos ni como redirecciones: `python3 - <<'PY'` con la línea `# map: old => packages/core/src/index.ts` en el cuerpo ya no cuenta como escritura.
- AC2: CUANDO hay comandos después de la línea que cierra el heredoc ENTONCES se analizan: `cat <<'EOF' > /dev/null`, una línea `don't`, `EOF` y `git commit -m x` se bloquea igual que `git commit -m x` solo.
- AC3: CUANDO el heredoc usa `<<-` ENTONCES la línea de cierre se reconoce aunque empiece por tabuladores.
- AC4: CUANDO una línea abre varios heredocs ENTONCES sus cuerpos se saltan en el orden en que se abrieron.
- AC5: CUANDO `<<` es un desplazamiento aritmético (`echo $((1 << 2))`) o forma parte de un here-string (`<<<`) ENTONCES no se toma por un heredoc y las líneas siguientes se analizan.
- AC6: CUANDO una palabra empieza por `#` fuera de comillas ENTONCES el resto de la línea no se analiza: `echo hi # > src/a.ts` no escribe nada, y `echo a#b > src/a.ts` sigue escribiendo en `src/a.ts`.
- AC7: CUANDO un heredoc no tiene línea de cierre ENTONCES el resto del comando cuenta como su cuerpo.

## Diseño

- `tokenize` (`guard/tokens.ts`) reconoce `<<` y `<<-` como un solo operador seguido de su delimitador, ya sin comillas, y anota el heredoc como pendiente. `<<<` sigue siendo un here-string.
- Al llegar al salto de línea que termina esa línea de comandos, salta los cuerpos pendientes en orden: cada uno hasta la primera línea igual a su delimitador (sin los tabuladores iniciales si es `<<-`); si no aparece, hasta el final.
- Dentro de `$((…))` y `((…))`, `<<` es un desplazamiento: el tokenizador lleva la cuenta de esos paréntesis.
- Una palabra que empieza por `#` fuera de comillas descarta el resto de la línea (A1).
- `shell.ts` no cambia: `splitRedirections` ya trata cualquier operador que empiece por `<` como entrada y consume su destino, así que el delimitador no acaba como argumento ni como archivo.

## Archivos

- modificar packages/core/src/guard/tokens.ts — heredocs, desplazamientos aritméticos y comentarios
- modificar packages/core/test/guard/shell.test.ts — un caso por cada forma
- modificar packages/cli/test/enforce.test.ts — las dos pruebas del guard de punta a punta
- modificar docs/ARCHITECTURE.md — el análisis de shell ignora heredocs y comentarios (§10)

## Tareas

- [x] T1: Heredocs y comentarios en el tokenizador
  - files: packages/core/src/guard/tokens.ts, packages/core/test/guard/shell.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4, AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/shell.test.ts
  - type: fix
- [ ] T2: El guard con heredocs, de punta a punta
  - files: packages/cli/test/enforce.test.ts
  - ac: AC1, AC2
  - verify: pnpm check
  - type: test

## Riesgos

- R1: Tomar por heredoc algo que no lo es haría saltar líneas que bash sí ejecuta, un falso negativo nuevo — AC5 cubre los desplazamientos y los here-strings, cada forma tiene su test, y los recibos del `pre-commit` siguen parando cualquier commit hecho sin `task done`.
- R2: Un `#` en mitad de una palabra tomado por comentario ocultaría el resto de la línea — AC6 prueba que `a#b` no es un comentario.
