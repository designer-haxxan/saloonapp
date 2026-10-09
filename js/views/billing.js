// Billing: build a bill from services and products, apply discount/tax/tip, take a (partial) payment,
// reduce product stock, and close the matching appointment. Saves an invoice.
import * as Store from '../store.js';
import { esc, money, num, round, todayStr, $, toast, confirmBox, printHtml } from '../util.js';
import { findOrCreateCustomer } from './customers.js';
import { receiptHTML } from './invoices.js';

let cart = blank();

function blank() {
  return { name: '', phone: '', customerId: '', apptId: '', lines: [], discType: 'rs', discVal: 0, tip: 0, tipStaffId: '', paid: null, method: '', defStaff: '', q: '' };
}

const activeStaff = () => Store.all('staff').filter((s) => s.active !== false);
const taxPct = () => num(Store.settings().taxPct);
const stockOf = (id) => num(Store.find('products', id)?.stock);
const qtyInCart = (id) => cart.lines.filter((l) => l.refId === id).reduce((s, l) => s + num(l.qty), 0);

function staffOptions(sel, { shopOption = false } = {}) {
  const list = activeStaff();
  if (sel && !list.some((s) => s.id === sel) && Store.find('staff', sel)) list.push(Store.find('staff', sel));
  const head = shopOption ? '<option value="">Shop (no one)</option>' : '<option value="">Unassigned</option>';
  return head + list.map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}

// Totals used everywhere on this screen. Tip is not revenue, so it sits outside the taxable amount.
function calc() {
  const subtotal = round(cart.lines.reduce((s, l) => s + num(l.rate) * num(l.qty), 0));
  const rawDisc = cart.discType === 'pct' ? subtotal * num(cart.discVal) / 100 : num(cart.discVal);
  const disc = round(Math.min(subtotal, Math.max(0, rawDisc)));
  const taxable = round(subtotal - disc);
  const tax = round(taxable * taxPct() / 100);
  const total = round(taxable + tax);
  const tip = round(Math.max(0, num(cart.tip)));
  const grand = round(total + tip);
  const paid = cart.paid == null ? grand : round(Math.min(grand, Math.max(0, num(cart.paid))));
  return { subtotal, disc, taxable, tax, total, tip, grand, paid, balance: round(grand - paid) };
}

export function render(el, ctx) {
  const qAppt = ctx.query.get('appt');
  const qCust = ctx.query.get('customer');
  if (qAppt && qAppt !== cart.apptId) loadAppointment(qAppt);
  else if (qCust && qCust !== cart.customerId) loadCustomer(qCust);

  const methods = Store.settings().paymentMethods || ['Cash'];
  if (!cart.method || !methods.includes(cart.method)) cart.method = methods[0];

  el.innerHTML = `
    <div class="bill-grid">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3><i class="bi bi-person"></i> Customer</h3>
            ${cart.apptId ? '<span class="tag info"><i class="bi bi-calendar-check"></i> From appointment</span>' : '<span class="small muted">Leave empty for a walk-in</span>'}</div>
          <div class="form-grid">
            <div class="field"><label>Name</label>
              <input class="input" id="cName" list="custNames" value="${esc(cart.name)}" placeholder="Walk-in customer"></div>
            <div class="field"><label>Phone</label>
              <input class="input" id="cPhone" inputmode="tel" value="${esc(cart.phone)}" placeholder="0300-1234567"></div>
          </div>
          <datalist id="custNames">${Store.all('customers').map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>
        </div>

        <div class="card">
          <div class="card-head">
            <h3><i class="bi bi-scissors"></i> Services</h3>
            <div class="row"><small class="muted">Performed by</small>
              <select class="input w-sm" id="defStaff">${staffOptions(cart.defStaff)}</select></div>
          </div>
          <div class="search" style="margin-bottom:14px"><i class="bi bi-search"></i>
            <input class="input" id="svcQ" placeholder="Search services" value="${esc(cart.q)}"></div>
          <div class="svc-pick" id="svcPick"></div>
        </div>

        <div class="card">
          <div class="card-head"><h3><i class="bi bi-bag"></i> Products</h3><span class="small muted">Stock goes down when billed</span></div>
          <div class="svc-pick" id="prodPick"></div>
        </div>
      </div>

      <aside class="card" style="position:sticky;top:92px">
        <div class="card-head"><h3>Bill</h3><button class="btn btn-sm btn-ghost" data-clear><i class="bi bi-arrow-counterclockwise"></i> Clear</button></div>
        <div id="lines"></div>
        <div class="totals" id="totals" style="margin-top:12px"></div>

        <div class="form-grid" style="margin-top:14px;gap:10px">
          <div class="field"><label>Discount</label>
            <div class="row" style="gap:6px"><input class="input" id="discVal" type="number" min="0" step="10" value="${cart.discVal || ''}" placeholder="0">
              <select class="input w-xs" id="discType"><option value="rs" ${cart.discType === 'rs' ? 'selected' : ''}>Rs</option><option value="pct" ${cart.discType === 'pct' ? 'selected' : ''}>%</option></select></div></div>
          <div class="field"><label>Tip</label><input class="input" id="tip" type="number" min="0" step="10" value="${cart.tip || ''}" placeholder="0"></div>
          <div class="field"><label>Tip goes to</label><select class="input" id="tipStaff">${staffOptions(cart.tipStaffId, { shopOption: true })}</select></div>
          <div class="field"><label>Payment method</label><select class="input" id="method">${methods.map((m) => `<option ${m === cart.method ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>
          <div class="field full"><label>Paid now</label>
            <div class="row" style="gap:6px"><input class="input" id="paid" type="number" min="0" step="10" placeholder="Full amount" value="${cart.paid ?? ''}">
              <button class="btn btn-sm" id="fullBtn" type="button">Full</button></div>
            <span class="small muted">Leave as Full, or enter less for a part payment. The rest stays on the customer's balance.</span></div>
        </div>

        <div id="balance" style="margin-top:14px"></div>
        <div class="grid" style="margin-top:16px;gap:10px">
          <button class="btn btn-primary btn-block" id="saveBtn"><i class="bi bi-check2-circle"></i> Save invoice</button>
          <button class="btn btn-gold btn-block" id="printBtn"><i class="bi bi-printer"></i> Save &amp; print receipt</button>
        </div>
      </aside>
    </div>`;

  renderPicks();
  renderLines();

  // Customer
  $('#cName', el).oninput = (e) => { cart.name = e.target.value; };
  $('#cPhone', el).oninput = (e) => { cart.phone = e.target.value; };
  $('#cPhone', el).onchange = (e) => {
    const digitsOnly = e.target.value.replace(/\D/g, '');
    const hit = digitsOnly && Store.all('customers').find((c) => c.phone.replace(/\D/g, '') === digitsOnly);
    if (hit) {
      cart.customerId = hit.id;
      if (!cart.name) { cart.name = hit.name; $('#cName', el).value = hit.name; }
    }
  };
  $('#defStaff', el).onchange = (e) => { cart.defStaff = e.target.value; };
  $('#svcQ', el).oninput = (e) => { cart.q = e.target.value; renderPicks(); };

  // Discount, tip, payment
  $('#discVal', el).oninput = (e) => { cart.discVal = num(e.target.value); updateTotals(); };
  $('#discType', el).onchange = (e) => { cart.discType = e.target.value; updateTotals(); };
  $('#tip', el).oninput = (e) => { cart.tip = num(e.target.value); updateTotals(); };
  $('#tipStaff', el).onchange = (e) => { cart.tipStaffId = e.target.value; };
  $('#method', el).onchange = (e) => { cart.method = e.target.value; };
  $('#paid', el).oninput = (e) => { cart.paid = e.target.value === '' ? null : num(e.target.value); updateTotals(); };
  $('#fullBtn', el).onclick = () => { cart.paid = null; $('#paid', el).value = ''; updateTotals(); };

  $('#saveBtn', el).onclick = () => save(ctx, false);
  $('#printBtn', el).onclick = () => save(ctx, true);

  el.onclick = async (e) => {
    const t = e.target;
    const svc = t.closest('[data-add-svc]');
    if (svc) return addService(svc.dataset.addSvc);
    const prod = t.closest('[data-add-prod]');
    if (prod) return addProduct(prod.dataset.addProd);
    const rm = t.closest('[data-rm]');
    if (rm) { cart.lines.splice(num(rm.dataset.rm), 1); renderLines(); renderPicks(); return; }
    if (t.closest('[data-clear]')) {
      if (cart.lines.length && !await confirmBox('Clear this bill? Items and customer details will be removed.', { okText: 'Clear', danger: true })) return;
      cart = blank();
      return ctx.refresh();
    }
  };

  // Line edits: update state and totals without re-rendering (keeps the keyboard focus).
  const lines = $('#lines', el);
  lines.oninput = (e) => {
    const i = num(e.target.dataset.i);
    const line = cart.lines[i];
    if (!line) return;
    if (e.target.classList.contains('qty')) {
      let q = Math.max(1, Math.floor(num(e.target.value) || 1));
      if (line.type === 'product' && q > stockOf(line.refId)) { q = Math.max(1, stockOf(line.refId)); toast(`Only ${stockOf(line.refId)} in stock`, 'error'); e.target.value = q; }
      line.qty = q;
    }
    if (e.target.classList.contains('rate')) line.rate = Math.max(0, num(e.target.value));
    updateLineAmount(i);
    updateTotals();
  };
  lines.onchange = (e) => {
    if (e.target.classList.contains('l-staff')) cart.lines[num(e.target.dataset.i)].staffId = e.target.value;
  };

  updateTotals();
}

function loadAppointment(id) {
  const a = Store.find('appointments', id);
  if (!a) return toast('That appointment could not be found', 'error');
  if (a.invoiceId) { toast('This appointment is already billed', 'error'); return; }
  cart = blank();
  cart.apptId = a.id;
  cart.name = a.customerName || '';
  cart.phone = a.customerPhone || '';
  cart.customerId = a.customerId || '';
  cart.lines = a.items.map((i) => ({ type: 'service', refId: i.refId, name: i.name, rate: num(i.price), qty: 1, staffId: a.staffId || '', duration: num(i.duration) }));
  cart.defStaff = a.staffId || '';
}

function loadCustomer(id) {
  const c = Store.find('customers', id);
  if (!c) return;
  cart = blank();
  cart.name = c.name;
  cart.phone = c.phone || '';
  cart.customerId = c.id;
}

function renderPicks() {
  const q = cart.q.trim().toLowerCase();
  const svcs = Store.all('services').filter((s) => s.active !== false && (!q || s.name.toLowerCase().includes(q)));
  const svcEl = $('#svcPick');
  if (svcEl) svcEl.innerHTML = svcs.length
    ? svcs.map((s, i) => `<button class="svc-btn" style="--i:${i}" data-add-svc="${s.id}"><b>${esc(s.name)}</b><span>${esc(s.category || '')} · ${s.duration} min</span><span class="money">${money(s.price)}</span></button>`).join('')
    : '<div class="empty" style="grid-column:1/-1">No service matches. Add services in the Services screen.</div>';

  const prods = Store.all('products');
  const prodEl = $('#prodPick');
  if (prodEl) prodEl.innerHTML = prods.length
    ? prods.map((p, i) => {
      const left = stockOf(p.id) - qtyInCart(p.id);
      return `<button class="svc-btn" style="--i:${i};${left <= 0 ? 'opacity:.5' : ''}" data-add-prod="${p.id}" ${left <= 0 ? 'disabled' : ''}>
        <b>${esc(p.name)}</b><span>${left > 0 ? left + ' in stock' : 'Out of stock'}</span><span class="money">${money(p.price)}</span></button>`;
    }).join('')
    : '<div class="empty" style="grid-column:1/-1">No products yet. Add retail items in the Products screen.</div>';
}

function addService(id) {
  const s = Store.find('services', id);
  if (!s) return;
  cart.lines.push({ type: 'service', refId: s.id, name: s.name, rate: num(s.price), qty: 1, staffId: cart.defStaff || '', duration: num(s.duration) });
  renderLines();
  toast(`${s.name} added`);
}

function addProduct(id) {
  const p = Store.find('products', id);
  if (!p) return;
  const existing = cart.lines.find((l) => l.type === 'product' && l.refId === id);
  if (qtyInCart(id) + 1 > num(p.stock)) return toast(`Only ${p.stock} ${p.name} in stock`, 'error');
  if (existing) existing.qty = num(existing.qty) + 1;
  else cart.lines.push({ type: 'product', refId: p.id, name: p.name, rate: num(p.price), qty: 1, staffId: '', cost: num(p.cost) });
  renderLines();
  renderPicks();
}

function renderLines() {
  const box = $('#lines');
  if (!box) return;
  if (!cart.lines.length) {
    box.innerHTML = '<div class="empty" style="padding:26px 8px"><i class="bi bi-cart"></i>Tap a service or product to add it to this bill.</div>';
  } else {
    box.innerHTML = cart.lines.map((l, i) => `
      <div class="cart-line">
        <div class="n">
          <b>${esc(l.name)}</b>
          ${l.type === 'service'
            ? `<select class="input l-staff" data-i="${i}" style="margin-top:6px;padding:6px 8px;font-size:12.5px">${staffOptions(l.staffId)}</select>`
            : `<span>Product · ${stockOf(l.refId)} in stock</span>`}
          <span class="money line-amt" data-amt="${i}" style="display:block;margin-top:4px;color:var(--brand-deep)">${money(num(l.rate) * num(l.qty))}</span>
        </div>
        <input class="input qty" type="number" min="1" step="1" data-i="${i}" value="${l.qty}" aria-label="Quantity">
        <input class="input rate" type="number" min="0" step="10" data-i="${i}" value="${l.rate}" aria-label="Rate">
        <button class="icon-btn" data-rm="${i}" style="width:34px;height:34px" aria-label="Remove"><i class="bi bi-x"></i></button>
      </div>`).join('');
  }
  updateTotals();
  renderPicks();
}

function updateLineAmount(i) {
  const l = cart.lines[i];
  const el = document.querySelector(`[data-amt="${i}"]`);
  if (l && el) el.textContent = money(num(l.rate) * num(l.qty));
}

function updateTotals() {
  const c = calc();
  const totals = $('#totals');
  if (totals) totals.innerHTML = `
    <div><span class="muted">Subtotal</span><span class="money">${money(c.subtotal)}</span></div>
    ${c.disc ? `<div><span class="muted">Discount</span><span class="money" style="color:var(--ok)">− ${money(c.disc)}</span></div>` : ''}
    ${taxPct() ? `<div><span class="muted">Sales tax (${taxPct()}%)</span><span class="money">${money(c.tax)}</span></div>` : ''}
    ${c.tip ? `<div><span class="muted">Tip</span><span class="money">${money(c.tip)}</span></div>` : ''}
    <div class="grand"><span>Total</span><span class="money">${money(c.grand)}</span></div>`;
  const bal = $('#balance');
  if (bal) bal.innerHTML = c.balance > 0
    ? `<div class="row between"><span>Balance on account</span><span class="balance-due money">${money(c.balance)}</span></div>`
    : `<div class="row between"><span>Status</span><span class="balance-ok"><i class="bi bi-check-circle-fill"></i> Paid in full</span></div>`;
}

async function save(ctx, print) {
  if (!cart.lines.length) return toast('Add at least one service or product', 'error');
  if (cart.lines.some((l) => num(l.qty) <= 0)) return toast('Quantities must be at least 1', 'error');

  for (const l of cart.lines.filter((x) => x.type === 'product')) {
    const need = cart.lines.filter((x) => x.refId === l.refId).reduce((s, x) => s + num(x.qty), 0);
    if (need > stockOf(l.refId)) return toast(`Only ${stockOf(l.refId)} ${l.name} in stock`, 'error');
  }
  if (cart.apptId && Store.find('appointments', cart.apptId)?.invoiceId) return toast('This appointment is already billed', 'error');

  const c = calc();
  const name = cart.name.trim();
  const phone = cart.phone.trim();
  if (c.balance > 0 && !name && !phone) {
    const ok = await confirmBox(`Customer balance of ${money(c.balance)} will be recorded for a walk-in customer without a name or phone. Continue?`, { okText: 'Continue', danger: true });
    if (!ok) return;
  }

  const customer = findOrCreateCustomer(name, phone);
  const number = Store.nextNo(Store.settings().invoicePrefix || 'INV');
  const inv = Store.add('invoices', {
    number,
    date: todayStr(),
    customerId: customer?.id || '',
    customerName: customer?.name || name || 'Walk-in customer',
    customerPhone: customer?.phone || phone,
    lines: cart.lines.map((l) => ({
      type: l.type, refId: l.refId, name: l.name, rate: round(l.rate), qty: num(l.qty),
      amount: round(num(l.rate) * num(l.qty)), staffId: l.type === 'service' ? (l.staffId || '') : '',
    })),
    subtotal: c.subtotal,
    discountType: cart.discType,
    discountValue: num(cart.discVal),
    discount: c.disc,
    taxPct: taxPct(),
    tax: c.tax,
    total: c.total,
    tip: c.tip,
    tipStaffId: c.tip ? cart.tipStaffId : '',
    paid: c.paid,
    method: cart.method,
    payments: c.paid > 0 ? [{ amount: c.paid, method: cart.method, date: todayStr() }] : [],
    apptId: cart.apptId || '',
    voided: false,
  });

  for (const l of cart.lines.filter((x) => x.type === 'product')) {
    const p = Store.find('products', l.refId);
    if (p) Store.update('products', p.id, { stock: Math.max(0, num(p.stock) - num(l.qty)) });
  }
  if (cart.apptId) Store.update('appointments', cart.apptId, { status: 'done', invoiceId: inv.id });

  cart = blank();
  toast(`${number} saved`, 'ok');
  if (print) printHtml(receiptHTML(inv, Store.settings()));
  ctx.go(`#/invoices/${inv.id}`);
}
