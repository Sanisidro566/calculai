# Calculai — estudia con un plan

Aplicación web de estudio, gratuita y sin cuentas. Funciona en cualquier navegador y se puede instalar en el celular o el computador. Después de la primera visita también funciona sin internet.

## Qué hace
- **Ahora:** arma un plan para la próxima hora según tus fechas y tu avance, y explica por qué eligió ese tema. Incluye modo enfoque con temporizador.
- **Próximas 72 horas:** muestra las evaluaciones y entregas que vienen.
- **Mapa:** temas con prerrequisitos y estado (Pendiente, Aprendiendo, Practicado, Necesita repaso, Dominado), más repaso espaciado.
- **Práctica:** preguntas de alternativas o numéricas, con fórmulas ($…$). Antes de responder dices qué tan seguro estás, y la app mide tu calibración.
- **Errores:** los errores se guardan solos y puedes anotar su causa.
- **Calendario:** vista mensual y agenda. Cada fecha muestra si está confirmada o no. Se exporta como `.ics` (Google, Apple, Outlook) o como CSV.
- **Conectar con WebC (o cualquier Moodle):** un marcador «Enviar a Calculai» lee tus cursos, las fechas del calendario, los recursos y los avisos desde tu sesión abierta de WebC (sirve aunque entres con Microsoft). Calculai detecta fechas dentro de los avisos y te las muestra como sugerencias para que las confirmes. No usa contraseñas ni servidores intermedios.
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
| `manifest.webmanifest`, `icons/` | Instalación como app |
| `vendor/katex.min.js` | Fórmulas matemáticas (KaTeX, licencia MIT) |
