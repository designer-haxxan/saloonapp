// Shared helpers: DOM, formatting (PKR, local dates), phone/WhatsApp, toasts, modals, print.

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
export const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const round = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

// Rs 1,500 style (Pakistani grouping)
export const money = (n) => 'Rs ' + Math.round(num(n)).toLocaleString('en-PK');

// ---------- Dates (always local time, never UTC) ----------
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const todayStr = () => ymd(new Date());
export function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseYMD(s); d.setDate(d.getDate() + n); return ymd(d); }
export function startOfWeek(s) { const d = parseYMD(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }
export const monthOf = (s) => s.slice(0, 7);
export function fmtDate(s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!s) return '';
  return parseYMD(s).toLocaleDateString('en-PK', opts);
}
export function fmtMonth(s) { return parseYMD(s + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' }); }
export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

// "14:30" <-> minutes since midnight
export const toMin = (t) => { const [h, m] = String(t || '00:00').split(':').map(Number); return h * 60 + (m || 0); };
export const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

// ---------- Phone & WhatsApp ----------
export function normPhone(p) { return String(p || '').replace(/[^\d+]/g, ''); }
// Pakistani numbers: 03xx-xxxxxxx -> wa.me/923xxxxxxxxx
export function waLink(phone, text) {
  let p = normPhone(phone).replace(/^\+/, '');
  if (p.startsWith('00')) p = p.slice(2);
  else if (p.startsWith('0')) p = '92' + p.slice(1);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

// Find a customer by phone digits (ignores dashes and spaces)
export const digits = (p) => String(p || '').replace(/\D/g, '');

// ---------- Toasts ----------
export function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3000);
}

// ---------- Modal ----------
// openModal({ title, html, wide, footer, onMount(box, close) }) -> close()
export function openModal({ title, html, wide = false, footer = '', onMount }) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3>
        <button class="icon-btn" data-close aria-label="Close"><i class="bi bi-x-lg"></i></button></div>
      <div class="modal-body">${html}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    back.style.opacity = '0';
    setTimeout(() => back.remove(), 150);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  const box = back.querySelector('.modal');
  onMount?.(box, close);
  return close;
}

// Promise-based yes/no dialog
export function confirmBox(message, { okText = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openModal({
      title: 'Please confirm',
      html: `<p style="margin:0;line-height:1.7">${esc(message).replace(/\n/g, '<br>')}</p>`,
      footer: `<button class="btn" data-no>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(okText)}</button>`,
      onMount(box, close) {
        box.querySelector('[data-yes]').onclick = () => { finish(true); close(); };
        box.querySelector('[data-no]').onclick = () => { finish(false); close(); };
        box.querySelector('[data-close]').addEventListener('click', () => finish(false), { once: true });
      },
    });
  });
}

// Form values as a plain object (checkbox arrays become arrays)
export function readForm(form) {
  const out = {};
  for (const [k, v] of new FormData(form).entries()) {
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  return out;
}

// ---------- Print ----------
// Puts html into #print-area and opens the print dialog, so only the receipt or payslip prints.
export function printHtml(html) {
  let area = $('#print-area');
  if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.append(area); }
  area.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

// Count-up animation for [data-count] elements inside root
export function countUp(root = document) {
  $$('[data-count]', root).forEach((el) => {
    const end = num(el.dataset.count);
    const fmt = el.dataset.fmt === 'money' ? money : (v) => Math.round(v).toLocaleString('en-PK');
    const start = performance.now();
    const dur = 900;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(end * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// Simple avatar initials
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
