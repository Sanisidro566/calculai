# Arquitectura de Calculai

Mapa para saber **dónde está cada cosa** y **qué no se puede romper**. Si vas a cambiar algo, lee esto primero.

## Archivos

| Archivo | Qué contiene | Cuándo tocarlo |
|---|---|---|
| `index.html` | Esqueleto: menú, contenedor `#view`, panel lateral, modo enfoque, buscador | Casi nunca |
| `app.js` | Toda la lógica, en secciones (ver índice al inicio del archivo) | Casi siempre |
| `styles.css` | Diseño claro/oscuro. Variables en `:root` (tres bloques: claro, oscuro automático, oscuro forzado) | Cambios visuales |
| `calculai-sync.user.js` | Script de Tampermonkey: lee WebC con la sesión del navegador y le entrega los datos a la app | Cambios en la lectura de WebC. **Subir `@version` y `SCRIPT_V` en app.js juntos** |
| `conector.js` | Marcador «Enviar a Calculai» (se ejecuta dentro de WebC) | Cambios en la lectura manual |
| `oauth.html` | Retorno del inicio de sesión de Microsoft (Outlook) | Casi nunca |
| `sw.js` | Modo sin internet. **Subir `CACHE` en cada publicación** que cambie app.js o styles.css | Cada publicación |
| `tests/smoke.py` | Prueba automática con datos inventados | Al agregar funciones importantes |

## Datos

Todo vive en el navegador de cada persona.

| Dónde | Clave | Qué guarda |
|---|---|---|
| localStorage | `calculai:v1` | `{data: D, progress: P}` |
| localStorage | `calculai-lstate` | Avance dentro de cada clase interactiva (por enlace de la clase) |
| localStorage | `calculai-ai-*`, `calculai-ms` | API key de IA, configuración de Outlook |
| IndexedDB | `calculai-clases` | HTML de las clases interactivas (paquete de clases), clave = enlace |

- **D** = `{subjects, events, topics, items, resources, news, sync}`. `topics` son las clases y temas (con `content` si tienen texto propio y `url` si apuntan a una clase o material).
- **P** = `{status, attempts, errors, days, sessions, dayLoad, lastLesson}`.
- `normData` / `normProg` solo conservan las claves que existen en `blankData()` / `blankProg()`. **Un campo nuevo de primer nivel debe agregarse ahí** o se pierde al recargar.

## Flujos

**Clases.** `vClases` lista los temas por materia. `vLesson` muestra, en este orden: el texto propio (`t.content`, si existe), la clase interactiva guardada (`savedFrame`, si el enlace está en IndexedDB) y, si no hay ninguna de las dos, el material del enlace (visor de Drive, YouTube o PDF, o un botón para abrirlo aparte).

**Paquete de clases.** Es un archivo `.json` `{app:'calculai', lessons:[{key, code, title, html}], data?}`. Se carga en *Editar → Respaldo → Cargar paquete de clases* o con *Abrir archivo*. `importPack` guarda las clases en IndexedDB. Si el paquete trae `data`, ofrece cargarla, y lo hace directo cuando solo hay datos de ejemplo.

**Clase aislada.** El iframe tiene `sandbox` **sin** `allow-same-origin`: la clase no puede leer los datos ni la API key de Calculai. `lessonShim` reemplaza su `localStorage` por una copia que avisa cada cambio por `postMessage`. Calculai lo guarda en `calculai-lstate` y, si la clave termina en `-status`, actualiza el estado del tema.

**Revisión de WebC.**
1. Al abrir la app, `startAutoSync` llama a `requestWebcSync`, que envía `calculai-sync-request {courses, codes, known}`.
2. El script lee a fondo solo los cursos vinculados (por id de WebC o por código), en paralelo, sin reabrir los avisos ya conocidos (`known`) y con un máximo de 100 s.
3. Responde con `calculai-webc {auto:true}` y llama a `applyAutoWebc`.
4. `applyAutoWebc` agrega o actualiza fechas, recursos y avisos, manda las fechas leídas en avisos a «Para revisar» y llena la tarjeta «Novedades».
5. Si una fecha leída en un aviso nombra una evaluación que ya está en el calendario (misma materia, tipo y número, p. ej. «Control 2») con otra fecha, `addToInbox` la marca como **posible cambio de fecha** (`replaces`). En «Para revisar» aparece «✓ Cambiar fecha», que mueve esa evaluación en vez de duplicarla. No se aplica sola porque la fecha viene de leer texto libre.
6. El script responde siempre: acusa recibo al instante (`state:'checking'`) y tiene un plazo duro. Si la app no recibe ese acuse en 12 s, muestra que el problema es el script, no WebC.

**Ojo con Tampermonkey:** el script corre en un entorno aislado donde `window` no es la ventana real. No compares `ev.source === window` en el script; filtra por `ev.origin`. La prueba `tests/smoke.py` imita ese entorno.

## Reglas que no se rompen

1. **La sincronización (WebC, Outlook, marcador) nunca modifica `D.topics`, `D.items`, `P` ni IndexedDB.** Solo `D.events`, `D.resources`, `D.news`, `D.sync` y `s.webc`/`s.url` de cada materia.
2. **Las clases guardadas no van dentro de D.** Así no inflan el guardado y nada que reemplace D las borra.
3. **Nada de datos reales en el repositorio.** El repositorio es público: ni datos de cursos, ni clases, ni nombres. Las pruebas usan datos inventados.
4. **Sin servidores intermedios ni contraseñas.** WebC se lee con la sesión del navegador. Outlook usa OAuth con PKCE de solo lectura.
5. **Cambios pequeños y localizados.** Edita la función que corresponde dentro de su sección, no reescribas secciones enteras. Si agregas una función, súmala al índice de `app.js`.
6. **Antes de publicar:** `node --check app.js`, `node --check calculai-sync.user.js`, `python3 tests/smoke.py` (debe decir «TODO OK»). Luego sube `CACHE` en `sw.js`.
