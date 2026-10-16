/* global M */ /* M es la configuración de Moodle que ya existe en cada página de WebC */
/* CalculAi · conector para WebC / Moodle.
   Se ejecuta DENTRO de WebC (con tu sesión ya iniciada) desde el marcador «Enviar a CalculAi».
   Lee tus cursos, fechas del calendario, recursos y avisos usando las mismas páginas que ves,
   y se los entrega a CalculAi. No pide ni guarda contraseñas y no envía nada a terceros. */
(function(){
  'use strict';
  if (window.__calculaiConector) { window.__calculaiConector.show(); return; }
  var SCRIPT = document.currentScript && document.currentScript.src;
  var APP = SCRIPT ? SCRIPT.replace(/conector\.js.*$/, '') : 'https://sanisidro566.github.io/calculai/';
  var APP_ORIGIN = new URL(APP).origin;
  var MOODLE = window.M && M.cfg && M.cfg.wwwroot ? M.cfg.wwwroot : null;

  /* ---------- panel ---------- */
  var css = '#clc-panel{position:fixed;top:16px;right:16px;z-index:2147483647;width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#fffdf6;color:#16223d;border:2px solid #16223d;border-radius:16px;box-shadow:0 20px 50px -10px rgba(0,0,0,.45);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;padding:16px}' +
    '#clc-panel *{box-sizing:border-box}#clc-panel h2{margin:0 0 4px;font-size:19px;font-weight:800}#clc-panel p{margin:6px 0}#clc-panel small{color:#5b6887}' +
    '#clc-panel .clc-x{position:absolute;top:10px;right:12px;border:0;background:none;font-size:20px;cursor:pointer;color:#16223d}' +
    '#clc-panel .clc-list{display:grid;gap:6px;margin:10px 0}#clc-panel label{display:flex;gap:8px;align-items:flex-start;padding:7px 9px;border:1px solid #d5d8e0;border-radius:10px;cursor:pointer;background:#fff}' +
    '#clc-panel input{margin-top:3px;width:17px;height:17px}#clc-panel .clc-btn{border:2px solid #16223d;background:#16223d;color:#fffdf6;border-radius:10px;padding:9px 14px;font-weight:700;cursor:pointer;font-size:14px}' +
    '#clc-panel .clc-btn.ghost{background:transparent;color:#16223d}#clc-panel .clc-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}' +
    '#clc-panel .clc-bar{height:8px;background:#e7e3d6;border-radius:99px;overflow:hidden;margin:10px 0}#clc-panel .clc-bar i{display:block;height:100%;width:0;background:#ffcf2e;transition:width .3s}' +
    '#clc-panel .clc-log{font-size:13px;color:#46557a;max-height:120px;overflow:auto}#clc-panel .clc-ok{color:#1f8a4c;font-weight:700}#clc-panel .clc-err{color:#c9382f;font-weight:700}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  var panel = document.createElement('div'); panel.id = 'clc-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'CalculAi');
  document.body.appendChild(panel);
  function el(tag, attrs, kids){ var e = document.createElement(tag); if (attrs) for (var k in attrs){ if (k === 'text') e.textContent = attrs[k]; else if (k.slice(0,2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } (kids || []).forEach(function(c){ if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return e; }
  function render(kids){ panel.innerHTML = ''; panel.appendChild(el('button', {class:'clc-x', 'aria-label':'Cerrar', onclick:function(){ panel.remove(); style.remove(); delete window.__calculaiConector; }, text:'×'})); kids.forEach(function(k){ if (k) panel.appendChild(k); }); }
  window.__calculaiConector = {show:function(){ if (!document.body.contains(panel)) document.body.appendChild(panel); }};

  if (!MOODLE || !M.cfg.sesskey) {
    render([el('h2', {text:'CalculAi'}), el('p', {text:'Abre este marcador dentro de WebC (o tu Moodle) con tu sesión iniciada, por ejemplo en la página «Mis cursos».'})]);
    return;
  }

  /* ---------- utilidades ---------- */
  function ajax(methodname, args){
    return fetch(MOODLE + '/lib/ajax/service.php?sesskey=' + M.cfg.sesskey + '&info=' + methodname, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify([{index:0, methodname:methodname, args:args}])})
      .then(function(r){ return r.json(); }).then(function(j){ if (!j || !j[0] || j[0].error) throw new Error((j && j[0] && j[0].exception && j[0].exception.errorcode) || 'ajax'); return j[0].data; });
  }
  function page(url){ return fetch(url, {credentials:'same-origin'}).then(function(r){ if (!r.ok) throw new Error(r.status); return r.text(); }).then(function(t){ return new DOMParser().parseFromString(t, 'text/html'); }); }
  var TYPE_WORDS = /\s+(Archivo|URL|Tarea|Foro|Carpeta|Cuestionario|Página|Pagina|Reunión de Zoom|E-Marking|Consulta|Etiqueta|File|Assignment|Forum|Folder|Quiz|Page)$/;
  function cleanName(a){ var inst = a.querySelector('.instancename'); var t = inst ? (inst.childNodes[0] ? inst.childNodes[0].textContent : inst.textContent) : a.textContent; return t.replace(/\s+/g, ' ').trim().replace(TYPE_WORDS, ''); }
  var ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
  function titleCase(s){ return s.toLowerCase().split(' ').map(function(w, i){ var up = w.toUpperCase(); if (ROMAN.test(up)) return up; if (i > 0 && /^(de|del|la|las|el|los|y|e|en|a|para)$/.test(w)) return w; return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
  function courseMeta(c){
    var full = (c.fullname || '').replace(/\s+/g, ' ').trim();
    var base = full.split(/\s+Sec\.|\s+Secci[oó]n|\s+STGO|\s+S-SEM/i)[0].trim();
    var isUpper = base === base.toUpperCase();
    var name = isUpper ? titleCase(base) : base;
    var code = ((c.shortname || '') + ' ' + (c.idnumber || '')).match(/[A-Z]{3,4}\d{3,4}/);
    var sec = full.match(/Sec\.?\s*(\d+)/i);
    return {name:name, short:name.split(' ')[0].slice(0, 18), code:code ? code[0] : '', section:sec ? 'Sección ' + sec[1] : '', academic:!!code};
  }
  var bar, log;
  function step(pct, msg){ if (bar) bar.style.width = pct + '%'; if (log){ var p = el('div', {text:msg}); log.appendChild(p); log.scrollTop = log.scrollHeight; } }

  /* ---------- paso 1: elegir cursos ---------- */
  render([el('h2', {text:'CalculAi · conectar con WebC'}), el('p', {text:'Buscando tus cursos…'})]);
  ajax('core_course_get_enrolled_courses_by_timeline_classification', {classification:'inprogress', limit:0, offset:0, sort:'fullname'})
    .then(function(d){ chooseCourses(d.courses || []); })
    .catch(function(e){ render([el('h2', {text:'CalculAi'}), el('p', {class:'clc-err', text:'No pude leer tus cursos (' + e.message + '). Revisa que tu sesión de WebC esté iniciada y vuelve a intentarlo.'})]); });

  function chooseCourses(courses){
    var boxes = [], filesCb = el('input', {type:'checkbox'}); filesCb.checked = true;
    var list = el('div', {class:'clc-list'}, courses.map(function(c){
      var m = courseMeta(c); var cb = el('input', {type:'checkbox'}); cb.checked = m.academic; cb._course = c; boxes.push(cb);
      return el('label', null, [cb, el('span', null, [el('b', {text:m.name}), el('br'), el('small', {text:[m.code, m.section].filter(Boolean).join(' · ') || c.shortname})])]);
    }));
    render([el('h2', {text:'CalculAi · conectar con WebC'}),
      el('p', {text:'Elige los cursos que quieres llevar a CalculAi. Leeré sus fechas del calendario, los recursos publicados y los avisos recientes.'}),
      list,
      el('label', null, [filesCb, el('span', null, [el('b', {text:'Traer también los archivos'}), el('br'), el('small', {text:'PDF, PowerPoint, Word y páginas de cada curso, para crear clases en CalculAi. Puede tardar un par de minutos.'})])]),
      el('small', {text:'Nada sale de tu navegador: los datos se entregan directamente a tu CalculAi en ' + APP_ORIGIN + '.'}),
      el('div', {class:'clc-row'}, [el('button', {class:'clc-btn', text:'Leer cursos seleccionados', onclick:function(){ var sel = boxes.filter(function(b){ return b.checked; }).map(function(b){ return b._course; }); if (!sel.length) return; collect(sel, filesCb.checked); }})])]);
  }

  /* ---------- paso 2: leer ---------- */
  function collect(courses, withFiles){
    bar = el('i'); log = el('div', {class:'clc-log'});
    render([el('h2', {text:'Leyendo WebC…'}), el('div', {class:'clc-bar'}, [bar]), log]);
    var payload = {type:'calculai-webc', v:1, origin:MOODLE, site:(document.title.split('|').pop() || '').trim(), at:new Date().toISOString(), courses:[]};
    var now = Math.floor(Date.now() / 1000);
    var events = {};
    step(5, 'Calendario…');
    var pEvents = Promise.all([
      ajax('core_calendar_get_action_events_by_timesort', {timesortfrom:now - 14 * 86400, limitnum:50}).catch(function(){ return {events:[]}; }),
      ajax('core_calendar_get_calendar_upcoming_view', {courseid:1, categoryid:0}).catch(function(){ return {events:[]}; })
    ]).then(function(rs){ rs.forEach(function(r){ (r.events || []).forEach(function(e){ events[e.id] = e; }); }); });
    var i = 0;
    var seq = pEvents.then(function(){ step(15, Object.keys(events).length + ' eventos de calendario.'); });
    courses.forEach(function(c){
      seq = seq.then(function(){
        var m = courseMeta(c); var url = MOODLE + '/course/view.php?id=' + c.id;
        var out = {id:c.id, fullname:c.fullname, shortname:c.shortname, url:url, name:m.name, short:m.short, code:m.code, section:m.section, events:[], resources:[], news:[]};
        Object.keys(events).forEach(function(k){ var e = events[k]; var cid = e.course ? e.course.id : e.courseid; if (cid === c.id) out.events.push({id:e.id, name:e.name, ts:e.timesort || e.timestart, type:e.modulename || e.eventtype || '', url:e.url || (e.action && e.action.url) || ''}); });
        step(15 + Math.round(80 * i / courses.length), m.name + ': recursos…');
        return page(url).then(function(doc){
          var seen = {}; var newsUrl = null;
          doc.querySelectorAll('#region-main a[href*="/mod/"], .course-content a[href*="/mod/"]').forEach(function(a){
            var href = a.href; if (!href || seen[href]) return; seen[href] = 1;
            var type = (href.match(/\/mod\/(\w+)\//) || [])[1] || 'otro';
            var name = cleanName(a); if (!name) return;
            var secEl = a.closest('[data-sectionname], li.section, .course-section'); var section = '';
            if (secEl){ section = secEl.getAttribute('data-sectionname') || ((secEl.querySelector('.sectionname, h3') || {}).textContent || ''); section = section.replace(/\s+/g, ' ').trim(); }
            if (type === 'forum' && /^(avisos|anuncios|novedades|news|announcements)$/i.test(name) && !newsUrl) newsUrl = href;
            if (['resource','url','folder','page','assign','quiz','book'].indexOf(type) >= 0) out.resources.push({name:name, url:href, type:type, section:section});
          });
          if (!newsUrl) return out;
          step(15 + Math.round(80 * (i + .5) / courses.length), m.name + ': avisos…');
          return page(newsUrl).then(function(fdoc){
            var links = [], s2 = {};
            fdoc.querySelectorAll('a[href*="discuss.php?d="]').forEach(function(a){ var u = a.href.split('#')[0]; var t = a.textContent.replace(/\s+/g, ' ').trim(); if (!s2[u] && t && !/^\d+$/.test(t)){ s2[u] = 1; links.push({url:u, title:t}); } });
            links = links.slice(0, 12);
            return links.reduce(function(p, L){ return p.then(function(){ return page(L.url).then(function(ddoc){
              var arts = ddoc.querySelectorAll('article'); var text = []; var date = null; var author = '';
              arts.forEach(function(ar, k){ var tx = ar.innerText || ar.textContent || ''; text.push(tx.replace(/\n{3,}/g, '\n\n').trim()); if (k === 0){ var mm = tx.match(/de\s+(.+?)\s+-\s+\w+,\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4}),\s+(\d{1,2}):(\d{2})/); if (mm){ author = mm[1].trim(); date = [mm[4], mm[3], mm[2], mm[5], mm[6]].join('|'); } } });
              out.news.push({id:(L.url.match(/d=(\d+)/) || [])[1] || L.url, title:L.title, url:L.url, author:author, date:date, text:text.join('\n\n———\n\n').slice(0, 5000)});
            }).catch(function(){}); }); }, Promise.resolve()).then(function(){ return out; });
          }).catch(function(){ return out; });
        }).catch(function(){ return out; }).then(function(o){ payload.courses.push(o); i++; });
      });
    });
    if (withFiles) seq = seq.then(function(){ return getFiles(payload); });
    seq.then(function(){ step(100, 'Listo.'); deliver(payload); });
  }

  /* ---------- archivos: desde aquí (dentro de WebC) sí se pueden bajar con tu sesión ---------- */
  var MAXF = 30 * 1024 * 1024, MAXT = 300 * 1024 * 1024;
  function fileName(r, fallback){
    var cd = r.headers.get('content-disposition') || '', m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i), n = '';
    if (m){ try { n = decodeURIComponent(m[1]); } catch (e) { n = m[1]; } }
    if (!n){ try { n = decodeURIComponent(new URL(r.url).pathname.split('/').pop()); } catch (e) {} }
    return n || fallback;
  }
  function sameSite(u){ return typeof u === 'string' && u.indexOf(MOODLE + '/') === 0; }
  function grab(url, name, hop){
    if (!sameSite(url)) return Promise.reject(new Error('fuera de WebC'));
    return fetch(url, {credentials:'same-origin'}).then(function(r){
      if (!r.ok) throw new Error(r.status);
      var ct = r.headers.get('content-type') || '', len = +r.headers.get('content-length') || 0;
      if (len > MAXF) throw new Error('muy grande');
      if (/text\/html/.test(ct) && !hop) return r.text().then(function(t){
        /* WebC a veces muestra el archivo dentro de una página: busco el enlace al archivo real */
        var d = new DOMParser().parseFromString(t, 'text/html');
        var a = d.querySelector('#region-main a[href*="pluginfile.php"], #region-main object[data*="pluginfile.php"], #region-main iframe[src*="pluginfile.php"], #region-main embed[src*="pluginfile.php"]');
        var u = a && (a.getAttribute('href') || a.getAttribute('data') || a.getAttribute('src'));
        if (!u) throw new Error('sin archivo');
        return grab(new URL(u, url).href, name, true);
      });
      return r.arrayBuffer().then(function(buf){ if (buf.byteLength > MAXF) throw new Error('muy grande'); return {buf:buf, ctype:ct, name:fileName(r, name)}; });
    });
  }
  function getFiles(payload){
    var jobs = [];
    payload.courses.forEach(function(c){ c.resources.forEach(function(r){ if ((r.type === 'resource' || r.type === 'page') && sameSite(r.url)) jobs.push(r); }); });
    payload.files = [];
    if (!jobs.length) return Promise.resolve();
    var total = 0, done = 0, ok = 0, k = 0;
    step(96, 'Archivos: 0 de ' + jobs.length + '…');
    function one(r){
      var p = r.type === 'page'
        ? fetch(r.url, {credentials:'same-origin'}).then(function(res){ if (!res.ok) throw new Error(res.status); return res.arrayBuffer().then(function(buf){ return {buf:buf, ctype:'text/html', name:r.name + '.html'}; }); })
        : grab(r.url + (r.url.indexOf('?') >= 0 ? '&' : '?') + 'redirect=1', r.name, false);
      return p.then(function(f){ if (total + f.buf.byteLength > MAXT) return; total += f.buf.byteLength; ok++; payload.files.push({url:r.url, name:f.name, ctype:f.ctype, buf:f.buf}); }).catch(function(){});
    }
    function worker(){ if (k >= jobs.length) return Promise.resolve(); var r = jobs[k++]; return one(r).then(function(){ done++; if (bar) bar.style.width = (96 + Math.round(4 * done / jobs.length)) + '%'; if (log && log.lastChild) log.lastChild.textContent = 'Archivos: ' + done + ' de ' + jobs.length + ' (' + ok + ' listos)…'; return worker(); }); }
    return Promise.all([worker(), worker(), worker()]).then(function(){ step(99, ok + ' de ' + jobs.length + ' archivos listos.'); });
  }

  /* ---------- paso 3: entregar a CalculAi ---------- */
  function deliver(payload){
    window.__calculaiLast = payload;
    var nEv = 0, nRes = 0, nNews = 0, nFiles = (payload.files || []).length; payload.courses.forEach(function(c){ nEv += c.events.length; nRes += c.resources.length; nNews += c.news.length; });
    var status = el('p', {text:''});
    function download(){ var blob = new Blob([JSON.stringify(payload, function(k, v){ return k === 'files' ? undefined : v; })], {type:'application/json'}); var a = el('a', {href:URL.createObjectURL(blob), download:'calculai-webc-' + new Date().toISOString().slice(0, 10) + '.json'}); document.body.appendChild(a); a.click(); a.remove(); status.textContent = 'Archivo descargado. En CalculAi: Editar → Abrir archivo.'; status.className = 'clc-ok'; }
    function send(){
      var w = window.open(APP + '?from=webc', 'calculai');
      if (!w){ status.textContent = 'Tu navegador bloqueó la ventana. Usa «Descargar archivo».'; status.className = 'clc-err'; return; }
      status.textContent = 'Abriendo CalculAi…'; status.className = '';
      var sent = false, tries = 0;
      function onMsg(ev){ if (ev.origin !== APP_ORIGIN || !ev.data) return; if (ev.data.type === 'calculai-ready' && !sent){ sent = true; w.postMessage(payload, APP_ORIGIN); } if (ev.data.type === 'calculai-received'){ status.textContent = '✓ Listo: revisa y confirma en CalculAi.'; status.className = 'clc-ok'; window.removeEventListener('message', onMsg); } }
      window.addEventListener('message', onMsg);
      var iv = setInterval(function(){ tries++; if (sent || tries > 40){ clearInterval(iv); if (!sent){ status.textContent = 'CalculAi no respondió. Usa «Descargar archivo».'; status.className = 'clc-err'; } return; } try { w.postMessage({type:'calculai-ping'}, APP_ORIGIN); } catch (e) {} }, 500);
    }
    render([el('h2', {text:'Todo listo'}),
      el('p', {text:payload.courses.length + ' cursos · ' + nEv + ' fechas de calendario · ' + nRes + ' recursos · ' + nNews + ' avisos' + (nFiles ? ' · ' + nFiles + ' archivos para crear clases' : '') + '.'}),
      el('p', null, [el('small', {text:'En CalculAi vas a revisar todo antes de guardarlo. Las fechas que aparezcan dentro de los avisos llegan como sugerencias para que las confirmes tú.'})]),
      el('div', {class:'clc-row'}, [el('button', {class:'clc-btn', text:'Enviar a CalculAi', onclick:send}), el('button', {class:'clc-btn ghost', text:'Descargar archivo', onclick:download})]),
      nFiles ? el('p', null, [el('small', {text:'Los archivos solo viajan con «Enviar a CalculAi» (no con «Descargar archivo»).'})]) : null,
      status]);
  }
})();
