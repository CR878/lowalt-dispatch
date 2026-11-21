/* First-party page and enquiry statistics; never reads form contents. */
(() => {
  'use strict';
  if (window.__airspaceAnalytics || window.top !== window.self || /^(localhost|127\.)/.test(location.hostname) || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;
  window.__airspaceAnalytics = true;
  const makeId = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); return [...b].map(n => n.toString(16).padStart(2, '0')).join(''); };
  if (!window.crypto?.getRandomValues) return;
  const id = makeId(), path = location.pathname, endpoint = '/airspace-analytics.php';
  const url = new URL(location.href);
  if (url.searchParams.has('preview_site')) return;
  const base = {id, path, title: document.title.slice(0, 200), referrer: document.referrer.slice(0, 2400)};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term'].forEach(k => { base[k] = (url.searchParams.get(k) || '').slice(0, 100); });
  let sent = false, active = 0, since = 0, lastReport = 0, accepted = false;
  const send = (data, beacon = false) => {
    const text = JSON.stringify(data);
    if (beacon && navigator.sendBeacon) { navigator.sendBeacon(endpoint, new Blob([text], {type: 'application/json'})); return; }
    return fetch(endpoint, {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: text, keepalive: true}).catch(() => null);
  };
  const start = () => {
    if (sent || document.visibilityState !== 'visible') return;
    sent = true; since = performance.now();
    Promise.resolve(send({...base, kind: 'page'})).then(r => { accepted = !!r && r.status === 204; });
  };
  const seconds = () => Math.min(3600, Math.floor((active + (since ? performance.now() - since : 0)) / 1000));
  const report = () => { const n = seconds(); if (!accepted || n <= lastReport) return; lastReport = n; send({id, path, kind: 'engage', seconds: n}, true); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (since) active += performance.now() - since; since = 0; report(); }
    else { start(); if (sent) since = performance.now(); }
  });
  window.addEventListener('pagehide', report);
  window.addEventListener('pageshow', e => { if (e.persisted && sent) since = performance.now(); });
  setInterval(() => { if (document.visibilityState === 'visible') report(); }, 30000);
  const clicked = new Set();
  document.addEventListener('click', event => {
    if (!accepted) return;
    const el = event.target.closest('a,button'); if (!el) return;
    const href = el.getAttribute('href') || '', text = el.textContent.trim(); let action = '';
    if (/^tel:/.test(href)) action = 'phone';
    else if (/^mailto:/.test(href)) action = 'email';
    else if (/crm\.kdji\.cn|在线客服|立即获取方案/.test(href + text)) action = 'customer_service';
    else if (/mplink\/client|小程序/.test(href + text)) action = 'mini_program';
    else if (/预约演示|申请体验|场景演示/.test(text)) action = 'demo';
    else if (/申请资料|获取资料|获取下载/.test(text)) action = 'resource_request';
    if (!action || clicked.has(action)) return;
    clicked.add(action); send({id: makeId(), page_id: id, path, title: base.title, kind: 'action', action}, true);
  }, {capture: true});
  start();
})();
