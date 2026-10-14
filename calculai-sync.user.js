// ==UserScript==
// @name         Calculai · revisión automática de WebC
// @namespace    https://sanisidro566.github.io/calculai/
// @version      1.0.0
// @description  Cada vez que abres Calculai, revisa WebC (con tu sesión ya iniciada) y trae fechas, avisos y recursos nuevos. No pide ni guarda contraseñas.
// @match        https://sanisidro566.github.io/calculai/*
// @connect      webc.uai.cl
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @run-at       document-idle
// @noframes
// ==/UserScript==
/* Cómo funciona
   - Calculai (la página) le pide a este script una revisión al abrirse.
   - El script lee WebC con TU sesión del navegador, igual que el marcador «Enviar a Calculai»
     (mismas páginas y mismas funciones de Moodle), y le entrega los datos a Calculai.
   - Si no has iniciado sesión en WebC, se lo avisa a Calculai para que te muestre «Inicia sesión en WebC».
   - Nada se envía a otros servidores. Solo responde a mensajes de la propia página de Calculai. */
(function(){
  'use strict';
  var VERSION = '1.0.0';
  var gmx = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest : (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : null;
  var ORIGIN = location.origin;
  function post(msg){ window.postMessage(msg, ORIGIN); }
  if (!gmx){ post({type:'calculai-agent-hello', v:VERSION, ok:false, why:'Tu gestor de scripts no permite leer otras páginas (falta GM_xmlhttpRequest).'}); return; }

  function req(method, url, body, headers){
    return new Promise(function(resolve, reject){
      gmx({method:method, url:url, data:body, headers:headers || {}, anonymous:false, withCredentials:true, timeout:25000,
        onload:function(r){ resolve({status:r.status, url:r.finalUrl || url, text:r.responseText || ''}); },
        onerror:function(){ reject(new Error('red')); }, ontimeout:function(){ reject(new Error('tiempo')); }});
    });
  }
  function htmlDoc(t){ return new DOMParser().parseFromString(t, 'text/html'); }

  var busy = false;
  window.addEventListener('message', function(ev){
    if (ev.source !== window || ev.origin !== ORIGIN || !ev.data || typeof ev.data !== 'object') return;
    if (ev.data.type === 'calculai-agent-ping') post({type:'calculai-agent-hello', v:VERSION, ok:true});
    if (ev.data.type === 'calculai-sync-request' && !busy) run(ev.data).catch(function(e){ post({type:'calculai-sync-status', state:'error', msg:String(e && e.message || e)}); }).then(function(){ busy = false; });
  });
  post({type:'calculai-agent-hello', v:VERSION, ok:true});

  function run(rq){
    busy = true;
    var BASE = String(rq.base || 'https://webc.uai.cl').replace(/\/+$/, '');
    if (!/^https:\/\/[^/]+(\/[^?#]*)?$/.test(BASE) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(BASE)) throw new Error('dirección de Moodle no válida');
    var want = (rq.courses || []).map(Number).filter(Boolean);
    post({type:'calculai-sync-status', state:'checking'});
    return req('GET', BASE + '/my/').then(function(r){
      var m = r.text.match(/"sesskey":"([^"]+)"/);
      if (r.status >= 400 || /\/login\//.test(r.url) || !m){ post({type:'calculai-sync-status', state:'login', base:BASE}); return; }
      var sesskey = m[1];
      var site = ((htmlDoc(r.text).title || '').split('|').pop() || '').trim();
      function ajax(methodname, args){
        return req('POST', BASE + '/lib/ajax/service.php?sesskey=' + encodeURIComponent(sesskey) + '&info=' + methodname, JSON.stringify([{index:0, methodname:methodname, args:args}]), {'Content-Type':'application/json'})
          .then(function(x){ var j = JSON.parse(x.text); if (!j || !j[0] || j[0].error) throw new Error((j && j[0] && j[0].exception && j[0].exception.errorcode) || 'ajax'); return j[0].data; });
      }
      function page(url){ return req('GET', url).then(function(x){ if (x.status >= 400) throw new Error(x.status); return htmlDoc(x.text); }); }
      return ajax('core_course_get_enrolled_courses_by_timeline_classification', {classification:'inprogress', limit:0, offset:0, sort:'fullname'}).then(function(d){
        var all = d.courses || [];
        var sel = want.length ? all.filter(function(c){ return want.indexOf(c.id) >= 0; }) : all.filter(function(c){ return courseMeta(c).academic; });
        var unlinked = all.filter(function(c){ return want.length && want.indexOf(c.id) < 0 && courseMeta(c).academic; }).map(function(c){ var mm = courseMeta(c); return {id:c.id, name:mm.name, code:mm.code}; });
        return collect(BASE, site, sel, ajax, page).then(function(payload){ payload.auto = true; payload.unlinked = unlinked; post(payload); });
      });
    });
  }

  /* --- Igual que conector.js: mismas páginas y funciones de Moodle --- */
  var TYPE_WORDS = /\s+(Archivo|URL|Tarea|Foro|Carpeta|Cuestionario|Página|Pagina|Reunión de Zoom|E-Marking|Consulta|Etiqueta|File|Assignment|Forum|Folder|Quiz|Page)$/;
  function cleanName(a){ var inst = a.querySelector('.instancename'); var t = inst ? (inst.childNodes[0] ? inst.childNodes[0].textContent : inst.textContent) : a.textContent; return t.replace(/\s+/g, ' ').trim().replace(TYPE_WORDS, ''); }
  var ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
  function titleCase(s){ return s.toLowerCase().split(' ').map(function(w, i){ var up = w.toUpperCase(); if (ROMAN.test(up)) return up; if (i > 0 && /^(de|del|la|las|el|los|y|e|en|a|para)$/.test(w)) return w; return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
  function courseMeta(c){
    var full = (c.fullname || '').replace(/\s+/g, ' ').trim();
    var base = full.split(/\s+Sec\.|\s+Secci[oó]n|\s+STGO|\s+S-SEM/i)[0].trim();
    var name = base === base.toUpperCase() ? titleCase(base) : base;
    var code = ((c.shortname || '') + ' ' + (c.idnumber || '')).match(/[A-Z]{3,4}\d{3,4}/);
    var sec = full.match(/Sec\.?\s*(\d+)/i);
    return {name:name, short:name.split(' ')[0].slice(0, 18), code:code ? code[0] : '', section:sec ? 'Sección ' + sec[1] : '', academic:!!code};
  }
  function collect(BASE, site, courses, ajax, page){
    var payload = {type:'calculai-webc', v:1, origin:BASE, site:site, at:new Date().toISOString(), courses:[]};
    var now = Math.floor(Date.now() / 1000), events = {};
    var seq = Promise.all([
      ajax('core_calendar_get_action_events_by_timesort', {timesortfrom:now - 14 * 86400, limitnum:50}).catch(function(){ return {events:[]}; }),
      ajax('core_calendar_get_calendar_upcoming_view', {courseid:1, categoryid:0}).catch(function(){ return {events:[]}; })
    ]).then(function(rs){ rs.forEach(function(r){ (r.events || []).forEach(function(e){ events[e.id] = e; }); }); });
    courses.forEach(function(c, i){
      seq = seq.then(function(){
        post({type:'calculai-sync-status', state:'reading', msg:(i + 1) + '/' + courses.length});
        var m = courseMeta(c), url = BASE + '/course/view.php?id=' + c.id;
        var out = {id:c.id, fullname:c.fullname, shortname:c.shortname, url:url, name:m.name, short:m.short, code:m.code, section:m.section, events:[], resources:[], news:[]};
        Object.keys(events).forEach(function(k){ var e = events[k]; var cid = e.course ? e.course.id : e.courseid; if (cid === c.id) out.events.push({id:e.id, name:e.name, ts:e.timesort || e.timestart, type:e.modulename || e.eventtype || '', url:e.url || (e.action && e.action.url) || ''}); });
        return page(url).then(function(doc){
          var seen = {}, newsUrl = null;
          doc.querySelectorAll('#region-main a[href*="/mod/"], .course-content a[href*="/mod/"]').forEach(function(a){
            var href = new URL(a.getAttribute('href'), url).href; if (seen[href]) return; seen[href] = 1;
            var type = (href.match(/\/mod\/(\w+)\//) || [])[1] || 'otro';
            var name = cleanName(a); if (!name) return;
            var secEl = a.closest('[data-sectionname], li.section, .course-section'), section = '';
            if (secEl){ section = secEl.getAttribute('data-sectionname') || ((secEl.querySelector('.sectionname, h3') || {}).textContent || ''); section = section.replace(/\s+/g, ' ').trim(); }
            if (type === 'forum' && /^(avisos|anuncios|novedades|news|announcements)$/i.test(name) && !newsUrl) newsUrl = href;
            if (['resource','url','folder','page','assign','quiz','book'].indexOf(type) >= 0) out.resources.push({name:name, url:href, type:type, section:section});
          });
          if (!newsUrl) return;
          return page(newsUrl).then(function(fdoc){
            var links = [], s2 = {};
            fdoc.querySelectorAll('a[href*="discuss.php?d="]').forEach(function(a){ var u = new URL(a.getAttribute('href'), newsUrl).href.split('#')[0]; var t = a.textContent.replace(/\s+/g, ' ').trim(); if (!s2[u] && t && !/^\d+$/.test(t)){ s2[u] = 1; links.push({url:u, title:t}); } });
            return links.slice(0, 12).reduce(function(p, L){ return p.then(function(){ return page(L.url).then(function(ddoc){
              var text = [], date = null, author = '';
              ddoc.querySelectorAll('article').forEach(function(ar, k){ var tx = ar.textContent || ''; tx = tx.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim(); text.push(tx); if (k === 0){ var mm = tx.match(/de\s+(.+?)\s+-\s+\w+,\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4}),\s+(\d{1,2}):(\d{2})/); if (mm){ author = mm[1].trim(); date = [mm[4], mm[3], mm[2], mm[5], mm[6]].join('|'); } } });
              out.news.push({id:(L.url.match(/d=(\d+)/) || [])[1] || L.url, title:L.title, url:L.url, author:author, date:date, text:text.join('\n\n———\n\n').slice(0, 5000)});
            }).catch(function(){}); }); }, Promise.resolve());
          }).catch(function(){});
        }).catch(function(){}).then(function(){ payload.courses.push(out); });
      });
    });
    return seq.then(function(){ return payload; });
  }
})();
