# Arquitectura de CalculAi

Mapa para saber **dónde está cada cosa** y **qué no se puede romper**. Si vas a cambiar algo, lee esto primero.

## Archivos

| Archivo | Qué contiene | Cuándo tocarlo |
|---|---|---|
| `index.html` | Esqueleto: menú, contenedor `#view`, panel lateral, modo enfoque, buscador | Casi nunca |
| `app.js` | Toda la lógica, en secciones (ver índice al inicio del archivo) | Casi siempre |
| `styles.css` | Diseño claro/oscuro. Variables en `:root` (tres bloques: claro, oscuro automático, oscuro forzado) | Cambios visuales |
| `calculai-sync.user.js` | Script de Tampermonkey: lee WebC con la sesión del navegador y le entrega los datos a la app | Cambios en la lectura de WebC. **Subir `@version` y `SCRIPT_V` en app.js juntos** |
| `conector.js` | Marcador «Enviar a CalculAi» (se ejecuta dentro de WebC) | Cambios en la lectura manual |
| `oauth.html` | Retorno del inicio de sesión de Microsoft (Outlook) | Casi nunca |
| `sw.js` | Modo sin internet. **Subir `CACHE` en cada publicación** que cambie app.js o styles.css | Cada publicación |
| `tests/smoke.py` | Prueba automática en Chromium con datos inventados | Al agregar funciones importantes |
| `tests/antislop.py` | Revisión estática: seguridad, campos de datos, versiones, datos reales, textos | Si agregas una regla nueva |
| `vendor/pdfjs/` | pdf.js 6.3.289 (Mozilla, Apache-2.0) para leer el texto de los PDF | Solo para actualizarlo |

## Datos

Todo vive en el navegador de cada persona.

| Dónde | Clave | Qué guarda |
|---|---|---|
| localStorage | `calculai:v1` | `{data: D, progress: P}` |
| localStorage | `calculai-lstate` | Avance dentro de cada clase interactiva (por enlace de la clase) |
| localStorage | `calculai-ai-*`, `calculai-ms` | API key de IA, configuración de Outlook |
| IndexedDB | `calculai-clases` | HTML de las clases interactivas (paquete de clases), clave = enlace |

- **D** = `{subjects, events, topics, items, resources, news, sync, plan}`. `plan` son los ajustes del plan de estudio (horas por día, desde cuándo, días). `topics` son las clases y temas (con `content` si tienen texto propio y `url` si apuntan a una clase o material).
- **P** = `{status, attempts, errors, days, sessions, dayLoad, lastLesson}`.
- `normData` / `normProg` solo conservan las claves que existen en `blankData()` / `blankProg()`. **Un campo nuevo de primer nivel debe agregarse ahí** o se pierde al recargar.

## Flujos

**Clases.** `vClases` lista los temas por materia. `vLesson` muestra, en este orden: el texto propio (`t.content`, si existe), la clase interactiva guardada (`savedFrame`, si el enlace está en IndexedDB) y, si no hay ninguna de las dos, el material del enlace (visor de Drive, YouTube o PDF, o un botón para abrirlo aparte).

**Paquete de clases.** Es un archivo `.json` `{app:'calculai', lessons:[{key, code, title, html}], data?}`. Se carga en *Editar → Respaldo → Cargar paquete de clases* o con *Abrir archivo*. `importPack` guarda las clases en IndexedDB. Si el paquete trae `data`, ofrece cargarla, y lo hace directo cuando solo hay datos de ejemplo.

**Clase aislada.** El iframe tiene `sandbox` **sin** `allow-same-origin`: la clase no puede leer los datos ni la API key de CalculAi. `lessonShim` reemplaza su `localStorage` por una copia que avisa cada cambio por `postMessage`. CalculAi lo guarda en `calculai-lstate` y, si la clave termina en `-status`, actualiza el estado del tema.

**Plan de estudio (Calendario).** `buildPlan` reparte las clases pendientes de cada materia (en el orden de `D.topics`) en los días que quedan hasta su evaluación, según `D.plan`. Cada cupo va a la materia más apurada (clases que faltan ÷ días que quedan), así las materias se alternan; la víspera de cada evaluación es de repaso. Se recalcula siempre desde hoy: lo Practicado o Dominado sale. Lo que no alcanza se pasa a la evaluación siguiente o se avisa. Se ve en el mes, en Agenda, en el detalle del día y en «Ahora» (`todayPlanCard`).

**Crear clases con mi material.** `openGenerator` → elige archivos de WebC (los trae el script con `calculai-file-request`, solo `/mod/resource`, `/mod/page` y `/pluginfile.php`) o subidos → `readMaterial` saca el texto (PDF con pdf.js, `.pptx`/`.docx` con un lector de zip propio) → la IA propone clases (`genPlan`) y escribe cada una (`genBuild`), o se copia la instrucción y se pega la respuesta → `parseLessons` separa clases y ejercicios → `addGenerated` crea temas (con `content` y `gen`) y ejercicios. IA: Google (con plan gratis), Anthropic u OpenAI, con la key de cada persona (`callAI`, `aiConfigEl`).

**WebC directo, sin instalar nada (camino principal).** `openWebcConnect` abre en WebC `admin/tool/mobile/launch.php?service=moodle_mobile_app&urlscheme=calculai&confirmed=1` (el inicio de sesión de la app de WebC). Esa página muestra un enlace `calculai://token=…`; la persona copia su dirección y la pega. `parseWebcKey` saca la clave del servicio móvil, que queda en `localStorage` (`calculai-webc-token`, nunca en D). `ws()` llama a `webservice/rest/server.php` y `webcFileByToken` a `webservice/pluginfile.php`. Ambos responden con `Access-Control-Allow-Origin: *`, verificado en el código fuente de Moodle. `restSync` arma el mismo formato que el script y llama a `applyAutoWebc`. Si la clave vence, la barra pide «Conectar de nuevo». Requiere que WebC tenga activo el servicio de la app móvil. El script y el marcador siguen como alternativas.

**Estudiar para una evaluación.** `vEvalStudy` (Clases → «🎯 Estudiar para», o la tarjeta de la evaluación en «Ahora» o en el Calendario). Guarda en el evento `e.study = {text, docs, gaps, note}` y la lista `e.topics`; `examFor` toma esa lista en cuenta, así que el plan, la preparación, «La próxima hora» y Práctica (`pracFilter = 'ev:<id>'`) usan solo esas clases. `aiOrPaste` consulta la IA con la key o, sin key, copia la instrucción y recibe la respuesta pegada. Al subir la pauta (o con «✦ Crear las clases para…»), `evalAutoClasses` divide lo que se evalúa en ~3 clases nuevas solo para esa evaluación (con ejercicios), marcadas con `gen.eval` y guardadas como `e.topics`; sin API key usa copiar y pegar. Volver a crearlas reemplaza las anteriores que sigan en «Pendiente». La elección manual de clases queda como ajuste opcional. «Crear clases para lo que falta» abre el generador con la pauta como material y el foco de la evaluación (`openGenerator(sid, {mats, focus, evalId})`).

**Primera conexión (compañeros).** Sin materias y con el script, «Conectar con WebC» lista los cursos (`firstConnect` → `firstPicker`) y los trae a la revisión normal (`vWebcReview`).

**Revisión de WebC.**
1. Al abrir la app, `startAutoSync` llama a `requestWebcSync`, que envía `calculai-sync-request {courses, codes, known}`.
2. El script lee a fondo solo los cursos vinculados (por id de WebC o por código), en paralelo, sin reabrir los avisos ya conocidos (`known`) y con un máximo de 100 s.
3. Responde con `calculai-webc {auto:true}` y llama a `applyAutoWebc`.
4. `applyAutoWebc` agrega o actualiza fechas, recursos y avisos, manda las fechas leídas en avisos a «Para revisar» y llena la tarjeta «Novedades».
5. Si una fecha leída en un aviso nombra una evaluación que ya está en el calendario (misma materia, tipo y número, p. ej. «Control 2») con otra fecha, `addToInbox` la marca como **posible cambio de fecha** (`replaces`). En «Para revisar» aparece «✓ Cambiar fecha», que mueve esa evaluación en vez de duplicarla. No se aplica sola porque la fecha viene de leer texto libre.
6. El script responde siempre: acusa recibo al instante (`state:'checking'`) y tiene un plazo duro. Si la app no recibe ese acuse en 12 s, muestra que el problema es el script, no WebC.

**Seguridad.** El repositorio y la app son públicos y se comparten: un archivo de otra persona (plantilla, paquete, respaldo) es dato no confiable.
- `h()` descarta `href`/`src` que no sean web, correo, `blob:` o relativos (`urlOk`); `openExt` abre solo `http(s)`; el visor solo incrusta `https`.
- `normData`/`normProg` exigen arreglos de objetos; `planCfg` corrige valores raros.
- CSP en `index.html`: conexiones solo a WebC, a los proveedores de IA y a Microsoft; sin imágenes externas ni `object`. Las clases (srcdoc) heredan esta política: por eso permite scripts en línea y cdnjs.
- CalculAi no corre dentro de otra página (arranque). El script solo habla con WebC (`@connect webc.uai.cl`) y solo trae archivos de cursos.
- La API key vive en el `localStorage` de `sanisidro566.github.io`, compartido con cualquier otra página publicada en esa misma cuenta de GitHub Pages: no publiques ahí páginas de terceros.

**Ojo con Tampermonkey:** el script corre en un entorno aislado donde `window` no es la ventana real. No compares `ev.source === window` en el script; filtra por `ev.origin`. La prueba `tests/smoke.py` imita ese entorno.

- **Archivos de WebC para crear clases.** WebC entrega la lista de cursos por REST con permiso CORS, pero sus archivos (`pluginfile.php`) no traen `Access-Control-Allow-Origin`, así que la app no puede bajarlos directo (el navegador lo bloquea; la app lo muestra como un solo aviso, error interno `BLOCKED`). El camino que funciona es el marcador «Enviar a CalculAi» (`conector.js`): corre dentro de WebC, baja con tu sesión los archivos de tipo recurso y página (máx. 30 MB c/u, 300 MB en total) y los manda con `postMessage` junto al resto. La app solo acepta archivos si el mensaje viene de `webc.uai.cl` y los guarda en Cache Storage `calculai-archivos` (`saveWebcFiles`), nunca en D, P ni en IndexedDB. `fetchWebcFile` mira primero ese caché, después la clave y después el script. `sw.js` no borra ese caché al actualizar.

## Reglas que no se rompen

1. **La sincronización (WebC, Outlook, marcador) nunca modifica `D.topics`, `D.items`, `P` ni IndexedDB.** Solo `D.events`, `D.resources`, `D.news`, `D.sync` y `s.webc`/`s.url` de cada materia.
2. **Las clases guardadas no van dentro de D.** Así no inflan el guardado y nada que reemplace D las borra.
3. **Nada de datos reales en el repositorio.** El repositorio es público: ni datos de cursos, ni clases, ni nombres. Las pruebas usan datos inventados.
4. **Sin servidores intermedios ni contraseñas.** WebC se lee con la sesión del navegador. Outlook usa OAuth con PKCE de solo lectura.
5. **Cambios pequeños y localizados.** Edita la función que corresponde dentro de su sección, no reescribas secciones enteras. Si agregas una función, súmala al índice de `app.js`.
6. **Antes de publicar:** `python3 tests/antislop.py` (debe decir «ANTISLOP OK») y `python3 tests/smoke.py` (debe decir «TODO OK»). Luego sube `CACHE` en `sw.js`.
7. **Enlaces y HTML:** nunca `innerHTML`, `eval` ni `window.open` directo con datos del usuario (ver Seguridad).
