# CalculAi — estudia con un plan

Aplicación web de estudio, gratuita y sin cuentas. Funciona en cualquier navegador y se puede instalar en el celular o el computador. Después de la primera visita también funciona sin internet.

## Qué hace
- **Ahora:** arma un plan para la próxima hora según tus fechas y tu avance, y explica por qué eligió ese tema. Incluye modo enfoque con temporizador.
- **Próximas 72 horas:** muestra las evaluaciones y entregas que vienen.
- **Clases:** todas tus clases ordenadas por materia, con buscador, «continuar donde quedaste» y un lector dentro de la app. El material de Google Drive, Docs, YouTube o PDF se ve dentro de CalculAi; lo de WebC se abre aparte porque Moodle lo exige.
- **Paquete de clases:** tus clases interactivas se guardan en este dispositivo (Editar → Respaldo → *Cargar paquete de clases*) y se leen dentro de CalculAi, aunque WebC no esté conectado. Se muestran aisladas: no pueden leer tus datos. Lo que marques en «Mi estado» dentro de la clase se copia al tema.
- **Crear clases con mi material:** eliges archivos del curso (los de WebC los trae el script; también puedes subir PDF, PowerPoint .pptx, Word .docx o texto) y una IA arma clases con objetivo, teoría, fórmulas, ejemplos, errores típicos, ejercicios con soluciones y verificación, más ejercicios para «Práctica». Usa tu propia API key (Google tiene plan gratis) o copia la instrucción para pegarla en tu asistente. Las clases quedan marcadas como hechas con IA para revisarlas con tus apuntes.
- **Adaptar con IA:** en cada clase puedes pedir una explicación más simple, más ejemplos, un resumen, errores frecuentes o ejercicios, y contarle qué te cuesta. Usa tu propia API key (guardada solo en tu navegador) o copia la instrucción para pegarla en tu asistente.
- **Mapa:** temas con prerrequisitos y estado (Pendiente, Aprendiendo, Practicado, Necesita repaso, Dominado), más repaso espaciado.
- **Práctica:** preguntas de alternativas o numéricas, con fórmulas ($…$). Antes de responder dices qué tan seguro estás, y la app mide tu calibración.
- **Banco de errores (dentro de Práctica):** los errores se guardan solos y puedes anotar su causa.
- **Calendario y plan de estudio:** le dices cuántas horas al día quieres estudiar (desde hoy o X días antes de cada evaluación) y reparte las clases de cada materia, en orden desde la primera, en los días que quedan; la víspera de cada evaluación queda para repaso y se reacomoda solo cuando avanzas. Vista mensual y agenda, con horas disponibles por día. Cada fecha muestra si está confirmada o no. Se exporta como `.ics` (Google, Apple, Outlook) o como CSV.
- **Conectar con WebC sin instalar nada:** abres WebC desde CalculAi, copias el enlace «para abrir la app» y lo pegas. Con esa clave (la misma que usa la app de WebC, guardada solo en tu navegador) CalculAi revisa WebC solo: cursos, fechas, avisos y archivos para crear clases.
- **Estudiar para una evaluación:** en Clases eliges el control o la prueba, escribes qué entra o subes la pauta, el temario o una prueba anterior, y marcas (o la IA detecta) las clases que entran. El plan, la práctica y la preparación usan solo eso; además puedes crear clases para lo que falta y ejercicios tipo prueba.
- **Conectar con WebC (o cualquier Moodle) con el marcador:** un marcador «Enviar a CalculAi» lee tus cursos, las fechas del calendario, los recursos y los avisos desde tu sesión abierta de WebC (sirve aunque entres con Microsoft). CalculAi detecta fechas dentro de los avisos y te las muestra como sugerencias para que las confirmes. No usa contraseñas ni servidores intermedios.
- **Revisión automática al abrir:** con el script `calculai-sync.user.js` (Tampermonkey), cada vez que abres CalculAi se revisa WebC con tu sesión: se agregan fechas del calendario del curso, avisos y recursos nuevos; las fechas leídas en avisos quedan en «Para revisar» y lo nuevo aparece en la tarjeta «Novedades». Solo lee a fondo los cursos que ya son materias (por id o por código), en paralelo y sin reabrir avisos ya leídos. La revisión nunca toca tus temas, clases ni progreso.
- **Outlook (opcional):** con un registro de app de Microsoft (solo lectura de correo), CalculAi lee los correos de WebC o de tus cursos al abrirse y propone sus fechas.
- **Seguridad:** todo queda en tu navegador; los archivos que te compartan no pueden ejecutar código en CalculAi (solo enlaces web, visor solo https, política CSP) y las clases se muestran aisladas.
- **Editar:** materias, evaluaciones, temas, ejercicios y recursos. Tiene respaldo completo y «plantilla para compartir» con compañeros (sin el progreso).

## Privacidad
Todos los datos se guardan en el navegador (`localStorage`) de cada persona. No hay servidor ni cuentas. Para cambiar de equipo, usa *Editar → Respaldo completo* y luego *Abrir archivo*.

## Cómo publicarla (gratis)
Es un sitio estático: basta con subir esta carpeta tal cual.

**Opción A: GitHub Pages**
1. Crea un repositorio público (por ejemplo `calculai`) y sube todos estos archivos a la raíz.
2. Ve a *Settings → Pages → Deploy from a branch → main / (root)* y guarda.
3. En un minuto queda en `https://TU-USUARIO.github.io/calculai/`.

**Opción B: Netlify Drop**
1. Entra a https://app.netlify.com/drop.
2. Arrastra esta carpeta completa y obtendrás una dirección pública al instante. Si creas una cuenta gratuita, la dirección queda fija.

**Opción C: Cloudflare Pages o Vercel:** sube la carpeta como sitio estático, sin compilación.

> La instalación como app y el modo sin internet requieren HTTPS. Las tres opciones lo incluyen.

## Probarla en tu computador
```bash
cd calculai
python3 -m http.server 8000
# abre http://localhost:8000
```

## Archivos
| Archivo | Para qué |
|---|---|
| `index.html` | Página |
| `styles.css` | Diseño (claro y oscuro) |
| `app.js` | Toda la lógica |
| `sw.js` | Modo sin internet |
| `conector.js` | Conector que se ejecuta dentro de WebC/Moodle desde el marcador |
| `calculai-sync.user.js` | Script de revisión automática de WebC (Tampermonkey) |
| `oauth.html` | Retorno del inicio de sesión de Microsoft (Outlook) |
| `ARQUITECTURA.md` | Mapa del código, datos, flujos y reglas que no se rompen |
| `CLAUDE.md` | Instrucciones para quien edite el código con IA |
| `tests/antislop.py` | Revisión estática antes de publicar (seguridad, datos, versiones) |
| `tests/smoke.py` | Prueba automática (datos inventados): `python3 tests/smoke.py` antes de publicar |
| `manifest.webmanifest`, `icons/` | Instalación como app |
| `vendor/katex.min.js` | Fórmulas matemáticas (KaTeX, licencia MIT) |
