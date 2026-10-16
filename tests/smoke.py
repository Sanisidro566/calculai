"""Prueba rápida de CalculAi: correr ANTES de publicar cualquier cambio.

    pip install playwright        (Chromium ya instalado, o: playwright install chromium)
    python3 tests/smoke.py        (desde la carpeta del repositorio)

Levanta un servidor local, abre la app en Chromium sin conexión a WebC real y comprueba
lo que no se puede romper. Usa solo datos inventados: nunca pongas aquí datos ni clases reales.
Termina con «TODO OK» o con la lista de fallas (código de salida 1).
"""
import asyncio, base64, io, json, os, re, socket, subprocess, sys, tempfile, time, zipfile
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8899
APP = f'http://127.0.0.1:{PORT}/'
FAILS = []

def check(ok, msg):
    print(('  ✓ ' if ok else '  ✗ ') + msg)
    if not ok: FAILS.append(msg)

# ---------- Datos inventados ----------
SEED = r'''() => {
  const iso = d => d.toISOString().slice(0,10);
  const inD = n => { const d = new Date(); d.setDate(d.getDate()+n); return iso(d); };
  const data = {v:1, owner:"Prueba", subjects:[
      {id:"s1", name:"Física de prueba", short:"Física", code:"FIS101", color:"naranja"},
      {id:"s2", name:"Álgebra de prueba", short:"Álgebra", code:"MAT113", color:"violeta", webc:10002}],
    events:[{id:"e1", subj:"s1", kind:"prueba", name:"Prueba 2", date:inD(10), time:"09:00", ver:true, topics:[]},
            {id:"e2", subj:"s1", kind:"control", name:"Control 2", date:inD(2), time:"10:00", ver:false, topics:[]}],
    topics:[
      {id:"t1", subj:"s1", code:"F1", title:"Cinemática", scope:"actual", prio:"2", pre:[], content:"# Cinemática\n\n$$x = x_0 + v_0 t$$"},
      {id:"t2", subj:"s1", code:"F2", title:"Newton", scope:"actual", prio:"2", pre:["t1"], url:"https://claude.ai/artifact/PRUEBA-F2"},
      {id:"t3", subj:"s2", code:"A1", title:"Sistemas", scope:"actual", prio:"1", pre:[], url:"https://claude.ai/artifact/PRUEBA-A1"}],
    items:[{id:"q1", topic:"t1", type:"num", q:"¿2+2?", ans:4, tol:.01, unit:"", ex:""}],
    resources:[], news:[], sync:{}};
  localStorage.setItem("calculai:v1", JSON.stringify({data, progress:{status:{}, attempts:[], errors:[], days:{}, sessions:[], dayLoad:{}, lastLesson:""}, savedAt:new Date().toISOString()}));
}'''
LESSON = '<!doctype html><html><head><meta charset="utf-8"><title>Clase</title></head><body><nav><a href="#teoria">Teoría</a> <a href="otra.html">Otra</a></nav><h1>Newton de prueba</h1><div style="height:3000px"></div><h2 id="teoria">Teoría</h2><div style="height:1500px"></div><div id="status"><button data-s="Practicado">Practicado</button></div><script>document.querySelector("button").onclick=function(){try{localStorage.setItem("F2-status",JSON.stringify("Practicado"))}catch(e){}};</script></body></html>'
PACK = {'app': 'calculai', 'v': 1, 'lessons': [
    {'key': 'https://claude.ai/artifact/PRUEBA-F2', 'code': 'F2', 'title': 'Newton', 'html': LESSON},
    {'key': 'https://claude.ai/artifact/PRUEBA-A1', 'code': 'A1', 'title': 'Sistemas', 'html': LESSON.replace('Newton', 'Sistemas')}]}

# ---------- Archivos de curso inventados (PDF y PowerPoint mínimos) ----------
def mini_pdf(pages):
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>', None, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']; kids = []
    for lines in pages:
        c = b'BT /F1 12 Tf 50 750 Td 16 TL ' + b' '.join(b'(' + l.encode('cp1252') + b') Tj T*' for l in lines) + b' ET'
        objs.append(b'<< /Length %d >>\nstream\n' % len(c) + c + b'\nendstream')
        objs.append(b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>' % len(objs)); kids.append(len(objs))
    objs[1] = b'<< /Type /Pages /Kids [' + b' '.join(b'%d 0 R' % k for k in kids) + b'] /Count %d >>' % len(kids)
    out, offs = b'%PDF-1.4\n', []
    for i, o in enumerate(objs): offs.append(len(out)); out += b'%d 0 obj\n' % (i + 1) + o + b'\nendobj\n'
    x = len(out); out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs)
    return out + b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, x)
def mini_pptx(slides):
    b = io.BytesIO(); z = zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED)
    for i, t in enumerate(slides, 1): z.writestr(f'ppt/slides/slide{i}.xml', '<p:sld xmlns:a="a" xmlns:p="p">' + ''.join(f'<a:p><a:r><a:t>{x}</a:t></a:r></a:p>' for x in t) + '</p:sld>')
    z.close(); return b.getvalue()
FRASE = 'La segunda ley de Newton dice que la fuerza neta es igual a la masa por la aceleracion. '
PDF = mini_pdf([['Dinamica de prueba', FRASE[:80], FRASE[80:]] + [FRASE[:80]] * 5, ['Ejemplo: 2 kg y 10 N dan 5 m/s2.'] + [FRASE[:80]] * 5])
CLASE = '''Aquí va:

# {t}

## Objetivo
Usar la segunda ley.

## Mapa
- Antes: vectores.

## Teoría
La fuerza neta produce aceleración.

## Fórmulas

$$F = m a$$

## Procedimiento
1. Dibuja el diagrama.

## Ejemplos resueltos
Un bloque de 2 kg con 10 N acelera 5 m/s².

## Errores típicos
- Olvidar el peso.

## Ejercicios
1. Bloque de 4 kg con 8 N.

## Soluciones
1. 2 m/s².

## Verificación de dominio
- ¿Qué es la fuerza neta?

```ejercicios
[{{"tipo":"numerica","pregunta":"4 kg y 8 N: ¿aceleración?","respuesta":2,"tolerancia":0.01,"unidad":"m/s²","explicacion":"a = F/m"}},
 {{"tipo":"alternativas","pregunta":"¿Unidad de fuerza?","opciones":["Newton","Joule"],"correcta":0,"explicacion":"N"}}]
```
'''

# ---------- WebC simulado (lo que respondería Moodle) ----------
NOW = int(time.time())
def webc(method, url, data):
    if url.endswith('/my/'):
        return 200, url, '<html><head><title>Área personal | WebC</title><script>M.cfg = {"sesskey":"abc"};</script></head></html>'
    if 'service.php' in url:
        fn = re.search(r'info=(\w+)', url).group(1)
        if fn == 'core_course_get_enrolled_courses_by_timeline_classification':
            d = {'courses': [{'id': 10001, 'fullname': 'FÍSICA I Sec.3', 'shortname': 'X-FIS101-3'},
                             {'id': 10002, 'fullname': 'ÁLGEBRA LINEAL Sec.8', 'shortname': 'X-MAT113-8'},
                             {'id': 99999, 'fullname': 'CÁLCULO II Sec.2', 'shortname': 'X-MAT114-2'}]}
        elif fn == 'core_calendar_get_action_events_by_timesort':
            d = {'events': [{'id': 7001, 'name': 'Vencimiento de Entrega lab', 'timesort': NOW + 5 * 86400, 'modulename': 'assign', 'course': {'id': 10001}, 'url': 'https://webc.uai.cl/mod/assign/view.php?id=9'}]}
        else:
            d = {'events': []}
        return 200, url, json.dumps([{'error': False, 'data': d}])
    if 'course/view.php?id=10001' in url:
        return 200, url, '<div id="region-main"><li class="section" data-sectionname="General"><a href="https://webc.uai.cl/mod/forum/view.php?id=1"><span class="instancename">Avisos</span></a><a href="https://webc.uai.cl/mod/resource/view.php?id=2"><span class="instancename">Guía 10</span></a></li></div>'
    if 'course/view.php' in url:
        return 200, url, '<div id="region-main"></div>'
    if 'forum/view.php?id=1' in url:
        return 200, url, '<a href="https://webc.uai.cl/mod/forum/discuss.php?d=500">Cambio de fecha</a>'
    if 'mod/resource/view.php?id=2' in url:
        return 200, 'https://webc.uai.cl/pluginfile.php/9/mod_resource/content/1/Gu%C3%ADa%2010.pdf', '', base64.b64encode(PDF).decode(), 'Content-Type: application/pdf\r\n'
    if 'discuss.php?d=500' in url:
        return 200, url, '<article>Cambio de fecha\nde Profe - lunes, 12 de octubre de 2026, 10:00\nEl informe se entrega el viernes 30 de octubre a las 22:00.\nEl Control 2 se cambia al 5 de noviembre a las 11:30.</article>'
    return 404, url, ''

GM_SHIM = "window.GM_xmlhttpRequest = function(o){ window.__gm(o.method, o.url, o.data || '').then(function(r){ var buf = r[3] ? Uint8Array.from(atob(r[3]), function(c){ return c.charCodeAt(0); }).buffer : null; o.onload({status:r[0], finalUrl:r[1], responseText:r[2], response:buf, responseHeaders:r[4] || ''}); }, function(){ o.onerror && o.onerror(); }); };"

async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try: socket.create_connection(('127.0.0.1', PORT), timeout=.2).close(); break
        except OSError: time.sleep(.1)
    tmp = tempfile.mkdtemp(); pack_file = os.path.join(tmp, 'paquete-prueba.json'); pptx_file = os.path.join(tmp, 'trabajo.pptx')
    json.dump(PACK, open(pack_file, 'w'))
    open(pptx_file, 'wb').write(mini_pptx([['Trabajo y energía de prueba', 'W = F d'] + [FRASE[:70]] * 3]))
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
            await ctx.route(re.compile(r'https://(fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com)/.*'), lambda r: r.abort())
            async def gm(method, url, data): return list(webc(method, url, data))
            await ctx.expose_function('__gm', gm)
            errs = []
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(APP); await pg.wait_for_timeout(300)

            print('1. Arranque y pestañas')
            await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_timeout(500)
            for t in ['Ahora', 'Clases', 'Mapa', 'Práctica', 'Calendario', 'Biblioteca', 'Editar']:
                await pg.click(f'.tab:has-text("{t}")'); await pg.wait_for_timeout(150)
            check(not errs, f'todas las pestañas abren sin errores {errs[:2]}')
            await pg.click('.tab:has-text("Práctica")'); await pg.click('.prac-sec button:has-text("Banco de errores")'); await pg.wait_for_timeout(200)
            check(await pg.locator('h2:has-text("Banco de errores")').count() == 1 and await pg.locator('.tab:has-text("Errores")').count() == 0, 'el banco de errores está dentro de Práctica (sin pestaña aparte)')
            await pg.evaluate("go('errores')"); await pg.wait_for_timeout(150)
            check(await pg.evaluate('tab') == 'practica' and await pg.locator('h2:has-text("Banco de errores")').count() == 1, 'los botones «Ver errores» siguen llevando al banco')

            print('1b. Plan de estudio en el calendario')
            await pg.click('.tab:has-text("Calendario")'); await pg.wait_for_timeout(200)
            check(await pg.locator('.plancard h3:has-text("¿Cuánto quieres estudiar?")').count() == 1, 'el calendario pregunta cuánto quieres estudiar')
            await pg.click('.plancard button:has-text("Armar mi plan")'); await pg.wait_for_timeout(400)
            order = await pg.evaluate("Object.values(buildPlan().days).flat().filter(x=>!x.rev).map(x=>x.t.id)")
            check(order[:2] == ['t1', 't2'], f'las clases se agendan en orden desde el inicio de la materia {order}')
            check('t3' not in order, 'una materia sin evaluaciones no entra al plan')
            check(await pg.locator('.mp').count() >= 2, 'las clases del plan aparecen en los días del calendario')
            await pg.click('.tab:has-text("Ahora")'); await pg.wait_for_timeout(200)
            check(await pg.locator('.plancard.today').count() == 1, '«Ahora» muestra lo que toca hoy según el plan')
            await pg.evaluate("setStatus('t1','dominado'); planPick = 0; render()"); await pg.wait_for_timeout(200)
            check(await pg.evaluate("Object.values(buildPlan().days).flat().some(x=>!x.rev && x.t.id==='t1' && !x.done)") == False, 'una clase marcada como Dominado sale del plan (o queda como hecha hoy)')
            await pg.evaluate("delete P.status.t1; save()")

            print('2. Paquete de clases')
            await pg.click('.tab:has-text("Editar")'); await pg.wait_for_timeout(200)
            async with pg.expect_file_chooser() as fc:
                await pg.click('button:has-text("Cargar paquete de clases")')
            await (await fc.value).set_files(pack_file); await pg.wait_for_timeout(1200)
            check(await pg.evaluate('lessonKeys.size') == 2, 'se guardan las 2 clases del paquete')
            check(await pg.evaluate('D.subjects[0].name') == 'Física de prueba', 'un paquete sin datos no cambia las materias')
            await pg.evaluate("go('clases')"); await pg.wait_for_timeout(200)
            await pg.click('.cl-card:has-text("Newton")'); await pg.wait_for_timeout(800)
            fr = pg.frame_locator('iframe.saved-frame')
            check(await fr.locator('h1').inner_text() == 'Newton de prueba', 'la clase guardada se ve dentro de CalculAi')
            iso = await pg.evaluate("(() => { try { document.querySelector('iframe.saved-frame').contentWindow.document; return false; } catch(e){ return true; } })()")
            check(iso, 'la clase está aislada (no puede leer los datos de CalculAi)')
            await fr.locator('a[href="#teoria"]').click(); await pg.wait_for_timeout(900)
            pos = await fr.locator('#teoria').evaluate('e => e.getBoundingClientRect().top')
            check(await fr.locator('h1').count() == 1 and pos < 400, f'el índice de la clase («#teoria») baja a esa parte sin salir de la clase ({pos:.0f})')
            await fr.locator('a[href="otra.html"]').click(); await pg.wait_for_timeout(500)
            check(await fr.locator('h1').count() == 1, 'un enlace relativo no saca a la clase de su recuadro')
            await fr.locator('#status button').click(); await pg.wait_for_timeout(300)
            check(await pg.evaluate("st('t2')") == 'practicado', '«Mi estado» de la clase actualiza el estado del tema')

            print('3. Revisión automática de WebC (simulada)')
            topics_before = await pg.evaluate('JSON.stringify(D.topics)')
            await pg.evaluate("lessonOpen = null; go('ahora')")
            await pg.add_script_tag(content=GM_SHIM)
            # Tampermonkey corre el script en un entorno aislado donde `window` es un envoltorio (no la ventana real).
            # Se imita aquí para que la prueba falle si el script vuelve a depender de `ev.source === window`.
            src = open(os.path.join(ROOT, 'calculai-sync.user.js'), encoding='utf-8').read()
            await pg.add_script_tag(content='(function(window){' + src + '\n})(new Proxy(window, {get:function(t,k){var v=t[k]; return typeof v==="function"?v.bind(t):v;}}));')
            await pg.wait_for_timeout(2500)
            strip = await pg.inner_text('#syncStrip')
            check('WebC revisado' in strip, 'la barra muestra «WebC revisado»')
            check(await pg.evaluate("D.subjects.find(s=>s.id==='s1').webc") == 10001, 'la materia se vincula por código (FIS101)')
            check(await pg.evaluate("D.events.some(e=>e.webc==='cal:7001')"), 'la fecha del calendario de WebC se agrega')
            check(await pg.evaluate("D.resources.some(r=>r.title==='Guía 10')"), 'el recurso nuevo se agrega')
            check(await pg.evaluate("D.sync.inbox.filter(x=>!x.replaces).length") == 1, 'la fecha encontrada en un aviso queda en «Para revisar»')
            check(await pg.evaluate("D.sync.inbox.some(x=>x.replaces==='e2')"), 'el aviso que mueve el «Control 2» se reconoce como cambio de fecha')
            check(await pg.locator('.novedades').count() == 1, 'aparece la tarjeta «Novedades de WebC»')
            check(topics_before == await pg.evaluate('JSON.stringify(D.topics)'), 'la revisión NO toca los temas ni las clases')
            check(await pg.evaluate('lessonKeys.size') == 2, 'las clases guardadas siguen ahí')
            await pg.click('#syncStrip button:has-text("Revisar ahora")'); await pg.wait_for_timeout(2000)
            check(await pg.evaluate("D.events.filter(e=>e.webc==='cal:7001').length") == 1, 'revisar de nuevo no duplica fechas')
            check(await pg.evaluate("(D.news.find(n=>n.id==='n-500')||{}).text?.length > 0"), 'el aviso ya conocido conserva su texto')
            await pg.evaluate("go('ahora')"); await pg.wait_for_timeout(300)
            await pg.click('.inbox button:has-text("Cambiar fecha")'); await pg.wait_for_timeout(300)
            e2 = await pg.evaluate("(() => { const e = D.events.find(e=>e.id==='e2'); return e.date.slice(5) + ' ' + e.time; })()")
            check(e2 == '11-05 11:30', f'«Cambiar fecha» mueve el Control 2 existente ({e2})')
            check(await pg.evaluate("D.events.filter(e=>/control 2/i.test(e.name)).length") == 1, 'el cambio de fecha no duplica el Control 2')

            print('3b. Seguridad')
            await pg.evaluate("D.topics.push({id:'tx', subj:'s1', code:'X', title:'Trampa', url:'javascript:alert(1)//x.pdf', pre:[]}); D.resources.push({id:'rx', subj:'s1', title:'Trampa', url:'javascript:alert(2)'}); lessonOpen = 'tx'; go('clases')")
            await pg.wait_for_timeout(300)
            bad = await pg.evaluate("[...document.querySelectorAll('[href],[src]')].filter(e => /^\\s*javascript:/i.test(e.getAttribute('href') || e.getAttribute('src') || '') && !e.closest('#drawer')).length")
            check(bad == 0, 'un enlace «javascript:» de un archivo compartido no llega a la página')
            check(await pg.evaluate("urlOk('https://a.cl') && urlOk('apuntes/x.pdf') && urlOk('mailto:a@b.cl') && !urlOk('javascript:x') && !urlOk(' JavaScript:x') && !urlOk('data:text/html,x') && !urlOk('vbscript:x')"), 'solo se aceptan direcciones web, de correo o relativas')
            check(await pg.evaluate("embedUrl('javascript:alert(1)//x.pdf') === null && embedUrl('http://a.cl/x.pdf') === null && !!embedUrl('https://a.cl/x.pdf')"), 'el visor solo incrusta direcciones https')
            await pg.evaluate("D.topics = D.topics.filter(t => t.id !== 'tx'); D.resources = D.resources.filter(r => r.id !== 'rx'); lessonOpen = null; save()")
            check(await pg.evaluate("(() => { const d = normData({subjects:{}, topics:[1, 'x', {id:5, title:'a'}, null], plan:[], events:'no'}); return Array.isArray(d.subjects) && d.topics.length === 1 && d.topics[0].id === '5' && Array.isArray(d.events) && !Array.isArray(d.plan); })()"), 'un archivo dañado no rompe los datos (normData)')
            check(await pg.evaluate("(() => { const k = D.plan; D.plan = {on:true, days:'x', hours:-5, minPer:'a'}; const c = planCfg(); D.plan = k; return c.days.length === 7 && c.hours === .5 && c.minPer === 60; })()"), 'un plan con valores raros se corrige solo')
            fpg = await ctx.new_page()
            await fpg.set_content(f'<iframe src="{APP}" style="width:800px;height:600px"></iframe>'); await fpg.wait_for_timeout(1500)
            check('propia pestaña' in await fpg.frame_locator('iframe').locator('body').inner_text(), 'CalculAi no funciona dentro de otra página')
            await fpg.close()
            check(await pg.evaluate("!!document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')"), 'la página tiene política de seguridad (CSP)')

            print('5. Crear clases con mi material (IA simulada)')
            CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS'}
            async def ia(route):
                rq = route.request
                if rq.method == 'OPTIONS': return await route.fulfill(status=204, headers=CORS)
                if '/models?' in rq.url: return await route.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps({'models': [{'name': 'models/gemini-9.0-flash', 'supportedGenerationMethods': ['generateContent']}]}))
                pr = json.loads(rq.post_data)['contents'][0]['parts'][0]['text']
                if 'Clases disponibles de la asignatura' in pr: txt = json.dumps({'entra': ['F1'], 'falta': [{'titulo': 'Energía potencial', 'cubre': 'U = mgh'}], 'comentario': 'Entra cinemática.'})
                elif 'Crea entre 6 y 10 ejercicios' in pr: txt = json.dumps([{'clase': 'F1', 'tipo': 'numerica', 'pregunta': 'x0 = 1, v0 = 2, t = 3: ¿x?', 'respuesta': 7, 'tolerancia': 0.01, 'unidad': 'm', 'explicacion': '1 + 2·3'}])
                elif 'Responde SOLO con JSON' in pr: txt = json.dumps({'clases': [{'titulo': 'Newton aplicado', 'cubre': 'F = ma'}, {'titulo': 'Trabajo', 'cubre': 'W = F d'}]})
                else: txt = CLASE.format(t=re.search(r'«([^»]+)»\.\nDebe', pr).group(1))
                await route.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps({'candidates': [{'content': {'parts': [{'text': txt}]}}]}))
            await ctx.route(re.compile(r'https://generativelanguage\.googleapis\.com/.*'), ia)
            await pg.evaluate("localStorage.setItem('calculai-ai-provider','gemini'); localStorage.setItem('calculai-ai-key','PRUEBA'); lessonOpen = null; classSubj = 's1'; go('clases')")
            await pg.wait_for_timeout(200)
            await pg.click('.sec-title button:has-text("Crear clases con mi material")'); await pg.wait_for_timeout(300)
            await pg.check('#genBody .gen-list label:has-text("Guía 10") input')
            async with pg.expect_file_chooser() as fc:
                await pg.click('#genBody button:has-text("Subir archivos")')
            await (await fc.value).set_files(pptx_file)
            await pg.click('#genBody button:has-text("Leer material")'); await pg.wait_for_timeout(4000)
            leidos = await pg.locator('.gen-read li').count()
            check(leidos == 2 and await pg.locator('.gen-err li').count() == 0, f'lee un PDF traído de WebC por el script y un PowerPoint subido ({leidos} de 2)')
            await pg.click('#genBody button:has-text("Proponer clases")'); await pg.wait_for_timeout(1200)
            await pg.click('#genBody button:has-text("Crear las clases elegidas")'); await pg.wait_for_timeout(2500)
            gen = await pg.evaluate("D.topics.filter(t => t.gen).map(t => [t.code, t.title, t.pre.length, D.items.filter(i => i.topic === t.id).length])")
            check(len(gen) == 2 and gen[0][3] == 2 and gen[1][2] == 1, f'crea las clases en orden, con sus ejercicios para Práctica {gen}')
            await pg.evaluate("openLesson(D.topics.find(t => t.gen).id)"); await pg.wait_for_timeout(500)
            check(await pg.locator('.lc-toc .chip').count() >= 8, 'la clase creada tiene su índice (Objetivo, Mapa, Teoría…)')
            check(topics_before == await pg.evaluate("JSON.stringify(D.topics.filter(t => !t.gen))"), 'crear clases no cambia las clases que ya tenías')
            await pg.evaluate("localStorage.removeItem('calculai-ai-key'); lessonOpen = null")

            print('7. Estudiar para una evaluación')
            await pg.evaluate("localStorage.setItem('calculai-ai-key','PRUEBA'); lessonOpen = null; go('clases')"); await pg.wait_for_timeout(200)
            await pg.click('.eval-chip:has-text("Prueba 2")'); await pg.wait_for_timeout(300)
            check(await pg.locator('h1:has-text("Estudiar para Física · Prueba 2")').count() == 1, 'desde Clases se abre «Estudiar para» una evaluación')
            await pg.fill('.eval-page textarea', 'Entra cinemática; no entra Newton.'); await pg.dispatch_event('.eval-page textarea', 'change')
            async with pg.expect_file_chooser() as fc:
                await pg.click('.eval-page button:has-text("Subir pauta")')
            await (await fc.value).set_files(pptx_file); await pg.wait_for_timeout(1200)
            await pg.wait_for_timeout(2500)
            check(await pg.evaluate("D.events.find(e=>e.id==='e1').study.docs.length") == 1, 'se puede subir la pauta o el temario')
            auto = await pg.evaluate("(() => { const e = D.events.find(e=>e.id==='e1'); return e.topics.map(id => [topic(id).title, topic(id).gen.eval, D.items.filter(i=>i.topic===id).length]); })()")
            check(len(auto) == 2 and all(a[1] == 'e1' and a[2] >= 1 for a in auto), f'al subir la pauta crea solo las clases para esa evaluación, con ejercicios {auto}')
            check(await pg.locator('.eval-auto li').count() == 2, 'muestra las clases creadas para la evaluación')
            await pg.click('.eval-page summary:has-text("Ajustar qué clases entran")')
            await pg.click('.eval-page button:has-text("Detectar con IA")'); await pg.wait_for_timeout(1500)
            check(await pg.evaluate("JSON.stringify(D.events.find(e=>e.id==='e1').topics)") == '["t1"]', 'la IA marca las clases que entran según lo que escribiste y la pauta')
            check(await pg.locator('.eval-gaps:has-text("Energía potencial")').count() == 1, 'muestra lo que entra y no tiene clase')
            check(await pg.evaluate("examFor(topic('t1')).id") == 'e1', 'las clases elegidas cuentan para esa evaluación (plan, preparación, «Ahora»)')
            n0 = await pg.evaluate("poolFor('ev:e1').length")
            await pg.click('.eval-page button:has-text("Ejercicios tipo prueba")'); await pg.wait_for_timeout(1500)
            check(await pg.evaluate("poolFor('ev:e1').length") == n0 + 1, f'crea ejercicios tipo prueba para las clases que entran ({n0} → {n0 + 1})')
            await pg.click('.eval-page button:has-text("Practicar solo esto")'); await pg.wait_for_timeout(300)
            check(await pg.locator('.seg:has-text("🎯 Física · Prueba 2")').count() == 1 and await pg.evaluate("topic(Q.item.topic).id") == 't1', 'Práctica queda filtrada solo a esa evaluación')
            await pg.evaluate("openEvalStudy('e1')"); await pg.wait_for_timeout(300)
            await pg.click('.eval-page summary:has-text("Ajustar qué clases entran")')
            await pg.click('.eval-gaps button:has-text("Crear clases para lo que falta")'); await pg.wait_for_timeout(300)
            check(await pg.evaluate("GEN.evalId === 'e1' && GEN.base.length === 1 && /Energía potencial/.test(GEN.focus)"), 'crear clases para lo que falta usa la pauta y se enfoca en lo que entra')
            await pg.evaluate("closeDrawer(); localStorage.removeItem('calculai-ai-key'); evalAutoClasses(D.events.find(e=>e.id==='e1'))"); await pg.wait_for_timeout(300)
            await ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
            await pg.click('#drawer button:has-text("Copiar instrucción")'); await pg.wait_for_timeout(200)
            clip = await pg.evaluate("navigator.clipboard.readText()")
            check('Arma 3 clases' in clip and 'Trabajo y energía de prueba' in clip, 'sin API key, la instrucción para el asistente pide 3 clases con la pauta')
            await pg.fill('#drawer textarea', CLASE.format(t='Uno') + '\n' + CLASE.format(t='Dos') + '\n' + CLASE.format(t='Tres'))
            await pg.click('#drawer button:has-text("Usar la respuesta")'); await pg.wait_for_timeout(500)
            check(await pg.evaluate("D.events.find(e=>e.id==='e1').topics.map(id=>topic(id).title).join(',')") == 'Uno,Dos,Tres', 'pegando la respuesta se crean las 3 clases de la evaluación')
            await pg.evaluate("closeDrawer(); D.events.find(e=>e.id==='e1').topics = []; delete D.events.find(e=>e.id==='e1').study; pracFilter = 'todo'; evalOpen = null; save()")

            print('4. Recarga y celular')
            await pg.reload(); await pg.wait_for_timeout(800)
            check(await pg.evaluate('lessonKeys.size') == 2 and await pg.evaluate("st('t2')") == 'practicado', 'tras recargar se mantienen clases y progreso')
            await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(300)
            check(not await pg.evaluate('document.documentElement.scrollWidth > innerWidth'), 'sin scroll horizontal en el celular')
            check(not errs, f'sin errores de JavaScript {errs[:3]}')

            print('6. Compañero nuevo: WebC directo con la clave de la app (Moodle simulado)')
            TOKEN = 'a' * 32
            ctx2 = await b.new_context(viewport={'width': 1280, 'height': 900})
            await ctx2.route(re.compile(r'https://(fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com)/.*'), lambda r: r.abort())
            wscalls = []
            async def moodle(route):
                rq = route.request; H = {'access-control-allow-origin': '*', 'content-type': 'application/json'}
                if 'pluginfile.php' in rq.url:
                    ok = 'token=' + TOKEN in rq.url
                    return await route.fulfill(status=200 if ok else 403, headers={'access-control-allow-origin': '*', 'content-type': 'application/pdf'}, body=PDF if ok else b'')
                form = dict(x.split('=', 1) for x in (rq.post_data or '').split('&') if '=' in x)
                fn = form.get('wsfunction'); wscalls.append(fn)
                if form.get('wstoken') != TOKEN: return await route.fulfill(status=200, headers=H, body=json.dumps({'exception': 'moodle_exception', 'errorcode': 'invalidtoken', 'message': 'Token no válido'}))
                d = {'core_webservice_get_site_info': {'sitename': 'WebC', 'userid': 7, 'siteurl': 'https://webc.uai.cl'},
                     'core_course_get_enrolled_courses_by_timeline_classification': {'courses': [{'id': 10001, 'fullname': 'FÍSICA I Sec.3', 'shortname': 'X-FIS101-3'}, {'id': 10002, 'fullname': 'ÁLGEBRA LINEAL Sec.8', 'shortname': 'X-MAT113-8'}, {'id': 555, 'fullname': 'Biblioteca', 'shortname': 'BIB'}]},
                     'core_calendar_get_action_events_by_timesort': {'events': [{'id': 7001, 'name': 'Vencimiento de Entrega lab', 'timesort': NOW + 5 * 86400, 'modulename': 'assign', 'course': {'id': 10001}, 'url': 'https://webc.uai.cl/mod/assign/view.php?id=9'}]},
                     'core_calendar_get_calendar_upcoming_view': {'events': []},
                     'core_course_get_contents': [{'name': 'Unidad 1', 'modules': [{'modname': 'resource', 'name': 'Guía 10', 'url': 'https://webc.uai.cl/mod/resource/view.php?id=2', 'contents': [{'filename': 'Guía 10.pdf', 'fileurl': 'https://webc.uai.cl/webservice/pluginfile.php/9/mod_resource/content/1/Gu%C3%ADa%2010.pdf?forcedownload=1'}]}, {'modname': 'forum', 'name': 'Avisos', 'url': 'https://webc.uai.cl/mod/forum/view.php?id=1'}]}],
                     'mod_forum_get_forums_by_courses': [{'id': 31, 'course': 10001, 'type': 'news'}],
                     'mod_forum_get_forum_discussions': {'discussions': [{'discussion': 500, 'name': 'Cambio de fecha', 'message': '<p>El informe se entrega el <b>viernes 30 de octubre</b> a las 22:00.</p>', 'created': NOW - 3600, 'userfullname': 'Profe'}]}}.get(fn)
                if fn == 'core_course_get_contents' and form.get('courseid') != '10001': d = []
                if d is None: return await route.fulfill(status=200, headers=H, body=json.dumps({'exception': 'x', 'errorcode': 'nofunction', 'message': fn}))
                await route.fulfill(status=200, headers=H, body=json.dumps(d))
            await ctx2.route(re.compile(r'https://webc\.uai\.cl/webservice/.*'), moodle)
            p2 = await ctx2.new_page(); errs2 = []; p2.on('pageerror', lambda e: errs2.append(str(e)))
            await p2.goto(APP); await p2.wait_for_timeout(500)
            await p2.click('.choice:has-text("Conectar con WebC")'); await p2.wait_for_timeout(300)
            check('launch.php?service=moodle_mobile_app' in (await p2.get_attribute('#drawer a:has-text("Abrir WebC")', 'href')), 'el botón abre el inicio de sesión de la app de WebC')
            await p2.fill('#drawer input', 'calculai://token=' + base64.b64encode(b'x' * 32 + b':::' + b'b' * 32).decode()); await p2.dispatch_event('#drawer input', 'change'); await p2.wait_for_timeout(600)
            check('no sirve' in await p2.inner_text('#drawer'), 'una clave equivocada se rechaza con un mensaje claro')
            await p2.fill('#drawer input', 'calculai://token=' + base64.b64encode(b'x' * 32 + b':::' + TOKEN.encode() + b':::priv').decode()); await p2.dispatch_event('#drawer input', 'change'); await p2.wait_for_timeout(2500)
            cursos = await p2.locator('#drawer .chk').all_inner_texts()
            check(len(cursos) == 2 and await p2.evaluate("localStorage.getItem('calculai-webc-token')") == TOKEN, f'con la clave lista los cursos sin script ni marcador {cursos}')
            await p2.click('#drawer button:has-text("Traer estos cursos")'); await p2.wait_for_timeout(2500)
            await p2.click('button:has-text("Guardar en CalculAi")'); await p2.wait_for_timeout(500)
            r2 = await p2.evaluate("({s:D.subjects.map(x=>x.name), e:D.events.length, r:D.resources.filter(x=>x.file).length, n:(D.news||[]).length, inD:JSON.stringify(D).includes('" + TOKEN + "')})")
            check(len(r2['s']) == 2 and r2['e'] >= 1 and r2['r'] >= 1 and r2['n'] >= 1, f'trae materias, fechas, archivos y avisos {r2}')
            check(not r2['inD'], 'la clave no queda dentro de los datos ni de los respaldos')
            await p2.evaluate("go('ahora')"); await p2.wait_for_timeout(300)
            await p2.evaluate("requestWebcSync(true)"); await p2.wait_for_timeout(2500)
            check('WebC revisado' in await p2.inner_text('#syncStrip'), 'al abrir, revisa WebC solo con la clave')
            await p2.evaluate("classSubj = D.subjects.find(s=>s.code==='FIS101').id; go('clases')"); await p2.wait_for_timeout(200)
            await p2.click('.sec-title button:has-text("Crear clases con mi material")'); await p2.wait_for_timeout(300)
            await p2.check('#genBody .gen-list label:has-text("Guía 10") input')
            await p2.click('#genBody button:has-text("Leer material")'); await p2.wait_for_timeout(3500)
            check(await p2.locator('.gen-read li:has-text("Guía 10.pdf")').count() == 1, 'el archivo de WebC se lee para crear clases, sin script')
            await p2.evaluate("localStorage.setItem('calculai-webc-token', 'c' * 1 + 'c'.repeat(31)); SYNC.webc = 'idle'; go('ahora'); requestWebcSync(true)"); await p2.wait_for_timeout(1500)
            check('venció' in await p2.inner_text('#syncStrip'), 'si la clave deja de servir, pide conectar de nuevo')
            check(not errs2, f'sin errores de JavaScript (compañero nuevo) {errs2[:3]}')
            await b.close()
    finally:
        srv.terminate()
    print('\nTODO OK' if not FAILS else f'\n{len(FAILS)} FALLA(S):\n- ' + '\n- '.join(FAILS))
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
