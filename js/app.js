// Boot, hash router, navigation (sidebar + phone bottom bar) and the service worker.
import * as Store from './store.js';
import { $, $$, todayStr, fmtDate, toast, esc } from './util.js';

// Each route loads its view module on demand.
export const ROUTES = [
  { id: 'dashboard', label: 'Home', icon: 'bi-grid-1x2-fill', load: () => import('./views/dashboard.js') },
  { id: 'calendar', label: 'Calendar', icon: 'bi-calendar2-week', load: () => import('./views/calendar.js') },
  { id: 'billing', label: 'New Bill', icon: 'bi-receipt-cutoff', load: () => import('./views/billing.js') },
  { id: 'invoices', label: 'Invoices', icon: 'bi-file-earmark-text', load: () => import('./views/invoices.js') },
  { id: 'services', label: 'Services', icon: 'bi-scissors', load: () => import('./views/services.js') },
  { id: 'staff', label: 'Staff', icon: 'bi-people', load: () => import('./views/staff.js') },
  { id: 'customers', label: 'Customers', icon: 'bi-person-hearts', load: () => import('./views/customers.js') },
  { id: 'products', label: 'Products', icon: 'bi-bag-heart', load: () => import('./views/products.js') },
  { id: 'payroll', label: 'Payroll', icon: 'bi-cash-stack', load: () => import('./views/payroll.js') },
  { id: 'reports', label: 'Reports', icon: 'bi-graph-up-arrow', load: () => import('./views/reports.js') },
  { id: 'settings', label: 'Settings', icon: 'bi-gear', load: () => import('./views/settings.js') },
];
const BOTTOM = ['dashboard', 'calendar', 'billing', 'invoices'];
const SECTIONS = { dashboard: 'Overview', calendar: 'Bookings', billing: 'Bookings', invoices: 'Bookings', services: 'Management', staff: 'Management', customers: 'Management', products: 'Management', payroll: 'Money', reports: 'Money', settings: 'System' };

let routeSeq = 0;
let currentRoute = null;

function buildNav() {
  let html = '';
  let section = '';
  for (const r of ROUTES) {
    const sec = SECTIONS[r.id];
    if (sec !== section) { section = sec; html += `<div class="nav-section" style="font-size:11px;opacity:.55;text-transform:uppercase;letter-spacing:.1em;margin:14px 12px 4px">${sec}</div>`; }
    html += `<a class="nav-link" href="#/${r.id}" data-route="${r.id}"><i class="bi ${r.icon}"></i>${esc(r.label)}</a>`;
  }
  $('#nav').innerHTML = html;

  $('#bottomNav').innerHTML = BOTTOM.map((id) => {
    const r = ROUTES.find((x) => x.id === id);
    return `<button data-go="${id}"><i class="bi ${r.icon}"></i>${esc(r.label.replace('New ', ''))}</button>`;
  }).join('') + `<button data-menu><i class="bi bi-three-dots"></i>More</button>`;
}

function markActive(id) {
  $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === id));
  $$('#bottomNav [data-go]').forEach((b) => b.classList.toggle('active', b.dataset.go === id));
}

function setSidebar(open) {
  $('#sidebar').classList.toggle('open', open);
  $('#scrim').classList.toggle('show', open);
}

export function go(hash) {
  if (location.hash === hash) route(true);
  else location.hash = hash;
}

// Re-render the current screen (after a data change). No entrance animation.
export function refresh() { return route(false); }

async function route(animate = true) {
  const raw = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [path, qs = ''] = raw.split('?');
  const [name, ...params] = path.split('/').map((p) => decodeURIComponent(p));
  const r = ROUTES.find((x) => x.id === name) || ROUTES[0];
  const seq = ++routeSeq;
  currentRoute = r.id;

  markActive(r.id);
  setSidebar(false);
  // A screen change closes any open dialog (booking, payment, payslip...).
  document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());
  $('#pageTitle').textContent = r.label;
  $('#crumb').textContent = SECTIONS[r.id] || 'Salon Pro';
  document.title = `${r.label} · Salon Pro`;

  const view = $('#view');
  if (animate) view.innerHTML = '<div class="loading"></div>';
  let mod;
  try {
    mod = await r.load();
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty"><i class="bi bi-wifi-off"></i>This screen could not load. Check the connection once, then reopen the app.</div>`;
    return;
  }
  if (seq !== routeSeq) return;

  view.className = 'view' + (animate ? ' enter' : '');
  view.innerHTML = '';
  try {
    await mod.render(view, { params, query: new URLSearchParams(qs), go, refresh });
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty"><i class="bi bi-exclamation-triangle"></i>Something went wrong on this screen.<br><small>${esc(err.message || err)}</small></div>`;
  }
}

function applySettings() {
  const s = Store.settings();
  $('#brandName').textContent = s.businessName || 'Salon Pro';
  document.title = `${s.businessName || 'Salon Pro'} · Salon Pro`;
  $('#dateChip').textContent = fmtDate(todayStr(), { weekday: 'short', day: 'numeric', month: 'short' });
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('service-worker.js').catch((e) => console.warn('SW failed', e));
}

function boot() {
  Store.load();
  buildNav();
  applySettings();

  $('#menuBtn').addEventListener('click', () => setSidebar(!$('#sidebar').classList.contains('open')));
  $('#scrim').addEventListener('click', () => setSidebar(false));
  $('#bottomNav').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-menu')) setSidebar(true);
    else go('#/' + b.dataset.go);
  });
  document.addEventListener('store:error', (e) => toast(e.detail, 'error'));
  window.addEventListener('hashchange', () => route(true));

  setTimeout(() => {
    $('#app').hidden = false;
    $('#splash').classList.add('gone');
    route(true);
  }, 700);
  registerSW();
}

// Settings changes (name, etc.) update the shell immediately.
document.addEventListener('settings:changed', applySettings);
export { applySettings, currentRoute };

boot();
