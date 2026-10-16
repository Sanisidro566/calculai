/* CalculAi — app de estudio. Funciona en cualquier navegador; los datos viven en este dispositivo. */
'use strict';
/* ===========================================================================
   ÍNDICE (busca el título de la sección tal cual; no uses números de línea)
   ---------------------------------------------------------------------------
   UTILIDADES ............ h() (crea DOM), $, fechas, toast(msg, ms)
   DATOS ... Y PROGRESO .. D (datos) y P (progreso): blankData/blankProg, normData/normProg, save()
   MOTOR «¿QUÉ HAGO AHORA?» score(), ranked(), buildSession()
   NAVEGACIÓN ............ TABS, go(), render() y las vistas:
                           vWelcome · vAhora · vMapa · vPractica (con vErrores adentro) · vCal (vMonth, vAgenda, plan) · vBiblio
   CLASES ................ vClases, vLesson, visor de Drive/YouTube/PDF (embedUrl, viewer)
     · Estudiar para ..... vEvalStudy: qué entra (texto/pauta), clases que entran (e.topics), aiOrPaste,
                           evalDetectPrompt/evalApplyDetect, ejercicios tipo prueba (evalAddItems)
     · Clases guardadas .. paquete de clases en IndexedDB «calculai-clases» (ldbPut/ldbGet, savedFrame, importPack)
     · IA ................ AI_MODES, aiPrompt, callAI (Google/Anthropic/OpenAI), aiConfigEl, openAIPanel
   GENERADOR DE CLASES ... openGenerator: lee PDF/pptx/docx (readMaterial, vendor/pdfjs), trae archivos de WebC
                           con el script (fetchWebcFile), la IA arma clases (genPlan/genBuild o copiar y pegar),
                           parseLessons → addGenerated (temas con content + ejercicios)
   EDITAR ................ formularios, vEditar, respaldo, importFile/importPack
   MODO ENFOQUE · BUSCADOR (Ctrl+K) · EJEMPLO (makeExample)
   CONECTAR CON WEBC ..... marcador «Enviar a CalculAi» (conector.js): receiveWebc, prepareWebc, vWebcReview
   REVISIÓN AUTOMÁTICA ... script calculai-sync.user.js: requestWebcSync, applyAutoWebc, novedadesCard,
                           Outlook (msConnect, outlookSync), syncStrip/paintSync, inboxCard
   TEMA, PWA, ARRANQUE ... tema claro/oscuro, service worker, arranque (startAutoSync, loadLessonKeys)

   REGLAS QUE NO SE ROMPEN (detalle en ARQUITECTURA.md)
   1. La revisión de WebC/Outlook solo agrega o actualiza D.events, D.resources, D.news y D.sync.
      Nunca toca D.topics, D.items, el progreso P ni las clases guardadas.
   2. Las clases guardadas viven en IndexedDB, no en D: ni «Borrar todo» de datos ni la sync las tocan.
   3. normData/normProg solo copian claves que existen en blankData/blankProg: un campo nuevo en D o P
      debe agregarse primero ahí, o se pierde al recargar.
   4. Al agregar una función, ponla dentro de su sección y súmala a este índice.
   =========================================================================== */

/* =========================================================
   UTILIDADES
   ========================================================= */
const $ = s => document.querySelector(s);
/* Seguridad: un enlace o recuadro solo puede apuntar a la web (https/http), a un correo, a un archivo creado
   aquí (blob:) o a una dirección relativa. Así un archivo compartido no puede colar «javascript:» u otros
   esquemas que ejecuten código dentro de CalculAi. La única excepción es el marcador «Enviar a CalculAi». */
function urlOk(v){ v = String(v).trim(); let bm = ''; try { bm = BOOKMARKLET; } catch {} if (bm && v === bm) return true; const m = v.match(/^([a-z][a-z0-9+.-]*):/i); return !m || /^(https?|mailto|blob)$/i.test(m[1]); }
function openExt(url){ if (url && /^https?:\/\//i.test(String(url).trim())) window.open(url, '_blank', 'noopener'); else if (url) toast('Ese enlace no es una dirección web'); }
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)){
    if (v == null || v === false) continue;
    if ((k === 'href' || k === 'src' || k === 'action' || k === 'formaction' || k === 'data') && !urlOk(v)) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)){
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
function svg(tag, attrs){ const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); return el; }
function rich(s){
  const span = h('span');
  String(s ?? '').split(/(\$[^$]+\$)/).forEach(part => {
    if (part.length > 2 && part[0] === '$' && part.at(-1) === '$'){
      const m = h('span', {class:'m'}); const tex = part.slice(1, -1);
      if (window.katex){ try { katex.render(tex, m, {output:'mathml', throwOnError:false}); } catch { m.textContent = tex; } }
      else { m.textContent = tex; m.className = 'm mono'; }
      span.append(m);
    } else if (part) {
      // Handle **bold** and *italic*
      part.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).forEach(seg => {
        if (seg.startsWith('**') && seg.endsWith('**')) span.append(h('strong', null, seg.slice(2, -2)));
        else if (seg.startsWith('*') && seg.endsWith('*')) span.append(h('em', null, seg.slice(1, -1)));
        else if (seg) span.append(seg);
      });
    }
  });
  return span;
}
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const diffDays = (a, b) => Math.round((parse(iso(b)) - parse(iso(a))) / 86400000);
const TODAY = parse(iso(new Date()));
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const fmtD = d => `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
const cap = s => s.replace(/^./, c => c.toUpperCase());
const uid = (p = 'x') => p + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
function toast(msg, ms = 2400){ const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms); }
const countdown = d => d === 0 ? 'hoy' : d === 1 ? 'mañana' : d < 0 ? 'ya pasó' : `en ${d} días`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/* =========================================================
   DATOS (editables por cada persona) Y PROGRESO
   ========================================================= */
const COLORS = ['azul','violeta','naranja','verde','rosa','cian','ambar','gris'];
const KIND = {prueba:{l:'Prueba', i:'■'}, control:{l:'Control', i:'◆'}, entrega:{l:'Entrega', i:'▲'}, proyecto:{l:'Proyecto', i:'●'}, examen:{l:'Examen', i:'★'}, otro:{l:'Otro', i:'○'}};
const SCOPE_LBL = {actual:'Material actual', noconf:'Inclusión no confirmada', hist:'Referencia histórica'};
const SCOPE_W = {actual:1, noconf:.6, hist:.45};
const STATUSES = [
  {k:'pendiente', l:'Pendiente', w:0}, {k:'aprendiendo', l:'Aprendiendo', w:1}, {k:'practicado', l:'Practicado', w:2},
  {k:'repaso', l:'Necesita repaso', w:1}, {k:'dominado', l:'Dominado', w:3}
];
const W = Object.fromEntries(STATUSES.map(s => [s.k, s.w]));
const SL = Object.fromEntries(STATUSES.map(s => [s.k, s.l]));
const INTERVAL = {aprendiendo:1, practicado:3, repaso:1, dominado:7};
const STORE = 'calculai:v1', OLD_STORE = 'cuaderno-web:v1';
const blankData = () => ({v:1, owner:'', subjects:[], events:[], topics:[], items:[], resources:[], news:[], sync:{}, plan:{}});
const blankProg = () => ({status:{}, attempts:[], errors:[], days:{}, sessions:[], dayLoad:{}, lastLesson:''});
/* Copian solo las claves conocidas y con el tipo correcto. Los arreglos deben ser arreglos de objetos con id
   (un archivo dañado o malicioso no rompe la app ni mete datos raros). */
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
function normField(v, b){
  if (Array.isArray(b)) return Array.isArray(v) ? v.filter(isObj).map(x => (x.id == null || typeof x.id === 'string') ? x : {...x, id:String(x.id)}) : b;
  if (isObj(b)) return isObj(v) ? v : b;
  return v != null && typeof v === typeof b ? v : b;
}
function normData(d){ const b = blankData(); if (!isObj(d)) return b; for (const k of Object.keys(b)) b[k] = normField(d[k], b[k]); return b; }
function normProg(p){ const b = blankProg(); if (!isObj(p)) return b; for (const k of Object.keys(b)) b[k] = k === 'attempts' || k === 'errors' || k === 'sessions' ? (Array.isArray(p[k]) ? p[k].filter(isObj) : b[k]) : normField(p[k], b[k]); return b; }
let D = blankData(), P = blankProg(), storageOk = true;
try { const raw = localStorage.getItem(STORE) || localStorage.getItem(OLD_STORE); if (raw){ const j = JSON.parse(raw); D = normData(j.data); P = normProg(j.progress); } } catch { storageOk = false; }
let saveT = null;
function save(){ clearTimeout(saveT); saveT = setTimeout(() => {
  P.attempts = P.attempts.slice(-800); P.sessions = P.sessions.slice(-400); P.errors = P.errors.slice(-400);
  try { localStorage.setItem(STORE, JSON.stringify({data:D, progress:P, savedAt:new Date().toISOString()})); storageOk = true; } catch { storageOk = false; }
  syncBadge();
}, 300); }

const S = id => D.subjects.find(s => s.id === id) || {id, name:'(materia borrada)', short:'?', code:'', color:'gris', note:''};
const scs = sid => `--sc:var(--c-${S(sid).color || 'gris'})`;
const topic = id => D.topics.find(t => t.id === id);
const topicsOf = sid => D.topics.filter(t => t.subj === sid);
const exams = () => D.events.filter(e => e.date && (e.kind === 'prueba' || e.kind === 'control' || e.kind === 'examen')).sort((a, b) => a.date.localeCompare(b.date));
const lastEvalDate = () => { const e = exams(); return e.length ? parse(e.at(-1).date) : addDays(TODAY, 30); };

const st = id => P.status[id]?.s || 'pendiente';
function setStatus(id, s){ P.status[id] = {s, at:iso(TODAY)}; save(); }
function nextReview(id){ const e = P.status[id]; if (!e || !INTERVAL[e.s]) return null; return addDays(parse(e.at), INTERVAL[e.s]); }
const isDue = id => { const n = nextReview(id); return n && n <= TODAY; };
function evidence(tid){ const a = P.attempts.filter(x => D.items.find(i => i.id === x.item)?.topic === tid); const ok = a.filter(x => x.ok).length; return {n:a.length, ok, pct:a.length ? Math.round(100 * ok / a.length) : null}; }

/* =========================================================
   MOTOR «¿QUÉ HAGO AHORA?» — siempre explica por qué
   ========================================================= */
function nextExam(sid, from = TODAY){ return exams().filter(e => e.subj === sid && !(e.topics && e.topics.length) && parse(e.date) >= from)[0]; }
function examFor(t){
  if (t.exam){ const e = exams().find(x => x.id === t.exam && parse(x.date) >= TODAY); if (e) return e; }
  /* Si elegiste las clases que entran en una evaluación («Estudiar para»), cuenta la más cercana de las dos. */
  const listed = exams().find(x => (x.topics || []).includes(t.id) && parse(x.date) >= TODAY), gen = nextExam(t.subj);
  return listed && (!gen || listed.date <= gen.date) ? listed : gen || listed;
}
function score(t){
  const ex = examFor(t); if (!ex) return {u:0, why:[]};
  const d = Math.max(0, diffDays(TODAY, parse(ex.date)));
  const time = 1 / (1 + d / 4);
  const s = st(t.id);
  let gap = 1 - W[s] / 3; if (s === 'repaso') gap = .85;
  let u = time * gap * (SCOPE_W[t.scope] || 1) * ({1:1.15, 2:1, 3:.85}[t.prio] || 1);
  const why = [`${S(t.subj).short} · ${ex.name} es ${countdown(d)} (${fmtD(parse(ex.date))}).`];
  why.push(s === 'pendiente' ? 'Todavía está Pendiente.' : `Tu autoevaluación: ${SL[s]}.`);
  if (isDue(t.id)){ u += .25 * time; why.push('Le toca repaso según tu última autoevaluación.'); }
  if ((t.pre || []).some(p => W[st(p)] < 2)) u *= .7;
  const unlocks = D.topics.filter(x => (x.pre || []).includes(t.id));
  if (unlocks.length && W[s] < 2) why.push(`Es base de: ${unlocks.map(x => (x.code ? x.code + ' ' : '') + x.title).join(', ')}.`);
  if (t.scope && t.scope !== 'actual') why.push(`Ojo: ${SCOPE_LBL[t.scope].toLowerCase()}.`);
  const ev = evidence(t.id); if (ev.n && ev.pct < 60){ u += .15 * time; why.push(`En práctica llevas ${ev.pct}% de aciertos (${ev.n} intentos).`); }
  return {u, why, ex, d};
}
function ranked(){ return D.topics.map(t => ({t, ...score(t)})).filter(x => x.u > 0 && (st(x.t.id) !== 'dominado' || isDue(x.t.id))).sort((a, b) => b.u - a.u); }
function buildSession(t){
  const s = st(t.id);
  const lbl = (t.code ? t.code + ' · ' : '') + t.title;
  if (s === 'pendiente' || s === 'aprendiendo') return [
    {min:5, t:'Calentamiento sin mirar', d:'Escribe en papel lo que ya sabes (o crees saber) del tema. Sirve aunque sea poco.'},
    {min:25, t:'Clase', d:`Lee y rehace los ejemplos de ${lbl}.`, lesson:t.id},
    {min:15, t:'Práctica', d:'Ejercicios del más fácil al más difícil.', practice:t.id},
    {min:5, t:'Errores', d:'Anota cada error y por qué ocurrió.', go:'errores'},
    {min:5, t:'Autoevaluación', d:'Marca cómo quedó el tema. «Necesita repaso» también es avance.'}
  ];
  return [
    {min:5, t:'Recuperar de memoria', d:'Sin abrir nada: fórmulas, pasos y errores típicos del tema.'},
    {min:10, t:'Repaso rápido', d:'Solo lo que no recordaste.', lesson:t.id},
    {min:30, t:'Práctica mixta', d:'Ejercicios de este tema y de los anteriores.', practice:t.id},
    {min:10, t:'Errores', d:'Reintenta los errores pendientes de esta materia.', go:'errores'},
    {min:5, t:'Autoevaluación', d:'Actualiza el estado del tema.'}
  ];
}
function daySuggest(d){
  const ex = exams(), evs = ex.filter(e => e.date === iso(d));
  const next = D.subjects.map(s => { const e = ex.filter(x => x.subj === s.id && parse(x.date) > d)[0]; return e ? {s:s.id, e, n:diffDays(d, parse(e.date))} : null; }).filter(Boolean).sort((a, b) => a.n - b.n);
  const tips = [];
  evs.forEach(e => tips.push(`Día de ${S(e.subj).short} · ${e.name}${e.time ? ' (' + e.time + ')' : ''}. Antes: solo resumen de fórmulas y errores peligrosos.`));
  if (next[0]){
    if (next[0].n === 1) tips.push(`Víspera de ${S(next[0].s).short} · ${next[0].e.name}: ensayo o simulacro y repaso de errores. Nada nuevo.`);
    else tips.push(`Foco principal: ${S(next[0].s).short} (${next[0].e.name} en ${next[0].n} días).`);
  }
  if (next[1]) tips.push(`Bloque corto: ${S(next[1].s).short} (${next[1].e.name} en ${next[1].n} días).`);
  return {exams:evs, next, tips};
}

/* =========================================================
   NAVEGACIÓN
   ========================================================= */
const TABS = [{k:'ahora', l:'Ahora', i:'◎'}, {k:'clases', l:'Clases', i:'▤'}, {k:'mapa', l:'Mapa', i:'◇'}, {k:'practica', l:'Práctica', i:'✎'}, {k:'cal', l:'Calendario', s:'Agenda', i:'▦'}, {k:'biblio', l:'Biblioteca', s:'Biblio', i:'❏'}, {k:'editar', l:'Editar', i:'⚙'}];
let tab = 'ahora', mapSubj = null, planPick = 0, pracFilter = 'todo', selDay = null, pracSec = 'ejercicios';
try { const t = sessionStorage.getItem('calculai-tab'); if (t && TABS.some(x => x.k === t)) tab = t; } catch {}
/* El banco de errores vive dentro de Práctica: go('errores') abre Práctica en esa sección. */
function go(k){ if (k === 'errores'){ k = 'practica'; pracSec = 'errores'; } else if (k === 'practica' && tab !== 'practica') pracSec = 'ejercicios'; tab = k; try { sessionStorage.setItem('calculai-tab', k); } catch {} closeSidebar(); render(); window.scrollTo({top:0}); }
function closeSidebar(){ const sb = $('#sidebar'); if (sb) sb.classList.remove('open'); const sc = $('#scrim'); if (sc) sc.classList.remove('on'); }
function renderTabs(){
  const nav = $('#tabs'); nav.replaceChildren();
  const bnav = $('#bottomnav'); if (bnav) bnav.replaceChildren();
  if (!D.subjects.length) return;
  const openErr = P.errors.filter(e => !e.resolved).length;
  TABS.forEach(t => {
    const cnt = t.k === 'practica' && openErr ? openErr : 0;
    const onTab = () => { if (t.k === 'clases' && tab === 'clases'){ lessonOpen = null; evalOpen = null; } go(t.k); };
    nav.append(h('button', {class:'tab', role:'tab', type:'button', 'aria-selected':String(tab === t.k), onclick:onTab},
      h('span', {class:'ti'}, t.i), t.l,
      cnt ? h('span', {class:'count'}, cnt) : null));
    if (bnav) bnav.append(h('button', {class:'btab', role:'tab', type:'button', 'aria-selected':String(tab === t.k), onclick:onTab},
      h('span', {class:'ti'}, t.i),
      cnt ? h('span', {class:'count'}, cnt) : null,
      t.s || t.l));
  });
}
function render(){
  renderTabs();
  const v = $('#view'); v.replaceChildren();
  if (!D.subjects.length && tab !== 'webc'){ vWelcome(v); return; }
  if (tab === 'webc'){ vWebcReview(v); return; }
  ({ahora:vAhora, clases:vClases, mapa:vMapa, practica:vPractica, cal:vCal, biblio:vBiblio, editar:vEditar})[tab](v);
}
const subjChip = s => h('span', {class:'chip subj-chip', style:scs(s)}, h('span', {class:'dot', style:'background:var(--sc)'}), S(s).short);
const scopeTag = sc => sc ? h('span', {class:`scope ${sc}`}, SCOPE_LBL[sc]) : null;
const extLink = (url, label, cls = 'btn ghost small') => url ? h('a', {class:cls, href:url, target:'_blank', rel:'noopener'}, label, ' ↗') : null;
const verBadge = e => h('span', {class:'ver ' + (e.ver ? 'ok' : 'no'), title:e.src || ''}, e.ver ? '✓ confirmada' : '⚠ sin confirmar');
const kindChip = e => h('span', {class:`kchip k-${e.kind}`}, (KIND[e.kind] || KIND.otro).i + ' ' + (KIND[e.kind] || KIND.otro).l);

/* ---------------- INICIO (sin datos) ---------------- */
function vWelcome(v){
  const file = h('input', {type:'file', accept:'.json,application/json', style:'display:none', onchange:e => importFile(e.target.files[0], true)});
  v.append(h('div', {class:'welcome'},
    h('p', {class:'note', style:'margin:0 0 6px'}, 'calculai · tu plan de estudio'),
    webcOn() && SYNC.first ? syncStrip() : null,
    h('h1', null, 'Estudia con un plan, ', h('span', {class:'hl'}, 'no con culpa.')),
    h('p', {class:'muted', style:'font-size:1.05rem'}, 'Agrega tus materias, evaluaciones y temas. CalculAi te dice qué estudiar en la próxima hora y por qué, te hace practicar con honestidad y te avisa lo que viene.'),
    h('div', {class:'choices'},
      h('button', {class:'choice', type:'button', onclick:startEmpty}, h('span', {class:'ico'}, '✎'), h('b', null, 'Empezar desde cero'), h('span', null, 'Creo mi primera materia y voy agregando lo demás.')),
      h('button', {class:'choice', type:'button', onclick:() => { D = makeExample(); P = blankProg(); save(); go('ahora'); toast('Cargué un ejemplo: edítalo o bórralo cuando quieras'); }}, h('span', {class:'ico'}, '◎'), h('b', null, 'Ver un ejemplo'), h('span', null, 'Tres materias de muestra para conocer la app. Después lo borras.')),
      h('button', {class:'choice', type:'button', onclick:() => webcOn() ? firstConnect() : openWebcConnect()}, h('span', {class:'ico'}, '⟳'), h('b', null, 'Conectar con WebC'), h('span', null, webcOn() ? 'WebC ya está conectado: elige tus cursos y traigo fechas, avisos y archivos.' : 'Sin instalar nada: trae tus cursos, fechas, avisos y archivos desde WebC.')),
      h('button', {class:'choice', type:'button', onclick:() => file.click()}, h('span', {class:'ico'}, '⇪'), h('b', null, 'Abrir un archivo'), h('span', null, 'Un respaldo tuyo, tu paquete de clases o una plantilla que te compartió alguien de tu curso.'))),
    file,
    h('div', {class:'feat'},
      h('div', null, h('b', null, '¿Qué hago ahora?'), 'Un plan de una hora según tus fechas y lo que te falta.'),
      h('div', null, h('b', null, 'Mapa de dominio'), 'Tus temas, sus prerrequisitos y tu estado en cada uno.'),
      h('div', null, h('b', null, 'Práctica honesta'), 'Antes de responder dices qué tan seguro o segura estás. Los «errores peligrosos» se marcan solos.'),
      h('div', null, h('b', null, 'Calendario'), 'Con fechas confirmadas o no, y exportable a Google Calendar.')),
    h('div', {class:'card welcome-howto'}, h('b', null, '¿Te lo compartió alguien de tu curso?'),
      h('ol', {class:'tiny'},
        h('li', null, 'Toca «Conectar con WebC»: abres WebC, copias un enlace y lo pegas aquí. No se instala nada y desde ahí CalculAi revisa WebC solo cada vez que la abres.'),
        h('li', null, 'En «Clases», toca «✦ Crear clases con mi material»: elige los archivos de tu curso y se arman clases con ejercicios.'),
        h('li', null, 'En «Calendario», dime cuántas horas quieres estudiar y reparto las clases en los días que quedan.'))),
    h('p', {class:'tiny muted', style:'margin-top:22px'}, 'Privacidad: todo se guarda solo en este dispositivo y navegador. Nada se envía a ningún servidor de CalculAi. Si conectas una IA, el material que elijas se envía directo a ese proveedor. Usa «Editar → Respaldo» para llevar tus datos a otro equipo.')));
}
/* Primera conexión con el script (sin materias todavía): lista tus cursos y trae los que elijas a la revisión. */
function firstConnect(){
  if (!webcToken() && verLt(String(SYNC.agent), '1.1.1')){ openAutoSyncHelp(); toast('Actualiza el script de revisión para conectar desde aquí'); return; }
  SYNC.first = true; requestWebcSync(true); render(); toast('Buscando tus cursos en WebC…');
}
function firstPicker(list){
  const pick = new Set(list.map(c => c.id));
  $('#drawer').classList.add('wide');
  openDrawer(h('div', {class:'drawer-head'}, h('div', {style:'flex:1'}, h('h3', null, 'Tus cursos en WebC')), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')),
    h('div', {class:'drawer-body'},
      h('p', {class:'tiny muted', style:'margin:0 0 10px'}, 'Elige los cursos que quieres estudiar con CalculAi. Después revisas lo que llegó antes de guardarlo.'),
      h('div', {class:'gen-list', style:'max-height:none'}, list.map(c => h('label', {class:'chk'}, h('input', {type:'checkbox', checked:true, onchange:e => { e.target.checked ? pick.add(c.id) : pick.delete(c.id); }}), h('span', null, c.name, ' ', h('small', {class:'muted'}, c.code || ''))))),
      h('button', {class:'btn hlbtn', type:'button', style:'margin-top:12px', onclick:() => { if (!pick.size){ toast('Elige al menos un curso'); return; } closeDrawer(); SYNC.addCourses = [...pick]; SYNC.first = true; requestWebcSync(true, SYNC.addCourses); render(); toast('Leyendo tus cursos… puede tardar un minuto'); }}, 'Traer estos cursos')));
}
function startEmpty(){
  D = blankData(); P = blankProg();
  openForm('Tu primera materia', subjectFields(), {color:'azul'}, vals => { D.subjects.push(subjectFrom(vals)); save(); go('editar'); toast('Listo. Ahora agrega evaluaciones y temas'); });
}

/* ---------------- AHORA ---------------- */
/* ---------- Vista: Ahora ---------- */
function vAhora(v){
  const hr = new Date().getHours();
  const saludo = hr < 12 ? 'Buenos días' : hr < 20 ? 'Buenas tardes' : 'Buenas noches';
  const upcoming = exams().filter(e => parse(e.date) >= TODAY && diffDays(TODAY, parse(e.date)) <= 31);
  const first = upcoming[0];
  v.append(h('div', {class:'hello'},
    h('div', null, h('h1', null, saludo + (D.owner ? ', ' + D.owner : '') + '. ', h('span', {class:'hl'}, '¿Qué hago ahora?')),
      syncStrip(),
      h('p', null, first ? `Próximos 30 días: ${plural(upcoming.length, 'evaluación', 'evaluaciones')}. La más cercana: ${S(first.subj).short} · ${first.name}, ${countdown(diffDays(TODAY, parse(first.date)))}.` : 'No tienes evaluaciones en los próximos 30 días. Agrégalas en Editar.'))));

  const nv = novedadesCard(); if (nv) v.append(nv);
  const ib = inboxCard(); if (ib) v.append(ib);
  const tp = todayPlanCard(); if (tp) v.append(tp);
  const lastL = P.lastLesson && topic(P.lastLesson);
  if (lastL) v.append(h('button', {class:'card cl-cont cl-strip', type:'button', style:scs(lastL.subj), onclick:() => openLesson(lastL.id)}, h('small', {class:'kicker'}, '▤ Continuar tu clase'), h('b', null, lastL.title), h('span', {class:'tiny muted'}, S(lastL.subj).name + ' · ' + (hasLesson(lastL) ? readMin(lastL) + ' min de lectura' : 'material del curso'))));
  if (upcoming.length){
    const end = addDays(parse(upcoming.at(-1).date), 1), span = Math.max(1, diffDays(TODAY, end));
    const track = h('div', {class:'track', 'aria-hidden':'true'}, h('div', {class:'track-line'}), h('div', {class:'track-today'}, h('span', null, 'hoy')));
    upcoming.forEach((e, i) => {
      const left = (diffDays(TODAY, parse(e.date)) / span) * 100;
      track.append(h('div', {class:`flag ${i % 2 ? 'up' : 'down'}`, style:`left:${left}%;${scs(e.subj)}`}, h('i'),
        h('span', {style:left < 12 ? 'left:-8px;text-align:left' : left > 88 ? 'right:-8px;text-align:right' : ''}, `${S(e.subj).short} ${e.name}`, h('br'), `${parse(e.date).getDate()} ${MESES[parse(e.date).getMonth()]}`)));
    });
    v.append(track);
  }
  const soon = D.events.filter(e => e.date && parse(e.date) >= TODAY && diffDays(TODAY, parse(e.date)) <= 3).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  if (soon.length) v.append(h('section', {class:'urgent'}, h('h3', null, `Próximas 72 horas · ${plural(soon.length, 'pendiente', 'pendientes')}`),
    h('div', {class:'evlist'}, soon.map(e => eventRow(e, true))),
    h('button', {class:'btn ghost small', type:'button', style:'margin-top:8px', onclick:() => go('cal')}, 'Ver calendario completo')));

  const grid = h('div', {class:'grid2'});
  const list = ranked();
  const todays = planOn(iso(TODAY)).filter(x => !x.rev && !x.done).map(x => x.t.id);
  if (todays.length && planPick === 0){ const i = list.findIndex(x => x.t.id === todays[0]); if (i > 0) list.unshift(list.splice(i, 1)[0]); }
  if (list.length){
    const pick = list[planPick % list.length], t = pick.t, steps = buildSession(t);
    const total = steps.reduce((a, s) => a + s.min, 0);
    grid.append(h('section', {class:'card plan', style:scs(t.subj)},
      h('div', {class:'plan-head'},
        h('div', {class:'kicker'}, `La próxima hora · ${total} min`),
        h('h3', null, t.title),
        h('div', {style:'display:flex;gap:6px;flex-wrap:wrap'}, subjChip(t.subj), t.code ? h('span', {class:'chip mono'}, t.code) : null, scopeTag(t.scope)),
        h('ul', {class:'why', 'aria-label':'Por qué este tema'}, pick.why.map(w => h('li', null, w)))),
      h('ol', {class:'steps'}, steps.map(s => h('li', null,
        h('span', {class:'min'}, s.min + "'"),
        h('div', null, h('div', {class:'st-t'}, s.t), h('div', {class:'st-d'}, s.d)),
        s.lesson ? h('button', {class:'btn ghost small', type:'button', onclick:() => openLesson(s.lesson)}, 'Abrir clase') : s.go ? h('button', {class:'btn ghost small', type:'button', onclick:() => go(s.go)}, 'Ver') : s.practice && D.items.some(i => i.topic === s.practice) ? h('button', {class:'btn ghost small', type:'button', onclick:() => { pracFilter = s.practice; Q = null; go('practica'); }}, 'Practicar') : h('span')))),
      h('div', {class:'plan-foot'},
        h('button', {class:'btn hlbtn', type:'button', onclick:() => startFocus(t, steps)}, '▶ Empezar sesión'),
        h('button', {class:'btn ghost', type:'button', onclick:() => { planPick++; render(); }}, 'Otra sugerencia'),
        h('span', {class:'tiny muted'}, `Sugerencia ${planPick % list.length + 1} de ${list.length}`))));
  } else {
    grid.append(h('section', {class:'card empty empty-cta'}, h('span', {class:'hand'}, 'Nada urgente por ahora'),
      D.topics.length ? 'Todo dominado o sin evaluaciones próximas. Revisa el calendario.' : 'Agrega temas a tus materias para que pueda armarte un plan.',
      h('button', {class:'btn small', type:'button', onclick:() => go('editar')}, 'Ir a Editar')));
  }
  grid.append(h('section', null,
    upcoming.length ? h('div', {class:'examlist'}, upcoming.slice(0, 6).map(e => {
      const d = diffDays(TODAY, parse(e.date));
      return h('div', {class:'exam exam-link', style:scs(e.subj), role:'button', tabindex:'0', title:'Estudiar para esta evaluación', onclick:() => openEvalStudy(e.id), onkeydown:ev => { if (ev.key === 'Enter') openEvalStudy(e.id); }},
        h('div', {class:'dd'}, h('b', null, d), h('small', null, d === 1 ? 'día' : 'días')),
        h('div', null, h('h4', null, `${S(e.subj).name} · ${e.name}`),
          h('p', null, `${fmtD(parse(e.date))}${e.time ? ' · ' + e.time : e.slot ? ' · ' + e.slot : ''}`),
          h('p', null, verBadge(e), ' ', e.scopeNote ? h('span', {class:'scope noconf'}, e.scopeNote) : null)));
    })) : h('div', {class:'card empty'}, 'Sin evaluaciones en los próximos 30 días.'),
    h('p', {class:'note'}, '«Confirmada» significa que viste la fecha en una fuente oficial del curso. Lo demás aparece como «sin confirmar».')));
  v.append(grid);

  const due = D.topics.filter(t => isDue(t.id));
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Repasos que vencen'), h('span', {class:'hand'}, due.length ? `${due.length} hoy` : 'nada pendiente')));
  v.append(due.length ? h('div', {class:'duelist'}, due.map(t => h('button', {class:'chip subj-chip', type:'button', style:scs(t.subj) + ';cursor:pointer;min-height:36px', onclick:() => { mapSubj = t.subj; go('mapa'); setTimeout(() => openTopic(t.id), 50); }}, (t.code ? t.code + ' · ' : '') + t.title)))
    : h('p', {class:'muted'}, 'Cuando marques un tema, CalculAi calcula cuándo repasarlo: Aprendiendo y Necesita repaso al día siguiente, Practicado a los 3 días, Dominado a los 7.'));

  if (upcoming.length){
    v.append(h('div', {class:'sec-title'}, h('h2', null, 'Preparación por evaluación'), h('span', {class:'hand'}, 'estimación propia, no predice tu nota')));
    v.append(h('div', {class:'readiness'}, upcoming.map(e => {
      const ts = e.topics && e.topics.length ? e.topics.map(topic).filter(Boolean) : topicsOf(e.subj).filter(t => !t.exam);
      if (!ts.length) return h('div', {class:'card ready', style:scs(e.subj)}, h('div', {style:'font-weight:700'}, `${S(e.subj).short} · ${e.name}`), h('p', {class:'tiny muted'}, 'Sin temas asociados todavía.'));
      let num = 0, den = 0; const counts = {};
      ts.forEach(t => { const s = st(t.id); counts[s] = (counts[s] || 0) + 1; const w = SCOPE_W[t.scope] || 1; num += W[s] / 3 * w; den += w; });
      const pct = Math.round(100 * num / den);
      return h('div', {class:'card ready', style:scs(e.subj)},
        h('div', {class:'ready-top'}, h('span', null, h('b', {style:'color:var(--sc)'}, pct + '%')), h('span', {class:'tiny muted'}, countdown(diffDays(TODAY, parse(e.date))))),
        h('div', {style:'font-weight:700'}, `${S(e.subj).short} · ${e.name}`),
        h('div', {class:'meter'}, STATUSES.map(s => counts[s.k] ? h('span', {style:`width:${100 * counts[s.k] / ts.length}%;background:var(--s-${s.k})`, title:`${s.l}: ${counts[s.k]}`}) : null)),
        h('div', {class:'tiny muted', style:'margin-top:6px'}, `${plural(ts.length, 'tema', 'temas')} · ${counts.dominado || 0} dominados · ${counts.pendiente || 0} pendientes`));
    })));
    v.append(h('div', {class:'legend'}, STATUSES.map(s => h('span', null, h('i', {class:'dot', style:`background:var(--s-${s.k})`}), s.l))));
  }
  const wk = addDays(TODAY, -6);
  const att = P.attempts.filter(a => parse(a.at) >= wk), okN = att.filter(a => a.ok).length;
  const mins = P.sessions.filter(s => parse(s.at) >= wk).reduce((a, s) => a + s.min, 0);
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Últimos 7 días')));
  v.append(h('div', {class:'stats'},
    h('div', {class:'card stat'}, h('b', null, mins), h('span', null, 'minutos en modo enfoque')),
    h('div', {class:'card stat'}, h('b', null, att.length), h('span', null, 'ejercicios respondidos')),
    h('div', {class:'card stat'}, h('b', null, att.length ? Math.round(100 * okN / att.length) + '%' : '—'), h('span', null, 'de aciertos')),
    h('div', {class:'card stat'}, h('b', null, P.errors.filter(e => !e.resolved).length), h('span', null, 'errores por resolver'))));
}

/* ---------------- MAPA ---------------- */
function depthOf(t, memo = {}, seen = new Set()){
  if (memo[t.id] != null) return memo[t.id]; if (seen.has(t.id)) return 0; seen.add(t.id);
  const pre = (t.pre || []).map(topic).filter(p => p && p.subj === t.subj);
  return memo[t.id] = pre.length ? 1 + Math.max(...pre.map(p => depthOf(p, memo, seen))) : 0;
}
let mapRO = null;
/* ---------- Vista: Mapa ---------- */
function vMapa(v){
  if (!mapSubj || !D.subjects.some(s => s.id === mapSubj)) mapSubj = D.subjects[0].id;
  v.append(h('div', {class:'subj-switch'}, D.subjects.map(s => h('button', {class:'seg', type:'button', style:scs(s.id), 'aria-pressed':String(mapSubj === s.id), onclick:() => { mapSubj = s.id; render(); }}, h('span', {class:'dot', style:'background:var(--sc)'}), s.name))));
  const S0 = S(mapSubj);
  v.append(h('p', {class:'muted', style:'margin:6px 0 0'}, [S0.code, S0.prof].filter(Boolean).join(' · ')));
  if (S0.note) v.append(h('p', {class:'note'}, S0.note));
  const ts = topicsOf(mapSubj);
  if (!ts.length){ v.append(h('div', {class:'card empty empty-cta', style:'margin-top:14px'}, 'Esta materia todavía no tiene temas.', h('button', {class:'btn small', type:'button', onclick:() => openTopicForm(null, mapSubj)}, '+ Agregar tema'))); return; }
  v.append(h('div', {class:'legend'}, STATUSES.map(s => h('span', null, h('i', {class:'dot', style:`background:var(--s-${s.k})`}), s.l)),
    h('span', null, h('span', {class:'scope noconf'}, 'rayado'), ' no confirmado'), h('span', null, h('span', {class:'scope hist'}, 'punteado'), ' histórico')));
  const memo = {}, rows = [];
  ts.forEach(t => { const d = depthOf(t, memo); (rows[d] = rows[d] || []).push(t); });
  const wrap = h('div', {class:'mapwrap', style:scs(mapSubj)});
  const svgEl = svg('svg', {class:'links'}); wrap.append(svgEl);
  rows.filter(Boolean).forEach(r => wrap.append(h('div', {class:'maprow'}, r.sort((a, b) => (a.code || a.title).localeCompare(b.code || b.title)).map(t => {
    const s = st(t.id);
    return h('button', {class:`node ${t.scope || ''}`, type:'button', 'data-id':t.id, style:`--stc:var(--s-${s})`, onclick:() => openTopic(t.id), 'aria-label':`${t.title}, ${SL[s]}`},
      isDue(t.id) ? h('span', {class:'due'}, 'repaso') : null,
      t.code ? h('span', {class:'code'}, t.code) : null, h('span', {class:'nt'}, t.title),
      h('span', {class:'ns'}, h('i', {class:'dot', style:`background:var(--s-${s})`}), SL[s]));
  }))));
  v.append(h('div', {class:'card', style:'margin-top:14px;padding:6px'}, wrap));
  v.append(h('div', {style:'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px'}, h('button', {class:'btn ghost small', type:'button', onclick:() => openTopicForm(null, mapSubj)}, '+ Agregar tema'),
    h('span', {class:'tiny muted'}, 'Las flechas salen de los prerrequisitos que definas en cada tema.')));
  const draw = () => drawLinks(wrap, svgEl, ts);
  requestAnimationFrame(draw);
  if (mapRO) mapRO.disconnect(); mapRO = new ResizeObserver(draw); mapRO.observe(wrap);
}
function drawLinks(wrap, svgEl, ts){
  svgEl.replaceChildren(); const box = wrap.getBoundingClientRect();
  ts.forEach(t => (t.pre || []).forEach(pid => {
    const a = wrap.querySelector(`[data-id="${pid}"]`), b = wrap.querySelector(`[data-id="${t.id}"]`); if (!a || !b) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const x1 = ra.left + ra.width / 2 - box.left, y1 = ra.bottom - box.top, x2 = rb.left + rb.width / 2 - box.left, y2 = rb.top - box.top, my = (y1 + y2) / 2;
    svgEl.append(svg('path', {d:`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`, class:W[st(pid)] >= 2 ? 'ready' : ''}));
  }));
}
/* Índice de una clase escrita en CalculAi: un botón por cada «## sección» (desplaza sin cambiar la dirección). */
function lessonToc(body){
  const hs = body ? [...body.querySelectorAll('h4.lc-h')] : [];
  if (hs.length < 3) return null;
  return h('nav', {class:'lc-toc', 'aria-label':'Partes de la clase'}, hs.map(x => h('button', {class:'chip', type:'button', onclick:() => x.scrollIntoView({behavior:'smooth', block:'start'})}, x.textContent)));
}
function renderContent(txt){
  if (!txt) return null;
  const wrap = h('div', {class:'lesson-content'});
  const blocks = txt.replace(/\r/g, '').split(/\n{2,}/).flatMap(b => { const m = b.match(/^(#{1,3} [^\n]*)\n([\s\S]+)$/); return m ? [m[1], m[2]] : [b]; });
  blocks.forEach(block => {
    const trimmed = block.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('# ')){ wrap.append(h('h3', {class:'lc-h'}, rich(trimmed.slice(2)))); return; }
    if (trimmed.startsWith('## ')){ wrap.append(h('h4', {class:'lc-h'}, rich(trimmed.slice(3)))); return; }
    if (trimmed.startsWith('### ')){ wrap.append(h('h5', {class:'lc-h'}, rich(trimmed.slice(4)))); return; }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')){
      const items = trimmed.split('\n').filter(l => l.trim());
      wrap.append(h('ul', {class:'lc-ul'}, items.map(l => h('li', null, rich(l.replace(/^[-*]\s*/, ''))))));
      return;
    }
    if (/^\d+\.\s/.test(trimmed)){
      const items = trimmed.split('\n').filter(l => l.trim());
      wrap.append(h('ol', {class:'lc-ol'}, items.map(l => h('li', null, rich(l.replace(/^\d+\.\s*/, ''))))));
      return;
    }
    if (trimmed.startsWith('> ')){
      wrap.append(h('blockquote', {class:'lc-bq'}, rich(trimmed.replace(/^>\s?/gm, ''))));
      return;
    }
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$')){
      const math = trimmed.slice(2, -2).trim();
      const el = h('div', {class:'lc-math'});
      try { if (window.katex) katex.render(math, el, {displayMode:true, output:'mathml', throwOnError:false}); else el.textContent = math; }
      catch { el.textContent = math; }
      wrap.append(el);
      return;
    }
    wrap.append(h('p', {class:'lc-p'}, rich(trimmed.replace(/\n/g, ' '))));
  });
  return wrap;
}
/* =========================================================
   CLASES — todo se lee dentro de CalculAi
   ========================================================= */
let lessonOpen = null, classSubj = 'todas';
function openLesson(id){ if (!topic(id)) return; lessonOpen = id; P.lastLesson = id; save(); closeDrawer(); go('clases'); }
const hasLesson = t => !!(t.content && t.content.trim());

/* ---------- Clases guardadas en este dispositivo (paquete de clases) ----------
   Las clases interactivas (HTML) viven en IndexedDB «calculai-clases», no en D:
   así pesan poco en el guardado normal y la revisión de WebC nunca las toca.
   La clave de cada clase es el enlace del tema o recurso (t.url / r.url).
   Se muestran en un iframe aislado (sandbox sin allow-same-origin): no pueden leer los datos de CalculAi.
   Lo que la clase guarda en «localStorage» (respuestas, avance) se redirige a calculai-lstate. */
const LDB = 'calculai-clases';
let lessonKeys = new Set();
const lessonHtmlCache = {};
function ldbOpen(){ return new Promise((res, rej) => { const r = indexedDB.open(LDB, 1); r.onupgradeneeded = () => r.result.createObjectStore('l'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function ldbPut(list){
  const db = await ldbOpen();
  await new Promise((res, rej) => { const tx = db.transaction('l', 'readwrite'); list.forEach(x => tx.objectStore('l').put({key:x.key, code:x.code || '', title:x.title || '', html:x.html, at:new Date().toISOString()}, x.key)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  list.forEach(x => { lessonKeys.add(x.key); lessonHtmlCache[x.key] = x.html; });
}
async function ldbGet(key){
  if (lessonHtmlCache[key]) return lessonHtmlCache[key];
  try { const db = await ldbOpen(); return await new Promise(res => { const r = db.transaction('l').objectStore('l').get(key); r.onsuccess = () => { const v = r.result && r.result.html || null; if (v) lessonHtmlCache[key] = v; res(v); }; r.onerror = () => res(null); }); } catch { return null; }
}
async function ldbClear(){ try { const db = await ldbOpen(); await new Promise(res => { const tx = db.transaction('l', 'readwrite'); tx.objectStore('l').clear(); tx.oncomplete = res; tx.onerror = res; }); } catch {} lessonKeys = new Set(); for (const k in lessonHtmlCache) delete lessonHtmlCache[k]; }
async function loadLessonKeys(){
  try { const db = await ldbOpen(); const keys = await new Promise(res => { const r = db.transaction('l').objectStore('l').getAllKeys(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); lessonKeys = new Set(keys); if (keys.length) render(); } catch {}
}
const hasSaved = t => !!(t && t.url && lessonKeys.has(t.url));
const lessonReady = t => hasLesson(t) || hasSaved(t);
/* Texto plano de una clase guardada (para la IA). Usa la copia en memoria (se carga al abrir la clase). */
function savedText(t){ const html = t && t.url && lessonHtmlCache[t.url]; if (!html) return ''; const d = new DOMParser().parseFromString(html, 'text/html'); d.querySelectorAll('script,style,noscript,svg').forEach(x => x.remove()); return (d.body.innerText || d.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 14000); }
/* Avance que cada clase guarda (su «localStorage»), por enlace de la clase. */
function lstateAll(){ try { return JSON.parse(localStorage.getItem('calculai-lstate') || '{}') || {}; } catch { return {}; } }
function lstateSet(key, state){ const all = lstateAll(); all[key] = state; try { localStorage.setItem('calculai-lstate', JSON.stringify(all)); } catch {} }
/* Script que se antepone a la clase: reemplaza localStorage por una copia que avisa a CalculAi cada cambio. */
function lessonShim(key){
  const j = v => JSON.stringify(v).replace(/</g, '\\u003c');
  return `<script>(function(){var K=${j(key)},S=${j(lstateAll()[key] || {})};function send(){try{parent.postMessage({type:'calculai-lstate',key:K,state:S},'*')}catch(e){}}var st={getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(S,k)?S[k]:null},setItem:function(k,v){S[String(k)]=String(v);send()},removeItem:function(k){delete S[String(k)];send()},clear:function(){S={};send()},key:function(i){return Object.keys(S)[i]||null},get length(){return Object.keys(S).length}};try{Object.defineProperty(window,'localStorage',{value:st,configurable:true})}catch(e){}${lessonNavFix}})();<\/script>`;
}
/* Dentro de la clase (srcdoc), un enlace «#teoria» se resolvía contra la dirección de CalculAi y cargaba la app
   dentro del recuadro. Aquí: los «#…» desplazan a esa parte, los enlaces web abren en otra pestaña y nada más
   puede sacar a la clase de su recuadro (tampoco un formulario sin destino). */
const lessonNavFix = "function sc(id){var el=id?(document.getElementById(id)||document.getElementsByName(id)[0]):null;if(el)el.scrollIntoView({behavior:'smooth',block:'start'});else if(!id)window.scrollTo({top:0,behavior:'smooth'})}"
  + "document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;var h=a.getAttribute('href')||'';"
  + "if(h.charAt(0)==='#'){e.preventDefault();var id=h.slice(1);try{id=decodeURIComponent(id)}catch(x){}sc(id);return}"
  + "if(/^(javascript:|mailto:|tel:|blob:|data:)/i.test(h))return;if(/^https?:/i.test(h)){a.setAttribute('target','_blank');a.setAttribute('rel','noopener');return}e.preventDefault()},true);"
  + "document.addEventListener('submit',function(e){var f=e.target,act=f&&f.getAttribute&&f.getAttribute('action');if(!act||!/^https?:/i.test(act))e.preventDefault()},true);";
function withShim(html, key){ const m = html.match(/<head[^>]*>/i); return m ? html.replace(m[0], m[0] + lessonShim(key)) : lessonShim(key) + html; }
window.addEventListener('message', ev => {
  const d = ev.data; if (!d || d.type !== 'calculai-lstate' || typeof d.key !== 'string' || !d.state || typeof d.state !== 'object') return;
  const fr = [...document.querySelectorAll('iframe.saved-frame')].find(f => f.contentWindow === ev.source && f.dataset.key === d.key);
  if (!fr || JSON.stringify(d.state).length > 300000) return;
  const prev = lstateAll()[d.key] || {};
  lstateSet(d.key, d.state);
  /* Si en la clase marcas «Mi estado», el tema de CalculAi queda con el mismo estado. */
  for (const k of Object.keys(d.state)){
    if (!/-status$/.test(k) || d.state[k] === prev[k]) continue;
    let v = String(d.state[k]); try { v = JSON.parse(v); } catch {}
    const s = norm(String(v)).replace('necesita ', '');
    const t = D.topics.find(x => x.url === d.key);
    if (t && W[s] !== undefined && st(t.id) !== s){
      setStatus(t.id, s);
      document.querySelectorAll('.lp-top .chip').forEach(c => { if (Object.values(SL).includes(c.textContent)) c.replaceChildren(h('i', {class:'dot', style:`background:var(--s-${s})`}), SL[s]); });
      toast(`${t.title}: ${SL[s]}`);
    }
  }
});
/* Muestra una clase guardada dentro de CalculAi, en un marco aislado. */
function savedFrame(url, title){
  const wrap = h('div', {class:'saved-lesson'});
  const frame = h('iframe', {class:'saved-frame', title:title || 'Clase', sandbox:'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms', 'data-key':url});
  const bar = h('div', {class:'saved-bar tiny muted'},
    h('span', null, '▤ Clase interactiva · guardada en este dispositivo'),
    h('span', {class:'saved-act'},
      h('button', {class:'linkbtn', type:'button', onclick:() => { try { (wrap.requestFullscreen || wrap.webkitRequestFullscreen).call(wrap); } catch {} }}, '⤢ Pantalla completa')));
  wrap.append(bar, frame);
  ldbGet(url).then(html => { if (html) frame.srcdoc = withShim(html, url); else frame.replaceWith(h('p', {class:'tiny muted'}, 'No encontré esta clase en este dispositivo. Vuelve a cargar el paquete de clases en Editar → Respaldo.')); });
  return wrap;
}
function openSaved(url, title){
  $('#drawer').classList.add('wide');
  openDrawer(h('div', {class:'drawer-head'}, h('div', {style:'flex:1;min-width:0'}, h('h3', null, title || 'Material')), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')),
    h('div', {class:'drawer-body'}, savedFrame(url, title)));
}
/* Abre un recurso: guardado → dentro de CalculAi; Drive/YouTube/PDF → visor; lo demás → pestaña aparte. */
function openResource(url, title){ if (!url) return; if (lessonKeys.has(url)) openSaved(url, title); else if (embedUrl(url)) openViewer(url, title); else openExt(url); }
/* Importa un paquete de clases: {app:'calculai', lessons:[{key, code, title, html}], data?, progress?}. */
async function importLessons(list){
  const ok = (list || []).filter(x => x && typeof x.key === 'string' && /^https?:\/\//.test(x.key) && typeof x.html === 'string' && x.html.length < 3e6);
  if (!ok.length) return 0;
  await ldbPut(ok); return ok.length;
}
const isExampleData = () => D.subjects.length > 0 && D.subjects.every(s => /^s-(cal|alg|fis)$/.test(s.id));
const readMin = t => Math.max(1, Math.round(String(t.content || '').split(/\s+/).length / 180));
function lessonOrder(sid){ const memo = {}; return topicsOf(sid).slice().sort((a, b) => depthOf(a, memo) - depthOf(b, memo) || (a.code || a.title).localeCompare(b.code || b.title, 'es', {numeric:true})); }
/* Enlaces que sí se pueden mostrar dentro de la app (Drive, Docs, YouTube, PDF). */
function embedUrl(u){
  try {
    const x = new URL(u, location.href);
    if (x.protocol !== 'https:') return null; // solo https dentro de un recuadro
    if (/(^|\.)drive\.google\.com$/.test(x.hostname)){
      const f = x.pathname.match(/\/file\/d\/([^/]+)/); const id = f ? f[1] : x.searchParams.get('id');
      const folder = x.pathname.match(/\/folders\/([^/?]+)/);
      if (folder) return `https://drive.google.com/embeddedfolderview?id=${folder[1]}#list`;
      if (id) return `https://drive.google.com/file/d/${id}/preview`;
    }
    if (x.hostname === 'docs.google.com'){ const m = x.pathname.match(/^\/(document|presentation|spreadsheets)\/d\/([^/]+)/); if (m) return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`; }
    if (/(^|\.)youtube\.com$/.test(x.hostname) && x.searchParams.get('v')) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(x.searchParams.get('v'))}`;
    if (x.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed${x.pathname}`;
    if (/\.pdf$/i.test(x.pathname)) return x.href;
  } catch {}
  return null;
}
const isWebcUrl = u => /webc\.uai\.cl|\/mod\/|\/pluginfile\.php/.test(u || '') || !!(D.sync && D.sync.webc && u && u.startsWith(D.sync.webc.origin));
function viewer(url, title){
  if (!url) return null;
  const e = embedUrl(url);
  if (e) return h('div', {class:'viewer'},
    h('iframe', {src:e, title:title || 'Material', loading:'lazy', allow:'fullscreen; encrypted-media', allowfullscreen:true}),
    h('div', {class:'viewer-foot tiny muted'}, '¿No carga? ', h('a', {href:url, target:'_blank', rel:'noopener'}, 'Ábrelo aparte ↗')));
  return h('div', {class:'viewer-out'},
    h('p', {class:'tiny muted', style:'margin:0 0 8px'}, isWebcUrl(url)
      ? 'Este material está en WebC. Moodle pide tu sesión y, por defecto, no deja que otras páginas lo muestren dentro, así que se abre en una pestaña aparte.'
      : 'Este sitio no permite mostrarse dentro de otras apps, así que se abre en una pestaña aparte.'),
    extLink(url, 'Abrir material', 'btn small'));
}
function openViewer(url, title){
  $('#drawer').classList.add('wide');
  openDrawer(h('div', {class:'drawer-head'}, h('div', {style:'flex:1;min-width:0'}, h('h3', null, title || 'Material')), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')),
    h('div', {class:'drawer-body'}, viewer(url, title)));
}
/* Tarjeta compacta de la clase (panel lateral del mapa). */
function lessonCard(t){
  const has = hasLesson(t), saved = hasSaved(t);
  if (saved) ldbGet(t.url); // deja el texto listo para «Adaptar con IA»
  return h('div', {class:'lesson-card'},
    h('div', {class:'lc-info'}, h('b', null, saved ? '▤ Clase interactiva lista' : has ? '▤ Clase lista para leer' : t.url ? '◫ Material del curso' : '▤ Clase sin escribir'),
      h('small', {class:'muted'}, saved ? 'Guardada en este dispositivo · se ve dentro de CalculAi' : has ? `${readMin(t)} min de lectura · dentro de CalculAi` : t.url ? (embedUrl(t.url) ? 'Se ve dentro de CalculAi' : 'Se abre aparte') : 'Puedes escribirla o pegar una clase preparada')),
    h('div', {class:'ai-row'},
      h('button', {class:'btn small hlbtn', type:'button', onclick:() => openLesson(t.id)}, has || saved || t.url ? 'Abrir clase' : 'Ir a la clase'),
      h('button', {class:'btn small ai-btn', type:'button', onclick:() => openAIPanel(t)}, '✦ Adaptar con IA')));
}
function vClases(v){
  const t = lessonOpen && topic(lessonOpen);
  if (t){ vLesson(v, t); return; }
  lessonOpen = null;
  const evx = evalOpen && D.events.find(e => e.id === evalOpen);
  if (evx){ vEvalStudy(v, evx); return; }
  evalOpen = null;
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Clases'), h('span', {class:'hand'}, 'todo se lee aquí mismo'),
    h('button', {class:'btn small ai-btn', type:'button', style:'margin-left:auto', onclick:() => openGenerator()}, '✦ Crear clases con mi material')));
  const ups = exams().filter(e => parse(e.date) >= TODAY).slice(0, 8);
  if (ups.length) v.append(h('div', {class:'eval-row'}, h('b', {class:'tiny'}, '🎯 Estudiar para:'),
    ups.map(e => h('button', {class:'chip eval-chip', type:'button', style:scs(e.subj), onclick:() => openEvalStudy(e.id)}, h('span', {class:'dot', style:'background:var(--sc)'}), `${S(e.subj).short} · ${e.name} · ${countdown(diffDays(TODAY, parse(e.date)))}`))));
  const last = P.lastLesson && topic(P.lastLesson);
  const top = ranked()[0];
  const quick = h('div', {class:'cl-quick'},
    last ? h('button', {class:'card cl-cont', type:'button', style:scs(last.subj), onclick:() => openLesson(last.id)}, h('small', {class:'kicker'}, 'Continuar donde quedaste'), h('b', null, last.title), h('span', {class:'tiny muted'}, S(last.subj).name)) : null,
    top && (!last || top.t.id !== last.id) ? h('button', {class:'card cl-cont', type:'button', style:scs(top.t.subj), onclick:() => openLesson(top.t.id)}, h('small', {class:'kicker'}, 'Sugerida para ahora'), h('b', null, top.t.title), h('span', {class:'tiny muted'}, top.why[0])) : null);
  if (quick.children.length) v.append(quick);
  const missing = D.topics.filter(x => !lessonReady(x) && /^https:\/\/claude\.ai\//.test(x.url || '')).length;
  if (missing) v.append(h('div', {class:'card lp-empty', style:'margin-top:12px'},
    h('p', {style:'margin:0 0 4px'}, h('b', null, `${plural(missing, 'clase tuya está', 'clases tuyas están')} en claude.ai y todavía no ${missing === 1 ? 'está guardada' : 'están guardadas'} en este dispositivo.`)),
    h('p', {class:'tiny muted', style:'margin:0 0 8px'}, 'Carga tu paquete de clases (archivo .json) para leerlas dentro de CalculAi, aunque WebC no esté conectado.'),
    h('button', {class:'btn small', type:'button', onclick:pickLessonFile}, '⇪ Cargar paquete de clases')));
  const search = h('input', {type:'search', class:'cl-search', placeholder:'Buscar una clase (título, código o texto)…', 'aria-label':'Buscar clase'});
  v.append(h('div', {class:'filterrow', style:'margin-top:12px'},
    h('button', {class:'seg', type:'button', 'aria-pressed':String(classSubj === 'todas'), onclick:() => { classSubj = 'todas'; render(); }}, 'Todas'),
    D.subjects.map(s => h('button', {class:'seg', type:'button', style:scs(s.id), 'aria-pressed':String(classSubj === s.id), onclick:() => { classSubj = s.id; render(); }}, s.short))), search);
  const groups = [];
  D.subjects.filter(s => classSubj === 'todas' || classSubj === s.id).forEach(s => {
    const ts = lessonOrder(s.id);
    const nw = ts.filter(lessonReady).length;
    const grid = h('div', {class:'cl-grid'}, ts.map(x => {
      const stt = st(x.id), ex = examFor(x);
      const card = h('button', {class:'cl-card', type:'button', style:scs(s.id), onclick:() => openLesson(x.id), 'data-q':norm([x.code, x.title, x.content].join(' '))},
        h('span', {class:'cl-top'}, x.code ? h('span', {class:'chip mono'}, x.code) : null, h('span', {class:'cl-kind ' + (lessonReady(x) ? 'ok' : x.url ? 'mat' : 'none')}, hasSaved(x) ? '▤ clase' : hasLesson(x) ? `▤ ${readMin(x)} min` : x.url ? '◫ enlace' : 'sin clase')),
        h('b', {class:'cl-title'}, x.title),
        h('span', {class:'cl-foot tiny'}, h('i', {class:'dot', style:`background:var(--s-${stt})`}), SL[stt], ex ? ` · ${ex.name} ${countdown(diffDays(TODAY, parse(ex.date)))}` : ''));
      return card;
    }));
    const sec = h('section', {class:'cl-sec'}, h('div', {class:'cl-sh'}, h('h3', {class:'display'}, s.name), h('span', {class:'tiny muted'}, `${nw} de ${ts.length} clases disponibles aquí`),
      h('button', {class:'btn ghost small', type:'button', onclick:() => openTopicForm(null, s.id)}, '+ Clase')),
      ts.length ? grid : h('div', {class:'card lp-empty'}, h('p', {style:'margin:0 0 4px'}, h('b', null, 'Esta materia todavía no tiene clases.')),
        h('p', {class:'tiny muted', style:'margin:0 0 8px'}, webcFileRes(s.id).length ? `Tienes ${plural(webcFileRes(s.id).length, 'archivo', 'archivos')} de WebC en esta materia: puedo armar clases y ejercicios con ellos.` : 'Sube los PDF o presentaciones del curso y armo clases y ejercicios con ellos. También puedes escribirlas con «+ Clase».'),
        h('button', {class:'btn small ai-btn', type:'button', onclick:() => openGenerator(s.id)}, '✦ Crear clases con mi material')));
    groups.push(sec); v.append(sec);
  });
  const none = h('p', {class:'tiny muted', hidden:true}, 'Ninguna clase coincide con la búsqueda.'); v.append(none);
  search.addEventListener('input', () => {
    const q = norm(search.value.trim()); let any = false;
    v.querySelectorAll('.cl-card').forEach(c => { const ok = !q || c.dataset.q.includes(q); c.hidden = !ok; any = any || ok; });
    groups.forEach(g => { g.hidden = !!q && !g.querySelector('.cl-card:not([hidden])'); });
    none.hidden = any;
  });
}
function vLesson(v, t){
  const list = lessonOrder(t.subj), i = list.findIndex(x => x.id === t.id), prev = list[i - 1], next = list[i + 1];
  const s = st(t.id), ex = examFor(t), nItems = D.items.filter(x => x.topic === t.id).length;
  const page = h('div', {class:'lesson-page', style:scs(t.subj)});
  page.append(...[
    h('div', {class:'lp-top'},
      h('button', {class:'btn ghost small', type:'button', onclick:() => { lessonOpen = null; render(); window.scrollTo({top:0}); }}, '← Todas las clases'),
      subjChip(t.subj), t.code ? h('span', {class:'chip mono'}, t.code) : null, scopeTag(t.scope),
      h('span', {class:'chip'}, h('i', {class:'dot', style:`background:var(--s-${s})`}), SL[s])),
    h('h1', {class:'lp-title'}, t.title),
    ex ? h('p', {class:'tiny muted', style:'margin:-4px 0 10px'}, `Entra en ${S(ex.subj).short} · ${ex.name}, ${countdown(diffDays(TODAY, parse(ex.date)))} (${fmtD(parse(ex.date))}).`) : null,
    h('div', {class:'lp-actions'},
      h('button', {class:'btn small ai-btn', type:'button', onclick:() => openAIPanel(t, page)}, '✦ Adaptar con IA'),
      h('button', {class:'btn ghost small', type:'button', onclick:() => openTopicForm(t.id)}, hasLesson(t) ? '✎ Editar mi texto' : hasSaved(t) ? '✎ Agregar mis notas' : '✎ Escribir clase'),
      nItems ? h('button', {class:'btn ghost small', type:'button', onclick:() => { pracFilter = t.id; Q = null; go('practica'); }}, `Practicar (${nItems})`) : null,
      h('button', {class:'btn ghost small', type:'button', onclick:() => startFocus(t, buildSession(t))}, '▶ Sesión de estudio')),
    h('div', {class:'ai-slot'})].filter(Boolean));
  const saved = hasSaved(t), fromClaude = /^https:\/\/claude\.ai\//.test(t.url || '');
  if (saved) ldbGet(t.url);
  if (hasLesson(t)){
    const body = renderContent(t.content);
    const h1 = body && body.firstElementChild; if (h1 && h1.tagName === 'H3' && norm(h1.textContent.trim()) === norm(t.title.trim())) h1.remove();
    page.append(h('article', {class:'card lp-body'}, saved ? h('p', {class:'kicker', style:'margin:0 0 8px'}, 'Mi texto (notas o versión adaptada)') : null,
      t.gen ? h('p', {class:'tiny note', style:'margin:0 0 10px'}, `Clase creada con IA el ${fmtD(parse(t.gen.at))} a partir de: ${(t.gen.from || []).join(', ') || 'tu material'}. Revísala con tus apuntes.`) : null,
      lessonToc(body), body));
  }
  if (saved) page.append(h('article', {class:'card lp-body lp-saved'}, savedFrame(t.url, t.title)));
  if (!hasLesson(t) && !saved) page.append(h('article', {class:'card lp-body'}, h('div', {class:'lp-empty'},
    h('p', {style:'margin:0 0 6px'}, h('b', null, fromClaude ? 'Esta clase está en claude.ai y todavía no está guardada en este dispositivo.' : 'Esta clase todavía no tiene texto en CalculAi.')),
    h('p', {class:'tiny muted', style:'margin:0 0 10px'}, fromClaude ? 'Carga tu paquete de clases para leerla aquí mismo, sin depender de WebC ni de otra página.' : t.url ? 'Abajo tienes el material del curso. Puedes escribir la clase o pegar una ya preparada con «Escribir clase».' : 'Escríbela o pega una clase preparada con «Escribir clase». Usa # para títulos y $…$ para fórmulas.'),
    h('div', {class:'ai-row'}, fromClaude ? h('button', {class:'btn small', type:'button', onclick:pickLessonFile}, '⇪ Cargar paquete de clases') : null,
      h('button', {class:fromClaude ? 'btn ghost small' : 'btn small', type:'button', onclick:() => openTopicForm(t.id)}, '✎ Escribir clase')))));
  if (t.url && !saved) page.append(hasLesson(t)
    ? h('details', {class:'card lp-mat'}, h('summary', null, '◫ Material del curso'), viewer(t.url, t.title))
    : h('section', {class:'card lp-mat'}, h('h4', {style:'margin:0 0 8px'}, '◫ Material del curso'), viewer(t.url, t.title)));
  page.append(
    h('section', {class:'card lp-check'}, h('h4', {style:'margin:0 0 8px'}, '¿Cómo quedó este tema?'),
      h('div', {class:'statusbar'}, STATUSES.map(x => h('button', {class:'stbtn', type:'button', style:`--stc:var(--s-${x.k})`, 'aria-pressed':String(s === x.k), onclick:() => { setStatus(t.id, x.k); toast(`${t.title}: ${x.l}`); render(); }}, h('i', {class:'dot', style:`background:var(--s-${x.k})`}), x.l)))),
    h('nav', {class:'lp-nav', 'aria-label':'Otras clases'},
      prev ? h('button', {class:'btn ghost', type:'button', onclick:() => { openLesson(prev.id); }}, '← ' + prev.title) : h('span'),
      next ? h('button', {class:'btn', type:'button', onclick:() => { openLesson(next.id); }}, next.title + ' →') : h('span')));
  v.append(page);
}

/* ---------- Vista: Estudiar para una evaluación ----------
   Eliges qué entra (texto, pauta, temario o prueba anterior) y qué clases entran (a mano o con IA).
   Se guarda en el evento: e.topics (clases que entran; vacío = todas las de la materia) y
   e.study = {text, docs:[{name, text, pages}], gaps:[{titulo, cubre}], note}. El plan, la preparación,
   «La próxima hora» y Práctica usan e.topics. Desde aquí se crean clases para lo que falta y ejercicios tipo prueba. */
let evalOpen = null, evalBusy = '';
function openEvalStudy(id){ evalOpen = id; lessonOpen = null; closeDrawer(); go('clases'); }
const studyOf = e => { if (!isObj(e.study)) e.study = {}; if (!Array.isArray(e.study.docs)) e.study.docs = []; if (!Array.isArray(e.study.gaps)) e.study.gaps = []; return e.study; };
const evalDocsText = e => studyOf(e).docs.map(d => `### ${d.name}\n${d.text}`).join('\n\n').slice(0, 60000);
const codeOf = t => t.code || t.id;
function evalList(e){ const all = lessonOrder(e.subj); return e.topics && e.topics.length ? all.filter(t => e.topics.includes(t.id)) : all; }
function evalDetectPrompt(e){
  const st0 = studyOf(e), docs = evalDocsText(e);
  return `Evaluación: «${S(e.subj).name} · ${e.name}» (${fmtD(parse(e.date))}).\n\nLo que entra, según el estudiante:\n${st0.text || '(no escribió nada)'}\n${docs ? `\nDocumentos que subió (pauta, temario o prueba anterior):\n${docs}\n` : ''}\nClases disponibles de la asignatura (código: título):\n${lessonOrder(e.subj).map(t => `${codeOf(t)}: ${t.title}`).join('\n') || '(ninguna todavía)'}\n\nResponde SOLO con JSON válido:\n{"entra":["C01","C02"],"falta":[{"titulo":"…","cubre":"…"}],"comentario":"una o dos frases"}\n- «entra»: códigos de las clases cuyos contenidos aparecen en la evaluación.\n- «falta»: contenidos que entran pero que ninguna clase cubre.\nUsa solo lo que dicen el texto y los documentos. Si no alcanza para decidir, dilo en «comentario».`;
}
function evalItemsPrompt(e){
  const st0 = studyOf(e), docs = evalDocsText(e), list = evalList(e);
  return `Crea entre 6 y 10 ejercicios de práctica para «${S(e.subj).name} · ${e.name}», con el estilo, el nivel y el tipo de preguntas de la pauta o prueba anterior de abajo (si hay), y solo sobre lo que entra. Asigna cada ejercicio a una de estas clases (código: título):\n${list.map(t => `${codeOf(t)}: ${t.title}`).join('\n')}\n\nResponde SOLO con JSON válido, una lista:\n[{"clase":"C03","tipo":"alternativas","pregunta":"…","opciones":["…","…","…","…"],"correcta":0,"explicacion":"…"},\n {"clase":"C04","tipo":"numerica","pregunta":"…","respuesta":1.5,"tolerancia":0.01,"unidad":"","explicacion":"…"}]\n«correcta» es la posición de la opción correcta contando desde 0; «tolerancia» es relativa. Las respuestas deben ser correctas y verificables. Fórmulas con $…$.\n\nLo que entra: ${st0.text || '(no escribió nada)'}\n${docs ? `\nDocumentos:\n${docs}` : ''}`;
}
function evalApplyDetect(e, txt){
  const m = String(txt || '').match(/\{[\s\S]*\}/); if (!m){ toast('La respuesta no traía la lista de clases'); return; }
  let j; try { j = JSON.parse(m[0]); } catch { toast('No pude leer la respuesta (JSON inválido)'); return; }
  const all = lessonOrder(e.subj), want = (Array.isArray(j.entra) ? j.entra : []).map(x => norm(String(x).trim()));
  const ids = all.filter(t => want.includes(norm(codeOf(t))) || want.includes(norm(t.title))).map(t => t.id);
  const st0 = studyOf(e);
  st0.gaps = (Array.isArray(j.falta) ? j.falta : []).filter(x => x && x.titulo).slice(0, 10).map(x => ({titulo:String(x.titulo).slice(0, 140), cubre:String(x.cubre || '').slice(0, 300)}));
  st0.note = String(j.comentario || '').slice(0, 400);
  if (ids.length) e.topics = ids;
  save(); render();
  toast(`${plural(ids.length, 'clase marcada', 'clases marcadas')}${st0.gaps.length ? ` · ${plural(st0.gaps.length, 'contenido sin clase', 'contenidos sin clase')}` : ''}`, 4000);
}
function evalAddItems(e, txt){
  const m = String(txt || '').match(/\[[\s\S]*\]/); if (!m){ toast('La respuesta no traía ejercicios'); return; }
  let a; try { a = JSON.parse(m[0]); } catch { toast('No pude leer la respuesta (JSON inválido)'); return; }
  const list = evalList(e); if (!list.length){ toast('Primero necesitas clases en esta materia'); return; }
  let n = 0;
  (Array.isArray(a) ? a : []).slice(0, 20).forEach(x => { const it = genItem(x); if (!it) return; const t = list.find(y => norm(codeOf(y)) === norm(String(x.clase || ''))) || list[0]; D.items.push({id:uid('q'), topic:t.id, ...it, origin:`Tipo ${e.name} (creado con IA)`}); n++; });
  save(); render(); toast(n ? `${plural(n, 'ejercicio nuevo', 'ejercicios nuevos')} para ${e.name}` : 'No llegaron ejercicios válidos', 4000);
}
/* Con API key consulta directo; sin key, copiar la instrucción y pegar la respuesta. */
async function aiOrPaste(prompt, opt, onText){
  if (getAIKey()){
    evalBusy = 'Consultando a la IA… (puede tardar un minuto)'; render();
    try { onText(await callAI(prompt, opt)); } catch (e) { toast('No se pudo: ' + (e.message === 'NO_KEY' ? 'falta la API key' : e.message), 5000); }
    evalBusy = ''; render(); return;
  }
  const ans = h('textarea', {class:'ai-need', rows:8, placeholder:'Pega aquí la respuesta completa de tu asistente.'});
  $('#drawer').classList.add('wide');
  openDrawer(h('div', {class:'drawer-head'}, h('div', {style:'flex:1'}, h('h3', null, '✦ Pedírselo a tu asistente de IA')), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')),
    h('div', {class:'drawer-body'},
      h('p', {class:'tiny muted', style:'margin:0 0 8px'}, 'Copia la instrucción (ya trae lo que entra y tus documentos), pégala en el asistente de IA que uses y pega aquí su respuesta.'),
      h('button', {class:'btn small', type:'button', onclick:async () => { try { await navigator.clipboard.writeText(prompt); toast('Instrucción copiada'); } catch { ans.value = prompt; ans.select(); toast('Copia el texto del cuadro'); } }}, '⧉ Copiar instrucción'),
      ans, h('div', {class:'ai-row', style:'margin-top:8px'}, h('button', {class:'btn small hlbtn', type:'button', onclick:() => { if (!ans.value.trim()) return; closeDrawer(); onText(ans.value); }}, 'Usar la respuesta')),
      h('details', {style:'margin-top:12px'}, h('summary', {class:'tiny', style:'cursor:pointer;font-weight:700'}, '⚙ O conecta una IA para hacerlo solo'), aiConfigEl(() => { closeDrawer(); aiOrPaste(prompt, opt, onText); }))));
}
async function evalUpload(e, files){
  const st0 = studyOf(e), ok = [], fail = [];
  for (const f of [...files].slice(0, 6)){
    evalBusy = `Leyendo ${f.name}…`; render();
    try { const mt = await readMaterial(f.name, await f.arrayBuffer(), f.type); st0.docs = st0.docs.filter(d => d.name !== mt.name).concat({name:mt.name, pages:mt.pages.length, text:mt.pages.join('\n\n').slice(0, 40000)}).slice(-6); ok.push(f.name); }
    catch (err) { fail.push({name:f.name, msg:err.message}); }
  }
  evalBusy = ''; save(); render();
  if (fail.length && ok.length === 0){
    let msg = `No pude leer los archivos:\n${fail.map(f => `• ${f.name}: ${f.msg}`).join('\n')}`;
    if (fail.some(f => f.msg.includes('escaneo') || f.msg.includes('casi no'))) msg += '\n\n💡 Si son escaneos, conviértelos a PDF con texto: abre en Google Docs y exporta como PDF.';
    if (fail.some(f => f.msg.includes('antigua'))) msg += '\n\n💡 Actualiza a .pptx o .docx (versiones modernas).';
    toast(msg, 8000);
    return;
  } else if (fail.length) {
    toast(`Leí ${ok.length} archivo(s) OK${fail.length ? ` (${fail.length} no pude leer: ${fail.map(f => f.name).join(', ')})` : ''}`);
  }
  if (st0.docs.length && !st0.auto) evalAutoClasses(e);
}
/* Con la pauta (o lo que escribiste), la IA divide lo que se evalúa en ~3 clases nuevas solo para esta
   evaluación, con los ejercicios de la pauta como ejemplos y ejercicios para Práctica. Esas clases pasan a
   ser las que entran (e.topics). Si se vuelven a crear, las anteriores sin avance se reemplazan. */
const evalFocus = e => { const st0 = studyOf(e); return `Esto es para preparar «${S(e.subj).name} · ${e.name}». El material de abajo es la pauta, el temario o una prueba anterior de esa evaluación: las clases deben enseñar exactamente lo que ahí se evalúa (conceptos, procedimientos y tipos de ejercicio), usar sus ejercicios como ejemplos resueltos y no agregar temas que no aparecen.${st0.text ? ' Además, el estudiante dice: ' + st0.text : ''}`; };
async function evalAutoClasses(e){
  const st0 = studyOf(e), sb = S(e.subj);
  if (!st0.docs.length && !st0.text){ toast('Sube una pauta, guía o prueba anterior · O escribe qué contenidos entran · Si ya subiste algo, mira arriba qué pasó'); return; }
  const mats = st0.docs.length ? st0.docs.map(x => ({name:x.name, pages:[x.text], chars:x.text.length})) : [{name:'Lo que entra', pages:[st0.text], chars:st0.text.length}];
  const mt = matText(mats).txt, focus = evalFocus(e), from = mats.map(m => m.name), say = m => { evalBusy = m; render(); };
  const finish = made => {
    if (!made.length){ evalBusy = ''; render(); return; }
    const old = (st0.auto && st0.auto.ids) || [];
    old.filter(id => !made.some(t => t.id === id) && st(id) === 'pendiente').forEach(id => { D.topics = D.topics.filter(t => t.id !== id); D.items = D.items.filter(i => i.topic !== id); });
    made.forEach(t => { t.gen.eval = e.id; });
    e.topics = made.map(t => t.id); st0.auto = {at:iso(TODAY), ids:e.topics.slice()}; st0.gaps = []; st0.note = '';
    evalBusy = ''; save(); render();
    toast(`${plural(made.length, 'clase nueva', 'clases nuevas')} para ${e.name}, con sus ejercicios`, 5000);
  };
  if (!getAIKey()){
    aiOrPaste(genAllPrompt(sb, mt, focus, 3), {}, txt => {
      const L = parseLessons(txt); if (!L.length){ toast('No encontré clases en la respuesta: cada una debe empezar con «# título»', 5000); return; }
      const made = []; L.slice(0, 6).forEach(x => made.push(...addGenerated(e.subj, [x], from, made.length ? made.at(-1).id : null))); finish(made);
    });
    return;
  }
  const made = [];
  try {
    say('Leyendo la pauta y dividiéndola en clases…');
    const plan = parsePlan(await aiRetry(genPlanPrompt(sb, mt, focus, 3), {max:3000, json:true}, say));
    for (let i = 0; i < plan.length; i++){
      say(`Escribiendo la clase ${i + 1} de ${plan.length}: ${plan[i].titulo}… (cada una tarda alrededor de un minuto)`);
      try {
        const L = parseLessons(await aiRetry(genClassPrompt(sb, plan, i, mt, focus), {max:16000}, say))[0];
        if (!L) throw new Error('la respuesta no tenía el formato esperado');
        L.title = plan[i].titulo; L.content = L.content.replace(/^# .+/, '# ' + L.title);
        made.push(...addGenerated(e.subj, [L], from, made.length ? made.at(-1).id : null));
      } catch (err) { toast(`Clase ${i + 1}: ${err.message}`, 5000); if (/no es válida|NO_KEY/.test(err.message)) break; }
    }
  } catch (err) { toast('No se pudo: ' + (err.message === 'NO_KEY' ? 'falta la API key' : err.message), 5000); }
  finish(made);
}
function vEvalStudy(v, e){
  const sb = S(e.subj), all = lessonOrder(e.subj), st0 = studyOf(e), chosen = !!(e.topics && e.topics.length), list = evalList(e), d = diffDays(TODAY, parse(e.date));
  const done = t => ['practicado', 'dominado'].includes(st(t.id)), nextT = list.find(t => !done(t));
  const nItems = poolFor('ev:' + e.id).length, openErr = P.errors.filter(x => !x.resolved && list.some(t => (D.items.find(i => i.id === x.item) || {}).topic === t.id)).length;
  let num = 0; list.forEach(t => { num += W[st(t.id)] / 3; }); const pct = list.length ? Math.round(100 * num / list.length) : 0;
  const fileIn = h('input', {type:'file', multiple:true, accept:'.pdf,.pptx,.docx,.txt,.md,application/pdf', style:'display:none', onchange:ev => { evalUpload(e, ev.target.files); ev.target.value = ''; }});
  const planDays = (() => { const p = buildPlan(); if (!p) return null; return Object.entries(p.days).map(([k, xs]) => [k, xs.filter(x => (x.e && x.e.id === e.id))]).filter(([, xs]) => xs.length).slice(0, 6); })();
  const page = h('div', {class:'lesson-page eval-page', style:scs(e.subj)});
  page.append(...[
    h('div', {class:'lp-top'}, h('button', {class:'btn ghost small', type:'button', onclick:() => { evalOpen = null; render(); window.scrollTo({top:0}); }}, '← Clases'), subjChip(e.subj), kindChip(e), verBadge(e)),
    h('h1', {class:'lp-title'}, `Estudiar para ${sb.short} · ${e.name}`),
    h('p', {class:'tiny muted', style:'margin:-4px 0 10px'}, `${cap(fmtD(parse(e.date)))}${e.time ? ' · ' + e.time : ''} · ${countdown(d)} · preparación estimada ${pct}% (${plural(list.length, 'clase', 'clases')})`),
    evalBusy ? h('p', {class:'gen-status tiny', role:'status'}, evalBusy) : null,
    /* 1. Qué entra */
    h('section', {class:'card gen-step'}, h('h4', null, '1. ¿Qué entra?'),
      h('textarea', {class:'ai-need', rows:3, placeholder:'Ej.: entra hasta integrales impropias, sin series; habrá un ejercicio de áreas. Escribe lo que dijo el profesor o el temario.', 'aria-label':'Qué entra', onchange:ev => { st0.text = ev.target.value.slice(0, 4000); save(); }}, st0.text || ''),
      h('div', {class:'ai-row', style:'margin-top:8px'}, h('button', {class:'btn ghost small', type:'button', onclick:() => fileIn.click()}, '⇪ Subir pauta, temario o prueba anterior'), h('span', {class:'tiny muted'}, 'PDF, PowerPoint, Word o texto'), fileIn),
      st0.docs.length ? h('ul', {class:'tiny gen-read'}, st0.docs.map(x => h('li', null, `📄 ${x.name} · ${plural(x.pages || 1, 'página', 'páginas')} `, h('button', {class:'linkbtn', type:'button', onclick:() => { st0.docs = st0.docs.filter(y => y !== x); save(); render(); }}, 'quitar')))) : null,
      st0.auto && st0.auto.ids.some(topic)
        ? h('div', {class:'eval-auto'}, h('b', null, `✓ Clases creadas para ${e.name}:`), h('ul', {class:'tiny'}, st0.auto.ids.map(topic).filter(Boolean).map(t => h('li', null, `${t.code} · ${t.title}`))),
            h('button', {class:'btn ghost small', type:'button', disabled:evalBusy || null, onclick:() => { if (confirm('¿Crear las clases de nuevo? Las anteriores que sigan en «Pendiente» se reemplazan.')) evalAutoClasses(e); }}, '↻ Crearlas de nuevo'))
        : h('div', {class:'ai-row', style:'margin-top:10px'}, h('button', {class:'btn hlbtn', type:'button', disabled:evalBusy || null, onclick:() => evalAutoClasses(e)}, `✦ Crear las clases para ${e.name}`),
            h('span', {class:'tiny muted'}, 'Al subir la pauta se crean solas: divide lo que se evalúa en unas 3 clases con ejercicios.'))),
    /* 2. Clases que entran (ajuste opcional) */
    h('details', {class:'card gen-step', open:(!st0.auto && chosen) || null}, h('summary', null, h('b', null, '2. Ajustar qué clases entran (opcional)')),
      h('p', {class:'tiny muted', style:'margin:0 0 8px'}, chosen ? `Elegiste ${list.length} de ${all.length} clases. El plan, la práctica y la preparación usan solo estas.` : 'Si no eliges ninguna, cuentan todas las clases de la materia.'),
      all.length ? h('div', {class:'gen-list'}, all.map(t => h('label', {class:'chk'}, h('input', {type:'checkbox', checked:(chosen && e.topics.includes(t.id)) || null, onchange:ev => { const cur = new Set(e.topics || []); ev.target.checked ? cur.add(t.id) : cur.delete(t.id); e.topics = all.filter(x => cur.has(x.id)).map(x => x.id); save(); render(); }}),
        h('span', null, h('i', {class:'dot', style:`background:var(--s-${st(t.id)})`}), ' ', t.code ? h('b', null, t.code + ' ') : null, t.title)))) : h('p', {class:'tiny muted'}, 'Esta materia todavía no tiene clases.'),
      h('div', {class:'ai-row', style:'margin-top:8px'},
        all.length ? h('button', {class:'btn small ai-btn', type:'button', disabled:evalBusy || null, onclick:() => { if (!st0.text && !st0.docs.length){ toast('Primero escribe qué entra o sube la pauta'); return; } aiOrPaste(evalDetectPrompt(e), {max:3000, json:true}, txt => evalApplyDetect(e, txt)); }}, '✦ Detectar con IA') : null,
        chosen ? h('button', {class:'btn ghost small', type:'button', onclick:() => { e.topics = []; save(); render(); }}, 'Usar todas') : null),
      st0.note ? h('p', {class:'tiny note', style:'margin:8px 0 0'}, st0.note) : null,
      st0.gaps.length || st0.docs.length ? h('div', {class:'eval-gaps'},
        st0.gaps.length ? h('div', null, h('b', {class:'tiny'}, 'Contenidos que entran y no tienen clase:'), h('ul', {class:'tiny'}, st0.gaps.map(g => h('li', null, h('b', null, g.titulo), g.cubre ? ' — ' + g.cubre : '')))) : null,
        h('button', {class:'btn small ai-btn', type:'button', onclick:() => openGenerator(e.subj, {evalId:e.id, mats:st0.docs.map(x => ({name:x.name, pages:[x.text], chars:x.text.length})), focus:[st0.text, ...st0.gaps.map(g => g.titulo + (g.cubre ? ': ' + g.cubre : ''))].filter(Boolean).join('; ')})}, st0.gaps.length ? '✦ Crear clases para lo que falta' : '✦ Crear clases con estos documentos')) : null),
    /* 3. Estudiar */
    h('section', {class:'card gen-step'}, h('h4', null, '3. Estudiar'),
      planDays && planDays.length ? h('p', {class:'tiny', style:'margin:0 0 8px'}, h('b', null, 'Tu plan: '), planDays.map(([k, xs]) => `${fmtD(parse(k))} (${xs.map(x => x.rev ? 'repaso' : codeOf(x.t)).join(', ')})`).join(' · ')) : h('p', {class:'tiny muted', style:'margin:0 0 8px'}, planCfg().on ? 'El plan no tiene días para esta evaluación.' : h('span', null, 'Para repartir estas clases en días, ', h('button', {class:'linkbtn', type:'button', onclick:() => go('cal')}, 'arma tu plan en Calendario'), '.')),
      list.length ? h('div', {class:'plist'}, list.map(t => h('div', {class:'prow' + (done(t) ? ' done' : ''), style:scs(t.subj)}, h('span', {class:'pdot'}),
        h('div', {style:'min-width:0;flex:1'}, h('b', null, (done(t) ? '✓ ' : '') + (t.code ? t.code + ' · ' : '') + t.title), h('div', {class:'tiny muted'}, SL[st(t.id)] + (nextT && nextT.id === t.id ? ' · sigue con esta' : ''))),
        h('button', {class:nextT && nextT.id === t.id ? 'btn small' : 'btn ghost small', type:'button', onclick:() => openLesson(t.id)}, 'Abrir clase')))) : null,
      h('div', {class:'ai-row', style:'margin-top:10px'},
        nextT ? h('button', {class:'btn hlbtn', type:'button', onclick:() => startFocus(nextT, buildSession(nextT))}, `▶ Sesión con ${nextT.code || nextT.title}`) : null,
        h('button', {class:'btn ghost small', type:'button', disabled:!nItems || null, onclick:() => { pracFilter = 'ev:' + e.id; Q = null; pracSec = 'ejercicios'; go('practica'); }}, `Practicar solo esto (${nItems})`),
        list.length ? h('button', {class:'btn small ai-btn', type:'button', disabled:evalBusy || null, onclick:() => aiOrPaste(evalItemsPrompt(e), {max:6000, json:true}, txt => evalAddItems(e, txt))}, st0.docs.length ? '✦ Ejercicios tipo prueba (con tu pauta)' : '✦ Ejercicios tipo prueba') : null,
        openErr ? h('button', {class:'btn ghost small', type:'button', onclick:() => go('errores')}, `⚠ ${plural(openErr, 'error por resolver', 'errores por resolver')}`) : null))].filter(Boolean));
  v.append(page);
}

/* ---------- IA: adaptar una clase a lo que te cuesta ---------- */
const AI_MODES = [
  {k:'simple', l:'Explícame más simple', prompt:'Reescribe esta clase de forma más simple e intuitiva, como para alguien que ve el tema por primera vez. Mantén las fórmulas, pero explica la idea antes de cada una.'},
  {k:'examples', l:'Dame más ejemplos', prompt:'Agrega 3 ejemplos resueltos adicionales, de dificultad creciente, con el procedimiento paso a paso.'},
  {k:'summary', l:'Hazme un resumen', prompt:'Haz un resumen de los puntos clave de esta clase: fórmulas importantes, qué significa cada símbolo y cuándo se usa cada una.'},
  {k:'rephrase', l:'Explícalo de otra forma', prompt:'Explica el mismo contenido con otras palabras y otro enfoque, con analogías cuando ayuden. No agregues contenido nuevo.'},
  {k:'errors', l:'Errores frecuentes', prompt:'Lista los errores más frecuentes en estos temas. Para cada uno: por qué ocurre, cómo detectarlo y cómo evitarlo.'},
  {k:'practice', l:'Ejercicios para practicar', prompt:'Crea 4 ejercicios de práctica de dificultad creciente sobre esta clase. Pon todas las soluciones al final, en una sección «Soluciones».'}
];
const AI_DEFAULT_MODEL = {anthropic:'claude-haiku-5-5', openai:'gpt-4o-mini', gemini:''}; // gemini: se elige solo según la key
const lsGet = (k, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };
const getAIKey = () => lsGet('calculai-ai-key');
const setAIKey = k => lsSet('calculai-ai-key', k);
const getAIProvider = () => lsGet('calculai-ai-provider', 'anthropic');
const setAIProvider = p => lsSet('calculai-ai-provider', p);
const getAIModel = () => lsGet('calculai-ai-model') || AI_DEFAULT_MODEL[getAIProvider()] || '';
/* Google: pregunta qué modelos permite la key y elige uno «flash» (rápido; es el que suele tener plan gratis). */
async function geminiModel(key){
  const saved = lsGet('calculai-ai-gauto'); if (saved) return saved;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {headers:{'x-goog-api-key':key}});
  if (!r.ok) throw new Error(r.status === 400 || r.status === 401 || r.status === 403 ? 'la API key no es válida' : `error ${r.status} al revisar la key`);
  const all = ((await r.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name));
  const clean = all.filter(m => !/(image|tts|audio|live|embed|vision|exp|preview|thinking|learnlm|robotics|computer)/i.test(m.name));
  const ver = m => parseFloat((m.name.match(/gemini-(\d+(?:\.\d+)?)/i) || [])[1] || 0);
  const rank = m => (/flash/i.test(m.name) ? 2 : 0) - (/lite/i.test(m.name) ? 1 : 0);
  const pick = (clean.length ? clean : all).sort((a, b) => rank(b) - rank(a) || ver(b) - ver(a))[0];
  if (!pick) throw new Error('esa key no tiene modelos disponibles');
  const name = pick.name.replace(/^models\//, ''); lsSet('calculai-ai-gauto', name); return name;
}
const setAIModel = m => lsSet('calculai-ai-model', m);

function aiPrompt(mode, t, need){
  const base = mode ? mode.prompt : 'Adapta esta clase según lo que pide el estudiante.';
  return `${base}${need ? `\n\nLo que me cuesta o necesito: ${need}` : ''}\n\nReglas: responde en español; usa solo el contenido de la clase (si agregas algo que no está en ella, márcalo como «Complemento»); usa $…$ para fórmulas en línea y $$…$$ en bloques; usa # y ## para títulos.\n\n---\nClase «${t.title}»:\n\n${t.content || savedText(t) || '(La clase no tiene texto escrito en CalculAi.' + (t.url ? ' Material: ' + t.url : '') + ')'}`;
}
async function callAI(prompt, opt = {}){
  const key = getAIKey(), provider = getAIProvider(), max = opt.max || 4096;
  if (!key) throw new Error('NO_KEY');
  const model = provider === 'gemini' ? (getAIModel() || await geminiModel(key)) : getAIModel();
  const sys = 'Eres un ayudante universitario. Respondes en español, con claridad y sin inventar contenido.';
  let r;
  try {
    if (provider === 'anthropic'){
      r = await fetch('https://api.anthropic.com/v1/messages', {method:'POST', headers:{'Content-Type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true'}, body:JSON.stringify({model, max_tokens:max, system:sys, messages:[{role:'user', content:prompt}]})});
    } else if (provider === 'gemini'){
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {method:'POST', headers:{'Content-Type':'application/json', 'x-goog-api-key':key}, body:JSON.stringify({systemInstruction:{parts:[{text:sys}]}, contents:[{role:'user', parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:Math.max(max, 8192), ...(opt.json ? {responseMimeType:'application/json'} : {})}})});
    } else {
      r = await fetch('https://api.openai.com/v1/chat/completions', {method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${key}`}, body:JSON.stringify({model, messages:[{role:'system', content:sys}, {role:'user', content:prompt}]})});
    }
  } catch { throw new Error('no hay conexión con el servicio de IA'); }
  if (!r.ok){
    const e = await r.text().catch(() => '');
    if (provider === 'gemini' && r.status === 404) lsSet('calculai-ai-gauto', '');
    throw new Error(r.status === 401 || (provider === 'gemini' && (r.status === 400 && /API_KEY|api key/i.test(e) || r.status === 403)) ? 'la API key no es válida'
      : r.status === 429 ? 'llegaste al límite de uso de tu plan de IA; espera un minuto y vuelve a intentar'
      : r.status === 404 ? `el modelo «${model}» no está disponible para esa cuenta` : `error ${r.status} ${e.slice(0, 120)}`);
  }
  const j = await r.json();
  const out = provider === 'anthropic' ? (j.content || []).map(c => c.text || '').join('')
    : provider === 'gemini' ? ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(x => x.text || '').join('')
    : ((j.choices && j.choices[0] && j.choices[0].message) || {}).content || '';
  if (!out.trim()) throw new Error('la IA respondió vacío (puede ser un bloqueo de contenido o el límite de largo)');
  return out;
}
/* Configuración de la IA (se usa en «Adapta esta clase» y en «Crear clases con mi material»). */
const AI_PROV = {
  gemini:{l:'Google · tiene plan gratis', help:['Crea una key gratis con tu cuenta de Google en ', ['https://aistudio.google.com/', 'Google AI Studio'], ' (botón «Get API key»). En el plan gratis hay un límite de uso por minuto y por día, y Google indica que puede usar lo que envías para mejorar sus productos: no pongas datos personales.']},
  anthropic:{l:'Anthropic', help:['Requiere una cuenta de pago en la consola de desarrolladores de Anthropic.']},
  openai:{l:'OpenAI', help:['Requiere una cuenta de pago en la plataforma de desarrolladores de OpenAI.']}
};
function aiConfigEl(onSaved){
  const provSel = h('select', {class:'ai-prov-sel', 'aria-label':'Proveedor'}, Object.entries(AI_PROV).map(([k, o]) => h('option', {value:k, selected:getAIProvider() === k || null}, o.l)));
  const keyIn = h('input', {type:'password', class:'ai-key-in', value:getAIKey(), placeholder:'Pega tu API key', 'aria-label':'API key', autocomplete:'off', spellcheck:'false'});
  const modelIn = h('input', {type:'text', class:'ai-key-in', value:lsGet('calculai-ai-model') || AI_DEFAULT_MODEL[getAIProvider()] || '', placeholder:'automático', 'aria-label':'Modelo', style:'max-width:180px'});
  const help = h('p', {class:'tiny muted', style:'margin:6px 0 0'});
  const paintHelp = () => help.replaceChildren(...(AI_PROV[provSel.value] || AI_PROV.gemini).help.map(x => Array.isArray(x) ? h('a', {href:x[0], target:'_blank', rel:'noopener'}, x[1] + ' ↗') : x));
  provSel.addEventListener('change', () => { modelIn.value = AI_DEFAULT_MODEL[provSel.value] || ''; paintHelp(); });
  paintHelp();
  return h('div', {class:'ai-config-body'},
    h('p', {class:'tiny muted', style:'margin:0 0 8px'}, 'Usa tu propia API key. Se guarda solo en este navegador y lo que envías va directo al proveedor que elijas, sin pasar por otros servidores. Revisa los precios y límites en la página del proveedor.'),
    h('div', {class:'ai-row'}, provSel, keyIn, modelIn,
      h('button', {class:'btn ghost small', type:'button', onclick:() => { setAIProvider(provSel.value); setAIKey(keyIn.value.trim()); setAIModel(modelIn.value.trim()); lsSet('calculai-ai-gauto', ''); toast(keyIn.value.trim() ? 'IA conectada' : 'API key eliminada'); onSaved && onSaved(); }}, 'Guardar')),
    help);
}

function openAIPanel(t, host){
  host = host || document.querySelector('.drawer-body');
  if (!host) return;
  const wrap = h('section', {class:'ai-panel', 'aria-label':'Adaptar clase con IA'});
  const resultArea = h('div', {class:'ai-result'});
  const statusEl = h('div', {class:'ai-status tiny muted', role:'status'});
  const need = h('textarea', {class:'ai-need', rows:2, placeholder:'Ej.: no entiendo cuándo usar cada fórmula · me pierdo con los signos · necesito algo rápido antes de la prueba'});

  const configEl = h('details', {class:'ai-config', open:!getAIKey() || null},
    h('summary', null, getAIKey() ? '⚙ Configuración de IA (conectada)' : '⚙ Conectar una IA (opcional)'),
    aiConfigEl(() => openAIPanel(t, host)),
    h('p', {class:'tiny muted', style:'margin:8px 0 0'}, 'Sin API key igual funciona: cada botón copia una instrucción lista para pegar en el asistente de IA que ya uses.'));

  const run = async mode => {
    const prompt = aiPrompt(mode, t, need.value.trim());
    if (!getAIKey()){
      try { await navigator.clipboard.writeText(prompt); toast('Instrucción copiada: pégala en tu asistente de IA'); statusEl.textContent = 'Instrucción copiada. Si después quieres guardar la respuesta aquí, pégala en «Editar clase».'; }
      catch { resultArea.replaceChildren(h('p', {class:'tiny muted'}, 'Copia esta instrucción:'), h('textarea', {class:'ai-need', rows:6, readonly:true, onclick:e => e.target.select()}, prompt)); }
      return;
    }
    statusEl.textContent = 'Generando… (puede tardar unos segundos)'; resultArea.replaceChildren();
    wrap.querySelectorAll('.ai-modes .btn').forEach(b => b.disabled = true);
    try {
      const text = await callAI(prompt);
      statusEl.textContent = 'Revisa la respuesta: la IA puede equivocarse. Compárala con tu material antes de reemplazar la clase.';
      resultArea.replaceChildren(renderContent(text),
        h('div', {class:'ai-row', style:'margin-top:12px'},
          h('button', {class:'btn small', type:'button', onclick:() => { if (t.content && !t.contentOrig) t.contentOrig = t.content; t.content = text; save(); toast('Clase actualizada (la original quedó guardada)'); refreshLesson(t.id); }}, t.content ? 'Usar como mi clase' : 'Guardar como clase'),
          t.content ? h('button', {class:'btn ghost small', type:'button', onclick:() => { t.content = t.content.trim() + '\n\n## Agregado con IA\n\n' + text; save(); toast('Agregado al final de la clase'); refreshLesson(t.id); }}, 'Agregar al final') : null,
          h('button', {class:'btn ghost small', type:'button', onclick:async () => { try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch { toast('No se pudo copiar'); } }}, 'Copiar'),
          h('button', {class:'btn ghost small', type:'button', onclick:() => { resultArea.replaceChildren(); statusEl.textContent = ''; }}, 'Descartar')));
    } catch (err) {
      statusEl.textContent = err.message === 'NO_KEY' ? 'Falta la API key.' : `No se pudo generar: ${err.message}.`;
    } finally { wrap.querySelectorAll('.ai-modes .btn').forEach(b => b.disabled = false); }
  };

  wrap.append(...[
    h('div', {class:'ai-head'}, h('h4', null, '✦ Adapta esta clase'), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar panel de IA', onclick:() => wrap.remove()}, '✕')),
    h('label', {class:'tiny', style:'font-weight:700;display:block;margin-bottom:4px'}, '¿Qué te cuesta o qué necesitas? (opcional)'), need,
    h('div', {class:'ai-modes'}, AI_MODES.map(m => h('button', {class:'btn ghost small', type:'button', onclick:() => run(m)}, m.l)),
      h('button', {class:'btn ghost small', type:'button', onclick:() => need.value.trim() ? run(null) : (need.focus(), toast('Escribe primero qué necesitas'))}, 'Solo lo que escribí')),
    t.contentOrig ? h('p', {class:'tiny', style:'margin:4px 0 0'}, h('button', {class:'linkbtn', type:'button', onclick:() => { t.content = t.contentOrig; delete t.contentOrig; save(); toast('Clase original restaurada'); refreshLesson(t.id); }}, '↺ Restaurar la clase original')) : null,
    configEl, statusEl, resultArea].filter(Boolean));

  const existing = host.querySelector('.ai-panel');
  if (existing) existing.replaceWith(wrap);
  else { const slot = host.querySelector('.ai-slot'); if (slot) slot.replaceChildren(wrap); else host.insertBefore(wrap, host.querySelector(':scope > h4')); }
  wrap.scrollIntoView({block:'nearest', behavior:'smooth'});
}
/* Vuelve a dibujar la clase donde esté abierta (lector o panel lateral). */
function refreshLesson(id){ if (tab === 'clases' && lessonOpen === id) render(); else if ($('#drawer').classList.contains('open')) openTopic(id); }

function openTopic(id){
  const t = topic(id); if (!t) return;
  const s = st(id), ev = evidence(id), nr = nextReview(id);
  document.querySelectorAll('.node.sel').forEach(n => n.classList.remove('sel'));
  document.querySelector(`.node[data-id="${id}"]`)?.classList.add('sel');
  openDrawer(h('div', {class:'drawer-head', style:scs(t.subj)},
      h('div', {style:'flex:1;min-width:0'}, h('div', {style:'display:flex;gap:6px;flex-wrap:wrap'}, subjChip(t.subj), t.code ? h('span', {class:'chip mono'}, t.code) : null, scopeTag(t.scope)), h('h3', null, t.title)),
      h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')),
    h('div', {class:'drawer-body'},
      lessonCard(t),
      h('div', {class:'ai-slot'}),
      h('h4', null, 'Tu autoevaluación'),
      h('div', {class:'statusbar'}, STATUSES.map(x => h('button', {class:'stbtn', type:'button', style:`--stc:var(--s-${x.k})`, 'aria-pressed':String(s === x.k), onclick:() => { setStatus(id, x.k); toast(`${t.title}: ${x.l}`); render(); openTopic(id); }}, h('i', {class:'dot', style:`background:var(--s-${x.k})`}), x.l))),
      h('p', {class:'tiny muted'}, P.status[id] ? `Marcado el ${fmtD(parse(P.status[id].at))}.` + (nr ? ` Próximo repaso: ${fmtD(nr)}.` : '') : 'Aún no lo marcas.'),
      h('h4', null, 'Evidencia de práctica (separada de tu autoevaluación)'),
      h('div', {class:'evid'}, h('div', {class:'card'}, h('b', null, ev.n), h('span', {class:'tiny muted'}, 'intentos')), h('div', {class:'card'}, h('b', null, ev.pct == null ? '—' : ev.pct + '%'), h('span', {class:'tiny muted'}, 'aciertos'))),
      ev.n && ev.pct < 60 && W[s] >= 2 ? h('p', {class:'note'}, 'Tu autoevaluación dice más que la práctica. ¿Lo pasamos a «Necesita repaso»?') : null,
      h('div', {style:'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px'},
        D.items.some(i => i.topic === id) ? h('button', {class:'btn ghost small', type:'button', onclick:() => { pracFilter = id; Q = null; closeDrawer(); go('practica'); }}, 'Practicar este tema') : null,
        h('button', {class:'btn ghost small', type:'button', onclick:() => openItemForm(null, id)}, '+ Ejercicio'),
        h('button', {class:'btn ghost small', type:'button', onclick:() => openTopicForm(id)}, 'Editar tema')),
      h('h4', null, 'Antes de este tema'),
      (t.pre || []).filter(topic).length ? h('div', {class:'duelist'}, t.pre.map(topic).filter(Boolean).map(pt => h('button', {class:'chip', type:'button', style:'cursor:pointer;min-height:34px', onclick:() => openTopic(pt.id)}, h('i', {class:'dot', style:`background:var(--s-${st(pt.id)})`}), (pt.code ? pt.code + ' ' : '') + pt.title))) : h('p', {class:'tiny muted'}, 'Sin prerrequisitos.')));
}

/* ---------------- PRÁCTICA ---------------- */
let Q = null;
function poolFor(f){
  const ev = String(f).startsWith('ev:') ? D.events.find(e => 'ev:' + e.id === f) : null;
  const evT = ev ? new Set(ev.topics && ev.topics.length ? ev.topics : topicsOf(ev.subj).map(t => t.id)) : null;
  return D.items.filter(i => topic(i.topic) && (evT ? evT.has(i.topic) : f === 'todo' ? true : D.subjects.some(s => s.id === f) ? topic(i.topic).subj === f : i.topic === f));
}
function pickItem(f, exclude){
  const all = poolFor(f); const pool = all.filter(i => i.id !== exclude); if (!pool.length) return all[0];
  const weight = i => { const a = P.attempts.filter(x => x.item === i.id); if (!a.length) return 3; return a.at(-1).ok ? .6 : 2.5; };
  const tot = pool.reduce((s, i) => s + weight(i), 0); let r = Math.random() * tot;
  for (const i of pool){ r -= weight(i); if (r <= 0) return i; } return pool[0];
}
function newQ(item){ Q = item ? {item, order:item.type === 'mc' ? item.opts.map((_, k) => k).sort(() => Math.random() - .5) : null, choice:null, conf:null, checked:false, ok:null, val:''} : null; }
function parseNum(s){ s = String(s).trim().replace(/\s/g, '').replace(',', '.'); const f = s.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/); if (f){ const b = +f[2]; return b ? +f[1] / b : null; } const n = Number(s); return Number.isFinite(n) && s !== '' ? n : null; }
const fmtNum = n => String(Math.round(n * 1e6) / 1e6).replace('.', ',');
/* ---------- Vista: Práctica ---------- */
function vPractica(v){
  const openErr = P.errors.filter(e => !e.resolved && D.items.some(i => i.id === e.item)).length;
  v.append(h('div', {class:'viewsw prac-sec', role:'tablist', 'aria-label':'Sección de práctica'},
    h('button', {class:'seg', type:'button', role:'tab', 'aria-selected':String(pracSec !== 'errores'), 'aria-pressed':String(pracSec !== 'errores'), onclick:() => { pracSec = 'ejercicios'; render(); }}, '✎ Ejercicios'),
    h('button', {class:'seg', type:'button', role:'tab', 'aria-selected':String(pracSec === 'errores'), 'aria-pressed':String(pracSec === 'errores'), onclick:() => { pracSec = 'errores'; render(); }}, '⚠ Banco de errores', openErr ? h('span', {class:'count'}, openErr) : null)));
  if (pracSec === 'errores'){ vErrores(v); return; }
  if (String(pracFilter).startsWith('ev:') && !D.events.some(e => 'ev:' + e.id === pracFilter)) pracFilter = 'todo';
  const isEv = String(pracFilter).startsWith('ev:'), pEv = isEv && D.events.find(e => 'ev:' + e.id === pracFilter);
  const isTopic = !isEv && pracFilter !== 'todo' && !D.subjects.some(s => s.id === pracFilter);
  if (isTopic && !topic(pracFilter)) pracFilter = 'todo';
  v.append(h('div', {class:'filterrow'},
    h('button', {class:'seg', type:'button', 'aria-pressed':String(pracFilter === 'todo'), onclick:() => { pracFilter = 'todo'; Q = null; render(); }}, 'Todo'),
    D.subjects.map(s => h('button', {class:'seg', type:'button', style:scs(s.id), 'aria-pressed':String(pracFilter === s.id), onclick:() => { pracFilter = s.id; Q = null; render(); }}, s.short)),
    isTopic && topic(pracFilter) ? h('button', {class:'seg', type:'button', 'aria-pressed':'true', onclick:() => { pracFilter = 'todo'; Q = null; render(); }}, topic(pracFilter).title + ' ✕') : null,
    pEv ? h('button', {class:'seg', type:'button', 'aria-pressed':'true', onclick:() => { pracFilter = 'todo'; Q = null; render(); }}, `🎯 ${S(pEv.subj).short} · ${pEv.name} ✕`) : null,
    h('button', {class:'btn ghost small', type:'button', onclick:() => openItemForm(null, isTopic ? pracFilter : null)}, '+ Crear ejercicio')));
  if (!poolFor(pracFilter).length){
    v.append(h('div', {class:'card empty empty-cta', style:'margin-top:18px'}, h('span', {class:'hand'}, 'Aún no hay ejercicios aquí'),
      'Crea tus propias preguntas (alternativas o numéricas) desde las guías o pruebas de tu curso. Puedes escribir fórmulas entre signos $, por ejemplo $\\int x\\,dx$.',
      h('button', {class:'btn small', type:'button', onclick:() => openItemForm(null, isTopic ? pracFilter : null)}, '+ Crear ejercicio')));
    return;
  }
  if (!Q || !poolFor(pracFilter).includes(Q.item)) newQ(pickItem(pracFilter));
  const it = Q.item, t = topic(it.topic);
  const grid = h('div', {class:'prac'});
  const card = h('section', {class:'card qcard', style:scs(t.subj)});
  card.append(h('div', {class:'qmeta'}, subjChip(t.subj), h('span', {class:'chip mono'}, (t.code ? t.code + ' · ' : '') + t.title), t.scope && t.scope !== 'actual' ? scopeTag(t.scope) : null));
  if (it.origin) card.append(h('div', {class:'origin'}, 'Origen: ' + it.origin));
  card.append(h('div', {class:'q'}, rich(it.q)));
  let btn;
  if (it.type === 'mc'){
    card.append(h('div', {class:'opts', role:'group', 'aria-label':'Alternativas'}, Q.order.map((k, idx) => {
      let cls = 'opt'; if (Q.checked){ if (k === it.ans) cls += ' right'; else if (k === Q.choice) cls += ' wrong'; }
      return h('button', {class:cls, type:'button', 'aria-pressed':String(Q.choice === k), disabled:Q.checked || null, onclick:() => { Q.choice = k; render(); }}, h('span', {class:'let'}, 'abcdefgh'[idx]), rich(it.opts[k]));
    })));
  } else {
    card.append(h('input', {class:'numin', inputmode:'decimal', placeholder:'Tu respuesta' + (it.unit ? ` (${it.unit})` : ''), value:Q.val, disabled:Q.checked || null, 'aria-label':'Respuesta numérica',
      oninput:e => { Q.val = e.target.value; btn.disabled = !(Q.val.trim() && Q.conf); }, onkeydown:e => { if (e.key === 'Enter' && !btn.disabled) check(); }}));
  }
  if (!Q.checked) card.append(h('div', {class:'conf'}, h('p', null, 'Antes de comprobar: ¿qué tan segura o seguro estás?'),
    h('div', {class:'confrow'}, [['seguro','Seguro'],['medio','Más o menos'],['adivino','Adivinando']].map(([k, l]) => h('button', {class:'seg', type:'button', 'aria-pressed':String(Q.conf === k), onclick:() => { Q.conf = k; render(); }}, l)))));
  const ready = Q.conf && (it.type === 'mc' ? Q.choice != null : Q.val.trim());
  btn = h('button', {class:'btn', type:'button', disabled:!ready || null, onclick:check}, 'Comprobar');
  if (!Q.checked) card.append(h('div', {style:'margin-top:14px'}, btn));
  if (Q.checked){
    const dang = !Q.ok && Q.conf === 'seguro';
    card.append(h('div', {class:'feedback ' + (Q.ok ? 'ok' : 'bad')},
      h('b', null, Q.ok ? (Q.conf === 'adivino' ? 'Correcto… pero adivinaste: cuenta como no sabido.' : 'Correcto.') : dang ? 'Incorrecto, y estabas seguro: error peligroso.' : 'Incorrecto.'),
      it.type === 'num' && !Q.ok ? h('div', null, 'Respuesta: ', h('span', {class:'mono'}, fmtNum(it.ans) + (it.unit ? ' ' + it.unit : ''))) : null,
      it.ex ? h('div', null, rich(it.ex)) : null,
      !(Q.ok && Q.conf !== 'adivino') ? h('div', {class:'tiny', style:'margin-top:6px'}, 'Quedó en tu banco de errores.') : null));
    card.append(h('div', {style:'margin-top:14px;display:flex;gap:8px;flex-wrap:wrap'},
      h('button', {class:'btn', type:'button', onclick:() => { newQ(pickItem(pracFilter, it.id)); render(); }}, 'Siguiente →'),
      h('button', {class:'btn ghost small', type:'button', onclick:() => openLesson(t.id)}, 'Ver clase'),
      h('button', {class:'btn ghost small', type:'button', onclick:() => openItemForm(it.id)}, 'Editar ejercicio')));
  }
  grid.append(card);
  const A = P.attempts;
  grid.append(h('section', null,
    h('div', {class:'card'},
      h('h3', {class:'display', style:'margin:0 0 4px;font-size:1.1rem'}, 'Calibración'),
      h('p', {class:'tiny muted', style:'margin:0 0 12px'}, 'Compara lo seguro que te sientes con lo que realmente aciertas. Saber qué no sabes también es estudiar bien.'),
      h('div', {class:'calib'}, [['seguro','Seguro'],['medio','Más o menos'],['adivino','Adivinando']].map(([k, l]) => {
        const a = A.filter(x => x.conf === k), p = a.length ? Math.round(100 * a.filter(x => x.ok).length / a.length) : null;
        return h('div', {class:'calrow'}, h('span', null, l), h('div', {class:'calbar'}, h('span', {style:`width:${p || 0}%`})), h('span', {class:'mono tiny'}, p == null ? '—' : p + '%'));
      })), calibMsg(A)),
    h('div', {class:'card', style:'margin-top:12px'},
      h('h3', {class:'display', style:'margin:0 0 6px;font-size:1.1rem'}, 'Cómo funciona'),
      h('ul', {class:'tiny', style:'margin:0;padding-left:18px;color:var(--ink-2)'},
        h('li', null, 'Primero eliges tu confianza y después compruebas.'),
        h('li', null, 'Los ejercicios que fallaste vuelven más seguido.'),
        h('li', null, 'Cada ejercicio puede decir su origen (guía, prueba anterior, creado por ti).'),
        h('li', null, `Tienes ${plural(D.items.length, 'ejercicio', 'ejercicios')} en total.`)))));
  v.append(grid);
  function check(){
    let ok;
    if (it.type === 'mc') ok = Q.choice === it.ans;
    else { const n = parseNum(Q.val); const tol = it.tol != null ? it.tol : .01; ok = n != null && Math.abs(n - it.ans) <= tol * Math.max(1, Math.abs(it.ans)); }
    Q.checked = true; Q.ok = ok;
    const effOk = ok && Q.conf !== 'adivino', yours = it.type === 'mc' ? it.opts[Q.choice] : Q.val;
    P.attempts.push({item:it.id, ok, conf:Q.conf, at:iso(TODAY)});
    if (!effOk){
      const ex = P.errors.find(e => e.item === it.id && !e.resolved);
      if (ex){ ex.yours = yours; ex.conf = Q.conf; ex.at = iso(TODAY); ex.times = (ex.times || 1) + 1; }
      else P.errors.push({id:uid('e'), item:it.id, yours, conf:Q.conf, at:iso(TODAY), cause:'', note:'', resolved:false, times:1});
    } else P.errors.filter(e => e.item === it.id && !e.resolved).forEach(e => { e.resolved = true; e.resolvedAt = iso(TODAY); });
    save(); render();
  }
}
function calibMsg(A){
  const s = A.filter(x => x.conf === 'seguro'); if (s.length < 4) return h('p', {class:'tiny muted', style:'margin:12px 0 0'}, 'Responde unos cuantos más para ver tu patrón.');
  const p = s.filter(x => x.ok).length / s.length;
  return h('p', {class:'note', style:'margin-top:12px'}, p < .8 ? `Cuando te sientes seguro aciertas ${Math.round(p * 100)}%. Revisa primero los «errores peligrosos».` : 'Tu seguridad es confiable. Usa «Más o menos» para decidir qué repasar.');
}

/* ---------------- ERRORES ---------------- */
const CAUSES = [['','¿Por qué fallé?'],['concepto','No entendía el concepto'],['procedimiento','Elegí mal el procedimiento'],['algebra','Error de álgebra o aritmética'],['lectura','Leí mal el enunciado'],['descuido','Descuido (signo, unidad)']];
let errFilter = 'abiertos';
/* ---------- Vista: Errores (sección dentro de Práctica) ---------- */
function vErrores(v){
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Banco de errores'), h('span', {class:'hand'}, 'cada error es un ejercicio gratis')));
  v.append(h('div', {class:'filterrow', style:'margin-top:0'}, [['abiertos','Por resolver'],['peligrosos','Peligrosos'],['resueltos','Resueltos']].map(([k, l]) => h('button', {class:'seg', type:'button', 'aria-pressed':String(errFilter === k), onclick:() => { errFilter = k; render(); }}, l))));
  const E = P.errors.filter(e => D.items.some(i => i.id === e.item));
  const list = E.filter(e => errFilter === 'resueltos' ? e.resolved : errFilter === 'peligrosos' ? !e.resolved && e.conf === 'seguro' : !e.resolved).slice().reverse();
  const byCause = {}; E.filter(e => e.cause).forEach(e => byCause[e.cause] = (byCause[e.cause] || 0) + 1);
  const top = Object.entries(byCause).sort((a, b) => b[1] - a[1])[0];
  if (top) v.append(h('p', {class:'note'}, `Tu causa más frecuente: ${CAUSES.find(c => c[0] === top[0])[1].toLowerCase()} (${top[1]}).`));
  if (!list.length) v.append(h('div', {class:'card empty'}, h('span', {class:'hand'}, errFilter === 'resueltos' ? 'Aún nada resuelto' : 'Sin errores aquí'), 'Los errores de la práctica llegan solos. Se resuelven cuando vuelves a acertar el ejercicio sin adivinar.'));
  const wrap = h('div', {class:'errs'});
  list.forEach(e => {
    const it = D.items.find(i => i.id === e.item), t = topic(it.topic); if (!t) return;
    const right = it.type === 'mc' ? it.opts[it.ans] : fmtNum(it.ans) + (it.unit ? ' ' + it.unit : '');
    wrap.append(h('article', {class:`card err ${e.resolved ? 'done' : ''}`, style:scs(t.subj)},
      h('div', {class:'err-top'}, subjChip(t.subj), h('span', {class:'chip mono'}, t.code || t.title), e.conf === 'seguro' && !e.resolved ? h('span', {class:'chip danger'}, 'peligroso') : null, e.times > 1 ? h('span', {class:'chip'}, `×${e.times}`) : null, h('span', {class:'tiny muted'}, fmtD(parse(e.at)))),
      h('div', null, rich(it.q)),
      h('dl', {class:'ans'}, h('dt', null, 'Tu respuesta'), h('dd', null, rich(e.yours || '—')), h('dt', null, 'Correcta'), h('dd', null, rich(right))),
      e.resolved ? h('p', {class:'tiny muted'}, 'Resuelto el ' + fmtD(parse(e.resolvedAt || e.at))) :
      h('div', {class:'err-tools'},
        h('select', {'aria-label':'Causa del error', onchange:ev => { e.cause = ev.target.value; save(); }}, CAUSES.map(([k, l]) => { const o = h('option', {value:k}, l); if (e.cause === k) o.selected = true; return o; })),
        h('input', {placeholder:'Qué haré distinto la próxima vez', value:e.note || '', 'aria-label':'Nota', onchange:ev => { e.note = ev.target.value; save(); }}),
        h('button', {class:'btn small', type:'button', onclick:() => { pracFilter = it.topic; newQ(it); pracSec = 'ejercicios'; render(); window.scrollTo({top:0}); }}, 'Reintentar'))));
  });
  v.append(wrap);
}

/* ---------------- CALENDARIO ---------------- */
let calView = (window.innerWidth < 640 ? 'agenda' : 'mes'), calMonth = null, calOff = {};
const evOn = e => !calOff[e.subj];
const evWhen = e => e.time || e.slot || 'Todo el día';
function eventsOn(k){ return D.events.filter(e => e.date === k && evOn(e)); }
function whenTxt(e){ const d = diffDays(TODAY, parse(e.date)); return (d === 0 ? 'hoy' : d === 1 ? 'mañana' : d < 0 ? `hace ${-d} días` : `en ${d} días`) + (e.time ? ' · ' + e.time : e.slot ? ' · ' + e.slot.toLowerCase() : ''); }
function eventRow(e, compact){
  return h('div', {class:`evrow ${parse(e.date) < TODAY ? 'past' : ''}`, style:scs(e.subj)},
    h('div', {class:'evdate'}, h('b', null, parse(e.date).getDate()), h('small', null, DIAS[parse(e.date).getDay()].slice(0, 3) + ' ' + MESES[parse(e.date).getMonth()])),
    h('div', {style:'min-width:0'},
      h('div', {class:'evtop'}, kindChip(e), subjChip(e.subj), verBadge(e)),
      h('div', {class:'evname'}, `${S(e.subj).short} · ${e.name}`),
      h('div', {class:'tiny muted'}, whenTxt(e)),
      !compact && e.src ? h('div', {class:'tiny', style:'color:var(--ink-3);margin-top:2px'}, 'Fuente: ' + e.src) : null,
      e.note ? h('div', {class:'tiny note', style:'margin:4px 0 0'}, e.note) : null,
      compact ? null : h('div', {style:'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px'},
        ['prueba', 'control', 'examen'].includes(e.kind) && parse(e.date) >= TODAY ? h('button', {class:'btn small', type:'button', onclick:() => openEvalStudy(e.id)}, '🎯 Estudiar para esta') : null,
        h('button', {class:'btn ghost small', type:'button', onclick:() => openEventForm(e.id)}, 'Editar'))));
}
/* ---------- Vista: Calendario ---------- */
function vCal(v){
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Calendario'), h('span', {class:'hand'}, 'evaluaciones y qué estudiar cada día')));
  v.append(planCard());
  v.append(h('div', {class:'calbar-top'},
    h('div', {class:'viewsw', role:'group', 'aria-label':'Vista'}, [['mes','Mes'],['agenda','Agenda']].map(([k, l]) => h('button', {class:'seg', type:'button', 'aria-pressed':String(calView === k), onclick:() => { calView = k; render(); }}, l))),
    h('div', {class:'filters', role:'group', 'aria-label':'Materias'}, D.subjects.map(s => h('button', {class:'seg', type:'button', style:scs(s.id), 'aria-pressed':String(!calOff[s.id]), onclick:() => { calOff[s.id] = !calOff[s.id]; render(); }}, h('span', {class:'dot', style:'background:var(--sc)'}), s.short))),
    h('div', {style:'display:flex;gap:6px;flex-wrap:wrap'},
      h('button', {class:'btn ghost small', type:'button', onclick:() => openEventForm(null)}, '+ Evento'),
      h('button', {class:'btn small', type:'button', onclick:exportICS}, '⇩ Evaluaciones (.ics)'),
      h('button', {class:'btn ghost small', type:'button', onclick:exportCSV, title:'Formato CSV de Google Calendar'}, 'CSV'))));
  if (calView === 'mes') vMonth(v); else vAgenda(v);
  v.append(h('div', {class:'legend', style:'margin:12px 0 0'}, Object.entries(KIND).filter(([k]) => k !== 'otro').map(([k, o]) => h('span', null, h('span', {class:`kchip k-${k}`}, o.i + ' ' + o.l))),
    planCfg().on ? h('span', null, h('span', {class:'mp', style:'--sc:var(--ink-3)'}, '▤ C01'), ' clase del plan') : null,
    h('span', null, h('span', {class:'ver ok'}, '✓'), ' confirmada'), h('span', null, h('span', {class:'ver no'}, '⚠'), ' sin confirmar')));
  const und = D.events.filter(e => !e.date && evOn(e));
  if (und.length) v.append(h('div', {class:'card', style:'margin-top:14px'}, h('b', null, 'Sin fecha todavía'), und.map(e => h('div', {class:'tiny', style:'margin-top:6px'}, kindChip(e), ' ', `${S(e.subj).short} · ${e.name}${e.note ? ' — ' + e.note : ''}`))));
  v.append(h('p', {class:'note'}, planCfg().on ? 'Los archivos .ics se importan en Google Calendar, Apple Calendar u Outlook.' : 'Los archivos .ics se importan en Google Calendar, Apple Calendar u Outlook. Las barras de color de cada día sugieren en qué materia enfocarte; arma tu plan arriba para ver las clases de cada día.'));
}
function vMonth(v){
  if (!calMonth) calMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  v.append(h('div', {class:'monthnav'},
    h('button', {class:'iconbtn', type:'button', 'aria-label':'Mes anterior', onclick:() => { calMonth = new Date(y, m - 1, 1); render(); }}, '‹'),
    h('h3', {class:'display', style:'margin:0;font-size:1.25rem'}, `${cap(MES_L[m])} ${y}`),
    h('button', {class:'iconbtn', type:'button', 'aria-label':'Mes siguiente', onclick:() => { calMonth = new Date(y, m + 1, 1); render(); }}, '›'),
    h('button', {class:'btn ghost small', type:'button', onclick:() => { calMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); selDay = iso(TODAY); render(); }}, 'Hoy')));
  const first = new Date(y, m, 1), start = addDays(first, -((first.getDay() + 6) % 7));
  const lastDay = new Date(y, m + 1, 0), end = addDays(lastDay, 6 - ((lastDay.getDay() + 6) % 7));
  const lastEval = lastEvalDate();
  const g = h('div', {class:'mgrid'}, ['lun','mar','mié','jue','vie','sáb','dom'].map(x => h('div', {class:'dow'}, x)));
  if (!selDay) selDay = iso(TODAY);
  for (let d = new Date(start); d <= end; d = addDays(d, 1)){
    const k = iso(d), out = d.getMonth() !== m, past = d < TODAY, evs = eventsOn(k), sug = daySuggest(d);
    const pl = past ? [] : planOn(k).filter(x => !calOff[x.rev ? x.subj : x.t.subj]);
    const bar = (!past && d <= lastEval && !planCfg().on) ? sug.next.filter(b => !calOff[b.s]).slice(0, 2) : [];
    g.append(h('button', {class:`mday ${out ? 'out' : ''} ${past ? 'past' : ''} ${k === iso(TODAY) ? 'today' : ''} ${selDay === k ? 'sel' : ''}`, type:'button',
        'aria-label':`${fmtD(d)}${evs.length ? ', ' + evs.length + ' evento(s)' : ''}`, onclick:() => { selDay = k; render(); }},
      h('span', {class:'mnum'}, d.getDate()),
      P.dayLoad[k] && P.dayLoad[k].hours ? h('span', {class:'dl-badge', title:`${P.dayLoad[k].hours}h planificadas`}, `${P.dayLoad[k].hours}h`) : null,
      P.days[k] ? h('span', {class:'tick', 'aria-label':'hecho'}, '✓') : null,
      h('span', {class:'mevs'}, evs.map(e => h('span', {class:`mev k-${e.kind} ${e.ver ? '' : 'unver'}`, style:scs(e.subj), title:`${S(e.subj).short} · ${e.name} · ${evWhen(e)}`},
        h('span', {class:'mev-t'}, `${(KIND[e.kind] || KIND.otro).i} ${e.time ? e.time.slice(0, 5) + ' ' : ''}${S(e.subj).short} ${e.name}`)))),
      pl.length ? h('span', {class:'mplan'}, pl.slice(0, 3).map(x => h('span', {class:'mp' + (x.done ? ' done' : '') + (x.rev ? ' rev' : ''), style:scs(x.rev ? x.subj : x.t.subj), title:planLbl(x)}, x.rev ? '↻ repaso' : `${x.done ? '✓' : '▤'} ${x.t.code || x.t.title}`)), pl.length > 3 ? h('span', {class:'mp more'}, `+${pl.length - 3}`) : null) : null,
      bar.length ? h('span', {class:'focusbar', title:'Foco sugerido'}, bar.map((b, i) => h('span', {style:`width:${i ? 35 : 65}%;background:var(--c-${S(b.s).color})`}))) : null));
  }
  v.append(h('div', {class:'card', style:'padding:10px;margin-top:10px'}, g));
  dayDetail(v);
}
function dayLoadFor(k){ return P.dayLoad[k] || {hours:0, blocks:[]}; }
function saveDayLoad(k, dl){ if (!dl.hours && !dl.blocks.length) delete P.dayLoad[k]; else P.dayLoad[k] = dl; save(); }
function dayLoadEditor(k){
  const dl = dayLoadFor(k);
  const wrap = h('div', {class:'dayload-ed'});
  const hrIn = h('input', {type:'number', class:'dl-hrs', min:0, max:16, step:0.5, value:dl.hours || '', placeholder:'0',
    'aria-label':'Horas disponibles', onchange:() => { dl.hours = Math.max(0, Math.min(16, parseFloat(hrIn.value) || 0)); saveDayLoad(k, dl); render(); }});
  wrap.append(h('div', {class:'dl-top'}, h('label', {class:'dl-lbl'}, 'Horas disponibles'), hrIn));
  if (dl.hours > 0){
    const total = dl.blocks.reduce((s, b) => s + (b.hours || 0), 0);
    const free = Math.max(0, dl.hours - total);
    const bWrap = h('div', {class:'dl-blocks'});
    dl.blocks.forEach((b, i) => {
      const sub = S(b.subj);
      bWrap.append(h('div', {class:'dl-block', style:scs(b.subj)},
        h('span', {class:'dl-subj'}, sub.short),
        h('input', {type:'number', class:'dl-bhrs', min:0, max:dl.hours, step:0.5, value:b.hours || '',
          'aria-label':`Horas ${sub.short}`,
          onchange:ev => { b.hours = Math.max(0, parseFloat(ev.target.value) || 0); saveDayLoad(k, dl); render(); }}),
        h('span', {class:'tiny muted'}, 'h'),
        h('button', {class:'iconbtn dl-rm', type:'button', title:'Quitar', onclick:() => { dl.blocks.splice(i, 1); saveDayLoad(k, dl); render(); }}, '×')));
    });
    // bar visual
    if (dl.blocks.length){
      const barEl = h('div', {class:'dl-bar'});
      dl.blocks.forEach(b => { if (b.hours > 0) barEl.append(h('span', {class:'dl-seg', style:`width:${(b.hours / dl.hours * 100).toFixed(1)}%;background:var(--c-${S(b.subj).color})`, title:`${S(b.subj).short}: ${b.hours}h`})); });
      if (free > 0) barEl.append(h('span', {class:'dl-seg dl-free', style:`width:${(free / dl.hours * 100).toFixed(1)}%`, title:`Libre: ${free}h`}));
      bWrap.append(barEl);
      bWrap.append(h('div', {class:'dl-summary tiny muted'}, `${total}h asignadas · ${free}h libres`));
    }
    wrap.append(bWrap);
    // add subject button
    const used = new Set(dl.blocks.map(b => b.subj));
    const avail = D.subjects.filter(s => !used.has(s.id));
    if (avail.length) wrap.append(h('div', {class:'dl-add'},
      h('select', {class:'dl-sel', 'aria-label':'Agregar materia', onchange:ev => {
        if (!ev.target.value) return;
        dl.blocks.push({subj:ev.target.value, hours:1});
        saveDayLoad(k, dl); render();
      }}, h('option', {value:''}, '+ Agregar materia…'), avail.map(s => h('option', {value:s.id}, s.short)))));
  }
  return wrap;
}
function dayDetail(v){
  const sd = parse(selDay), evs = eventsOn(selDay), sug = daySuggest(sd), lastEval = lastEvalDate();
  v.append(h('section', {class:'card daydetail'},
    h('h3', {class:'display', style:'margin:0 0 8px;font-size:1.2rem'}, cap(fmtD(sd))),
    evs.length ? h('div', {class:'evlist'}, evs.map(e => eventRow(e))) : h('p', {class:'muted tiny', style:'margin:0 0 8px'}, 'Sin evaluaciones ni entregas este día.'),
    sd >= TODAY && planOn(selDay).length ? h('div', {class:'dd-plan'}, h('b', {class:'tiny', style:'text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3)'}, 'Tu plan para este día'), h('div', {class:'plist'}, planOn(selDay).map(planRow))) : null,
    sd >= TODAY && planCfg().on && !planOn(selDay).length ? h('p', {class:'tiny muted'}, 'Sin clases del plan este día.') : null,
    sd >= TODAY && sd <= lastEval && sug.tips.length && !planCfg().on ? h('div', null, h('b', {class:'tiny', style:'text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3)'}, 'Foco de estudio sugerido'),
      h('ul', {style:'margin:4px 0 12px;padding-left:18px'}, sug.tips.map(x => h('li', null, x)))) : null,
    sd >= TODAY ? h('details', {class:'dl-wrap', open:(P.dayLoad[selDay] && P.dayLoad[selDay].hours) || null}, h('summary', {class:'tiny'}, planCfg().on ? 'Cambiar las horas de este día' : 'Horas disponibles este día'), dayLoadEditor(selDay)) : null,
    h('div', {style:'display:flex;gap:12px;flex-wrap:wrap;align-items:center'},
      sd >= TODAY ? h('label', {class:'chk'}, h('input', {type:'checkbox', checked:P.days[selDay] || null, onchange:e => { if (e.target.checked) P.days[selDay] = true; else delete P.days[selDay]; save(); render(); }}), 'Cumplí el plan de este día') : null,
      h('button', {class:'btn ghost small', type:'button', onclick:() => openEventForm(null, selDay)}, '+ Evento este día'))));
}
function vAgenda(v){
  const from = addDays(TODAY, -((TODAY.getDay() + 6) % 7));
  const evs = D.events.filter(e => e.date && evOn(e) && parse(e.date) >= from).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  /* Cada día: primero sus evaluaciones y entregas, después las clases del plan (si hay plan). */
  const p = buildPlan(), keys = new Set(evs.map(e => e.date));
  if (p) Object.keys(p.days).forEach(k => keys.add(k));
  if (!keys.size){ v.append(h('div', {class:'card empty empty-cta', style:'margin-top:14px'}, 'No hay eventos próximos.', h('button', {class:'btn small', type:'button', onclick:() => openEventForm(null)}, '+ Agregar evento'))); return; }
  let wk = null, box = null; const wrap = h('div', {class:'agenda'});
  [...keys].sort().forEach(k => {
    const d = parse(k), ws = iso(addDays(d, -((d.getDay() + 6) % 7)));
    if (ws !== wk){ wk = ws; const wd = parse(ws), rel = diffDays(from, wd) / 7;
      box = h('div', {class:'agweek'}, h('div', {class:'agwh'}, rel === 0 ? 'Esta semana' : rel === 1 ? 'Próxima semana' : `Semana del ${wd.getDate()} de ${MES_L[wd.getMonth()]}`)); wrap.append(box); }
    evs.filter(e => e.date === k).forEach(e => box.append(eventRow(e)));
    const pl = (p && p.days[k] || []).filter(x => !calOff[x.rev ? x.subj : x.t.subj]);
    if (pl.length) box.append(h('div', {class:'agplan'}, h('div', {class:'tiny agp-d'}, `${k === iso(TODAY) ? 'Hoy' : cap(fmtD(d))} · plan`), h('div', {class:'plist'}, pl.map(planRow))));
  });
  v.append(wrap);
}
/* ---------- Plan de estudio automático (Calendario) ----------
   Reparte las clases pendientes de cada materia en los días que quedan hasta cada evaluación, en el orden del
   curso (desde la primera clase). Se recalcula desde hoy con tu estado actual: lo que marcas Practicado o
   Dominado sale del plan (si lo marcaste hoy, se muestra hecho) y lo demás se reacomoda. Ajustes en D.plan.
   Las horas de un día editadas en «Horas disponibles» (P.dayLoad) mandan sobre las horas por día del plan. */
const PLAN_DEF = {on:false, start:'hoy', before:7, hours:2, minPer:60, days:[1, 2, 3, 4, 5, 6, 0]};
function planCfg(){
  const p = isObj(D.plan) ? D.plan : {}, n = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  const days = Array.isArray(p.days) ? p.days.map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 6) : PLAN_DEF.days;
  return {on:p.on === true, start:p.start === 'antes' ? 'antes' : 'hoy', before:Math.round(n(p.before, 1, 60, 7)), hours:n(p.hours, .5, 12, 2), minPer:Math.round(n(p.minPer, 20, 240, 60)), days:days.length ? [...new Set(days)] : PLAN_DEF.days};
}
const doneOn = t => ['practicado', 'dominado'].includes(st(t.id)) ? (P.status[t.id] && P.status[t.id].at) || '' : null;
let planCache = null;
function buildPlan(){
  const c = planCfg(); if (!c.on) return null;
  const key = JSON.stringify([c, iso(TODAY), D.topics.map(t => [t.id, t.subj, t.exam || '', doneOn(t)]), D.events.map(e => [e.id, e.date, e.kind, e.subj, e.topics || []]), P.dayLoad]);
  if (planCache && planCache.key === key) return planCache.plan;
  const evAll = exams().filter(e => parse(e.date) >= TODAY), bySubj = {}, queues = {};
  D.subjects.forEach(sb => { bySubj[sb.id] = evAll.filter(e => e.subj === sb.id); });
  const general = (sid, after) => bySubj[sid].find(x => parse(x.date) > after && !(x.topics && x.topics.length));
  const target = (t, list) => (t.exam && list.find(x => x.id === t.exam)) || list.find(x => (x.topics || []).includes(t.id)) || list.find(x => !(x.topics && x.topics.length));
  D.subjects.forEach(sb => {
    const list = bySubj[sb.id]; if (!list.length) return;
    const q = topicsOf(sb.id).map((t, i) => ({t, i, e:target(t, list), done:doneOn(t)}))
      .filter(x => x.e && (x.done == null || x.done === iso(TODAY)));
    q.sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i);
    if (q.length) queues[sb.id] = q;
  });
  const plan = {cfg:c, days:{}, late:[], left:[], total:0};
  const last = evAll.length ? parse(evAll.at(-1).date) : null;
  if (last){
    const minutes = d => { const dl = P.dayLoad[iso(d)]; if (dl && dl.hours) return dl.hours * 60; return c.days.includes(d.getDay()) ? c.hours * 60 : 0; };
    for (let d = new Date(TODAY); d < last; d = addDays(d, 1)){
      const k = iso(d), m = minutes(d); let slots = m > 0 ? Math.max(1, Math.round(m / c.minPer)) : 0;
      const out = [];
      /* La víspera de cada evaluación: repaso y ensayo, no materia nueva de esa asignatura. */
      evAll.filter(e => diffDays(d, parse(e.date)) === 1).forEach(e => { if (slots > 0){ out.push({rev:true, subj:e.subj, e}); slots--; } });
      for (const sid in queues){
        const q = queues[sid]; let moved = false;
        for (const it of q) if (parse(it.e.date) <= d){
          const nx = general(sid, d);
          if (d > TODAY) plan.late.push({t:it.t, e:it.e, to:nx || null}); // si la evaluación es hoy no hubo días para planificar
          if (nx) it.e = nx; else it.drop = true; moved = true;
        }
        if (moved){ queues[sid] = q.filter(x => !x.drop).sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i); }
      }
      /* Cada cupo va a la materia más apurada: clases que le faltan para su evaluación ÷ días que quedan
         (sin contar la víspera). Si ya tiene una clase ese día, pesa la mitad: así las materias se alternan. */
      while (slots > 0){
        let best = null, bestScore = -1;
        for (const sid in queues){
          const q = queues[sid], it = q[0]; if (!it) continue;
          const left = diffDays(d, parse(it.e.date));
          if (left <= 1 && out.some(x => x.rev && x.subj === sid)) continue;
          if (c.start === 'antes' && left > c.before) continue;
          let score = q.filter(x => x.e.date === it.e.date).length / Math.max(1, left - 1);
          if (out.some(x => !x.rev && x.t.subj === sid)) score *= .5;
          if (score > bestScore){ best = it; bestScore = score; }
        }
        if (!best) break;
        queues[best.t.subj].shift(); out.push({t:best.t, e:best.e, done:best.done === iso(TODAY)}); slots--; plan.total++;
      }
      if (out.length) plan.days[k] = out;
    }
  }
  for (const sid in queues) queues[sid].forEach(it => plan.left.push({t:it.t, e:it.e}));
  planCache = {key, plan};
  return plan;
}
const planOn = k => { const p = buildPlan(); return p ? p.days[k] || [] : []; };
const planLbl = x => x.rev ? `Repaso · ${S(x.subj).short} ${x.e.name}` : (x.t.code ? x.t.code + ' · ' : '') + x.t.title;
function planRow(x){
  if (x.rev) return h('div', {class:'prow rev', style:scs(x.subj)},
    h('span', {class:'pdot'}), h('div', {style:'min-width:0;flex:1'}, h('b', null, `Repaso y ensayo · ${S(x.subj).short}`), h('div', {class:'tiny muted'}, `Mañana es ${x.e.name}: fórmulas, errores y ejercicios mixtos. Nada nuevo.`)),
    h('button', {class:'btn ghost small', type:'button', onclick:() => { pracFilter = x.subj; Q = null; go('practica'); }}, 'Practicar'));
  const t = x.t, s = st(t.id);
  return h('div', {class:'prow' + (x.done ? ' done' : ''), style:scs(t.subj)},
    h('span', {class:'pdot'}),
    h('div', {style:'min-width:0;flex:1'}, h('b', null, (x.done ? '✓ ' : '') + planLbl(x)),
      h('div', {class:'tiny muted'}, `${S(t.subj).short} · para ${x.e.name} (${fmtD(parse(x.e.date))}) · ${SL[s]}`)),
    h('button', {class:'btn ghost small', type:'button', onclick:() => openLesson(t.id)}, 'Abrir clase'));
}
/* Tarjeta del Calendario: pregunta cuánto quieres estudiar y arma el plan. */
let planEdit = false;
function planCard(){
  const c = planCfg(), p = buildPlan();
  if (c.on && !planEdit){
    const nDays = Object.keys(p.days).length, lateNow = p.late.filter((x, i, a) => a.findIndex(y => y.t.id === x.t.id) === i);
    return h('section', {class:'card plancard on'},
      h('div', {class:'pc-head'},
        h('div', null, h('h3', null, 'Tu plan de estudio'),
          h('p', {class:'tiny muted', style:'margin:2px 0 0'}, `${c.start === 'hoy' ? 'Desde hoy' : `Desde ${plural(c.before, 'día', 'días')} antes de cada evaluación`} · ${String(c.hours).replace('.', ',')} h por día · ${c.minPer} min por clase · ${plural(p.total, 'clase agendada', 'clases agendadas')} en ${plural(nDays, 'día', 'días')}.`)),
        h('div', {style:'display:flex;gap:6px;flex-wrap:wrap'},
          h('button', {class:'btn ghost small', type:'button', onclick:() => { planEdit = true; render(); }}, 'Ajustar'),
          h('button', {class:'btn ghost small', type:'button', onclick:exportPlanICS}, '⇩ Plan (.ics)'))),
      lateNow.length ? h('div', {class:'pc-warn'}, h('b', null, `No alcanza el tiempo para ${plural(lateNow.length, 'clase', 'clases')} antes de su evaluación.`),
        lateNow.some(x => x.to) ? h('div', null, 'Pasan a la evaluación siguiente: ', lateNow.filter(x => x.to).map(x => `${S(x.t.subj).short} ${x.t.code || x.t.title} (${x.to.name})`).join(', '), '.') : null,
        lateNow.some(x => !x.to) ? h('div', null, 'Quedan fuera del plan: ', lateNow.filter(x => !x.to).map(x => `${S(x.t.subj).short} ${x.t.code || x.t.title}`).join(', '), '.') : null,
        h('div', null, 'Sube las horas por día, agrega días o empieza antes.')) : null,
      !p.total && !p.late.length ? h('div', {class:'pc-warn'}, h('b', null, 'No hay clases para agendar.'),
        h('div', null, !exams().some(e => parse(e.date) >= TODAY) ? 'Para armar el plan necesito pruebas, controles o exámenes con fecha. Agrégalos con «+ Evento» o en Editar.' : 'Las materias con evaluaciones próximas no tienen clases pendientes. Crea clases en «Clases → Crear clases con mi material».')) : null,
      p.left.length ? h('div', {class:'pc-warn'}, `${plural(p.left.length, 'clase quedó', 'clases quedaron')} sin día: `, p.left.slice(0, 4).map(x => x.t.code || x.t.title).join(', '), p.left.length > 4 ? '…' : '', '. Sube las horas o agrega días de estudio.') : null,
      h('p', {class:'tiny muted', style:'margin:10px 0 0'}, 'Se reacomoda solo: cuando marcas una clase como Practicado o Dominado, sale del plan y lo demás avanza. La víspera de cada evaluación queda para repaso.'));
  }
  const f = {...c};
  const num = (k, min, max, step, w) => h('input', {type:'number', min, max, step, value:f[k], style:`width:${w || 76}px`, 'aria-label':k, onchange:e => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (Number.isFinite(v)) f[k] = Math.max(min, Math.min(max, v)); }});
  const DL = [[1, 'L'], [2, 'M'], [3, 'M'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];
  const daysRow = h('div', {class:'viewsw', role:'group', 'aria-label':'Días de estudio'}, DL.map(([d, l]) => {
    const b = h('button', {class:'seg', type:'button', 'aria-pressed':String(f.days.includes(d)), 'aria-label':DIAS[d]}, l);
    b.onclick = () => { f.days = f.days.includes(d) ? f.days.filter(x => x !== d) : f.days.concat(d); b.setAttribute('aria-pressed', String(f.days.includes(d))); };
    return b;
  }));
  const radio = (val, ...label) => h('label', {class:'chk'}, h('input', {type:'radio', name:'plan-start', checked:f.start === val || null, onchange:() => { f.start = val; }}), ...label);
  return h('section', {class:'card plancard'},
    h('h3', null, '¿Cuánto quieres estudiar?'),
    h('p', {class:'tiny muted', style:'margin:2px 0 12px'}, 'Dime cuándo empezar y cuántas horas al día. Pongo en el calendario las clases de cada día, en orden desde el inicio de cada materia, hasta cada evaluación.'),
    h('div', {class:'pc-form'},
      h('div', {class:'pc-field'}, h('b', {class:'tiny'}, 'Empezar'), radio('hoy', 'Desde hoy'), radio('antes', num('before', 1, 60, 1, 64), h('span', null, 'días antes de cada evaluación'))),
      h('div', {class:'pc-field'}, h('b', {class:'tiny'}, 'Horas por día'), h('label', {class:'chk'}, num('hours', 0.5, 12, 0.5), ' h')),
      h('div', {class:'pc-field'}, h('b', {class:'tiny'}, 'Minutos por clase'), h('label', {class:'chk'}, num('minPer', 20, 240, 5), ' min'), h('span', {class:'tiny muted'}, 'Incluye leer, ejercicios y errores.')),
      h('div', {class:'pc-field'}, h('b', {class:'tiny'}, 'Días que estudias'), daysRow)),
    h('div', {style:'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px'},
      h('button', {class:'btn', type:'button', onclick:() => { if (!f.days.length){ toast('Elige al menos un día'); return; } D.plan = {...f, on:true}; planEdit = false; save(); render(); const pp = buildPlan(); toast(pp.total ? `Plan listo: ${plural(pp.total, 'clase', 'clases')} en el calendario` : 'Plan guardado. No hay clases pendientes con evaluación por delante.', 4000); }}, c.on ? 'Guardar cambios' : 'Armar mi plan'),
      c.on ? h('button', {class:'btn ghost', type:'button', onclick:() => { planEdit = false; render(); }}, 'Cancelar') : null,
      c.on ? h('button', {class:'btn ghost', type:'button', onclick:() => { D.plan = {...c, on:false}; planEdit = false; save(); render(); toast('Plan quitado del calendario'); }}, 'Quitar plan') : null));
}
/* «Ahora»: lo que el plan dice para hoy. */
function todayPlanCard(){
  const items = planOn(iso(TODAY)); if (!planCfg().on || !items.length) return null;
  const done = items.filter(x => x.done).length;
  return h('section', {class:'card plancard today'},
    h('div', {class:'pc-head'}, h('h3', null, `Hoy en tu plan · ${done}/${items.length}`), h('button', {class:'btn ghost small', type:'button', onclick:() => { calView = 'mes'; selDay = iso(TODAY); go('cal'); }}, 'Ver calendario')),
    h('div', {class:'plist'}, items.map(planRow)));
}
function exportPlanICS(){
  const p = buildPlan(); if (!p || !p.total){ toast('No hay clases en el plan'); return; }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), ymd = s => s.replace(/-/g, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CalculAi//Plan//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:CalculAi — plan de estudio'];
  Object.entries(p.days).forEach(([k, xs]) => {
    L.push('BEGIN:VEVENT', `UID:plan-${k}@calculai`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(k)}`, `DTEND;VALUE=DATE:${ymd(iso(addDays(parse(k), 1)))}`,
      icsFold(`SUMMARY:${icsEsc('Estudiar: ' + xs.map(x => x.rev ? 'repaso ' + S(x.subj).short : (x.t.code || x.t.title)).join(', '))}`),
      icsFold(`DESCRIPTION:${icsEsc(xs.map(x => '• ' + (x.rev ? `Repaso y ensayo ${S(x.subj).short} (mañana ${x.e.name})` : `${S(x.t.subj).short} · ${planLbl(x)} — para ${x.e.name}`)).join('\n'))}`), 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  download('calculai-plan.ics', L.join('\r\n') + '\r\n', 'text/calendar');
  toast('Plan descargado. En Google Calendar: Configuración → Importar');
}
/* Exportación */
function download(filename, text, type){
  const blob = new Blob([text], {type}); const url = URL.createObjectURL(blob);
  const a = h('a', {href:url, download:filename, style:'display:none'}); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
function evTimes(e){
  const t = (e.time || '').match(/\d{1,2}:\d{2}/g); if (!t) return null;
  const toMin = s => { const [H, M] = s.split(':').map(Number); return H * 60 + M; };
  let s = toMin(t[0]), en = t[1] ? toMin(t[1]) : null;
  if (en == null){ if (e.kind === 'entrega'){ en = s; s = s - 30; } else en = s + 90; }
  return {s, en};
}
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function icsFold(line){ const out = []; let l = line; while (l.length > 74){ out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); }
function evDesc(e){ return `${(KIND[e.kind] || KIND.otro).l} · ${S(e.subj).name}${S(e.subj).code ? ' (' + S(e.subj).code + ')' : ''}. ${e.ver ? 'Fecha confirmada' : 'Fecha SIN confirmar'}${e.src ? ' — ' + e.src : ''}.${e.slot ? ' Horario: ' + e.slot + '.' : ''}${e.note ? ' ' + e.note : ''}`; }
function exportICS(){
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ymd = s => s.replace(/-/g, '');
  const hm = m => pad(Math.floor(m / 60)) + pad(m % 60) + '00';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CalculAi//Estudio//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:CalculAi — evaluaciones'];
  D.events.filter(e => e.date && evOn(e)).forEach(e => {
    L.push('BEGIN:VEVENT', `UID:${e.id}@calculai`, `DTSTAMP:${stamp}`);
    const tt = evTimes(e);
    if (tt){ L.push(`DTSTART:${ymd(e.date)}T${hm(tt.s)}`, `DTEND:${ymd(e.date)}T${hm(tt.en)}`); }
    else { L.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(iso(addDays(parse(e.date), 1)))}`); }
    L.push(icsFold(`SUMMARY:${icsEsc(`[${S(e.subj).short}] ${e.name}`)}`), icsFold(`DESCRIPTION:${icsEsc(evDesc(e))}`));
    if (['prueba', 'control', 'examen', 'entrega', 'proyecto'].includes(e.kind)) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.name)}`, 'TRIGGER:-P1D', 'END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  download('calculai-evaluaciones.ics', L.join('\r\n') + '\r\n', 'text/calendar');
  toast('Descargado. En Google Calendar: Configuración → Importar');
}
function exportCSV(){
  const cell = s => { s = String(s ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const ampm = m => { let H = Math.floor(m / 60), M = m % 60; const ap = H >= 12 ? 'PM' : 'AM'; H = H % 12 || 12; return `${H}:${pad(M)} ${ap}`; };
  const rows = [['Subject','Start Date','Start Time','End Date','End Time','All Day Event','Description','Location','Private']];
  D.events.filter(e => e.date && evOn(e)).forEach(e => {
    const [Y, Mo, Dd] = e.date.split('-'), date = `${Mo}/${Dd}/${Y}`, tt = evTimes(e);
    rows.push([`[${S(e.subj).short}] ${e.name}`, date, tt ? ampm(tt.s) : '', date, tt ? ampm(tt.en) : '', tt ? 'False' : 'True', evDesc(e), '', 'True']);
  });
  download('calculai-evaluaciones.csv', rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n', 'text/csv');
  toast('CSV descargado');
}

/* ---------------- BIBLIOTECA ---------------- */
const LIBRARY = [
  {area:'Cálculo', t:'Active Calculus — Single Variable (2.ª ed.)', lic:'CC BY-SA 4.0', ai:'ok', n:'Inglés; versión en español «Cálculo activo» en LibreTexts.', u:'https://activecalculus.org/'},
  {area:'Cálculo', t:'CLP-1 y CLP-2 (UBC) + libros de problemas', lic:'CC BY-NC-SA 4.0', ai:'ok', n:'Pistas, respuestas y soluciones completas.', u:'https://personal.math.ubc.ca/~CLP/'},
  {area:'Cálculo', t:'APEX Calculus', lic:'CC BY-NC 4.0', ai:'ok', n:'Respuestas a ejercicios impares.', u:'https://opentext.uleth.ca/calculus.html'},
  {area:'Cálculo', t:'Strang, Calculus (MIT OCW)', lic:'CC BY-NC-SA 4.0', ai:'cond', n:'Material de MIT OpenCourseWare.', u:'https://ocw.mit.edu/'},
  {area:'Álgebra lineal', t:'Elementos de álgebra lineal para ingenieros (UPM, 2025)', lic:'CC BY 4.0', ai:'ok', n:'Escrito en español.', u:'https://oa.upm.es/90391/'},
  {area:'Álgebra lineal', t:'Kuttler, A First Course in Linear Algebra (Lyryx)', lic:'CC BY 4.0', ai:'ok', n:'Versión en español en LibreTexts.', u:'https://lyryx.com/first-course-linear-algebra/'},
  {area:'Álgebra lineal', t:'Nicholson, Linear Algebra with Applications (Lyryx)', lic:'CC BY-NC-SA 4.0', ai:'ok', n:'Cobertura amplia; incluye cadenas de Markov (§2.9).', u:'https://lyryx.com/linear-algebra-applications/'},
  {area:'Álgebra lineal', t:'Interactive Linear Algebra (Georgia Tech)', lic:'GFDL 1.2+', ai:'ok', n:'Versión en español en LibreTexts.', u:'https://textbooks.math.gatech.edu/ila/'},
  {area:'Física', t:'Crowell, Light and Matter', lic:'CC BY-SA 3.0', ai:'ok', n:'Serie completa de física introductoria.', u:'https://www.lightandmatter.com/'},
  {area:'Física', t:'MIT OCW 8.01SC Classical Mechanics', lic:'CC BY-NC-SA 4.0', ai:'cond', n:'Videos y notas por semana (Dourmashkin).', u:'https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/'}
];
/* ---------- Vista: Biblioteca ---------- */
function vBiblio(v){
  const news = (D.news || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (news.length){
    v.append(h('div', {class:'sec-title'}, h('h2', null, 'Avisos y correos'), h('span', {class:'hand'}, D.sync && D.sync.webc ? 'WebC revisado ' + agoMin(D.sync.webc.at) : '')));
    v.append(h('div', {class:'newslist'}, news.slice(0, 40).map(n => h('details', {class:'news', style:n.subj ? scs(n.subj) : '', ontoggle:e => { if (e.target.open && n.fresh){ delete n.fresh; save(); } }}, h('summary', null, n.subj ? subjChip(n.subj) : h('span', {class:'chip'}, 'Sin materia'), h('span', {class:'chip ib-src'}, n.src === 'outlook' ? '✉ Outlook' : '⟳ WebC'), n.fresh ? h('span', {class:'chip new-chip'}, 'nuevo') : null, h('b', null, n.title), h('small', {class:'muted'}, [n.author, n.date ? fmtD(parse(n.date)) : ''].filter(Boolean).join(' · '))),
      h('div', {class:'newsbody'}, n.text), n.url ? h('a', {class:'tiny', href:n.url, target:'_blank', rel:'noopener'}, n.src === 'outlook' ? 'Abrir en Outlook ↗' : 'Ver en WebC ↗') : null))));
  }
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Tu material'), h('span', {class:'hand'}, 'lo del curso manda')));
  D.subjects.forEach(s => {
    const ts = topicsOf(s.id).filter(t => t.url || hasLesson(t)), rs = D.resources.filter(r => r.subj === s.id);
    v.append(h('h3', {class:'display', style:'margin:18px 0 0;font-size:1rem;color:var(--ink-2)'}, s.name));
    if (!ts.length && !rs.length){ v.append(h('p', {class:'tiny muted'}, 'Sin enlaces todavía. Agrega el enlace del material en cada tema, o recursos en Editar.')); return; }
    v.append(h('div', {class:'mine'},
      ts.sort((a, b) => (a.code || a.title).localeCompare(b.code || b.title)).map(t => h('button', {class:'res', type:'button', style:scs(s.id), onclick:() => openLesson(t.id)}, h('i', {class:'dot', style:`background:var(--s-${st(t.id)})`}), h('span', null, h('b', null, (t.code ? t.code + ' · ' : '') + t.title), h('small', null, SCOPE_LBL[t.scope] || 'Tema')))),
      rs.map(r => h('button', {class:'res', type:'button', style:scs(s.id), onclick:() => openResource(r.url, r.title)}, h('span', {style:'font-size:1.1rem'}, '◆'), h('span', null, h('b', null, r.title), h('small', null, (r.kind || 'Recurso') + (r.url && lessonKeys.has(r.url) ? ' · se ve aquí' : r.url && !embedUrl(r.url) ? ' · se abre aparte ↗' : '')))))));
  });
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Libros abiertos para complementar'), h('span', {class:'hand'}, 'gratis y con licencia abierta')));
  v.append(h('p', {class:'muted tiny'}, 'Licencias revisadas en octubre de 2026. «IA» indica si la fuente oficial pone restricciones a usarlos con inteligencia artificial.'));
  const AI = {ok:['IA: sin restricción','ai-ok'], cond:['IA: con condiciones','ai-cond'], no:['IA: prohibida','ai-no']};
  [...new Set(LIBRARY.map(b => b.area))].forEach(a => {
    v.append(h('h3', {class:'display', style:'margin:18px 0 0;font-size:1rem;color:var(--ink-2)'}, a));
    v.append(h('div', {class:'lib'}, LIBRARY.filter(b => b.area === a).map(b => h('article', {class:'card book'},
      h('h4', null, b.t), h('div', {class:'lic'}, h('span', {class:'chip mono'}, b.lic), h('span', {class:'chip ' + AI[b.ai][1]}, AI[b.ai][0])),
      h('p', {class:'tiny muted', style:'margin:0'}, b.n), h('a', {class:'tiny', href:b.u, target:'_blank', rel:'noopener'}, b.u.replace(/^https?:\/\//, '').replace(/\/$/, '') + ' ↗')))));
  });
  v.append(h('div', {class:'card warn', style:'margin-top:16px'}, h('b', null, 'OpenStax: '), 'gratis para leer, pero sus prefacios actuales prohíben usarlo con IA generativa sin permiso escrito.'));
}

/* =========================================================
   GENERADOR DE CLASES — clases y ejercicios hechos con el material del curso
   Lee archivos (PDF, PowerPoint .pptx, Word .docx, texto) que la persona sube o que el script trae de
   WebC, y una IA escribe clases en el formato de CalculAi: objetivo, mapa, teoría, fórmulas, procedimiento,
   ejemplos, errores típicos, ejercicios con soluciones y verificación de dominio. Sin API key, se copia
   una instrucción para pegar en cualquier asistente y se pega la respuesta de vuelta.
   Crea temas (D.topics con content y gen) y ejercicios (D.items). No toca la sincronización.
   ========================================================= */
const MAT_MAX_FILE = 30e6, MAT_MAX_CHARS = 90000, GEN_MAX_CLASSES = 8;
let pdfjsP = null;
function loadPdfjs(){
  if (!pdfjsP) pdfjsP = import(new URL('vendor/pdfjs/pdf.min.mjs', location.href).href)
    .then(m => { m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', location.href).href; return m; })
    .catch(e => { pdfjsP = null; throw new Error('no pude cargar el lector de PDF (' + (e && e.message || e) + ')'); });
  return pdfjsP;
}
async function pdfPages(buf){
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({data:new Uint8Array(buf), isEvalSupported:false, disableFontFace:true, enableXfa:false});
  const pages = [];
  try {
    const doc = await task.promise;
    for (let i = 1; i <= doc.numPages; i++){
      const tc = await (await doc.getPage(i)).getTextContent();
      pages.push(tc.items.map(it => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim());
    }
  } finally { task.destroy(); }
  return pages;
}
/* Lector mínimo de .zip (los .pptx y .docx son zip) con la descompresión del propio navegador. */
async function unzipText(buf, want){
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), dec = new TextDecoder();
  let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--){ if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; } }
  if (eocd < 0) throw new Error('el archivo está dañado o no es de Office');
  const out = {}; let p = dv.getUint32(eocd + 16, true); const count = dv.getUint16(eocd + 10, true);
  for (let n = 0; n < count && p + 46 <= u8.length && dv.getUint32(p, true) === 0x02014b50; n++){
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
    if (!want(name) || dv.getUint32(lo, true) !== 0x04034b50) continue;
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = u8.subarray(start, start + csize);
    if (method === 0) out[name] = dec.decode(data);
    else if (method === 8) out[name] = dec.decode(new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()));
  }
  return out;
}
const xmlDecode = x => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
function ooxmlText(xml, t, para){
  const tRe = new RegExp(`<${t}(?:\\s[^>]*)?>([^<]*)</${t}>`, 'g');
  return xml.split(`</${para}>`).map(seg => { let m, o = ''; tRe.lastIndex = 0; while ((m = tRe.exec(seg))) o += xmlDecode(m[1]); return o; }).filter(x => x.trim()).join('\n');
}
async function readMaterial(name, buf, ctype = ''){
  if (buf.byteLength > MAT_MAX_FILE) throw new Error('es muy grande (máximo 30 MB)');
  const ext = ((name.match(/\.(\w+)$/) || [])[1] || '').toLowerCase(), u8 = new Uint8Array(buf);
  const sig = String.fromCharCode(...u8.subarray(0, 4));
  let pages;
  if (sig === '%PDF' || ext === 'pdf') pages = await pdfPages(buf);
  else if (sig.startsWith('PK') && (ext === 'pptx' || ext === 'docx' || !ext || /officedocument/.test(ctype))){
    const files = await unzipText(buf, n => /^ppt\/slides\/slide\d+\.xml$/.test(n) || n === 'word/document.xml');
    const slides = Object.keys(files).filter(n => n.startsWith('ppt/')).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
    if (slides.length) pages = slides.map(n => ooxmlText(files[n], 'a:t', 'a:p'));
    else if (files['word/document.xml']){ const all = ooxmlText(files['word/document.xml'], 'w:t', 'w:p'); pages = all.match(/[\s\S]{1,3500}(?:\n|$)/g) || [all]; }
    else throw new Error('no encontré texto dentro (¿es un PowerPoint o Word moderno?)');
  } else if (/^(ppt|doc|xls)$/.test(ext)) throw new Error(`es un formato antiguo (.${ext}): guárdalo como .${ext}x o PDF`);
  else if (/^(txt|md|csv|tex)$/.test(ext) || /^text\/plain/.test(ctype)) pages = [new TextDecoder().decode(u8)];
  else if (/^html?$/.test(ext) || /html/.test(ctype)){ const d = new DOMParser().parseFromString(new TextDecoder().decode(u8), 'text/html'); d.querySelectorAll('script,style,nav,header,footer').forEach(x => x.remove()); pages = [((d.querySelector('#region-main, main') || d.body || {}).textContent || '').replace(/\n\s*\n+/g, '\n\n')]; }
  else throw new Error(`no sé leer archivos .${ext || 'sin extensión'} (usa PDF, .pptx, .docx o texto)`);
  pages = pages.map(x => String(x || '').trim());
  const chars = pages.reduce((a, x) => a + x.length, 0);
  if (chars < 150) throw new Error('casi no tiene texto: si es un escaneo o solo imágenes, no lo puedo leer');
  return {name, pages, chars};
}
/* Texto del material con marcas [archivo, p. N]; si es muy largo, se recorta parejo entre archivos. */
function matText(mats){
  const total = mats.reduce((a, m) => a + m.chars, 0), ratio = Math.min(1, MAT_MAX_CHARS / Math.max(1, total));
  let cut = false;
  const txt = mats.map(m => {
    let budget = Math.floor(m.chars * ratio), o = `\n### Archivo: ${m.name}\n`;
    for (let i = 0; i < m.pages.length && budget > 0; i++){ const pg = m.pages[i].slice(0, budget); budget -= pg.length; if (pg) o += `\n[${m.name}, p. ${i + 1}]\n${pg}\n`; }
    if (ratio < 1) cut = true;
    return o;
  }).join('');
  return {txt, cut};
}
/* Archivos de WebC. WebC no deja que otra página baje sus archivos (CORS), así que el camino principal es
   el marcador «Enviar a CalculAi»: corre dentro de WebC, baja los archivos con tu sesión y los manda aquí.
   Se guardan en el caché del navegador (no en D ni en IndexedDB). Después se prueba la clave y el script. */
const FILE_CACHE = 'calculai-archivos';
const fileKey = url => APP_BASE + '__archivo?u=' + encodeURIComponent(url);
async function saveWebcFiles(files){
  if (!('caches' in window) || !Array.isArray(files)) return 0;
  const c = await caches.open(FILE_CACHE); let n = 0;
  for (const f of files.slice(0, 400)){
    if (!f || typeof f.url !== 'string' || !f.url.startsWith(WEBC + '/mod/') || !(f.buf instanceof ArrayBuffer) || !f.buf.byteLength || f.buf.byteLength > MAT_MAX_FILE) continue;
    try { await c.put(fileKey(f.url), new Response(f.buf, {headers:{'content-type':String(f.ctype || 'application/octet-stream').slice(0, 120), 'x-calculai-name':encodeURIComponent(String(f.name || 'archivo').slice(0, 200))}})); n++; } catch {}
  }
  return n;
}
async function cachedWebcFile(url){
  try {
    if (!('caches' in window)) return null;
    const r = await (await caches.open(FILE_CACHE)).match(fileKey(url)); if (!r) return null;
    return {name:decodeURIComponent(r.headers.get('x-calculai-name') || 'archivo'), ctype:r.headers.get('content-type') || '', buf:await r.arrayBuffer()};
  } catch { return null; }
}
async function cachedWebcUrls(){
  try { if (!('caches' in window)) return new Set(); const pre = APP_BASE + '__archivo?u=';
    return new Set((await (await caches.open(FILE_CACHE)).keys()).map(q => q.url).filter(u => u.startsWith(pre)).map(u => decodeURIComponent(u.slice(pre.length)))); } catch { return new Set(); }
}
const fileWaits = {};
async function fetchWebcFile(url){
  const hit = await cachedWebcFile(url); if (hit) return hit;
  const res = webcToken() && D.resources.find(r => r.url === url && r.file);
  if (res){ try { return await webcFileByToken(res); } catch (e) { if (!SYNC.agent) throw e; } }
  return new Promise((resolve, reject) => {
    if (!SYNC.agent) return reject(new Error('NO_AGENT'));
    if (verLt(String(SYNC.agent), '1.2.0')) return reject(new Error('OLD_AGENT'));
    const id = uid('f'), t = setTimeout(() => { delete fileWaits[id]; reject(new Error('WebC no respondió a tiempo')); }, 90000);
    fileWaits[id] = {resolve:v => { clearTimeout(t); resolve(v); }, reject:e => { clearTimeout(t); reject(e); }};
    window.postMessage({type:'calculai-file-request', id, url}, location.origin);
  });
}
window.addEventListener('message', ev => {
  const d = ev.data; if (!d || typeof d !== 'object' || d.type !== 'calculai-file' || ev.origin !== location.origin || ev.source !== window) return;
  const w = fileWaits[d.id]; if (!w) return; delete fileWaits[d.id];
  if (d.ok && d.buf instanceof ArrayBuffer) w.resolve({name:String(d.name || 'archivo'), ctype:String(d.ctype || ''), buf:d.buf}); else w.reject(new Error(d.msg || 'no se pudo traer el archivo'));
});
const webcFileRes = sid => D.resources.filter(r => r.subj === sid && /^https:\/\/[^/]+\/mod\/(resource|page)\/view\.php\?id=\d+/.test(r.url || ''));

/* Instrucciones para la IA */
const genFocus = f => f ? `\n\nLo que entra en la evaluación (prioriza estos contenidos y deja fuera lo que no entra): ${f}` : '';
const genCount = n => n ? `Arma ${n} clases (menos solo si el contenido es muy corto).` : `Máximo ${GEN_MAX_CLASSES} clases.`;
function genPlanPrompt(subj, mt, focus, n){
  return `Eres ayudante de la asignatura «${subj.name}». Abajo está el material del curso, con marcas [archivo, p. N].${genFocus(focus)}\n\nDivide este material en clases de estudio de 45 a 60 minutos, en el orden en que conviene aprenderlas (de lo básico a lo avanzado). Cada clase enseña pocos conceptos relacionados. ${genCount(n)}\n\nResponde SOLO con JSON válido, sin texto antes ni después:\n{"clases":[{"titulo":"…","cubre":"qué conceptos y procedimientos enseña, en una o dos frases","fuente":"archivo y páginas"}]}\n\nUsa solo lo que está en el material; no agregues temas que no aparecen.\n\n---\nMATERIAL\n${mt}`;
}
const GEN_FORMAT = `Formato (usa exactamente estos títulos, en este orden):
# (título de la clase)
## Objetivo
Una o dos frases: qué vas a poder hacer al terminar.
## Mapa
Qué necesitas saber antes y cómo se conecta con lo que viene (lista corta).
## Teoría
Primero la intuición, después la definición formal.
## Fórmulas
Cada fórmula en su propio párrafo $$…$$; debajo, qué significa cada símbolo, sus unidades si corresponde y cuándo se puede usar.
## Procedimiento
Pasos numerados para resolver los ejercicios típicos.
## Ejemplos resueltos
Dos o tres, de menor a mayor dificultad, paso a paso. Si el material trae ejemplos o ejercicios, úsalos primero.
## Errores típicos
Lista: el error, por qué pasa y cómo evitarlo.
## Ejercicios
Cuatro a seis ejercicios graduados, SIN soluciones aquí.
## Soluciones
Las soluciones de los ejercicios, con el desarrollo.
## Verificación de dominio
Tres preguntas cortas para saber si dominas el tema.

Reglas:
- Español de Chile, claro y sin relleno. Escribe como un buen ayudante universitario.
- Usa solo el contenido del material. Si agregas algo que no está en él, márcalo con «(Complemento)».
- Si una sección no aplica (por ejemplo, no hay fórmulas), escribe una línea que lo diga.
- Fórmulas: $…$ en línea y $$…$$ en bloque, en su propio párrafo. Sin tablas ni HTML.
- Separa los párrafos con una línea en blanco. Listas con «- » o «1. ».
- Al final de la clase agrega un bloque para practicar en la app, exactamente así:
\`\`\`ejercicios
[{"tipo":"alternativas","pregunta":"…","opciones":["…","…","…","…"],"correcta":0,"explicacion":"…"},
 {"tipo":"numerica","pregunta":"…","respuesta":12.5,"tolerancia":0.01,"unidad":"m/s","explicacion":"…"}]
\`\`\`
  Entre 4 y 8 ejercicios con respuesta correcta y verificable. «correcta» es la posición de la opción correcta contando desde 0. «tolerancia» es relativa (0.01 = 1 %).`;
function genClassPrompt(subj, plan, i, mt, focus){
  const c = plan[i], before = plan.slice(0, i).map(x => x.titulo).join('; '), after = plan.slice(i + 1).map(x => x.titulo).join('; ');
  return `Escribe la clase ${i + 1} de ${plan.length} de la asignatura «${subj.name}»: «${c.titulo}».\nDebe cubrir: ${c.cubre || c.titulo}.${genFocus(focus)}${c.fuente ? `\nFuente sugerida: ${c.fuente}.` : ''}${before ? `\nClases anteriores (no las repitas): ${before}.` : ''}${after ? `\nClases siguientes (no adelantes su contenido): ${after}.` : ''}\n\n${GEN_FORMAT}\n\n---\nMATERIAL\n${mt}`;
}
function genAllPrompt(subj, mt, focus, n){
  return `Eres ayudante de la asignatura «${subj.name}».${genFocus(focus)}\n\nCon el material de abajo (marcas [archivo, p. N]), arma clases de estudio de 45 a 60 minutos, en el orden en que conviene aprenderlas. ${genCount(n)} Escríbelas TODAS, una tras otra, cada una completa y con su propio bloque de ejercicios al final.\n\n${GEN_FORMAT}\n\nSi tu respuesta se corta, termina la clase que estabas escribiendo y espera a que te pidan «continúa».\n\n---\nMATERIAL\n${mt}`;
}
/* Respuesta de la IA → clases {title, content, items} */
function genItem(x){
  if (!x || typeof x !== 'object' || !x.pregunta) return null;
  const q = String(x.pregunta).slice(0, 1500), ex = String(x.explicacion || '').slice(0, 2000);
  if (Array.isArray(x.opciones) || /altern|mc|multiple/i.test(String(x.tipo || ''))){
    const opts = (x.opciones || []).map(o => String(o).slice(0, 500)).filter(Boolean).slice(0, 6), ans = Number(x.correcta);
    if (opts.length < 2 || !Number.isInteger(ans) || ans < 0 || ans >= opts.length) return null;
    return {type:'mc', q, opts, ans, ex};
  }
  const ans = typeof x.respuesta === 'number' ? x.respuesta : parseNum(x.respuesta == null ? '' : x.respuesta);
  if (ans == null || !Number.isFinite(ans)) return null;
  const tol = Number(x.tolerancia);
  return {type:'num', q, ans, tol:Number.isFinite(tol) && tol > 0 && tol <= .2 ? tol : .01, unit:String(x.unidad || '').slice(0, 30), ex};
}
function parseLessons(text){
  text = String(text || '').replace(/\r/g, '');
  /* Algunas IA envuelven toda la respuesta en ```markdown … ```: se quita solo ese envoltorio, no los bloques internos. */
  if (/^\s*```(?:markdown|md)?[ \t]*\n\s*#/.test(text)) text = text.replace(/^\s*```(?:markdown|md)?[ \t]*\n/, '').replace(/\n```\s*$/, '');
  return text.split(/\n(?=# [^#])/).map(x => x.trim()).filter(x => /^# \S/.test(x)).map(part => {
    let items = [];
    part = part.replace(/```[ \t]*(?:ejercicios|json)[ \t]*\n([\s\S]*?)```/gi, (_, js) => { try { const a = JSON.parse(js.trim()); if (Array.isArray(a)) items = items.concat(a); } catch {} return ''; });
    const title = part.match(/^# (.+)/)[1].replace(/^clase\s*\d+\s*[:.\-–]\s*/i, '').trim().slice(0, 140);
    return {title, content:part.replace(/^# .+/, '# ' + title).replace(/\n{3,}/g, '\n\n').trim(), items:items.map(genItem).filter(Boolean)};
  }).filter(L => L.content.length > 200);
}
function parsePlan(text){
  const m = String(text || '').match(/\{[\s\S]*\}/); if (!m) throw new Error('la IA no devolvió la lista de clases');
  const j = JSON.parse(m[0]), list = (j.clases || j.classes || []).filter(c => c && c.titulo).slice(0, GEN_MAX_CLASSES);
  if (!list.length) throw new Error('la IA no propuso clases');
  return list.map(c => ({titulo:String(c.titulo).slice(0, 140), cubre:String(c.cubre || '').slice(0, 400), fuente:String(c.fuente || '').slice(0, 200), on:true}));
}
function addGenerated(sid, lessons, from, prevId){
  const used = topicsOf(sid).map(t => +((t.code || '').match(/^C(\d+)$/) || [])[1] || 0);
  let n = Math.max(0, ...used), prev = prevId && topic(prevId) ? prevId : null; const made = [];
  lessons.forEach(L => {
    n++;
    const t = {id:uid('t'), subj:sid, code:'C' + pad(n), title:L.title, scope:'actual', prio:'2', pre:prev ? [prev] : [], content:L.content, gen:{at:iso(TODAY), from:from.slice(0, 8)}};
    D.topics.push(t); prev = t.id; made.push(t);
    L.items.forEach(it => D.items.push({id:uid('q'), topic:t.id, ...it, origin:'Creado con IA a partir de tu material'}));
  });
  save();
  return made;
}

/* Panel «Crear clases con mi material» */
let GEN = null;
function openGenerator(sid, preset){
  sid = sid || (classSubj !== 'todas' ? classSubj : D.subjects[0] && D.subjects[0].id);
  if (preset || !GEN || GEN.sid !== sid || GEN.done) GEN = {sid, pick:{}, local:[], mats:preset && preset.mats ? preset.mats.slice() : [], base:preset && preset.mats ? preset.mats.slice() : [], errs:[], plan:null, busy:'', made:[], focus:preset && preset.focus || '', evalId:preset && preset.evalId || ''};
  $('#drawer').classList.add('wide');
  openDrawer(h('div', {class:'drawer-head'}, h('div', {style:'flex:1'}, h('h3', null, '✦ Crear clases con mi material')), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')),
    h('div', {class:'drawer-body', id:'genBody'}));
  drawGen();
  cachedWebcUrls().then(s => { if (GEN && $('#genBody')){ GEN.ready = s; drawGen(); } });
}
function drawGen(){
  const body = document.getElementById('genBody'); if (!body || !GEN) return;
  const G = GEN, subj = S(G.sid), res = webcFileRes(G.sid), busy = !!G.busy;
  const status = h('p', {class:'tiny gen-status', role:'status'}, G.busy || '');
  const steps = [];
  steps.push(h('label', {class:'field'}, h('span', null, 'Materia'),
    h('select', {disabled:busy || null, onchange:e => { GEN = null; openGenerator(e.target.value); }}, D.subjects.map(sb => { const o = h('option', {value:sb.id}, sb.name); if (sb.id === G.sid) o.selected = true; return o; }))));
  /* 1. Material */
  const agentOk = !!webcToken() || (SYNC.agent && !verLt(String(SYNC.agent), '1.2.0')), ready = G.ready || new Set(), nReady = res.filter(r => ready.has(r.url)).length;
  const fileIn = h('input', {type:'file', multiple:true, accept:'.pdf,.pptx,.docx,.txt,.md,application/pdf', style:'display:none', onchange:e => { G.local.push(...[...e.target.files].slice(0, 12)); e.target.value = ''; G.mats = []; G.plan = null; drawGen(); }});
  steps.push(h('section', {class:'gen-step'}, h('h4', null, '1. Elige el material'),
    res.length ? h('div', null,
      h('p', {class:'tiny muted', style:'margin:0 0 6px'}, nReady ? `Archivos de esta materia en WebC (${nReady} ya traídos con el marcador, marcados «listo»):` : 'Archivos de esta materia en WebC:'),
      h('div', {class:'gen-list'}, res.slice(0, 60).map(r => h('label', {class:'chk'}, h('input', {type:'checkbox', disabled:!(agentOk || ready.has(r.url)) || busy || null, checked:G.pick[r.id] || null, onchange:e => { G.pick[r.id] = e.target.checked; G.mats = []; G.plan = null; }}), h('span', null, r.title, ' ', h('small', {class:'muted'}, r.kind || ''), ready.has(r.url) ? h('small', {class:'gen-ready'}, ' · listo') : null)))),
      res.length > nReady ? h('p', {class:'tiny note', style:'margin:6px 0 0'}, h('b', null, 'Para traer tus archivos de WebC: '), 'entra a WebC y aprieta el marcador «Enviar a CalculAi». Baja todos los archivos de una vez con tu sesión. ', h('button', {class:'linkbtn', type:'button', onclick:openWebcHelp}, 'Cómo guardar el marcador')) : null,
      null)
      : h('p', {class:'tiny muted', style:'margin:0 0 6px'}, 'Esta materia no tiene archivos de WebC guardados. Sube aquí los PDF o presentaciones del curso.'),
    h('div', {class:'ai-row', style:'margin-top:8px'}, h('button', {class:'btn ghost small', type:'button', disabled:busy || null, onclick:() => fileIn.click()}, '⇪ Subir archivos'), h('span', {class:'tiny muted'}, 'PDF, PowerPoint (.pptx), Word (.docx) o texto'), fileIn),
    G.local.length ? h('div', {class:'gen-list'}, G.local.map((f, i) => h('div', {class:'chk'}, h('span', null, '📄 ', f.name, ' ', h('small', {class:'muted'}, Math.round(f.size / 1024) + ' KB')), busy ? null : h('button', {class:'linkbtn', type:'button', onclick:() => { G.local.splice(i, 1); G.mats = []; G.plan = null; drawGen(); }}, 'quitar')))) : null,
    h('div', {style:'margin-top:10px'}, h('button', {class:'btn small', type:'button', disabled:busy || null, onclick:genRead}, G.mats.length ? '↻ Volver a leer' : 'Leer material')),
    G.mats.length ? h('ul', {class:'tiny gen-read'}, G.mats.map(m => h('li', null, `✓ ${m.name}: ${plural(m.pages.length, 'página', 'páginas')}, ${m.chars >= 1000 ? Math.round(m.chars / 1000) + ' mil' : m.chars} caracteres`))) : null,
    G.blocked ? h('div', {class:'tiny note gen-blocked'}, h('b', null, `WebC no deja que CalculAi baje ${plural(G.blocked, 'ese archivo', 'esos ' + G.blocked + ' archivos')} directo.`), ' Tráelos con un clic: entra a WebC y aprieta el marcador «Enviar a CalculAi». También puedes descargarlos de WebC y subirlos con «⇪ Subir archivos». ', h('button', {class:'btn small hlbtn', type:'button', onclick:openWebcHelp}, 'Cómo guardar el marcador')) : null,
    G.errs.length ? h('ul', {class:'tiny gen-err'}, G.errs.map(e => h('li', null, '✗ ' + e))) : null));
  /* 2. Clases */
  if (G.mats.length){
    const mt = matText(G.mats), key = getAIKey();
    const two = h('section', {class:'gen-step'}, h('h4', null, '2. Arma las clases'),
      mt.cut ? h('p', {class:'tiny note', style:'margin:0 0 8px'}, 'El material es largo: usaré una parte de cada archivo. Para cubrir todo, crea las clases en dos tandas, con menos archivos cada vez.') : null);
    if (key){
      if (!G.plan) two.append(h('p', {class:'tiny muted', style:'margin:0 0 8px'}, `Primero propongo la lista de clases (máximo ${GEN_MAX_CLASSES}) y tú eliges cuáles crear.`),
        h('button', {class:'btn small hlbtn', type:'button', disabled:busy || null, onclick:genPlan}, '✦ Proponer clases'));
      else {
        two.append(h('div', {class:'gen-list'}, G.plan.map((c, i) => h('label', {class:'chk gen-plan'}, h('input', {type:'checkbox', checked:c.on || null, disabled:busy || null, onchange:e => { c.on = e.target.checked; }}),
          h('span', null, h('b', null, `${i + 1}. `), h('input', {type:'text', value:c.titulo, disabled:busy || null, 'aria-label':'Título de la clase', onchange:e => { c.titulo = e.target.value.trim() || c.titulo; }}), h('small', {class:'muted', style:'display:block'}, c.cubre))))),
          h('div', {class:'ai-row', style:'margin-top:8px'}, h('button', {class:'btn small hlbtn', type:'button', disabled:busy || null, onclick:genBuild}, '✦ Crear las clases elegidas'), h('button', {class:'btn ghost small', type:'button', disabled:busy || null, onclick:() => { G.plan = null; drawGen(); }}, 'Proponer de nuevo')));
      }
    } else {
      const ans = h('textarea', {class:'ai-need', rows:6, placeholder:'Pega aquí la respuesta completa de tu asistente (todas las clases).'});
      two.append(h('p', {class:'tiny muted', style:'margin:0 0 8px'}, 'Sin API key: copia la instrucción (incluye tu material), pégala en el asistente de IA que uses y pega aquí su respuesta. Si se corta, pídele «continúa» y pega todo junto.'),
        h('div', {class:'ai-row'}, h('button', {class:'btn small', type:'button', onclick:async () => { const pr = genAllPrompt(subj, mt.txt, G.focus); try { await navigator.clipboard.writeText(pr); toast('Instrucción copiada: pégala en tu asistente'); } catch { ans.value = pr; ans.select(); toast('Copia el texto del cuadro'); } }}, '⧉ Copiar instrucción')),
        ans, h('div', {class:'ai-row', style:'margin-top:8px'}, h('button', {class:'btn small hlbtn', type:'button', onclick:() => { const L = parseLessons(ans.value); if (!L.length){ toast('No encontré clases: cada una debe empezar con «# título»', 4000); return; } genFinish(L); }}, 'Crear clases con la respuesta')));
    }
    two.append(h('details', {class:'gen-ai', open:!key || null}, h('summary', {class:'tiny'}, key ? '⚙ IA conectada · cambiar' : '⚙ Conectar una IA para crearlas automáticamente'), aiConfigEl(() => drawGen())));
    steps.push(two);
  }
  if (G.made.length) steps.push(h('section', {class:'gen-step done'}, h('h4', null, `✓ ${plural(G.made.length, 'clase creada', 'clases creadas')}`),
    h('ul', {class:'tiny'}, G.made.map(t => h('li', null, `${t.code} · ${t.title} (${plural(D.items.filter(i => i.topic === t.id).length, 'ejercicio', 'ejercicios')})`))),
    h('p', {class:'tiny muted'}, 'Las hizo una IA con tu material: revísalas con tus apuntes antes de una prueba. Puedes editarlas con «✎ Editar mi texto».'),
    h('button', {class:'btn small', type:'button', onclick:() => { classSubj = G.sid; closeDrawer(); lessonOpen = null; go('clases'); }}, 'Ver mis clases')));
  steps.push(status);
  body.replaceChildren(...steps);
}
async function genRead(){
  const G = GEN, res = webcFileRes(G.sid).filter(r => G.pick[r.id]);
  if (!res.length && !G.local.length && !G.base.length){ toast('Elige o sube al menos un archivo'); return; }
  G.mats = G.base.slice(); G.errs = []; G.blocked = 0; G.plan = null;
  const jobs = [...res.map(r => ({name:r.title, get:async () => { const f = await fetchWebcFile(r.url); return {name:f.name || r.title, buf:f.buf, ctype:f.ctype}; }})),
    ...G.local.map(f => ({name:f.name, get:async () => ({name:f.name, buf:await f.arrayBuffer(), ctype:f.type})}))];
  for (let i = 0; i < jobs.length; i++){
    G.busy = `Leyendo ${i + 1} de ${jobs.length}: ${jobs[i].name}…`; drawGen();
    try { const f = await jobs[i].get(); G.mats.push(await readMaterial(f.name, f.buf, f.ctype)); }
    catch (e) { const m = e && e.message || String(e); if (m === 'BLOCKED'){ G.blocked++; continue; } G.errs.push(`${jobs[i].name}: ${m === 'NO_AGENT' || m === 'OLD_AGENT' ? 'conecta tu WebC (o revísalo de nuevo) para traerlo' : m}`); }
  }
  G.busy = ''; drawGen();
}
async function aiRetry(prompt, opt, say = m => { if (GEN){ GEN.busy = m; drawGen(); } }){
  try { return await callAI(prompt, opt); }
  catch (e) { if (!/límite/.test(e.message)) throw e; say('Llegué al límite de uso por minuto de la IA. Espero 40 segundos y sigo…'); await new Promise(r => setTimeout(r, 40000)); return callAI(prompt, opt); }
}
async function genPlan(){
  const G = GEN; G.busy = 'Leyendo el material y proponiendo clases… (puede tardar un minuto)'; drawGen();
  try { G.plan = parsePlan(await aiRetry(genPlanPrompt(S(G.sid), matText(G.mats).txt, G.focus), {max:4000, json:true})); }
  catch (e) { toast('No se pudo: ' + (e.message === 'NO_KEY' ? 'falta la API key' : e.message), 5000); }
  G.busy = ''; drawGen();
}
async function genBuild(){
  const G = GEN, plan = G.plan.filter(c => c.on); if (!plan.length){ toast('Elige al menos una clase'); return; }
  const mt = matText(G.mats).txt, from = G.mats.map(m => m.name);
  for (let i = 0; i < plan.length; i++){
    G.busy = `Escribiendo la clase ${i + 1} de ${plan.length}: ${plan[i].titulo}… (cada una tarda alrededor de un minuto)`; drawGen();
    try {
      const L = parseLessons(await aiRetry(genClassPrompt(S(G.sid), plan, i, mt), {max:16000}))[0];
      if (!L) throw new Error('la respuesta no tenía el formato esperado');
      L.title = plan[i].titulo; L.content = L.content.replace(/^# .+/, '# ' + L.title);
      G.made.push(...addGenerated(G.sid, [L], from, G.made.length ? G.made.at(-1).id : null));
    } catch (e) { toast(`Clase ${i + 1}: ${e.message === 'NO_KEY' ? 'falta la API key' : e.message}`, 5000); if (e.message === 'NO_KEY' || /no es válida/.test(e.message)) break; }
  }
  genToEval(G); G.busy = ''; G.done = true; drawGen(); render();
  if (G.made.length) toast(`${plural(G.made.length, 'clase creada', 'clases creadas')} en ${S(G.sid).short}`, 4000);
}
/* Clases creadas desde «Estudiar para»: si esa evaluación tiene lista de clases, se suman a la lista. */
function genToEval(G){
  const ev = G.evalId && D.events.find(e => e.id === G.evalId);
  if (ev && ev.topics && ev.topics.length){ G.made.forEach(t => { if (!ev.topics.includes(t.id)) ev.topics.push(t.id); }); save(); }
}
function genFinish(L){
  const G = GEN; G.made.push(...addGenerated(G.sid, L.slice(0, 20), G.mats.map(m => m.name))); genToEval(G); G.done = true; drawGen(); render();
  toast(`${plural(L.length, 'clase creada', 'clases creadas')} en ${S(G.sid).short}`, 4000);
}

/* =========================================================
   EDITAR: materias, evaluaciones, temas, ejercicios, recursos
   ========================================================= */
function openDrawer(...kids){ const d = $('#drawer'); d.replaceChildren(...kids); d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on'); setTimeout(() => d.querySelector('input,select,textarea,button')?.focus(), 60); }
function closeDrawer(){ const d = $('#drawer'); d.classList.remove('open', 'wide'); d.setAttribute('aria-hidden', 'true'); $('#scrim').classList.remove('on'); document.querySelectorAll('.node.sel').forEach(n => n.classList.remove('sel')); }
/* Formulario genérico */
function openForm(title, fields, init, onSave, onDelete){
  const vals = {...init};
  const form = h('form', {class:'form', onsubmit:e => { e.preventDefault();
    for (const f of fields) if (f.required && !String(vals[f.k] ?? '').trim()){ toast(`Falta: ${f.label}`); return; }
    try { onSave(vals); } catch { return; } closeDrawer(); render(); }});
  fields.forEach(f => {
    if (f.show && !f.show(vals)) return;
    let input;
    if (f.type === 'textarea') input = h('textarea', {value:vals[f.k] ?? '', placeholder:f.ph || '', oninput:e => vals[f.k] = e.target.value});
    else if (f.type === 'select') { input = h('select', {onchange:e => { vals[f.k] = e.target.value; if (f.rerender) redraw(); }}, (typeof f.options === 'function' ? f.options(vals) : f.options).map(([k, l]) => { const o = h('option', {value:k}, l); if (String(vals[f.k] ?? '') === String(k)) o.selected = true; return o; })); if (vals[f.k] == null && input.options.length) vals[f.k] = input.value; }
    else if (f.type === 'checkbox') return form.append(h('label', {class:'chk'}, h('input', {type:'checkbox', checked:vals[f.k] || null, onchange:e => vals[f.k] = e.target.checked}), f.label, f.help ? h('small', {class:'tiny muted', style:'font-weight:400'}, ' — ' + f.help) : null));
    else if (f.type === 'color') input = h('div', {class:'swatches', role:'group', 'aria-label':f.label}, COLORS.map(c => h('button', {class:'sw', type:'button', style:`--sc:var(--c-${c})`, 'aria-label':c, 'aria-pressed':String(vals[f.k] === c), onclick:e => { vals[f.k] = c; e.currentTarget.parentElement.querySelectorAll('.sw').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); }})));
    else if (f.type === 'multi'){ const opts = typeof f.options === 'function' ? f.options(vals) : f.options; vals[f.k] = vals[f.k] || [];
      input = opts.length ? h('div', {class:'checks'}, opts.map(([k, l]) => h('label', null, h('input', {type:'checkbox', checked:vals[f.k].includes(k) || null, onchange:e => { vals[f.k] = e.target.checked ? [...new Set([...vals[f.k], k])] : vals[f.k].filter(x => x !== k); }}), l))) : h('small', null, f.empty || 'No hay opciones todavía.'); }
    else input = h('input', {type:f.type || 'text', value:vals[f.k] ?? '', placeholder:f.ph || '', step:f.step || null, inputmode:f.inputmode || null, oninput:e => vals[f.k] = e.target.value});
    form.append(h('label', {class:'field'}, h('span', null, f.label, f.required ? ' *' : ''), input, f.help ? h('small', null, f.help) : null));
  });
  form.append(h('div', {class:'form-actions'},
    onDelete ? h('button', {class:'btn danger small', type:'button', onclick:() => { if (confirm('¿Seguro? Esto no se puede deshacer.')){ onDelete(); closeDrawer(); render(); } }}, 'Eliminar') : h('span'),
    h('div', {style:'display:flex;gap:8px'}, h('button', {class:'btn ghost small', type:'button', onclick:closeDrawer}, 'Cancelar'), h('button', {class:'btn small', type:'submit'}, 'Guardar'))));
  function redraw(){ openForm(title, fields, vals, onSave, onDelete); }
  $('#drawer').classList.add('wide');
  openDrawer(h('div', {class:'drawer-head'}, h('div', {style:'flex:1'}, h('h3', null, title)), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')), h('div', {class:'drawer-body'}, form));
}
const subjOpts = () => D.subjects.map(s => [s.id, s.name]);
function subjectFields(){ return [
  {k:'name', label:'Nombre de la materia', required:true, ph:'Cálculo Integral'},
  {k:'short', label:'Nombre corto', ph:'Cálculo', help:'Se usa en chips y en el calendario.'},
  {k:'code', label:'Sigla o código', ph:'MAT106'},
  {k:'color', label:'Color', type:'color'},
  {k:'prof', label:'Profesor o sección', ph:'Prof. … · sección 7'},
  {k:'note', label:'Nota (alcance, temario, avisos)', type:'textarea', ph:'Ej.: sin temario oficial todavía.'}]; }
function subjectFrom(v, id){ return {id:id || uid('s'), name:v.name.trim(), short:(v.short || v.name).trim().slice(0, 18), code:(v.code || '').trim(), color:v.color || 'azul', prof:(v.prof || '').trim(), note:(v.note || '').trim()}; }
function openSubjectForm(id){
  const s = id ? D.subjects.find(x => x.id === id) : null;
  openForm(s ? 'Editar materia' : 'Nueva materia', subjectFields(), s ? {...s} : {color:COLORS[D.subjects.length % COLORS.length]},
    v => { const n = subjectFrom(v, s?.id); if (s) Object.assign(s, n); else D.subjects.push(n); save(); toast('Materia guardada'); },
    s ? () => { const tids = topicsOf(s.id).map(t => t.id); D.topics = D.topics.filter(t => t.subj !== s.id); D.items = D.items.filter(i => !tids.includes(i.topic)); D.events = D.events.filter(e => e.subj !== s.id); D.resources = D.resources.filter(r => r.subj !== s.id); D.subjects = D.subjects.filter(x => x.id !== s.id); save(); } : null);
}
function openEventForm(id, date){
  const e = id ? D.events.find(x => x.id === id) : null;
  if (!D.subjects.length) return toast('Primero crea una materia');
  openForm(e ? 'Editar evento' : 'Nuevo evento', [
    {k:'subj', label:'Materia', type:'select', options:subjOpts, rerender:true},
    {k:'kind', label:'Tipo', type:'select', options:Object.entries(KIND).map(([k, o]) => [k, o.l])},
    {k:'name', label:'Nombre', required:true, ph:'Prueba 2'},
    {k:'date', label:'Fecha', type:'date', help:'Déjala vacía si aún no hay fecha.'},
    {k:'time', label:'Hora', ph:'18:00 o 18:00–20:00', help:'Opcional. Para entregas, la hora de cierre.'},
    {k:'slot', label:'Horario en texto', ph:'Módulo de cátedra', help:'Si no sabes la hora exacta.'},
    {k:'ver', label:'Fecha confirmada en una fuente oficial', type:'checkbox'},
    {k:'src', label:'Fuente', ph:'Aviso del profesor, 8 oct · programa del curso'},
    {k:'topics', label:'Evalúa solo estos temas (opcional)', type:'multi', options:v => topicsOf(v.subj).map(t => [t.id, (t.code ? t.code + ' ' : '') + t.title]), empty:'Esta materia no tiene temas todavía.', help:'Si no marcas ninguno, cuenta para todos los temas de la materia.'},
    {k:'scopeNote', label:'Nota sobre el alcance', ph:'Temario no publicado'},
    {k:'note', label:'Nota', type:'textarea'}],
    e ? {...e, topics:[...(e.topics || [])]} : {subj:D.subjects[0].id, kind:'prueba', date:date || '', ver:false},
    v => { const n = {id:e?.id || uid('ev'), subj:v.subj, kind:v.kind, name:v.name.trim(), date:v.date || null, time:(v.time || '').trim(), slot:(v.slot || '').trim(), ver:!!v.ver, src:(v.src || '').trim(), topics:(v.topics || []).filter(t => topic(t)?.subj === v.subj), scopeNote:(v.scopeNote || '').trim(), note:(v.note || '').trim()};
      if (e) Object.assign(e, n); else D.events.push(n);
      D.topics.forEach(t => { if (t.exam === n.id && !n.topics.includes(t.id)) delete t.exam; });
      n.topics.forEach(tid => { const t = topic(tid); if (t) t.exam = n.id; });
      save(); toast('Evento guardado'); },
    e ? () => { if (e.webc) syncData().dismissed.push(e.webc); D.events = D.events.filter(x => x.id !== e.id); D.topics.forEach(t => { if (t.exam === e.id) delete t.exam; }); save(); } : null);
}
function openTopicForm(id, subj){
  const t = id ? topic(id) : null;
  if (!D.subjects.length) return toast('Primero crea una materia');
  openForm(t ? 'Editar tema' : 'Nuevo tema', [
    {k:'subj', label:'Materia', type:'select', options:subjOpts, rerender:true},
    {k:'title', label:'Título', required:true, ph:'Fracciones parciales'},
    {k:'code', label:'Código corto', ph:'C06', help:'Opcional: número de clase o unidad.'},
    {k:'url', label:'Enlace al material', type:'url', ph:'https://…', help:'Tu apunte, una clase, un video, un libro abierto…'},
    {k:'content', label:'Contenido de la clase', type:'textarea', ph:'Escribe aquí la clase o pega contenido…\n\n# Encabezado\nTexto con $fórmulas$ en línea.\n$$E = mc^2$$', help:'Opcional: la clase se muestra dentro de la app. Usa # para títulos, $…$ para fórmulas, $$…$$ para fórmulas grandes.'},
    {k:'pre', label:'Prerrequisitos', type:'multi', options:v => topicsOf(v.subj).filter(x => x.id !== t?.id).map(x => [x.id, (x.code ? x.code + ' ' : '') + x.title]), empty:'Aún no hay otros temas en esta materia.'},
    {k:'scope', label:'Alcance', type:'select', options:[['actual','Material actual'],['noconf','Inclusión no confirmada'],['hist','Referencia histórica']]},
    {k:'prio', label:'Prioridad', type:'select', options:[['2','Normal'],['1','Alta'],['3','Baja']]}],
    t ? {...t, content:t.content || '', pre:[...(t.pre || [])], prio:String(t.prio || 2)} : {subj:subj || mapSubj || D.subjects[0].id, scope:'actual', prio:'2'},
    v => { const n = {id:t?.id || uid('t'), subj:v.subj, title:v.title.trim(), code:(v.code || '').trim(), url:(v.url || '').trim(), content:(v.content || '').trim(), pre:(v.pre || []).filter(p => topic(p)?.subj === v.subj), scope:v.scope || 'actual', prio:Number(v.prio) || 2};
      if (t){ if (t.exam) n.exam = t.exam; Object.assign(t, n); } else D.topics.push(n); save(); toast('Tema guardado'); },
    t ? () => { D.topics = D.topics.filter(x => x.id !== t.id); D.topics.forEach(x => x.pre = (x.pre || []).filter(p => p !== t.id)); D.items = D.items.filter(i => i.topic !== t.id); D.events.forEach(e => e.topics = (e.topics || []).filter(x => x !== t.id)); delete P.status[t.id]; save(); } : null);
}
function openItemForm(id, tid){
  const it = id ? D.items.find(x => x.id === id) : null;
  if (!D.topics.length) return toast('Primero crea un tema');
  const topicOpts = () => D.topics.map(t => [t.id, `${S(t.subj).short} · ${(t.code ? t.code + ' ' : '') + t.title}`]);
  openForm(it ? 'Editar ejercicio' : 'Nuevo ejercicio', [
    {k:'topic', label:'Tema', type:'select', options:topicOpts},
    {k:'type', label:'Tipo de respuesta', type:'select', options:[['mc','Alternativas'],['num','Numérica']], rerender:true},
    {k:'q', label:'Enunciado', type:'textarea', required:true, help:'Fórmulas entre signos $, por ejemplo: $\\frac{1}{2}mv^2$.'},
    {k:'optsText', label:'Alternativas (una por línea)', type:'textarea', show:v => v.type === 'mc', help:'La correcta se indica abajo.'},
    {k:'ansIdx', label:'Número de la alternativa correcta', type:'number', show:v => v.type === 'mc', ph:'1'},
    {k:'ans', label:'Respuesta numérica', show:v => v.type === 'num', inputmode:'decimal', ph:'7 · 1/6 · -0,5'},
    {k:'tolPct', label:'Tolerancia (%)', type:'number', show:v => v.type === 'num', ph:'1'},
    {k:'unit', label:'Unidad', show:v => v.type === 'num', ph:'m/s²'},
    {k:'ex', label:'Explicación (se muestra al comprobar)', type:'textarea'},
    {k:'origin', label:'Origen', ph:'Guía 7, problema 2.1 · prueba 2025 · creado por mí'}],
    it ? {...it, optsText:(it.opts || []).join('\n'), ansIdx:it.type === 'mc' ? it.ans + 1 : '', ans:it.type === 'num' ? String(it.ans).replace('.', ',') : '', tolPct:it.tol != null ? it.tol * 100 : 1} : {topic:tid || D.topics[0].id, type:'mc', tolPct:1},
    v => {
      const n = {id:it?.id || uid('q'), topic:v.topic, type:v.type, q:v.q.trim(), ex:(v.ex || '').trim(), origin:(v.origin || '').trim()};
      if (v.type === 'mc'){ const opts = String(v.optsText || '').split('\n').map(x => x.trim()).filter(Boolean); const k = Number(v.ansIdx) - 1;
        if (opts.length < 2 || !(k >= 0 && k < opts.length)){ toast('Necesitas al menos 2 alternativas y el número de la correcta'); throw new Error('val'); }
        Object.assign(n, {opts, ans:k}); }
      else { const a = parseNum(v.ans); if (a == null){ toast('La respuesta numérica no es válida'); throw new Error('val'); } Object.assign(n, {ans:a, tol:Math.max(0, Number(v.tolPct) || 0) / 100, unit:(v.unit || '').trim()}); }
      if (it){ Object.keys(it).forEach(k => delete it[k]); Object.assign(it, n); } else D.items.push(n);
      Q = null; save(); toast('Ejercicio guardado'); },
    it ? () => { D.items = D.items.filter(x => x.id !== it.id); Q = null; save(); } : null);
}
function openResourceForm(id){
  const r = id ? D.resources.find(x => x.id === id) : null;
  if (!D.subjects.length) return toast('Primero crea una materia');
  openForm(r ? 'Editar recurso' : 'Nuevo recurso', [
    {k:'subj', label:'Materia', type:'select', options:subjOpts},
    {k:'title', label:'Título', required:true, ph:'Formulario general'},
    {k:'kind', label:'Tipo', ph:'Formulario · guía · simulacro · video'},
    {k:'url', label:'Enlace', type:'url', ph:'https://…'}],
    r ? {...r} : {subj:D.subjects[0].id},
    v => { const n = {id:r?.id || uid('r'), subj:v.subj, title:v.title.trim(), kind:(v.kind || '').trim(), url:(v.url || '').trim()}; if (r) Object.assign(r, n); else D.resources.push(n); save(); toast('Recurso guardado'); },
    r ? () => { D.resources = D.resources.filter(x => x.id !== r.id); save(); } : null);
}
function vEditar(v){
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Editar'), h('span', {class:'hand'}, 'tu CalculAi, a tu medida')));
  v.append(h('label', {class:'field', style:'max-width:360px'}, h('span', null, '¿Cómo te llamo?'), h('input', {type:'text', value:D.owner || '', placeholder:'Tu nombre (opcional)', onchange:e => { D.owner = e.target.value.trim().slice(0, 30); save(); }})));
  const sec = (title, addLbl, onAdd, rows, emptyTxt) => v.append(h('section', {class:'edit-sec'},
    h('div', {style:'display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap'}, h('h3', {class:'display', style:'margin:0;font-size:1.15rem'}, title), h('button', {class:'btn small', type:'button', onclick:onAdd}, addLbl)),
    rows.length ? h('div', {class:'edit-list'}, rows) : h('p', {class:'tiny muted'}, emptyTxt)));
  const row = (style, title, sub, onEdit) => h('div', {class:'edit-row', style}, h('div', {class:'info'}, h('b', null, title), h('small', null, sub)), h('button', {class:'btn ghost small', type:'button', onclick:onEdit}, 'Editar'));
  sec('Materias', '+ Materia', () => openSubjectForm(null), D.subjects.map(s => row(scs(s.id), s.name, [s.code, s.prof, plural(topicsOf(s.id).length, 'tema', 'temas')].filter(Boolean).join(' · '), () => openSubjectForm(s.id))), 'Sin materias.');
  sec('Evaluaciones y entregas', '+ Evento', () => openEventForm(null), D.events.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).map(e => row(scs(e.subj), `${S(e.subj).short} · ${e.name}`, `${(KIND[e.kind] || KIND.otro).l} · ${e.date ? fmtD(parse(e.date)) : 'sin fecha'}${e.time ? ' · ' + e.time : ''} · ${e.ver ? 'confirmada' : 'sin confirmar'}`, () => openEventForm(e.id))), 'Sin eventos.');
  sec('Temas', '+ Tema', () => openTopicForm(null), D.subjects.flatMap(s => topicsOf(s.id).sort((a, b) => (a.code || a.title).localeCompare(b.code || b.title)).map(t => row(scs(s.id), (t.code ? t.code + ' · ' : '') + t.title, `${s.short} · ${SCOPE_LBL[t.scope] || ''}${t.url ? ' · con enlace' : ''} · ${plural(D.items.filter(i => i.topic === t.id).length, 'ejercicio', 'ejercicios')}`, () => openTopicForm(t.id)))), 'Sin temas.');
  sec('Ejercicios', '+ Ejercicio', () => openItemForm(null), D.items.map(i => { const t = topic(i.topic); return t ? row(scs(t.subj), String(i.q).replace(/\$[^$]*\$/g, '[fórmula]').slice(0, 90), `${S(t.subj).short} · ${t.title} · ${i.type === 'mc' ? 'alternativas' : 'numérica'}`, () => openItemForm(i.id)) : null; }).filter(Boolean), 'Sin ejercicios. Crea preguntas desde tus guías o pruebas anteriores.');
  sec('Recursos', '+ Recurso', () => openResourceForm(null), D.resources.map(r => row(scs(r.subj), r.title, `${S(r.subj).short}${r.kind ? ' · ' + r.kind : ''}`, () => openResourceForm(r.id))), 'Formularios, guías, simulacros, videos…');

  v.append(h('div', {class:'sec-title', style:'margin-top:28px'}, h('h2', null, 'Conexiones'), h('span', {class:'hand'}, 'para que todo llegue solo')));
  v.append(webcCard());
  v.append(h('section', {class:'edit-sec card'}, h('h3', {class:'display', style:'margin:0 0 4px;font-size:1.15rem'}, '⟳ Revisión automática al abrir'), autoSyncSteps()));
  v.append(outlookCard());
  const file = h('input', {type:'file', accept:'.json,application/json', style:'display:none', onchange:e => importFile(e.target.files[0], false)});
  v.append(h('section', {class:'edit-sec card'},
    h('h3', {class:'display', style:'margin:0 0 6px;font-size:1.15rem'}, 'Respaldo y compartir'),
    h('p', {class:'tiny muted', style:'margin:0 0 10px'}, storageOk ? 'Tus datos se guardan automáticamente en este navegador. Descarga un respaldo de vez en cuando, o para pasarlos a otro equipo.' : '⚠ Este navegador no está guardando datos (¿modo incógnito?). Descarga un respaldo antes de cerrar.'),
    h('div', {style:'display:flex;gap:8px;flex-wrap:wrap'},
      h('button', {class:'btn small', type:'button', onclick:() => download(`calculai-respaldo-${iso(TODAY)}.json`, JSON.stringify({app:'calculai', v:1, data:D, progress:P}, null, 1), 'application/json')}, '⇩ Respaldo completo'),
      h('button', {class:'btn ghost small', type:'button', onclick:() => download(`calculai-plantilla-${iso(TODAY)}.json`, JSON.stringify({app:'calculai', v:1, data:shareTemplate()}, null, 1), 'application/json'), title:'Materias, fechas, clases y ejercicios, sin tu progreso ni tus datos de WebC'}, '⇩ Plantilla para compartir'),
      h('button', {class:'btn ghost small', type:'button', onclick:copyInvite, title:'Copia el enlace con instrucciones cortas'}, '✉ Invitar a un compañero'),
      h('button', {class:'btn ghost small', type:'button', onclick:() => file.click()}, '⇪ Abrir archivo'), file,
      h('button', {class:'btn ghost small', type:'button', onclick:shareToDevice, title:'Envía tu respaldo al celular u otro equipo'}, '📱 Pasar a otro dispositivo'),
      h('button', {class:'btn danger small', type:'button', onclick:() => { if (confirm('¿Borrar todos los datos de este navegador? Descarga antes un respaldo si los quieres.')){ D = blankData(); P = blankProg(); save(); tab = 'ahora'; render(); } }}, 'Borrar todo')),
    h('p', {class:'tiny muted', style:'margin:10px 0 0'}, 'La plantilla lleva tus materias, fechas, clases escritas en CalculAi y ejercicios. No lleva tu progreso, tus avisos ni lo que trajo tu WebC, ni tu API key. Las clases interactivas guardadas (paquete) tampoco van ahí.'),
    h('div', {class:'ai-row', style:'margin-top:12px;align-items:center'},
      h('span', {class:'tiny'}, h('b', null, '▤ Clases guardadas en este dispositivo: '), String(lessonKeys.size)),
      h('button', {class:'btn ghost small', type:'button', onclick:pickLessonFile}, '⇪ Cargar paquete de clases'),
      lessonKeys.size ? h('button', {class:'btn ghost small', type:'button', onclick:async () => { if (confirm('¿Quitar las clases guardadas en este dispositivo? Tus materias y tu progreso no cambian.')){ await ldbClear(); render(); toast('Clases quitadas de este dispositivo'); } }}, 'Quitar clases') : null),
    h('p', {class:'tiny muted', style:'margin:6px 0 0'}, 'Las clases se guardan aparte de tus datos: la revisión de WebC, los respaldos y la IA nunca las borran. En otro equipo, vuelve a cargar el paquete.')));
}
function importFile(f, fromWelcome){
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (j && j.type === 'calculai-webc' && Array.isArray(j.courses)){ receiveWebc(j); return; }
      if (j && Array.isArray(j.lessons)){ importPack(j, fromWelcome); return; }
      if (!j || !j.data || !Array.isArray(j.data.subjects)) throw new Error('formato');
      const nd = normData(j.data);
      if (!fromWelcome && D.subjects.length && !confirm(j.progress ? 'Esto reemplaza tus datos y tu progreso actuales por los del archivo. ¿Continuar?' : 'Esto reemplaza tus materias, fechas, temas y ejercicios por los de la plantilla (tu progreso se mantiene en los temas que coincidan). ¿Continuar?')) return;
      D = nd; if (j.progress) P = normProg(j.progress);
      save(); tab = 'ahora'; render(); toast(j.progress ? 'Respaldo cargado' : 'Plantilla cargada');
    } catch { toast('El archivo no es un respaldo ni una plantilla de CalculAi'); }
  };
  r.readAsText(f);
}
/* Paquete de clases: guarda las clases en este dispositivo y, si trae datos, ofrece cargarlos.
   Con datos de ejemplo (o sin datos) los carga directo; si ya tienes tus datos, pregunta. */
async function importPack(j, fromWelcome){
  const n = await importLessons(j.lessons).catch(() => -1);
  if (n < 0){ toast('No pude guardar las clases en este navegador (¿modo incógnito o sin espacio?)', 5000); return; }
  let loaded = false;
  if (j.data && Array.isArray(j.data.subjects)){
    const replace = fromWelcome || !D.subjects.length || isExampleData() || confirm('El paquete trae también materias, fechas y temas.\n\nAceptar: reemplazar tus datos actuales por los del paquete (tu progreso se mantiene).\nCancelar: guardar solo las clases y dejar tus datos como están.');
    if (replace){ D = normData(j.data); if (j.progress) P = normProg(j.progress); loaded = true; }
  }
  save(); tab = loaded ? 'clases' : tab; lessonOpen = null; render();
  toast(`${plural(n, 'clase guardada', 'clases guardadas')} en este dispositivo${loaded ? ' · tus materias quedaron cargadas' : ''}`, 6000);
}
let lessonFileInput = null;
function pickLessonFile(){
  if (!lessonFileInput){ lessonFileInput = h('input', {type:'file', accept:'.json,application/json', style:'display:none', onchange:e => { importFile(e.target.files[0], false); e.target.value = ''; }}); document.body.append(lessonFileInput); }
  lessonFileInput.click();
}

/* =========================================================
   MODO ENFOQUE
   ========================================================= */
let F = null, fTimer = null;
function startFocus(t, steps){ F = {t, steps, idx:0, left:steps[0].min * 60, running:true, elapsed:0, end:false}; $('#focus').classList.add('on'); document.body.style.overflow = 'hidden'; clearInterval(fTimer); fTimer = setInterval(tick, 1000); renderFocus(); }
function tick(){ if (!F || !F.running || F.end) return; F.left = Math.max(0, F.left - 1); F.elapsed++; if (F.left === 0){ F.running = false; try { navigator.vibrate && navigator.vibrate(200); } catch {} } renderFocus(); }
function nextStep(){ if (F.idx < F.steps.length - 1){ F.idx++; F.left = F.steps[F.idx].min * 60; F.running = true; } else F.end = true; renderFocus(); }
function toggleFocusLesson(){
  const box = $('#focusLesson'); if (!box || !F) return;
  if (box.hidden){ const t = topic(F.t.id) || F.t; box.replaceChildren(h('div', {class:'focus-lesson-in card', style:scs(t.subj)}, h('div', {class:'ai-row', style:'justify-content:space-between'}, h('b', {class:'display'}, '▤ ' + t.title), h('button', {class:'btn ghost small', type:'button', onclick:toggleFocusLesson}, 'Ocultar clase')), hasLesson(t) ? renderContent(t.content) : null, hasSaved(t) ? savedFrame(t.url, t.title) : !hasLesson(t) ? h('p', {class:'tiny muted'}, 'Esta clase aún no tiene texto en CalculAi.') : null, t.url && !hasSaved(t) ? viewer(t.url, t.title) : null)); box.hidden = false; box.scrollIntoView({behavior:'smooth', block:'start'}); }
  else { box.hidden = true; box.replaceChildren(); }
  renderFocus();
}
function endFocus(){ const fl = $('#focusLesson'); if (fl){ fl.hidden = true; fl.replaceChildren(); } if (F && F.elapsed >= 60){ P.sessions.push({at:iso(TODAY), topic:F.t.id, min:Math.round(F.elapsed / 60)}); save(); } clearInterval(fTimer); F = null; $('#focus').classList.remove('on'); document.body.style.overflow = ''; render(); }
function renderFocus(){
  const el = $('#focus'); if (!F) return;
  const step = F.steps[F.idx], tot = step.min * 60, frac = F.left / tot, C = 2 * Math.PI * 100;
  document.title = F.end ? 'CalculAi' : `${pad(Math.floor(F.left / 60))}:${pad(F.left % 60)} · ${step.t}`;
  let host = el.querySelector('#focusMain');
  if (!host){ host = h('div', {id:'focusMain'}); el.replaceChildren(host, h('div', {id:'focusLesson', class:'focus-lesson', hidden:true})); }
  host.replaceChildren(h('div', {class:'focus-in', style:scs(F.t.subj)},
    h('div', {class:'focus-top'}, h('div', null, subjChip(F.t.subj), ' ', h('b', {class:'display', style:'font-size:1.15rem'}, F.t.title)), h('button', {class:'iconbtn', type:'button', onclick:() => { document.title = 'CalculAi'; endFocus(); }, 'aria-label':'Salir del modo enfoque'}, 'Salir ✕')),
    F.end ? h('div', {class:'card endpanel'},
      h('h2', {class:'display', style:'margin:0 0 4px'}, 'Sesión terminada'),
      h('p', {class:'muted', style:'margin:0 0 14px'}, `${plural(Math.round(F.elapsed / 60), 'minuto', 'minutos')} de trabajo. ¿Cómo quedó ${F.t.title}?`),
      h('div', {class:'statusbar'}, STATUSES.filter(x => x.k !== 'pendiente').map(x => h('button', {class:'stbtn', type:'button', style:`--stc:var(--s-${x.k})`, 'aria-pressed':String(st(F.t.id) === x.k), onclick:() => { setStatus(F.t.id, x.k); toast(`${F.t.title}: ${x.l}`); document.title = 'CalculAi'; endFocus(); }}, h('i', {class:'dot', style:`background:var(--s-${x.k})`}), x.l))),
      h('p', {class:'note'}, 'Si dudas entre dos estados, elige el más bajo: el repaso llega antes y no pierdes nada.'))
    : h('div', null,
      h('div', {class:'focus-main'},
        h('div', {class:'ring'}, (() => { const s = svg('svg', {viewBox:'0 0 240 240'}); s.append(svg('circle', {class:'bg', cx:120, cy:120, r:100}), svg('circle', {class:'fg', cx:120, cy:120, r:100, 'stroke-dasharray':C, 'stroke-dashoffset':C * (1 - frac)})); return s; })(),
          h('div', {class:'t'}, h('div', null, h('b', null, `${pad(Math.floor(F.left / 60))}:${pad(F.left % 60)}`), h('small', null, F.left === 0 ? '¡paso cumplido!' : F.running ? step.t : 'en pausa')))),
        h('ol', {class:'fsteps'}, F.steps.map((s, i) => h('li', {class:i === F.idx ? 'cur' : i < F.idx ? 'done' : ''},
          h('span', {class:'fs-n'}, i < F.idx ? '✓' : i + 1),
          h('div', {style:'flex:1;min-width:0'}, h('div', {class:'fs-t'}, `${s.t} · ${s.min}'`), i === F.idx ? h('div', {class:'fs-d'}, s.d) : null),
          i === F.idx && s.lesson ? h('button', {class:'btn ghost small', type:'button', onclick:toggleFocusLesson}, $('#focusLesson') && !$('#focusLesson').hidden ? 'Ocultar clase' : 'Ver clase') : null)))),
      h('div', {class:'focus-ctrl'},
        h('button', {class:'btn ghost', type:'button', onclick:() => { F.running = !F.running; renderFocus(); }}, F.running ? '❚❚ Pausa' : '▶ Reanudar'),
        h('button', {class:F.left === 0 ? 'btn hlbtn' : 'btn', type:'button', onclick:nextStep}, F.idx < F.steps.length - 1 ? 'Siguiente paso →' : 'Terminar sesión')))));
}

/* =========================================================
   BUSCADOR (Ctrl+K)
   ========================================================= */
let palItems = [], palSel = 0;
function palData(){
  const out = D.subjects.length ? TABS.map(t => ({l:'Ir a ' + t.l, k:'Sección', run:() => go(t.k)})) : [];
  D.topics.forEach(t => out.push({l:(t.code ? t.code + ' · ' : '') + t.title, k:S(t.subj).short, dot:`var(--s-${st(t.id)})`, run:() => openLesson(t.id)}));
  D.resources.filter(r => r.url).forEach(r => out.push({l:r.title, k:S(r.subj).short + ' · abrir ↗', run:() => openExt(r.url)}));
  D.subjects.forEach(s => out.push({l:'Practicar ' + s.short, k:'Acción', run:() => { pracFilter = s.id; Q = null; go('practica'); }}));
  out.push({l:'Nuevo evento', k:'Acción', run:() => openEventForm(null)}, {l:'Nuevo tema', k:'Acción', run:() => openTopicForm(null)}, {l:'Nuevo ejercicio', k:'Acción', run:() => openItemForm(null)}, {l:'Cambiar tema claro/oscuro', k:'Acción', run:toggleTheme});
  return out;
}
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function openPal(){ $('#pal').classList.add('on'); const i = $('#palIn'); i.value = ''; palFilter(''); i.focus(); }
function closePal(){ $('#pal').classList.remove('on'); }
function palFilter(q){ const all = palData(), n = norm(q); palItems = n ? all.filter(x => norm(x.l + ' ' + x.k).includes(n)) : all; palSel = 0; drawPal(); }
function drawPal(){
  $('#palList').replaceChildren(...palItems.slice(0, 40).map((x, i) => h('button', {class:'pal-item', type:'button', role:'option', 'aria-selected':String(i === palSel), onclick:() => { closePal(); x.run(); }},
    x.dot ? h('i', {class:'dot', style:`background:${x.dot}`}) : h('span', {style:'width:9px'}), x.l, h('small', null, x.k))));
  $('#palList').children[palSel]?.scrollIntoView({block:'nearest'});
}

/* =========================================================
   EJEMPLO (fechas relativas a hoy, para que nunca quede viejo)
   ========================================================= */
function makeExample(){
  const d = n => iso(addDays(TODAY, n));
  const x = blankData();
  x.subjects = [
    {id:'s-cal', name:'Cálculo Integral (ejemplo)', short:'Cálculo', code:'MAT-EJ1', color:'azul', prof:'', note:'Datos de ejemplo: edítalos o bórralos en Editar.'},
    {id:'s-alg', name:'Álgebra Lineal (ejemplo)', short:'Álgebra', code:'MAT-EJ2', color:'violeta', prof:'', note:'Datos de ejemplo.'},
    {id:'s-fis', name:'Física I (ejemplo)', short:'Física', code:'FIS-EJ', color:'naranja', prof:'', note:'Datos de ejemplo.'}];
  x.events = [
    {id:'ev-1', subj:'s-alg', kind:'control', name:'Control 2', date:d(3), time:'', slot:'Horario de clase', ver:true, src:'Ejemplo', topics:[], scopeNote:'', note:''},
    {id:'ev-2', subj:'s-fis', kind:'entrega', name:'Informe de laboratorio', date:d(2), time:'22:00', slot:'', ver:true, src:'Ejemplo', topics:[], scopeNote:'', note:''},
    {id:'ev-3', subj:'s-cal', kind:'control', name:'Control 2', date:d(10), time:'', slot:'', ver:false, src:'', topics:[], scopeNote:'Alcance no publicado', note:''},
    {id:'ev-4', subj:'s-fis', kind:'prueba', name:'Prueba 2', date:d(12), time:'09:00', slot:'', ver:true, src:'Ejemplo', topics:[], scopeNote:'', note:''},
    {id:'ev-5', subj:'s-alg', kind:'prueba', name:'Prueba 2', date:d(15), time:'18:00–20:00', slot:'', ver:false, src:'', topics:[], scopeNote:'Sin temario oficial', note:''},
    {id:'ev-6', subj:'s-cal', kind:'prueba', name:'Prueba 2', date:d(22), time:'18:00', slot:'', ver:true, src:'Ejemplo', topics:[], scopeNote:'', note:''}];
  const T = (id, subj, code, title, pre, scope = 'actual') => ({id, subj, code, title, url:'', pre, scope, prio:2});
  x.topics = [
    T('t-c1','s-cal','C1','Integración por partes',[]), T('t-c2','s-cal','C2','Fracciones parciales',[]), T('t-c3','s-cal','C3','Sustitución trigonométrica',[]),
    T('t-c4','s-cal','C4','Elegir la técnica',['t-c1','t-c2','t-c3']), T('t-c5','s-cal','C5','Área entre curvas',[]), T('t-c6','s-cal','C6','Volúmenes: discos y cascarones',['t-c5']),
    T('t-a1','s-alg','A1','Forma escalonada y rango',[]), T('t-a2','s-alg','A2','Matriz inversa',['t-a1']), T('t-a3','s-alg','A3','Determinantes',[]), T('t-a4','s-alg','A4','Subespacios',[]), T('t-a5','s-alg','A5','Base y dimensión',['t-a4'],'noconf'),
    T('t-f1','s-fis','F1','DCL y leyes de Newton',[]), T('t-f2','s-fis','F2','Planos inclinados',['t-f1']), T('t-f3','s-fis','F3','Fricción',['t-f1','t-f2']), T('t-f4','s-fis','F4','Movimiento circular',['t-f1'],'noconf'), T('t-f5','s-fis','F5','Trabajo y energía cinética',['t-f1'],'noconf')];
  const MC = (id, tpc, q, opts, ex) => ({id, topic:tpc, type:'mc', q, opts, ans:0, ex, origin:'Ejercicio de ejemplo'});
  const NUM = (id, tpc, q, ans, tol, unit, ex) => ({id, topic:tpc, type:'num', q, ans, tol, unit, ex, origin:'Ejercicio de ejemplo'});
  x.items = [
    NUM('q1','t-c2','Si $\\dfrac{x+5}{x^2+x-2} = \\dfrac{A}{x-1} + \\dfrac{B}{x+2}$, ¿cuánto vale $A$?', 2, .001, '', '$x+5 = A(x+2) + B(x-1)$. Con $x=1$: $6=3A$, así que $A=2$.'),
    MC('q2','t-c1','$\\displaystyle\\int x\\,e^{x}\\,dx =$', ['$(x-1)e^{x} + C$','$x e^{x} + C$','$(x+1)e^{x} + C$','$\\tfrac{x^2}{2}e^{x} + C$'], 'Con $u=x$ y $dv=e^x dx$: $x e^x - \\int e^x dx = (x-1)e^x + C$.'),
    NUM('q3','t-c5','Área entre $y=x$ e $y=x^2$ para $0\\le x\\le 1$ (puedes escribir una fracción).', 1/6, .002, '', '$\\int_0^1 (x-x^2)\\,dx = \\tfrac12-\\tfrac13 = \\tfrac16$.'),
    NUM('q4','t-a3','Si $A$ es $3\\times3$ y $\\det(A)=5$, ¿cuánto vale $\\det(2A)$?', 40, .001, '', '$\\det(2A)=2^3\\det(A)=40$.'),
    MC('q5','t-a4','¿Es $W=\\{(x,y): x+y=1\\}$ un subespacio de $\\mathbb{R}^2$?', ['No: no contiene al vector cero','Sí: es una recta','Sí: es cerrado bajo la suma','No: tiene infinitos elementos'], '$(0,0)$ no cumple $0+0=1$.'),
    MC('q6','t-f3','Una caja está en reposo en un piso horizontal y nadie la empuja. ¿Cuánto vale la fricción estática?', ['Cero','$\\mu_s N$','$\\mu_k N$','$mg$'], '$f_s \\le \\mu_s N$ es un tope: si nada intenta moverla, vale cero.'),
    MC('q7','t-f2','Un bloque en reposo sobre un plano inclinado de ángulo $\\theta$, sin otras fuerzas. La normal vale:', ['$mg\\cos\\theta$','$mg$','$mg\\sin\\theta$','$mg/\\cos\\theta$'], 'Perpendicular al plano no hay aceleración: $N=mg\\cos\\theta$.'),
    NUM('q8','t-f5','Una fuerza $\\vec F=(4,3)$ N actúa durante $\\Delta\\vec r=(2,-1)$ m. ¿Cuánto trabajo hace (J)?', 5, .01, 'J', '$W=\\vec F\\cdot\\Delta\\vec r=8-3=5$ J.')];
  x.resources = [{id:'r-1', subj:'s-cal', title:'Active Calculus (libro abierto)', kind:'Libro', url:'https://activecalculus.org/'}, {id:'r-2', subj:'s-fis', title:'MIT OCW 8.01SC', kind:'Videos y notas', url:'https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/'}];
  return x;
}


/* =========================================================
   CONECTAR CON WEBC / MOODLE
   El conector corre dentro de WebC con tu sesión ya iniciada (inicio con Microsoft incluido):
   CalculAi nunca ve ni guarda tu contraseña.
   ========================================================= */
const APP_BASE = location.origin + location.pathname.replace(/[^/]*$/, '');
const BOOKMARKLET = `javascript:(function(){var s=document.createElement('script');s.src='${APP_BASE}conector.js?v='+Date.now();s.onerror=function(){alert('CalculAi: WebC no dejó abrir el marcador. Recarga WebC e inténtalo de nuevo.');};document.body.appendChild(s);})();`;
let pendingWebc = null;
function webcSteps(){
  const bm = h('a', {class:'btn hlbtn', href:BOOKMARKLET, title:'Arrástrame a tu barra de marcadores', onclick:e => { e.preventDefault(); toast('Arrastra este botón a tu barra de marcadores'); }}, '⟳ Enviar a CalculAi');
  const copy = async () => { try { await navigator.clipboard.writeText(BOOKMARKLET); toast('Copiado: ahora pégalo como dirección del marcador', 4000); } catch { toast('Selecciona el texto del cuadro y cópialo'); } };
  return h('div', null,
    h('p', {class:'tiny', style:'margin:0 0 8px'}, 'El marcador corre dentro de WebC con tu sesión: trae tus cursos, fechas y avisos, y ', h('b', null, 'baja todos tus archivos de una vez'), ' para crear clases. Se guarda una sola vez y funciona en el computador.'),
    h('p', {class:'tiny', style:'margin:0 0 4px'}, h('b', null, '1. Guarda el marcador (una sola vez)')),
    h('ol', {class:'tiny', style:'padding-left:18px;margin:0 0 8px;line-height:1.6'},
      h('li', null, 'Muestra la barra de marcadores: ', h('b', null, 'Ctrl + Mayús + B'), ' (en Mac: Cmd + Mayús + B).'),
      h('li', null, 'Arrastra el botón amarillo hasta esa barra y suéltalo.')),
    h('div', {style:'display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px'}, bm, h('span', {class:'tiny muted'}, '← arrástrame a la barra de marcadores')),
    h('details', {style:'margin:0 0 12px'}, h('summary', {class:'tiny', style:'cursor:pointer;font-weight:700'}, '¿No se queda en la barra? Agrégalo copiando y pegando'),
      h('ol', {class:'tiny', style:'padding-left:18px;margin:6px 0;line-height:1.6'},
        h('li', null, h('button', {class:'btn ghost small', type:'button', onclick:copy}, '⧉ Copiar el marcador')),
        h('li', null, 'Abre tus marcadores: ', h('b', null, 'Ctrl + Mayús + O'), ' (en Mac: Cmd + Opción + B).'),
        h('li', null, 'Arriba a la derecha toca ', h('b', null, '⋮ → Agregar marcador nuevo'), '.'),
        h('li', null, 'Nombre: ', h('b', null, 'Enviar a CalculAi'), '. Dirección (URL): pega lo que copiaste. Guarda.')),
      h('input', {type:'text', readonly:true, value:BOOKMARKLET, 'aria-label':'Texto del marcador', style:'width:100%;font-family:JetBrains Mono,monospace;font-size:.72rem;border:1px solid var(--line-2);border-radius:8px;padding:6px;background:var(--card-2);color:var(--ink)', onclick:e => e.target.select()})),
    h('p', {class:'tiny', style:'margin:0 0 4px'}, h('b', null, '2. Úsalo cuando quieras actualizar')),
    h('ol', {class:'tiny', style:'padding-left:18px;margin:0 0 8px;line-height:1.6'},
      h('li', null, 'Abre ', h('a', {href:'https://webc.uai.cl/my/courses.php', target:'_blank', rel:'noopener'}, 'WebC ↗'), ' e inicia sesión como siempre.'),
      h('li', null, 'Aprieta el marcador «Enviar a CalculAi», elige tus cursos y deja marcado «Traer también los archivos».'),
      h('li', null, 'Cuando termine, aprieta «Enviar a CalculAi». Se abre CalculAi: revisas lo que llegó y lo guardas. Los archivos quedan listos en «Crear clases con mi material».')),
    h('p', {class:'tiny muted', style:'margin-top:10px'}, '¿Por qué así? WebC no deja que otra página baje sus archivos. El marcador lo hace desde dentro de WebC, con tu sesión ya abierta, sin contraseñas y sin servidores intermedios. Todo queda en tu navegador.'));
}
function webcCard(){
  if (webcToken()) return h('section', {class:'edit-sec card', style:'border:2px solid var(--ink)'},
    h('h3', {class:'display', style:'margin:0 0 4px;font-size:1.15rem'}, '⟳ WebC conectado'),
    h('p', {class:'tiny muted', style:'margin:0 0 8px'}, `CalculAi revisa WebC solo cada vez que la abres${D.sync && D.sync.webc ? ' (última revisión: ' + agoMin(D.sync.webc.at) + ')' : ''}. La clave está solo en este navegador.`),
    h('div', {class:'ai-row'}, h('button', {class:'btn small', type:'button', onclick:() => { go('ahora'); requestWebcSync(true); }}, 'Revisar ahora'), h('button', {class:'btn ghost small', type:'button', onclick:webcDisconnect}, 'Desconectar')),
    h('h4', {style:'margin:14px 0 4px'}, '⟳ Traer tus archivos para crear clases'),
    webcSteps());
  return h('section', {class:'edit-sec card', style:'border:2px solid var(--ink)'},
    h('h3', {class:'display', style:'margin:0 0 4px;font-size:1.15rem'}, '⟳ Conectar con WebC'),
    h('p', {class:'tiny', style:'margin:0 0 8px'}, h('button', {class:'btn small hlbtn', type:'button', onclick:openWebcConnect}, 'Conectar sin instalar nada'), ' ', h('span', {class:'tiny muted'}, 'o usa el marcador:')),
    h('p', {class:'tiny muted', style:'margin:0 0 6px'}, D.sync && D.sync.webc ? `Última lectura: ${fmtD(parse(D.sync.webc.at.slice(0, 10)))} desde ${D.sync.webc.origin.replace(/^https?:\/\//, '')}. Repite el paso 3 cuando quieras actualizar: no se duplica nada.` : 'Trae tus cursos, las fechas del calendario de WebC, los recursos publicados y los avisos de los profesores.'),
    webcSteps());
}
function openWebcHelp(){
  $('#drawer').classList.add('wide');
  openDrawer(h('div', {class:'drawer-head'}, h('div', {style:'flex:1'}, h('h3', null, 'Conectar con WebC')), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')), h('div', {class:'drawer-body'}, webcSteps()));
}
/* Plantilla para un compañero: sin progreso, sin nombre, sin avisos ni datos de revisión de WebC, sin plan. */
function shareTemplate(){ return {...D, owner:'', news:[], sync:{}, plan:{}}; }
async function copyInvite(){
  const txt = `Te comparto CalculAi, la app con la que estudio: ${APP_BASE}\nNo necesita cuenta y todo queda en tu navegador. Conecta tu WebC desde la app, crea clases con el material de tus cursos (en «Clases») y arma tu plan en «Calendario».`;
  try { if (navigator.share) { await navigator.share({title:'CalculAi', text:txt}); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(txt); toast('Invitación copiada: pégala en WhatsApp o donde quieras', 3500); } catch { toast(APP_BASE, 6000); }
}
async function shareToDevice(){
  const name = `calculai-respaldo-${iso(TODAY)}.json`, txt = JSON.stringify({app:'calculai', v:1, data:D, progress:P});
  try {
    const f = new File([txt], name, {type:'application/json'});
    if (navigator.canShare && navigator.canShare({files:[f]})){ await navigator.share({files:[f], title:'Mi CalculAi', text:'Ábrelo en CalculAi → Abrir archivo'}); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  download(name, txt, 'application/json');
  toast('Descargado: envíatelo (correo, WhatsApp, Drive) y ábrelo en CalculAi del otro equipo');
}
/* Recepción desde el conector */
window.addEventListener('message', ev => {
  const d = ev.data; if (!d || typeof d !== 'object') return;
  if (d.type === 'calculai-ping' && ev.source){ try { ev.source.postMessage({type:'calculai-ready'}, ev.origin); } catch {} return; }
  if (d.type === 'calculai-webc' && Array.isArray(d.courses)){
    if (d.auto){ if (ev.source === window && ev.origin === location.origin) applyAutoWebc(resolveKnownNews(d)); return; }
    try { ev.source && ev.source.postMessage({type:'calculai-received'}, ev.origin); } catch {}
    const files = d.files; delete d.files;
    if (Array.isArray(files) && files.length && ev.origin === WEBC) saveWebcFiles(files).then(n => { if (n) toast(`${plural(n, 'archivo de WebC listo', 'archivos de WebC listos')} para crear clases`, 5000); });
    d.origin = d.origin || ev.origin; receiveWebc(d);
  }
});
if (window.opener && /[?&]from=webc/.test(location.search)){ try { window.opener.postMessage({type:'calculai-ready'}, '*'); } catch {} }
function receiveWebc(d){ pendingWebc = prepareWebc(d); closeDrawer(); tab = 'webc'; render(); window.scrollTo({top:0}); }

const MONTHS = {ene:0, enero:0, jan:0, feb:1, febrero:1, mar:2, marzo:2, abr:3, abril:3, apr:3, may:4, mayo:4, jun:5, junio:5, jul:6, julio:6, ago:7, agosto:7, aug:7, sep:8, sept:8, set:8, septiembre:8, setiembre:8, oct:9, octubre:9, nov:10, noviembre:10, dic:11, diciembre:11, dec:11};
const DATE_RE = /(?:\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+)?\b(\d{1,2})\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept?|set|oct|nov|dic|jan|apr|aug|dec)\b\.?(?:\s+(?:de\s+|del\s+)?(\d{4}))?/gi;
function kindOf(t){ t = norm(t); if (/examen/.test(t)) return 'examen'; if (/\bprueba|certamen|solemne/.test(t)) return 'prueba'; if (/\bcontrol/.test(t)) return 'control'; if (/proyecto/.test(t)) return 'proyecto'; if (/entrega|plazo|informe|\blab|tarea|buzon|bitacora|cierra/.test(t)) return 'entrega'; return 'otro'; }
function newsDate(n){ if (!n.date) return null; const p = n.date.split('|'); if (p.length < 3) return n.date.slice(0, 10); const m = MONTHS[norm(p[1])]; return m == null ? null : iso(new Date(+p[0], m, +p[2])); }
function extractDates(n){
  const out = [], post = newsDate(n), postD = post ? parse(post) : TODAY;
  const re = new RegExp(DATE_RE.source, 'gi');
  const lines = String(n.text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  lines.forEach(line => {
    if (/^de\s+.+\s-\s\w+,\s+\d/.test(line)) return; // cabecera del post
    let m; re.lastIndex = 0;
    while ((m = re.exec(line))){
      const day = +m[1], mon = MONTHS[norm(m[2])]; if (mon == null || day < 1 || day > 31) continue;
      let y = m[3] ? +m[3] : postD.getFullYear(); let d = new Date(y, mon, day);
      if (!m[3] && d < addDays(postD, -60)) d = new Date(y + 1, mon, day);
      const after = line.slice(m.index + m[0].length, m.index + m[0].length + 40), before = line.slice(Math.max(0, m.index - 25), m.index);
      const tm = after.match(/(?:a\s+las\s+|,\s*|\s)(\d{1,2})(?::|\.|h)(\d{2})(?:\s*(?:-|–|a)\s*(\d{1,2})(?::|\.)(\d{2}))?/) || before.match(/(\d{1,2}):(\d{2})\s*$/) || after.match(/a\s+las\s+(\d{1,2})\s*(?:hrs?|horas)/);
      let time = '';
      if (tm){ const H = +tm[1], Mi = tm[2] && tm[2].length === 2 ? tm[2] : '00'; if (H <= 23){ time = `${pad(H)}:${Mi}`; if (tm[3]) time += `–${pad(+tm[3])}:${tm[4]}`; } }
      let name = line.replace(new RegExp(DATE_RE.source, 'gi'), '').replace(/(?:a\s+las\s+)?\d{1,2}[:.h]\d{2}(\s*(hrs?|horas))?/gi, '').replace(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s:,.\-–]+|[\s:,.\-–]+$/g, '');
      const kw = line.match(/\b(prueba|control|examen|certamen|solemne|entrega|informe|laboratorio|lab\s?\d*|proyecto|tarea|interrogaci[oó]n|bit[aá]cora)\b[^.,;\n]{0,48}/i);
      if (kw){ let k2 = kw[0].replace(new RegExp(DATE_RE.source, 'gi'), '').replace(/(?:a\s+las\s+)?\d{1,2}[:.h]\d{2}(\s*(hrs?|horas))?/gi, '').replace(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi, '').replace(/\s+(es|ser[aá]n?|se|queda|qued[oó]|cambia|para|el\s+d[ií]a|hasta|a\s+partir)(?=\s|$).*$/i, '').replace(/\s{2,}/g, ' ').trim(); if (k2.length >= 3) name = k2.charAt(0).toUpperCase() + k2.slice(1); }
      if (name.length < 3) name = n.title; if (name.length > 70) name = name.slice(0, 67) + '…';
      out.push({date:iso(d), time, kind:kindOf(line + ' ' + (name === n.title ? n.title : '')), name, line:line.slice(0, 220)});
    }
  });
  return out;
}
function cleanEvName(s){ return String(s || '').replace(/^Vencimiento de\s+/i, '').replace(/^La entrega de\s+/i, '').trim(); }
function prepareWebc(d){
  const P2 = {origin:d.origin || '', at:d.at || new Date().toISOString(), courses:[]};
  (d.courses || []).forEach((c, ci) => {
    const byCode = c.code && D.subjects.find(s => s.code && s.code.toUpperCase() === c.code.toUpperCase());
    const byWebc = D.subjects.find(s => s.webc === c.id);
    const byName = D.subjects.find(s => norm(s.name).startsWith(norm(c.name).split(' ')[0]));
    const target = (byWebc || byCode || byName || {}).id || 'new';
    const subjFor = target === 'new' ? null : target;
    const evs = (c.events || []).filter(e => e.ts).map(e => { const dt = new Date(e.ts * 1000); const id = 'cal:' + e.id; const exist = D.events.find(x => x.webc === id);
      return {sel: dt >= addDays(TODAY, -1) || !!exist, id, date:iso(dt), time:`${pad(dt.getHours())}:${pad(dt.getMinutes())}`, name:cleanEvName(e.name), kind:/assign/.test(e.type) ? 'entrega' : /quiz/.test(e.type) ? 'control' : 'entrega', url:e.url || '', exist:!!exist}; });
    const sugg = []; const seen = new Set();
    (c.news || []).forEach(n => extractDates(n).forEach((x, k) => {
      const key = x.date + '|' + norm(x.name); if (seen.has(key)) return; seen.add(key);
      if (parse(x.date) < addDays(TODAY, -1)) return;
      const id = 'news:' + n.id + ':' + x.date + ':' + norm(x.name).slice(0, 20);
      const dup = subjFor && D.events.find(e => e.subj === subjFor && e.date === x.date && (e.webc === id || norm(e.name) === norm(x.name) || e.kind === x.kind));
      const already = D.events.find(e => e.webc === id);
      const calDup = evs.some(e => e.date === x.date && e.kind === x.kind);
      sugg.push({...x, id, newsTitle:n.title, newsUrl:n.url, newsDate:newsDate(n), sel:!already && !dup && !calDup && x.kind !== 'otro', dup:!!(already || dup), calDup});
    }));
    P2.courses.push({c, include:true, target, evs, sugg, addRes:true, addNews:true});
  });
  return P2;
}
function vWebcReview(v){
  const W2 = pendingWebc;
  if (!W2){ tab = 'ahora'; render(); return; }
  v.append(h('div', {class:'sec-title'}, h('h2', null, 'Datos de WebC'), h('span', {class:'hand'}, 'revisa antes de guardar')));
  v.append(h('p', {class:'muted', style:'margin:0'}, `Llegaron desde ${W2.origin.replace(/^https?:\/\//, '')} (${fmtD(parse(W2.at.slice(0, 10)))}). Nada se guarda hasta que presiones «Guardar en CalculAi». Al repetir la conexión, lo ya importado se actualiza en vez de duplicarse.`));
  W2.courses.forEach(row => {
    const c = row.c;
    const opts = [['new', '➕ Crear materia nueva'], ...D.subjects.map(s => [s.id, '↔ Unir con «' + s.name + '»'])];
    const sel = h('select', {onchange:e => { row.target = e.target.value; }}, opts.map(([k, l]) => { const o = h('option', {value:k}, l); if (row.target === k) o.selected = true; return o; }));
    const card = h('section', {class:'card', style:'margin-top:16px'},
      h('div', {style:'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center'},
        h('label', {class:'chk'}, h('input', {type:'checkbox', checked:row.include || null, onchange:e => { row.include = e.target.checked; render(); }}), h('span', null, c.name, ' ', h('small', {class:'muted', style:'font-weight:400'}, [c.code, c.section].filter(Boolean).join(' · ')))),
        row.include ? h('label', {class:'field', style:'min-width:230px'}, sel) : null));
    if (row.include){
      if (row.evs.length) card.append(h('h4', {class:'wh'}, `Fechas del calendario de WebC (${row.evs.length})`), h('div', {class:'wlist'}, row.evs.map(e => h('label', {class:'wrow'},
        h('input', {type:'checkbox', checked:e.sel || null, onchange:ev => e.sel = ev.target.checked}),
        h('span', null, h('b', null, e.name), h('small', null, ` · ${cap(fmtD(parse(e.date)))} · ${e.time}${e.exist ? ' · se actualizará' : ''}`))))));
      card.append(h('h4', {class:'wh'}, `Fechas encontradas en los avisos (${row.sugg.length})`));
      if (!row.sugg.length) card.append(h('p', {class:'tiny muted'}, c.news.length ? 'No encontré fechas futuras en los avisos recientes.' : 'Este curso no tiene un foro de avisos que pueda leer.'));
      else card.append(h('p', {class:'tiny muted', style:'margin:0 0 6px'}, 'Las detecté leyendo el texto de los avisos: revisa nombre, tipo y fecha, y desmarca las que no correspondan.'),
        h('div', {class:'wlist'}, row.sugg.map(x => h('div', {class:'wrow sugg'},
          h('input', {type:'checkbox', checked:x.sel || null, 'aria-label':'Importar', onchange:ev => x.sel = ev.target.checked}),
          h('div', {style:'min-width:0;flex:1'},
            h('div', {class:'srow'},
              h('select', {onchange:ev => x.kind = ev.target.value}, Object.entries(KIND).map(([k, o]) => { const op = h('option', {value:k}, o.l); if (x.kind === k) op.selected = true; return op; })),
              h('input', {type:'text', value:x.name, oninput:ev => x.name = ev.target.value, 'aria-label':'Nombre'}),
              h('input', {type:'date', value:x.date, oninput:ev => x.date = ev.target.value, 'aria-label':'Fecha'}),
              h('input', {type:'text', value:x.time, placeholder:'hora', oninput:ev => x.time = ev.target.value, style:'width:110px', 'aria-label':'Hora'})),
            h('div', {class:'tiny muted', style:'margin-top:4px'}, '«' + x.line + '» — aviso ', x.newsUrl ? h('a', {href:x.newsUrl, target:'_blank', rel:'noopener'}, x.newsTitle) : x.newsTitle, x.dup ? h('b', {style:'color:var(--margin)'}, ' · ya está en tu calendario') : x.calDup ? h('b', {style:'color:var(--margin)'}, ' · parece repetir una fecha del calendario de WebC') : null))))));
      card.append(h('div', {style:'display:flex;gap:16px;flex-wrap:wrap;margin-top:12px'},
        h('label', {class:'chk'}, h('input', {type:'checkbox', checked:row.addRes || null, onchange:e => row.addRes = e.target.checked}), `Agregar ${plural(c.resources.length, 'recurso', 'recursos')} (archivos, guías, enlaces)`),
        h('label', {class:'chk'}, h('input', {type:'checkbox', checked:row.addNews || null, onchange:e => row.addNews = e.target.checked}), `Guardar ${plural(c.news.length, 'aviso', 'avisos')} para leerlos aquí`)));
    }
    v.append(card);
  });
  v.append(h('div', {style:'display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:18px;position:sticky;bottom:12px;background:var(--card);border:1px solid var(--line-2);border-radius:14px;padding:10px 12px;box-shadow:var(--shadow);z-index:5'},
    h('button', {class:'btn hlbtn', type:'button', onclick:applyWebc}, '✓ Guardar en CalculAi'),
    h('button', {class:'btn ghost', type:'button', onclick:() => { pendingWebc = null; go(D.subjects.length ? 'ahora' : 'ahora'); }}, 'Cancelar')));
}
function applyWebc(){
  const W2 = pendingWebc; if (!W2) return;
  let nS = 0, nE = 0, nU = 0, nR = 0, nN = 0;
  W2.courses.filter(r => r.include).forEach(row => {
    const c = row.c; let sid = row.target;
    if (sid === 'new'){ sid = uid('s'); D.subjects.push({id:sid, name:c.name, short:c.short || c.name.split(' ')[0], code:c.code || '', color:COLORS[D.subjects.length % COLORS.length], prof:c.section || '', note:'Importada desde WebC.', webc:c.id, url:c.url}); nS++; }
    else { const s = D.subjects.find(x => x.id === sid); if (s){ s.webc = c.id; s.url = s.url || c.url; } }
    row.evs.filter(e => e.sel).forEach(e => {
      const ex = D.events.find(x => x.webc === e.id);
      const n = {subj:sid, kind:e.kind, name:e.name, date:e.date, time:e.time, slot:'', ver:true, src:`WebC · calendario del curso (${fmtD(parse(W2.at.slice(0, 10)))})`, topics:[], scopeNote:'', note:'', webc:e.id, url:e.url};
      if (ex){ Object.assign(ex, n); nU++; } else { D.events.push({id:uid('ev'), ...n}); nE++; }
    });
    row.sugg.filter(x => x.sel && x.date).forEach(x => {
      const ex = D.events.find(e => e.webc === x.id);
      const n = {subj:sid, kind:x.kind, name:x.name.trim() || x.newsTitle, date:x.date, time:(x.time || '').trim(), slot:'', ver:true, src:`WebC · aviso «${x.newsTitle}»${x.newsDate ? ' (' + fmtD(parse(x.newsDate)) + ')' : ''}`, topics:[], scopeNote:'', note:'Fecha leída automáticamente del aviso y revisada por ti al importar.', webc:x.id};
      if (ex){ Object.assign(ex, n); nU++; } else { D.events.push({id:uid('ev'), ...n}); nE++; }
    });
    if (row.addRes) c.resources.forEach(r => { const ex = D.resources.find(x => x.url === r.url); if (ex){ if (r.file){ ex.file = r.file; ex.fname = r.fname; } return; } D.resources.push({id:uid('r'), subj:sid, title:r.name, kind:({resource:'Archivo', url:'Enlace', folder:'Carpeta', page:'Página', assign:'Tarea', quiz:'Cuestionario', book:'Libro'}[r.type] || 'Recurso') + (r.section ? ' · ' + r.section : ''), url:r.url, webc:true, ...(r.file ? {file:r.file, fname:r.fname} : {})}); nR++; });
    if (row.addNews){ D.news = (D.news || []).filter(n => n.subj !== sid); c.news.forEach(n => D.news.push({id:'n-' + n.id, subj:sid, title:n.title, url:n.url, author:n.author, date:newsDate(n), text:n.text})); nN += c.news.length; }
  });
  D.sync = D.sync || {}; D.sync.webc = {origin:W2.origin, at:W2.at};
  pendingWebc = null; save(); go('ahora');
  toast(`WebC: ${nS} materias nuevas · ${nE} fechas nuevas · ${nU} actualizadas · ${nR} recursos · ${nN} avisos`);
}

/* =========================================================
   REVISIÓN AUTOMÁTICA AL ABRIR: WebC (script de revisión) + Outlook (opcional)
   Lo que llega con fecha clara del calendario de WebC se agrega solo;
   las fechas leídas en avisos o correos quedan en «Para revisar».
   ========================================================= */
const SYNC = {agent:null, agentWhy:'', webc:'idle', webcMsg:'', outlook:'idle', outlookMsg:'', lastPayload:null};
const STALE_MIN = 15;
const USERSCRIPT_URL = APP_BASE + 'calculai-sync.user.js';
const SCRIPT_V = '1.2.0'; // versión publicada de calculai-sync.user.js (súbela junto con @version del script)
const verLt = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++){ if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
function syncData(){ D.sync = D.sync || {}; for (const k of ['inbox', 'dismissed', 'ignoredCourses']) if (!Array.isArray(D.sync[k])) D.sync[k] = []; return D.sync; }
const minsSince = s => s ? (Date.now() - new Date(s).getTime()) / 60000 : Infinity;
function agoMin(s){ const m = minsSince(s); if (!isFinite(m)) return 'nunca'; if (m < 1) return 'recién'; if (m < 60) return `hace ${Math.round(m)} min`; if (m < 1440) return `hace ${Math.round(m / 60)} h`; return `hace ${Math.round(m / 1440)} d`; }
/* El script solo puede conectarse a WebC (@connect webc.uai.cl): otra dirección guardada (p. ej. en un archivo compartido) no se usa. */
const webcBase = () => { const o = D.sync && D.sync.webc && D.sync.webc.origin; return /^https:\/\/webc\.uai\.cl$/.test(o || '') ? o : 'https://webc.uai.cl'; };

/* ---------- WebC directo desde la app (sin instalar nada) ----------
   Usa el servicio de la app móvil de Moodle. La persona abre en WebC el inicio de sesión de la app
   (admin/tool/mobile/launch.php, el mismo que usa la app de WebC con Microsoft), copia el enlace
   «Haga clic aquí si la app no se abre…» y lo pega en CalculAi. Ese enlace trae una clave del servicio
   móvil; con ella CalculAi lee WebC directo: webservice/rest/server.php y webservice/pluginfile.php
   aceptan pedidos desde otras páginas (Access-Control-Allow-Origin: *, verificado en el código de Moodle).
   La clave queda solo en este navegador (localStorage), nunca en D, respaldos ni plantillas. */
const WEBC = 'https://webc.uai.cl';
const webcToken = () => lsGet('calculai-webc-token');
const webcOn = () => !!webcToken() || !!SYNC.agent;
const webcLaunchUrl = () => `${WEBC}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${Math.random().toString(36).slice(2, 12)}&urlscheme=calculai&confirmed=1`;
function parseWebcKey(txt){
  txt = String(txt || '').trim(); const m = txt.match(/token=([A-Za-z0-9+/=_-]+)/); let raw = m ? m[1] : txt;
  if (/^[a-f0-9]{32}$/i.test(raw)) return raw;
  try { const parts = atob(raw.replace(/-/g, '+').replace(/_/g, '/')).split(':::'); if (parts[1] && /^[a-f0-9]{32}$/i.test(parts[1])) return parts[1]; } catch {}
  return null;
}
function wsForm(obj, prefix, out){ for (const [k, v] of Object.entries(obj)){ const key = prefix ? `${prefix}[${k}]` : k; if (v != null && typeof v === 'object') wsForm(v, key, out); else if (v != null) out.append(key, String(v)); } return out; }
async function ws(fn, args = {}, token = webcToken()){
  const body = wsForm(args, '', new URLSearchParams({wstoken:token, wsfunction:fn, moodlewsrestformat:'json'}));
  let r; try { r = await fetch(WEBC + '/webservice/rest/server.php', {method:'POST', body}); } catch { throw new Error('WebC no permitió la conexión directa desde CalculAi'); }
  if (!r.ok) throw new Error('WebC respondió ' + r.status);
  const j = await r.json().catch(() => null);
  if (j && j.exception){ if (/invalidtoken|accessexception|invalidlogin/i.test(j.errorcode || '')) throw new Error('TOKEN'); throw new Error(j.message || j.errorcode || 'error de WebC'); }
  return j;
}
const WEBC_TYPES = /\s+(Archivo|URL|Tarea|Foro|Carpeta|Cuestionario|Página|Pagina|File|Assignment|Forum|Folder|Quiz|Page)$/;
function webcMeta(c){
  const full = String(c.fullname || '').replace(/\s+/g, ' ').trim(), base = full.split(/\s+Sec\.|\s+Secci[oó]n|\s+STGO|\s+S-SEM/i)[0].trim();
  const tc = x => x.toLowerCase().split(' ').map((w, i) => /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/.test(w) ? w.toUpperCase() : i > 0 && /^(de|del|la|las|el|los|y|e|en|a|para)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const name = base === base.toUpperCase() ? tc(base) : base, code = ((c.shortname || '') + ' ' + (c.idnumber || '')).match(/[A-Z]{3,4}\d{3,4}/), sec = full.match(/Sec\.?\s*(\d+)/i);
  return {name, short:name.split(' ')[0].slice(0, 18), code:code ? code[0] : '', section:sec ? 'Sección ' + sec[1] : '', academic:!!code};
}
function htmlText(html){
  const d = new DOMParser().parseFromString(String(html || ''), 'text/html');
  d.querySelectorAll('br').forEach(b => b.replaceWith('\n')); d.querySelectorAll('p,div,li,h1,h2,h3,h4,tr').forEach(x => x.append('\n'));
  return (d.body ? d.body.textContent : '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function poolRun(items, n, fn){ let next = 0; const run = async () => { while (next < items.length){ const k = next++; await fn(items[k], k); } }; await Promise.all(Array.from({length:Math.min(n, items.length)}, run)); }
/* Lo mismo que hace el script (mismo formato de datos), pero desde CalculAi con la clave. */
async function restSync(rq){
  const started = Date.now(), timeUp = () => Date.now() - started > 100000;
  const want = (rq.courses || []).map(Number), codes = (rq.codes || []).map(c => String(c).toUpperCase().replace(/[^A-Z0-9]/g, ''));
  const say = (state, msg) => { SYNC.ack = true; SYNC.webc = state; SYNC.webcMsg = msg || ''; paintSync(); };
  say('checking', 'abriendo WebC');
  const info = await ws('core_webservice_get_site_info');
  say('checking', 'leyendo tus cursos');
  let list;
  try { list = (await ws('core_course_get_enrolled_courses_by_timeline_classification', {classification:'inprogress', limit:0, offset:0, sort:'fullname'})).courses || []; }
  catch (e) { if (e.message === 'TOKEN') throw e; list = await ws('core_enrol_get_users_courses', {userid:info.userid}); }
  const all = (list || []).filter(c => webcMeta(c).academic);
  const linked = c => want.includes(c.id) || (!!webcMeta(c).code && codes.includes(webcMeta(c).code.toUpperCase()));
  const sel = all.filter(linked), now = Math.floor(Date.now() / 1000), events = {};
  (await Promise.all([ws('core_calendar_get_action_events_by_timesort', {timesortfrom:now - 14 * 86400, limitnum:50}).catch(() => ({})),
    ws('core_calendar_get_calendar_upcoming_view', {courseid:1, categoryid:0}).catch(() => ({}))])).forEach(r => ((r && r.events) || []).forEach(e => { events[e.id] = e; }));
  const forums = sel.length ? await ws('mod_forum_get_forums_by_courses', {courseids:sel.map(c => c.id)}).catch(() => []) : [];
  const payload = {type:'calculai-webc', v:1, origin:WEBC, site:info.sitename || 'WebC', at:new Date().toISOString(), courses:[], partial:false, auto:true};
  let done = 0; if (sel.length) say('reading', '0/' + sel.length);
  await poolRun(sel, 3, async c => {
    const m = webcMeta(c), out = {id:c.id, fullname:c.fullname, shortname:c.shortname, url:`${WEBC}/course/view.php?id=${c.id}`, name:m.name, short:m.short, code:m.code, section:m.section, events:[], resources:[], news:[]};
    Object.values(events).forEach(e => { const cid = e.course ? e.course.id : e.courseid; if (cid === c.id) out.events.push({id:e.id, name:e.name, ts:e.timesort || e.timestart, type:e.modulename || e.eventtype || '', url:e.url || (e.action && e.action.url) || ''}); });
    if (timeUp()) payload.partial = true;
    else {
      try {
        (await ws('core_course_get_contents', {courseid:c.id}) || []).forEach(sec => (sec.modules || []).forEach(mod => {
          if (!['resource', 'url', 'folder', 'page', 'assign', 'quiz', 'book'].includes(mod.modname) || !mod.url) return;
          const f = (mod.contents || [])[0], file = /^(resource|page)$/.test(mod.modname) && f && /\/webservice\/pluginfile\.php\//.test(f.fileurl || '') ? f.fileurl : '';
          out.resources.push({name:String(mod.name || '').trim().replace(WEBC_TYPES, ''), url:mod.url, type:mod.modname, section:String(sec.name || '').trim(), file, fname:file ? String(f.filename || '') : ''});
        }));
      } catch (e) { if (e.message === 'TOKEN') throw e; }
      const fo = (forums || []).find(x => x.course === c.id && x.type === 'news');
      if (fo && !timeUp()){
        try { ((await ws('mod_forum_get_forum_discussions', {forumid:fo.id, page:0, perpage:6})).discussions || []).forEach(x => out.news.push({id:String(x.discussion), title:x.name || x.subject || 'Aviso', url:`${WEBC}/mod/forum/discuss.php?d=${x.discussion}`, author:x.userfullname || '', date:iso(new Date(x.created * 1000)), text:htmlText(x.message).slice(0, 5000)})); }
        catch (e) { if (e.message === 'TOKEN') throw e; }
      } else if (fo) payload.partial = true;
    }
    payload.courses.push(out); done++; say('reading', done + '/' + sel.length);
  });
  payload.unlinked = all.filter(c => !linked(c)).map(c => { const mm = webcMeta(c); return {id:c.id, name:mm.name, code:mm.code}; });
  payload.ms = Date.now() - started;
  return payload;
}
async function webcFileByToken(r){
  let res; try { res = await fetch(r.file + (r.file.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(webcToken())); } catch { throw new Error('BLOCKED'); }
  const ctype = res.headers.get('content-type') || '';
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'tu conexión con WebC venció: conéctala de nuevo' : 'WebC respondió ' + res.status);
  const buf = await res.arrayBuffer();
  if (/json/.test(ctype) && buf.byteLength < 2000) throw new Error('tu conexión con WebC venció: conéctala de nuevo');
  return {name:r.fname || r.title, ctype, buf};
}
/* Panel «Conectar con WebC»: abrir, copiar el enlace y pegarlo. */
function openWebcConnect(){
  const status = h('p', {class:'tiny gen-status', role:'status'});
  const tryKey = async txt => {
    const key = parseWebcKey(txt);
    if (!key){ status.textContent = txt.trim() ? 'Ese texto no trae la clave: copia la dirección del enlace (clic derecho → «Copiar dirección del enlace»), no el texto que se ve.' : ''; return; }
    status.textContent = 'Comprobando con WebC…';
    try {
      await ws('core_webservice_get_site_info', {}, key);
      lsSet('calculai-webc-token', key); closeDrawer(); toast('WebC conectado: ya puedo revisarlo solo', 4000);
      if (!D.subjects.length){ SYNC.first = true; render(); } SYNC.webc = 'idle'; requestWebcSync(true);
    } catch (e) { status.textContent = e.message === 'TOKEN' ? 'WebC dice que esa clave no sirve. Vuelve al paso 1 y copia el enlace nuevo.' : `No se pudo: ${e.message}. Prueba con el marcador (abajo).`; }
  };
  const inp = h('input', {type:'text', class:'ai-key-in', style:'width:100%;max-width:none', placeholder:'Pega aquí el enlace copiado', 'aria-label':'Enlace de WebC', autocomplete:'off', spellcheck:'false',
    onpaste:e => setTimeout(() => tryKey(e.target.value), 0), onchange:e => tryKey(e.target.value)});
  $('#drawer').classList.add('wide');
  openDrawer(h('div', {class:'drawer-head'}, h('div', {style:'flex:1'}, h('h3', null, 'Conectar con WebC')), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')),
    h('div', {class:'drawer-body'},
      h('p', {class:'tiny muted', style:'margin:0 0 10px'}, 'Sin instalar nada: usas el mismo inicio de sesión que la app de WebC. Se hace una sola vez en este navegador.'),
      h('ol', {class:'connect-steps'},
        h('li', null, h('a', {class:'btn hlbtn', href:webcLaunchUrl(), target:'_blank', rel:'noopener'}, '⟳ Abrir WebC'), h('div', {class:'tiny muted'}, 'Si te lo pide, inicia sesión como siempre (con Microsoft).')),
        h('li', null, h('b', null, 'En la página que se abre, copia el enlace para abrir la app.'), h('div', {class:'tiny muted'}, 'Dice algo como «Haga clic aquí si la app no se abre automáticamente». En el computador: clic derecho sobre el enlace → «Copiar dirección del enlace». En el celular: mantén presionado el enlace → «Copiar enlace».')),
        h('li', null, h('b', null, 'Pégalo aquí:'), inp, status)),
      h('p', {class:'tiny muted'}, 'Qué guarda: una clave como la que usa la app de WebC, solo en este navegador. No es tu contraseña y no va en tus respaldos ni plantillas. La puedes quitar en Editar → «Conectar con WebC».'),
      h('details', {style:'margin-top:12px'}, h('summary', {class:'tiny', style:'cursor:pointer;font-weight:700'}, '¿No funciona? Otras formas de conectar'),
        h('div', {style:'margin-top:8px'}, webcSteps()),
        h('p', {class:'tiny'}, h('button', {class:'linkbtn', type:'button', onclick:openAutoSyncHelp}, 'Revisión con script (Tampermonkey)')))));
  setTimeout(() => inp.focus(), 50);
}
function webcDisconnect(){ lsSet('calculai-webc-token', ''); SYNC.webc = 'idle'; render(); toast('WebC desconectado de este navegador'); }

function requestWebcSync(force, extraCourses = []){
  if (!webcOn() || (!D.subjects.length && !SYNC.first)) return false;
  if (SYNC.webc === 'checking' || SYNC.webc === 'reading') return false;
  if (!force && minsSince(D.sync && D.sync.webc && D.sync.webc.at) < STALE_MIN) return false;
  SYNC.webc = 'checking'; SYNC.webcMsg = ''; SYNC.startAt = Date.now(); SYNC.ack = false; paintSync();
  /* known: avisos que ya están guardados, por curso de WebC; el script (v1.1+) no los vuelve a abrir. */
  const known = {};
  D.subjects.forEach(s => { if (!s.webc) return; known[s.webc] = (D.news || []).filter(n => n.subj === s.id && n.src === 'webc' && /^n-/.test(n.id)).map(n => n.id.slice(2)); });
  const rq = {type:'calculai-sync-request', base:webcBase(), courses:D.subjects.map(s => s.webc).filter(Boolean).concat(extraCourses), codes:D.subjects.map(s => s.code).filter(Boolean), known};
  if (webcToken()){
    clearTimeout(SYNC._t);
    restSync(rq).then(d => applyAutoWebc(resolveKnownNews(d))).catch(e => {
      if (e.message === 'TOKEN'){ lsSet('calculai-webc-token', ''); SYNC.webc = 'relink'; } else { SYNC.webc = 'error'; SYNC.webcMsg = e.message; }
      SYNC.first = false; paintSync();
    });
    return true;
  }
  window.postMessage(rq, location.origin);
  clearTimeout(SYNC._t); SYNC._t = setTimeout(() => { if (SYNC.webc === 'checking' || SYNC.webc === 'reading'){ SYNC.webc = 'error'; SYNC.webcMsg = 'WebC no respondió a tiempo'; paintSync(); } }, 150000);
  /* Si el script no acusa recibo en 12 s, el problema es el script (no WebC): se dice de inmediato. */
  clearTimeout(SYNC._ack); SYNC._ack = setTimeout(() => { if (!SYNC.ack && SYNC.webc === 'checking'){ clearTimeout(SYNC._t); SYNC.webc = 'error'; SYNC.webcMsg = 'el script de revisión no recibió el pedido: actualízalo'; paintSync(); } }, 12000);
  return true;
}
/* Los avisos que el script marca como ya conocidos (known:true) llegan sin texto: se completan con lo guardado. */
function resolveKnownNews(d){
  (d.courses || []).forEach(c => {
    c.news = (c.news || []).map(n => {
      if (!n.known) return n;
      const ex = (D.news || []).find(x => x.id === 'n-' + n.id);
      return ex ? {id:n.id, title:ex.title || n.title, url:ex.url || n.url, author:ex.author || '', date:ex.date || null, text:ex.text || '', known:true} : null;
    }).filter(Boolean);
  });
  return d;
}
/* Si un aviso nombra una evaluación que ya está en el calendario (misma materia, mismo tipo y número, p. ej.
   «Control 2») pero con otra fecha, es un posible cambio de fecha: se propone mover esa evaluación, no duplicarla. */
function evalTag(t){ const m = norm(String(t || '')).match(/\b(control|prueba|examen|certamen|solemne|interrogacion|entrega|informe|proyecto|tarea|laboratorio)\s*(?:n[°º.o]?\s*)?(\d+)?/); return m ? {w:m[1], n:m[2] || ''} : null; }
function sameEval(x){
  if (!x.subj) return null;
  const a = evalTag(x.name) || evalTag(x.line); if (!a) return null;
  const c = D.events.filter(e => e.subj === x.subj && e.date !== x.date && parse(e.date) >= addDays(TODAY, -1)).filter(e => { const b = evalTag(e.name); return b && b.w === a.w && b.n === a.n; });
  return c.length === 1 ? c[0] : null;
}
function addToInbox(x){
  const sd = syncData();
  if (!x.date || sd.dismissed.includes(x.id) || sd.inbox.some(y => y.id === x.id)) return false;
  if (D.events.some(e => e.webc === x.id || (x.subj && e.subj === x.subj && e.date === x.date && (e.kind === x.kind || norm(e.name) === norm(x.name))))) return false;
  if (parse(x.date) < TODAY) return false;
  const ev = sameEval(x);
  sd.inbox.push({id:x.id, src:x.src, subj:x.subj || '', kind:x.kind, name:ev ? ev.name : x.name, date:x.date, time:x.time || '', line:x.line || '', title:x.newsTitle || x.title || '', url:x.newsUrl || x.url || '', found:new Date().toISOString(), replaces:ev ? ev.id : undefined, oldDate:ev ? ev.date : undefined});
  return true;
}
function applyAutoWebc(d){
  clearTimeout(SYNC._t);
  SYNC.lastPayload = d;
  if (SYNC.first && !D.subjects.length && !SYNC.addCourses){
    SYNC.webc = 'ok'; render();
    const list = (d.unlinked || []).concat((d.courses || []).map(c => ({id:c.id, name:c.name, code:c.code})));
    if (list.length) firstPicker(list); else { SYNC.first = false; toast('No encontré cursos en tu WebC', 4000); }
    return;
  }
  SYNC.first = false;
  const W2 = prepareWebc(d), sd = syncData();
  const known = new Set((D.news || []).map(n => n.id));
  let nE = 0, nU = 0, nR = 0, nN = 0, nS = 0, nC = 0;
  const fresh = [], items = []; // items: lo nuevo de esta revisión, para la tarjeta «Novedades»
  W2.courses.forEach(row => {
    const c = row.c, sid = row.target;
    if (sid === 'new'){ if (!sd.ignoredCourses.includes(c.id)) fresh.push({id:c.id, name:c.name, code:c.code}); return; }
    const s = D.subjects.find(x => x.id === sid); if (s){ s.webc = c.id; s.url = s.url || c.url; }
    row.evs.filter(e => e.sel && !sd.dismissed.includes(e.id)).forEach(e => {
      const ex = D.events.find(x => x.webc === e.id);
      if (ex){ if (ex.date !== e.date || ex.time !== e.time){ ex.date = e.date; ex.time = e.time; ex.src = `WebC · calendario del curso (revisado ${fmtD(TODAY)})`; nU++; items.push({k:'cambio', t:ex.name, subj:sid, date:e.date}); } }
      else { D.events.push({id:uid('ev'), subj:sid, kind:e.kind, name:e.name, date:e.date, time:e.time, slot:'', ver:true, src:`WebC · calendario del curso (${fmtD(TODAY)})`, topics:[], scopeNote:'', note:'Agregada automáticamente desde el calendario de WebC.', webc:e.id, url:e.url}); nE++; items.push({k:'fecha', t:e.name, subj:sid, date:e.date}); }
    });
    c.resources.forEach(r => { const ex = D.resources.find(x => x.url === r.url); if (ex){ if (r.file && ex.file !== r.file){ ex.file = r.file; ex.fname = r.fname; } return; } D.resources.push({id:uid('r'), subj:sid, title:r.name, kind:({resource:'Archivo', url:'Enlace', folder:'Carpeta', page:'Página', assign:'Tarea', quiz:'Cuestionario', book:'Libro'}[r.type] || 'Recurso') + (r.section ? ' · ' + r.section : ''), url:r.url, webc:true, ...(r.file ? {file:r.file, fname:r.fname} : {})}); nR++; items.push({k:'recurso', t:r.name, subj:sid, url:r.url}); });
    /* Avisos: se reemplazan los de WebC de esta materia por la lista recibida (los ya conocidos llegan completados
       por resolveKnownNews). Nunca se tocan temas, clases, ejercicios ni progreso. */
    if (c.news.length){
      D.news = (D.news || []).filter(n => !(n.subj === sid && n.src !== 'outlook'));
      c.news.forEach(n => { const id = 'n-' + n.id; const isNew = !known.has(id); if (isNew){ nN++; items.push({k:'aviso', t:n.title, subj:sid, id}); } D.news.push({id, subj:sid, title:n.title, url:n.url, author:n.author, date:newsDate(n), text:n.text, src:'webc', fresh:isNew || undefined}); });
    }
    row.sugg.forEach(x => {
      if (x.dup || x.calDup || x.kind === 'otro' || !addToInbox({...x, subj:sid, src:'webc'})) return;
      const it = sd.inbox[sd.inbox.length - 1];
      if (it.replaces){ nC++; items.push({k:'posible', t:`${it.name}: ${fmtD(parse(it.oldDate))} → ${fmtD(parse(it.date))}`, subj:sid}); } else nS++;
    });
  });
  (d.unlinked || []).forEach(c => { if (!sd.ignoredCourses.includes(c.id) && !fresh.some(f => f.id === c.id)) fresh.push(c); });
  sd.newCourses = fresh;
  sd.webc = {origin:W2.origin, at:W2.at, auto:true, partial:!!d.partial, last:{nE, nU, nR, nN, nS, nC}};
  if (nS) items.push({k:'revisar', t:plural(nS, 'fecha encontrada en avisos', 'fechas encontradas en avisos'), subj:''});
  if (items.length){
    const prev = sd.novedades && !sd.novedades.seen ? sd.novedades.items : [];
    sd.novedades = {at:W2.at, seen:false, items:items.concat(prev).slice(0, 40)};
  }
  SYNC.webc = 'ok'; SYNC.webcMsg = '';
  save(); render();
  const parts = [nC && plural(nC, 'posible cambio de fecha (revísalo en «Para revisar»)', 'posibles cambios de fecha (revísalos en «Para revisar»)'), nE && plural(nE, 'fecha nueva', 'fechas nuevas'), nU && plural(nU, 'fecha cambiada', 'fechas cambiadas'), nN && plural(nN, 'aviso nuevo', 'avisos nuevos'), nR && plural(nR, 'recurso nuevo', 'recursos nuevos'), nS && plural(nS, 'fecha por revisar', 'fechas por revisar')].filter(Boolean);
  toast(parts.length ? 'WebC: ' + parts.join(' · ') : 'WebC revisado: sin novedades', parts.length ? 6000 : 2400);
  if (SYNC.addCourses){ const ids = SYNC.addCourses; SYNC.addCourses = null; const sub = {...d, courses:d.courses.filter(c => ids.includes(c.id))}; if (sub.courses.length) receiveWebc(sub); }
}
/* Tarjeta «Novedades» (Ahora): lo que trajo la última revisión de WebC, hasta que la marques como vista. */
function novedadesCard(){
  const nv = D.sync && D.sync.novedades;
  if (!nv || nv.seen || !nv.items || !nv.items.length) return null;
  const LBL = {posible:'⚠ Posible cambio de fecha', fecha:'📅 Fecha nueva', cambio:'↻ Fecha cambiada', aviso:'📣 Aviso', recurso:'📎 Recurso', revisar:'🔎 Para revisar'};
  const open = x => { if (x.k === 'aviso'){ go('biblio'); } else if (x.k === 'recurso'){ embedUrl(x.url) ? openViewer(x.url, x.t) : openExt(x.url); } else if (x.k === 'fecha' || x.k === 'cambio'){ go('cal'); } };
  return h('section', {class:'card inbox novedades'},
    h('div', {class:'ib-head'}, h('h3', null, `Novedades de WebC · ${nv.items.length}`), h('span', {class:'tiny muted'}, `Revisión ${agoMin(nv.at)}`),
      h('button', {class:'btn ghost small', type:'button', onclick:() => { nv.seen = true; save(); render(); }}, 'Marcar como visto')),
    h('div', {class:'wlist'}, nv.items.slice(0, 12).map(x => h('button', {class:'wrow nv-row', type:'button', style:x.subj ? scs(x.subj) : '', onclick:() => x.k === 'revisar' ? null : open(x)},
      h('span', {class:'chip'}, LBL[x.k] || x.k), h('span', {class:'nv-t'}, x.t), x.subj ? h('small', {class:'muted'}, S(x.subj).short) : null,
      x.date ? h('small', {class:'muted'}, fmtD(parse(x.date))) : null))),
    nv.items.length > 12 ? h('p', {class:'tiny muted', style:'margin:6px 0 0'}, `y ${nv.items.length - 12} más.`) : null);
}

/* ---------- Outlook (Microsoft Graph, solo lectura, opcional) ---------- */
const MS_KEY = 'calculai-ms', MS_SCOPE = 'offline_access User.Read Mail.Read', MS_REDIRECT = APP_BASE + 'oauth.html';
const msCfg = () => { try { return JSON.parse(localStorage.getItem(MS_KEY) || '{}'); } catch { return {}; } };
const msSave = c => { try { localStorage.setItem(MS_KEY, JSON.stringify(c)); } catch {} };
const msConnected = () => { const c = msCfg(); return !!(c.clientId && (c.refresh || c.access)); };
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const msAuthority = c => `https://login.microsoftonline.com/${encodeURIComponent(c.tenant || 'common')}/oauth2/v2.0`;
async function msConnect(){
  const c = msCfg(); if (!c.clientId){ toast('Primero pega el Id. de aplicación y guarda'); return; }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const url = msAuthority(c) + '/authorize?' + new URLSearchParams({client_id:c.clientId, response_type:'code', redirect_uri:MS_REDIRECT, response_mode:'query', scope:MS_SCOPE, code_challenge:challenge, code_challenge_method:'S256', state, prompt:'select_account'});
  const w = window.open(url, 'calculai-ms', 'width=520,height=700');
  try { localStorage.setItem('calculai-ms-pkce', JSON.stringify({verifier, state, mode:w ? 'popup' : 'tab', at:Date.now()})); } catch {}
  if (!w) location.href = url;
  else { SYNC.outlook = 'checking'; SYNC.outlookMsg = 'Esperando el inicio de sesión de Microsoft…'; paintSync(); }
}
async function msTokenRequest(params){
  const c = msCfg();
  const r = await fetch(msAuthority(c) + '/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({client_id:c.clientId, scope:MS_SCOPE, ...params})});
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token){ const e = new Error(j.error_description ? j.error_description.split('\r\n')[0] : `error ${r.status}`); e.code = j.error; throw e; }
  const n = msCfg(); n.access = j.access_token; n.exp = Date.now() + (j.expires_in || 3600) * 1000; if (j.refresh_token) n.refresh = j.refresh_token; msSave(n);
  return n.access;
}
async function msFinish(q){
  let pk = null; try { pk = JSON.parse(localStorage.getItem('calculai-ms-pkce') || 'null'); localStorage.removeItem('calculai-ms-pkce'); } catch {}
  const p = new URLSearchParams(q);
  try {
    if (p.get('error')) throw new Error((p.get('error_description') || p.get('error')).split('\r\n')[0]);
    if (!pk || !p.get('code') || p.get('state') !== pk.state) throw new Error('la respuesta de Microsoft no coincide con esta solicitud; vuelve a intentarlo');
    await msTokenRequest({grant_type:'authorization_code', code:p.get('code'), redirect_uri:MS_REDIRECT, code_verifier:pk.verifier});
    toast('Outlook conectado');
    await outlookSync(true);
  } catch (e) { SYNC.outlook = 'error'; SYNC.outlookMsg = msExplain(e.message); paintSync(); render(); }
}
function msExplain(m){
  m = String(m || '');
  if (/AADSTS(90094|65001|90008)|admin|administrador/i.test(m)) return 'Microsoft pide la aprobación de un administrador de tu institución para dar este permiso. Sin esa aprobación no se puede leer el correo desde CalculAi. (' + m.slice(0, 140) + ')';
  if (/AADSTS50011|redirect/i.test(m)) return 'La dirección de retorno no coincide. En el registro de la app agrega exactamente: ' + MS_REDIRECT;
  if (/AADSTS700016|application.*not found/i.test(m)) return 'Microsoft no encuentra ese Id. de aplicación. Revisa que lo copiaste completo.';
  return m.slice(0, 220);
}
async function msToken(){
  const c = msCfg();
  if (c.access && c.exp > Date.now() + 60000) return c.access;
  if (!c.refresh) throw Object.assign(new Error('Vuelve a conectar Outlook'), {code:'reconnect'});
  try { return await msTokenRequest({grant_type:'refresh_token', refresh_token:c.refresh}); }
  catch (e) { const n = msCfg(); delete n.refresh; delete n.access; msSave(n); throw Object.assign(new Error('La conexión con Outlook expiró: vuelve a conectarla'), {code:'reconnect'}); }
}
function subjOfText(txt){
  const t = norm(txt || '');
  const s = D.subjects.find(s => s.code && t.includes(norm(s.code))) || D.subjects.find(s => s.name && t.includes(norm(s.name))) || D.subjects.find(s => s.short && s.short.length >= 4 && t.includes(norm(s.short)));
  return s ? s.id : '';
}
async function outlookSync(force){
  if (!msConnected()) return;
  if (!force && (SYNC.outlook === 'checking' || minsSince(D.sync && D.sync.outlook && D.sync.outlook.at) < STALE_MIN)) return;
  SYNC.outlook = 'checking'; SYNC.outlookMsg = ''; paintSync();
  try {
    const tok = await msToken();
    const since = (D.sync && D.sync.outlook && D.sync.outlook.at) || new Date(Date.now() - 14 * 86400000).toISOString();
    const q = {'$filter':`receivedDateTime ge ${since.replace(/\.\d+Z$/, 'Z')}`, '$orderby':'receivedDateTime desc', '$top':'50', '$select':'id,subject,from,receivedDateTime,body,webLink'};
    const url = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?' + Object.entries(q).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    const r = await fetch(url, {headers:{Authorization:'Bearer ' + tok, Prefer:'outlook.body-content-type="text"'}});
    if (r.status === 401){ const n = msCfg(); delete n.access; msSave(n); throw Object.assign(new Error('La conexión con Outlook expiró: vuelve a conectarla'), {code:'reconnect'}); }
    if (!r.ok){ const j = await r.json().catch(() => ({})); throw new Error((j.error && j.error.message) || `Graph respondió ${r.status}`); }
    const msgs = (await r.json()).value || [];
    const kws = String(msCfg().keywords || 'webc').split(',').map(x => norm(x.trim())).filter(Boolean);
    const known = new Set((D.news || []).map(n => n.id));
    let nN = 0, nS = 0;
    msgs.forEach(m => {
      const from = (m.from && m.from.emailAddress) || {};
      const head = [from.name, from.address, m.subject].join(' ');
      const body = String((m.body && m.body.content) || '');
      const sid = subjOfText(m.subject + ' ' + body.slice(0, 600));
      if (!kws.some(k => norm(head).includes(k)) && !subjOfText(m.subject || '')) return;
      const id = 'ol-' + m.id; if (known.has(id)) return;
      const date = iso(new Date(m.receivedDateTime));
      D.news = D.news || [];
      D.news.push({id, subj:sid, title:m.subject || '(sin asunto)', url:m.webLink || '', author:from.name || from.address || '', date, text:body.slice(0, 5000), src:'outlook', fresh:true}); nN++;
      extractDates({id:m.id, title:m.subject || '', text:body, date}).forEach(x => { if (x.kind !== 'otro' && addToInbox({...x, id:'mail:' + m.id + ':' + x.date + ':' + norm(x.name).slice(0, 20), subj:sid, src:'outlook', newsTitle:m.subject, newsUrl:m.webLink})) nS++; });
    });
    if (D.news && D.news.length > 300) D.news = D.news.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 300);
    syncData().outlook = {at:new Date().toISOString(), last:{nN, nS}};
    SYNC.outlook = 'ok'; SYNC.outlookMsg = '';
    save(); render();
    if (nN || nS) toast(`Outlook: ${[nN && plural(nN, 'correo del curso', 'correos del curso'), nS && plural(nS, 'fecha por revisar', 'fechas por revisar')].filter(Boolean).join(' · ')}`);
  } catch (e) {
    SYNC.outlook = e.code === 'reconnect' ? 'reconnect' : 'error'; SYNC.outlookMsg = e.code === 'reconnect' ? e.message : msExplain(e.message); paintSync();
  }
}
function msDisconnect(){ const c = msCfg(); delete c.access; delete c.refresh; delete c.exp; msSave(c); SYNC.outlook = 'idle'; render(); toast('Outlook desconectado de este navegador'); }

/* ---------- Mensajes del script de revisión y del inicio de sesión ---------- */
window.addEventListener('message', ev => {
  const d = ev.data; if (!d || typeof d !== 'object' || ev.origin !== location.origin) return;
  if (d.type === 'calculai-oauth' && typeof d.q === 'string'){ msFinish(d.q); return; }
  if (ev.source !== window) return;
  if (d.type === 'calculai-agent-hello'){ SYNC.agent = d.ok ? d.v || '1' : null; SYNC.agentWhy = d.why || ''; paintSync(); if (d.ok) requestWebcSync(false); }
  else if (d.type === 'calculai-sync-status'){
    SYNC.ack = true;
    if (d.state === 'login'){ clearTimeout(SYNC._t); SYNC.webc = 'login'; }
    else if (d.state === 'error'){ clearTimeout(SYNC._t); SYNC.webc = 'error'; SYNC.webcMsg = d.msg || ''; }
    else { SYNC.webc = d.state; SYNC.webcMsg = d.msg || ''; }
    paintSync();
  }
});
window.addEventListener('storage', ev => { if (ev.key === 'calculai-oauth-return' && ev.newValue){ try { localStorage.removeItem('calculai-oauth-return'); } catch {} msFinish(ev.newValue); } });
function startAutoSync(){
  try { const q = localStorage.getItem('calculai-oauth-return'); if (q){ localStorage.removeItem('calculai-oauth-return'); history.replaceState(null, '', location.pathname); msFinish(q); } } catch {}
  window.postMessage({type:'calculai-agent-ping'}, location.origin);
  if (webcToken()) requestWebcSync(false);
  outlookSync(false);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible'){ requestWebcSync(false); outlookSync(false); } });
}

/* ---------- Barra de estado y bandeja «Para revisar» ---------- */
function syncStrip(){ const el = h('div', {id:'syncStrip', class:'sync-strip', 'aria-live':'polite'}); setTimeout(paintSync, 0); return el; }
function paintSync(){
  const el = document.getElementById('syncStrip'); if (!el) return;
  const sd = D.sync || {}, w = sd.webc;
  const link = (lbl, fn) => h('button', {class:'linkbtn', type:'button', onclick:fn}, lbl);
  let webc;
  if (SYNC.webc === 'relink'){
    webc = h('span', {class:'ss-item ss-warn'}, h('i', {class:'ss-dot'}), 'Tu conexión con WebC venció · ', link('Conectar de nuevo', openWebcConnect));
  } else if (!webcOn()){
    webc = h('span', {class:'ss-item ' + (minsSince(w && w.at) > 1440 ? 'ss-warn' : '')}, h('i', {class:'ss-dot'}), `WebC ${w ? 'leído ' + agoMin(w.at) : 'sin conectar'} · `,
      link('Conectar con WebC', openWebcConnect));
  } else if (SYNC.webc === 'checking' || SYNC.webc === 'reading'){
    const secs = SYNC.startAt ? Math.round((Date.now() - SYNC.startAt) / 1000) : 0;
    webc = h('span', {class:'ss-item ss-busy'}, h('i', {class:'ss-dot'}), `Revisando WebC${SYNC.webcMsg ? (SYNC.webc === 'reading' ? ' · curso ' : ' · ') + SYNC.webcMsg : ''}${secs >= 3 ? ` · ${secs} s` : ''}…`);
    clearTimeout(SYNC._tick); SYNC._tick = setTimeout(paintSync, 1000);
  } else if (SYNC.webc === 'login'){
    webc = h('span', {class:'ss-item ss-warn'}, h('i', {class:'ss-dot'}), 'Para revisar WebC, inicia sesión: ', h('a', {href:webcBase() + '/my/', target:'_blank', rel:'noopener'}, 'abrir WebC ↗'), ' · ', link('Reintentar', () => requestWebcSync(true)));
  } else if (SYNC.webc === 'error'){
    webc = h('span', {class:'ss-item ss-warn'}, h('i', {class:'ss-dot'}), `No pude revisar WebC${SYNC.webcMsg ? ' (' + SYNC.webcMsg + ')' : ''} · `, link('Reintentar', () => requestWebcSync(true)));
  } else {
    const l = w && w.last;
    webc = h('span', {class:'ss-item ss-ok'}, h('i', {class:'ss-dot'}), `WebC revisado ${agoMin(w && w.at)}`, l && (l.nE + l.nN + l.nU) ? ` · ${[l.nE && plural(l.nE, 'fecha nueva', 'fechas nuevas'), l.nU && plural(l.nU, 'cambio', 'cambios'), l.nN && plural(l.nN, 'aviso nuevo', 'avisos nuevos')].filter(Boolean).join(', ')}` : '', w && w.partial ? ' · revisión parcial (WebC lento)' : '', ' · ', link('Revisar ahora', () => requestWebcSync(true)));
  }
  /* Script desactualizado: ofrece instalar la versión publicada. */
  const oldScript = SYNC.agent && !webcToken() && verLt(String(SYNC.agent), SCRIPT_V)
    ? h('span', {class:'ss-item ss-warn'}, h('i', {class:'ss-dot'}), `Hay una versión más rápida del script de revisión (${SCRIPT_V}) · `, h('a', {href:USERSCRIPT_URL, target:'_blank', rel:'noopener'}, 'Actualizar ↗')) : null;
  let ol = null;
  const c = msCfg();
  if (msConnected() || SYNC.outlook === 'error' || SYNC.outlook === 'reconnect' || SYNC.outlook === 'checking'){
    if (SYNC.outlook === 'checking') ol = h('span', {class:'ss-item ss-busy'}, h('i', {class:'ss-dot'}), SYNC.outlookMsg || 'Revisando Outlook…');
    else if (SYNC.outlook === 'reconnect') ol = h('span', {class:'ss-item ss-warn'}, h('i', {class:'ss-dot'}), 'Outlook: ', link('volver a conectar', msConnect));
    else if (SYNC.outlook === 'error') ol = h('span', {class:'ss-item ss-warn', title:SYNC.outlookMsg}, h('i', {class:'ss-dot'}), 'Outlook: no se pudo revisar · ', link('ver detalle', () => go('editar')));
    else ol = h('span', {class:'ss-item ss-ok'}, h('i', {class:'ss-dot'}), `Outlook revisado ${agoMin(sd.outlook && sd.outlook.at)} · `, link('Revisar ahora', () => outlookSync(true)));
  } else if (c.clientId) ol = h('span', {class:'ss-item'}, h('i', {class:'ss-dot'}), 'Outlook: ', link('conectar', msConnect));
  const nc = (sd.newCourses || []).filter(x => !(sd.ignoredCourses || []).includes(x.id));
  /* «Agregar» pide una revisión que incluya esos cursos y luego abre la pantalla de revisión para elegir a qué materia van. */
  const addNew = () => { if (!SYNC.agent){ openWebcHelp(); return; } SYNC.addCourses = nc.map(x => x.id); requestWebcSync(true, SYNC.addCourses); };
  el.replaceChildren(...[webc, oldScript, ol, nc.length ? h('span', {class:'ss-item ss-warn'}, h('i', {class:'ss-dot'}), `${plural(nc.length, 'curso nuevo', 'cursos nuevos')} en WebC (${nc.map(x => x.name).join(', ')}) · `,
    link('Agregar', addNew), ' · ', link('Ignorar', () => { syncData().ignoredCourses.push(...nc.map(x => x.id)); save(); paintSync(); })) : null].filter(Boolean));
}
function inboxCard(){
  const sd = syncData(); const items = sd.inbox.filter(x => parse(x.date) >= TODAY).sort((a, b) => a.date.localeCompare(b.date));
  if (sd.inbox.length !== items.length){ sd.inbox = items; save(); }
  if (!items.length) return null;
  const confirmX = (x, apart) => {
    if (!x.subj){ toast('Elige a qué materia corresponde'); return false; }
    const ex = !apart && x.replaces && D.events.find(e => e.id === x.replaces);
    if (ex){
      ex.note = `Fecha cambiada según el aviso «${x.title}» (antes: ${fmtD(parse(ex.date))}${ex.time ? ' ' + ex.time : ''}).`;
      ex.date = x.date; if ((x.time || '').trim()) ex.time = x.time.trim();
      ex.src = `WebC · aviso «${x.title}»`; ex.ver = true;
      sd.inbox = sd.inbox.filter(y => y.id !== x.id); sd.dismissed.push(x.id); return true;
    }
    D.events.push({id:uid('ev'), subj:x.subj, kind:x.kind, name:(x.name || x.title).trim(), date:x.date, time:(x.time || '').trim(), slot:'', ver:true, src:x.src === 'outlook' ? `Outlook · correo «${x.title}»` : `WebC · aviso «${x.title}»`, topics:[], scopeNote:'', note:'Fecha leída automáticamente y confirmada por ti.', webc:x.id});
    sd.inbox = sd.inbox.filter(y => y.id !== x.id); return true;
  };
  const dismiss = x => { sd.inbox = sd.inbox.filter(y => y.id !== x.id); sd.dismissed.push(x.id); };
  return h('section', {class:'card inbox'},
    h('div', {class:'ib-head'}, h('h3', null, `Para revisar · ${items.length}`), h('span', {class:'tiny muted'}, 'Fechas que encontré en avisos de WebC y correos. Agrégalas solo si corresponden.'),
      items.filter(x => !x.replaces).length > 1 ? h('button', {class:'btn ghost small', type:'button', onclick:() => { let n = 0; items.filter(x => !x.replaces).forEach(x => { if (confirmX(x)) n++; }); save(); render(); toast(`${plural(n, 'fecha agregada', 'fechas agregadas')}`); }}, 'Agregar todas') : null),
    h('div', {class:'wlist'}, items.map(x => h('div', {class:'wrow sugg ib-row', style:x.subj ? scs(x.subj) : ''},
      h('div', {style:'min-width:0;flex:1'},
        x.replaces && D.events.some(e => e.id === x.replaces) ? h('div', {class:'ib-change'}, `⚠ Posible cambio de fecha: ${x.name} · ${fmtD(parse(x.oldDate))} → ${fmtD(parse(x.date))}`) : null,
        h('div', {class:'srow'},
          h('span', {class:'chip ib-src'}, x.src === 'outlook' ? '✉ Outlook' : '⟳ WebC'),
          h('select', {'aria-label':'Materia', onchange:ev => { x.subj = ev.target.value; save(); }}, h('option', {value:''}, 'Materia…'), D.subjects.map(s => { const o = h('option', {value:s.id}, s.short); if (x.subj === s.id) o.selected = true; return o; })),
          h('select', {'aria-label':'Tipo', onchange:ev => { x.kind = ev.target.value; save(); }}, Object.entries(KIND).map(([k, o]) => { const op = h('option', {value:k}, o.l); if (x.kind === k) op.selected = true; return op; })),
          h('input', {type:'text', value:x.name, 'aria-label':'Nombre', oninput:ev => { x.name = ev.target.value; }, onchange:save}),
          h('input', {type:'date', value:x.date, 'aria-label':'Fecha', onchange:ev => { x.date = ev.target.value; save(); }}),
          h('input', {type:'text', value:x.time, placeholder:'hora', style:'width:96px', 'aria-label':'Hora', onchange:ev => { x.time = ev.target.value; save(); }})),
        h('div', {class:'tiny muted', style:'margin-top:4px'}, x.line ? '«' + x.line + '» — ' : '', x.url ? h('a', {href:x.url, target:'_blank', rel:'noopener'}, x.title || 'ver origen') : x.title)),
      h('div', {class:'ib-act'},
        x.replaces && D.events.some(e => e.id === x.replaces)
          ? [h('button', {class:'btn small', type:'button', onclick:() => { if (confirmX(x)){ save(); render(); toast(`Fecha cambiada: ${x.name} → ${fmtD(parse(x.date))}`); } }}, '✓ Cambiar fecha'),
             h('button', {class:'btn ghost small', type:'button', onclick:() => { if (confirmX(x, true)){ save(); render(); toast('Agregada como fecha aparte'); } }}, 'Es otra fecha')]
          : h('button', {class:'btn small', type:'button', onclick:() => { if (confirmX(x)){ save(); render(); toast('Agregada al calendario'); } }}, '✓ Agregar'),
        h('button', {class:'btn ghost small', type:'button', onclick:() => { dismiss(x); save(); render(); }}, 'Descartar'))))));
}

/* ---------- Pantallas de configuración ---------- */
function openAutoSyncHelp(){
  $('#drawer').classList.add('wide');
  openDrawer(h('div', {class:'drawer-head'}, h('div', {style:'flex:1'}, h('h3', null, 'Revisión automática de WebC')), h('button', {class:'iconbtn', type:'button', 'aria-label':'Cerrar', onclick:closeDrawer}, '✕')),
    h('div', {class:'drawer-body'}, autoSyncSteps()));
}
function autoSyncSteps(){
  return h('div', null,
    h('p', {class:'note', style:'margin:0 0 10px'}, 'Lo más simple es ', h('button', {class:'linkbtn', type:'button', onclick:openWebcConnect}, '«Conectar con WebC» sin instalar nada'), '. El script es otra opción para quien ya usa Tampermonkey. Si al abrir el enlace del script ves código en vez del botón «Instalar», Tampermonkey no está instalado o no tiene permiso en este navegador.'),
    h('p', {class:'tiny muted', style:'margin:0 0 10px'}, 'El script corre en tu navegador con tu sesión de WebC ya abierta y revisa WebC cada vez que abres CalculAi. Sin contraseñas y sin servidores intermedios.'),
    SYNC.agent ? h('p', {class:'note', style:'margin:0 0 10px'}, `✓ El script de revisión está activo en este navegador (versión ${SYNC.agent}).`) : null,
    h('ol', {class:'tiny', style:'padding-left:18px;margin:6px 0 12px;line-height:1.7'},
      h('li', null, h('b', null, 'Instala la extensión gratuita Tampermonkey '), '(Chrome, Edge, Firefox o Safari en computador) desde la tienda de extensiones de tu navegador.'),
      h('li', null, h('b', null, 'Solo en Chrome o Edge: '), 'clic derecho en el ícono de Tampermonkey → «Administrar extensión» → activa «Permitir scripts de usuario» (Chrome 138 o más nuevo). En versiones anteriores, activa el «Modo de desarrollador» en chrome://extensions.'),
      h('li', null, h('b', null, 'Instala el script: '), h('a', {class:'btn small hlbtn', href:USERSCRIPT_URL, target:'_blank', rel:'noopener', style:'margin:4px 0'}, '⟳ Instalar revisión automática'), ' y en la ventana de Tampermonkey presiona «Instalar».'),
      h('li', null, h('b', null, 'Inicia sesión en WebC '), 'una vez en este navegador (', h('a', {href:webcBase() + '/my/', target:'_blank', rel:'noopener'}, 'abrir WebC ↗'), ').'),
      h('li', null, h('b', null, 'Recarga CalculAi. '), 'Arriba, en «Ahora», verás «Revisando WebC…» y luego el resumen. La primera vez Tampermonkey puede pedirte permiso para conectarse a webc.uai.cl: elige «Permitir siempre».')),
    h('div', {class:'card', style:'background:var(--card-2)'},
      h('b', null, 'Qué se actualiza solo'), h('ul', {class:'tiny', style:'margin:6px 0 0;padding-left:18px'},
        h('li', null, 'Fechas del calendario de WebC de tus cursos (entregas, controles): se agregan o se corrigen si cambiaron. Si borras una, no vuelve a aparecer.'),
        h('li', null, 'Avisos de los profesores y recursos nuevos (guías, archivos).'),
        h('li', null, 'Fechas escritas dentro de los avisos: quedan en «Para revisar», porque leerlas del texto puede fallar.'),
        h('li', null, 'Además, en «Crear clases con mi material» el script trae los archivos de tus cursos para armar clases.'))),
    h('p', {class:'tiny muted', style:'margin-top:10px'}, 'En el celular depende del navegador: Firefox para Android acepta Tampermonkey; en iPhone no puedo confirmar que funcione igual. Ahí sigue sirviendo el marcador «Enviar a CalculAi» o «Pasar a otro dispositivo».'));
}
function outlookCard(){
  const c = msCfg(), sd = D.sync || {};
  const idIn = h('input', {type:'text', value:c.clientId || '', placeholder:'00000000-0000-0000-0000-000000000000', 'aria-label':'Id. de aplicación (cliente)', class:'ai-key-in', style:'max-width:360px'});
  const tenIn = h('input', {type:'text', value:c.tenant || 'common', 'aria-label':'Inquilino', class:'ai-key-in', style:'max-width:160px'});
  const kwIn = h('input', {type:'text', value:c.keywords || 'webc', 'aria-label':'Palabras para reconocer correos', class:'ai-key-in', style:'max-width:320px'});
  const saveCfg = () => { const n = msCfg(); const changed = n.clientId !== idIn.value.trim() || (n.tenant || 'common') !== (tenIn.value.trim() || 'common'); n.clientId = idIn.value.trim(); n.tenant = tenIn.value.trim() || 'common'; n.keywords = kwIn.value.trim() || 'webc'; if (changed){ delete n.access; delete n.refresh; } msSave(n); };
  const field = (lbl, inp, help) => h('label', {class:'field', style:'margin:0 0 8px'}, h('span', null, lbl), inp, help ? h('small', {class:'tiny muted'}, help) : null);
  return h('section', {class:'edit-sec card'},
    h('h3', {class:'display', style:'margin:0 0 4px;font-size:1.15rem'}, '✉ Conectar Outlook (opcional)'),
    h('p', {class:'tiny muted', style:'margin:0 0 8px'}, 'Al abrir CalculAi, lee los correos nuevos de tu bandeja que vengan de WebC o mencionen tus cursos, los guarda en Biblioteca → Avisos y pasa las fechas que encuentre a «Para revisar». Solo pide permiso de lectura (Mail.Read). El acceso queda guardado en este navegador y los correos se leen directo desde Microsoft.'),
    msConnected() ? h('p', {class:'note', style:'margin:0 0 8px'}, `✓ Conectado · última revisión ${agoMin(sd.outlook && sd.outlook.at)}`) : null,
    SYNC.outlookMsg && (SYNC.outlook === 'error' || SYNC.outlook === 'reconnect') ? h('p', {class:'card warn tiny', style:'margin:0 0 8px'}, SYNC.outlookMsg) : null,
    field('Id. de aplicación (cliente)', idIn), field('Inquilino', tenIn, '«common» sirve para cuentas de la universidad y personales.'), field('Palabras para reconocer correos', kwIn, 'Separadas por coma. También se reconocen los correos que nombran el código o el nombre de tus materias.'),
    h('div', {class:'ai-row'},
      h('button', {class:'btn small', type:'button', onclick:() => { saveCfg(); msConnect(); }}, msConnected() ? 'Volver a conectar' : 'Guardar y conectar con Microsoft'),
      msConnected() ? h('button', {class:'btn ghost small', type:'button', onclick:() => outlookSync(true)}, 'Revisar ahora') : null,
      msConnected() ? h('button', {class:'btn ghost small', type:'button', onclick:msDisconnect}, 'Desconectar') : h('button', {class:'btn ghost small', type:'button', onclick:() => { saveCfg(); toast('Guardado'); }}, 'Solo guardar')),
    h('details', {style:'margin-top:12px'}, h('summary', {class:'tiny', style:'cursor:pointer;font-weight:700'}, 'Cómo obtener el Id. de aplicación (una sola vez, ~5 min)'),
      h('ol', {class:'tiny', style:'padding-left:18px;line-height:1.7'},
        h('li', null, 'Entra a ', h('a', {href:'https://entra.microsoft.com/', target:'_blank', rel:'noopener'}, 'entra.microsoft.com ↗'), ' con tu cuenta y ve a «Aplicaciones» → «Registros de aplicaciones» → «Nuevo registro».'),
        h('li', null, 'Nombre: CalculAi. Tipos de cuenta: «Cuentas de cualquier directorio organizativo y cuentas personales de Microsoft».'),
        h('li', null, 'URI de redirección: plataforma «Aplicación de página única (SPA)» y esta dirección exacta: ', h('code', {class:'mono'}, MS_REDIRECT), ' ', h('button', {class:'linkbtn', type:'button', onclick:async () => { try { await navigator.clipboard.writeText(MS_REDIRECT); toast('Copiada'); } catch { toast('Selecciónala y cópiala'); } }}, 'copiar')),
        h('li', null, 'Presiona «Registrar», copia el «Id. de aplicación (cliente)» y pégalo arriba.'),
        h('li', null, 'Presiona «Guardar y conectar con Microsoft» y acepta el permiso de lectura de correo.')),
      h('p', {class:'tiny muted'}, 'No puedo confirmar si la UAI permite que estudiantes registren apps o den este permiso por su cuenta: si Microsoft responde que se necesita aprobación de un administrador, esta conexión no se puede usar sin TI. La revisión automática de WebC funciona igual sin Outlook. Las conexiones de Microsoft desde páginas como esta duran hasta 24 horas; después, CalculAi te pedirá volver a conectar con un clic.')));
}

/* =========================================================
   TEMA, PWA, ARRANQUE
   ========================================================= */
function toggleTheme(){
  const r = document.documentElement, darkNow = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = darkNow ? 'light' : 'dark'; try { localStorage.setItem('calculai-theme', r.dataset.theme); } catch {}
  const mt = document.querySelector('meta[name=theme-color]'); if (mt) mt.content = r.dataset.theme === 'dark' ? '#0c2140' : '#f5f2e8';
  if (tab === 'mapa') render();
}
function syncBadge(){ const el = $('#sync'); if (!el) return; el.dataset.s = storageOk ? 'local' : 'none'; $('#syncTxt').textContent = storageOk ? 'Guardado en este dispositivo' : 'Sin guardar (descarga un respaldo)'; }
try { const th = localStorage.getItem('calculai-theme'); if (th) document.documentElement.dataset.theme = th; } catch {}
document.addEventListener('DOMContentLoaded', () => {
  $('#todayLbl').textContent = cap(fmtD(TODAY)) + ' · ' + TODAY.getFullYear();
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#palBtn').addEventListener('click', openPal);
  $('#palIn').addEventListener('input', e => palFilter(e.target.value));
  $('#palIn').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown'){ palSel = Math.min(palItems.length - 1, palSel + 1); drawPal(); e.preventDefault(); }
    else if (e.key === 'ArrowUp'){ palSel = Math.max(0, palSel - 1); drawPal(); e.preventDefault(); }
    else if (e.key === 'Enter' && palItems[palSel]){ const x = palItems[palSel]; closePal(); x.run(); }
  });
  $('#pal').addEventListener('click', e => { if (e.target.id === 'pal') closePal(); });
  $('#scrim').addEventListener('click', () => { closeDrawer(); closeSidebar(); });
  const sbBtn = $('#sidebarBtn');
  if (sbBtn) sbBtn.addEventListener('click', () => {
    const sb = $('#sidebar'), sc = $('#scrim');
    if (sb.classList.contains('open')){ closeSidebar(); }
    else { sb.classList.add('open'); sc.classList.add('on'); }
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); $('#pal').classList.contains('on') ? closePal() : openPal(); }
    else if (e.key === 'Escape'){ if ($('#pal').classList.contains('on')) closePal(); else if ($('#drawer').classList.contains('open')) closeDrawer(); }
  });
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; $('#installBtn').hidden = true; });
  /* CalculAi no funciona dentro de otra página: así una página ajena no puede usarla de fondo para
     engañarte con clics, ni puede volver a aparecer la app dentro del recuadro de una clase. */
  let framed = true; try { framed = window.top !== window.self; } catch {}
  if (framed){ $('#view').replaceChildren(h('div', {class:'card', style:'margin:24px'}, h('p', null, 'CalculAi se abre en su propia pestaña.'), h('a', {class:'btn', href:'https://sanisidro566.github.io/calculai/', target:'_blank', rel:'noopener'}, 'Abrir CalculAi ↗'))); return; }
  syncBadge(); render(); startAutoSync(); loadLessonKeys();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
});
