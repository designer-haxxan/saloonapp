// Invoices: list with filters and totals, printable receipt, payments on account, WhatsApp share, void.
import * as Store from '../store.js';
import { esc, money, num, round, fmtDate, $, openModal, readForm, toast, confirmBox, printHtml, waLink, digits, countUp } from '../util.js';
import { liveInvoices, sumInvoices, invoiceStatus, invoiceBalance, invoiceGrand, STATUS_LABEL, staffName } from '../domain.js';

let q = '';
let filter = 'all';

// Receipt markup shared by the invoice screen, printing and the billing screen.
export function receiptHTML(inv, s = Store.settings()) {
  const status = invoiceStatus(inv);
  const bal = invoiceBalance(inv);
  const row = (label, value, extra = '') => `<tr class="sum"><td colspan="4" class="r" style="color:#666">${label}</td><td class="r" ${extra}>${value}</td></tr>`;
  const lines = inv.lines.map((l) => `
    <tr>
      <td>${esc(l.name)}</td>
      <td>${l.type === 'service' ? esc(staffName(l.staffId)) : 'Product'}</td>
      <td class="r">${l.qty}</td>
      <td class="r">${money(l.rate)}</td>
      <td class="r">${money(l.amount)}</td>
    </tr>`).join('');

  return `
    <div class="receipt">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <h2>${esc(s.businessName)}</h2>
          ${s.urduName ? `<div class="urdu" style="font-size:19px;color:#7b2d52">${esc(s.urduName)}</div>` : ''}
          ${s.tagline ? `<div class="small" style="color:#777">${esc(s.tagline)}</div>` : ''}
          ${s.address ? `<div class="small" style="color:#555">${esc(s.address)}</div>` : ''}
          ${s.phone ? `<div class="small" style="color:#555">${esc(s.phone)}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div class="small" style="color:#888;letter-spacing:.12em">INVOICE</div>
          <b style="font-size:16px">${esc(inv.number)}</b>
          <div class="small" style="color:#555">${fmtDate(inv.date)}</div>
        </div>
      </div>

      <div class="small" style="margin:16px 0 2px"><b>Bill to:</b> ${esc(inv.customerName)}${inv.customerPhone ? ' · ' + esc(inv.customerPhone) : ''}</div>

      <table>
        <thead><tr><th>Item</th><th>By</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
        <tbody>${lines}</tbody>
        <tbody>
          ${row('Subtotal', money(inv.subtotal))}
          ${num(inv.discount) ? row('Discount' + (inv.discountType === 'pct' ? ` (${inv.discountValue}%)` : ''), '− ' + money(inv.discount)) : ''}
          ${num(inv.taxPct) ? row(`Sales tax (${inv.taxPct}%)`, money(inv.tax)) : ''}
          ${num(inv.tip) ? row('Tip', money(inv.tip)) : ''}
          <tr class="total"><td colspan="4" class="r">Total payable</td><td class="r">${money(invoiceGrand(inv))}</td></tr>
          ${num(inv.paid) ? row(`Paid${inv.method ? ' · ' + esc(inv.method) : ''}`, money(inv.paid)) : ''}
          ${bal > 0 ? row('Balance due', money(bal), 'style="color:#d64545;font-weight:700"') : ''}
        </tbody>
      </table>

      <div style="text-align:center;margin-top:18px">
        <span class="stamp ${status}">${STATUS_LABEL[status][0].toUpperCase()}</span>
      </div>
      ${s.footer ? `<p class="small" style="text-align:center;color:#777;margin:16px 0 0">${esc(s.footer)}</p>` : ''}
    </div>`;
}

export function render(el, ctx) {
  const id = ctx.params[0];
  if (id) return detail(el, id, ctx);
  list(el, ctx);
}

// ---------- List ----------
function list(el, ctx) {
  const all = Store.all('invoices').slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const shown = all.filter((i) =>
    (filter === 'all' || invoiceStatus(i) === filter) &&
    (!q || `${i.number} ${i.customerName} ${i.customerPhone}`.toLowerCase().includes(q)));
  const t = sumInvoices(liveInvoices());
  const counts = { all: all.length };
  for (const i of all) counts[invoiceStatus(i)] = (counts[invoiceStatus(i)] || 0) + 1;

  el.innerHTML = `
    <div class="grid grid-stats stats-fit">
      <div class="card stat" style="--i:0"><div class="stat-label">Total sales</div><div class="stat-value" data-count="${t.sales}" data-fmt="money">${money(0)}</div><i class="bi bi-receipt stat-icon"></i></div>
      <div class="card stat" style="--i:1"><div class="stat-label">Collected</div><div class="stat-value" data-count="${t.collected}" data-fmt="money">${money(0)}</div><i class="bi bi-cash-coin stat-icon"></i></div>
      <div class="card stat" style="--i:2"><div class="stat-label">Balance to collect</div><div class="stat-value" data-count="${t.balance}" data-fmt="money">${money(0)}</div><i class="bi bi-wallet2 stat-icon"></i></div>
    </div>
    <div class="toolbar">
      <div class="search"><i class="bi bi-search"></i><input class="input" id="invQ" placeholder="Search number, name or phone" value="${esc(q)}"></div>
      <div class="seg" style="flex-wrap:wrap">
        ${[['all', 'All'], ['unpaid', 'Unpaid'], ['partial', 'Part paid'], ['paid', 'Paid'], ['void', 'Void']].map(([k, l]) =>
          `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${l} ${counts[k] ? `<small>${counts[k]}</small>` : ''}</button>`).join('')}
      </div>
      <button class="btn btn-primary" data-go="billing"><i class="bi bi-plus-lg"></i> New bill</button>
    </div>

    ${!all.length ? '<div class="card empty"><i class="bi bi-file-earmark-text"></i><p>No invoices yet. Finish an appointment or start a bill to create your first invoice.</p></div>' : ''}
    ${all.length && !shown.length ? '<div class="empty"><i class="bi bi-search"></i>No invoice matches these filters.</div>' : ''}
    ${shown.length ? `
    <div class="card" style="padding:0">
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th class="num">Total</th><th class="num">Paid</th><th>Status</th></tr></thead>
        <tbody>
          ${shown.map((i, n) => {
            const st = invoiceStatus(i);
            return `<tr class="click" data-open="${i.id}" style="animation:fadeUp .35s both;animation-delay:${Math.min(n, 12) * 30}ms">
              <td><b>${esc(i.number)}</b></td>
              <td class="small muted">${fmtDate(i.date)}</td>
              <td>${esc(i.customerName)}<div class="small muted">${esc(i.customerPhone || '')}</div></td>
              <td class="num money">${money(invoiceGrand(i))}</td>
              <td class="num money">${money(i.paid)}</td>
              <td><span class="tag ${STATUS_LABEL[st][1]}">${STATUS_LABEL[st][0]}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>` : ''}`;

  const search = $('#invQ', el);
  search.oninput = () => { q = search.value.trim().toLowerCase(); list(el, ctx); const s2 = $('#invQ', el); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); };
  el.onclick = (e) => {
    const f = e.target.closest('[data-f]');
    if (f) { filter = f.dataset.f; return list(el, ctx); }
    if (e.target.closest('[data-go]')) return ctx.go('#/billing');
    const row = e.target.closest('[data-open]');
    if (row) ctx.go(`#/invoices/${row.dataset.open}`);
  };
  countUp(el);
}

// ---------- Detail ----------
function detail(el, id, ctx) {
  const inv = Store.find('invoices', id);
  if (!inv) {
    el.innerHTML = '<div class="card empty"><i class="bi bi-question-circle"></i><p>This invoice could not be found.</p><a class="btn" href="#/invoices">Back to invoices</a></div>';
    return;
  }
  const s = Store.settings();
  const bal = invoiceBalance(inv);
  const msg = `Assalam o Alaikum ${inv.customerName}! Invoice ${inv.number} from ${s.businessName}: total ${money(invoiceGrand(inv))}, paid ${money(inv.paid)}` +
    (bal > 0 ? `, balance ${money(bal)}` : ', paid in full') + '. Shukriya!';

  el.innerHTML = `
    <div class="row wrap no-print" style="margin-bottom:18px;gap:8px">
      <button class="btn btn-ghost" data-back><i class="bi bi-arrow-left"></i> All invoices</button>
      <div class="grow"></div>
      ${!inv.voided && bal > 0 ? '<button class="btn btn-ok" data-pay><i class="bi bi-cash-coin"></i> Record payment</button>' : ''}
      <button class="btn btn-gold" data-print><i class="bi bi-printer"></i> Print</button>
      ${digits(inv.customerPhone) ? `<a class="btn" target="_blank" rel="noopener" href="${esc(waLink(inv.customerPhone, msg))}"><i class="bi bi-whatsapp"></i> WhatsApp</a>` : ''}
      ${!inv.voided ? '<button class="btn btn-danger" data-void><i class="bi bi-slash-circle"></i> Void</button>' : ''}
    </div>
    ${receiptHTML(inv, s)}
    ${(inv.payments || []).length ? `
      <div class="card" style="max-width:560px;margin:18px auto 0">
        <h3 style="font-size:15px;margin-bottom:10px">Payments</h3>
        <div class="list">${inv.payments.map((p) => `
          <div class="list-item" style="cursor:default;padding:10px"><div class="grow"><b>${money(p.amount)}</b> <span class="small muted">${esc(p.method)}</span></div>
          <span class="small muted">${fmtDate(p.date)}</span></div>`).join('')}</div>
      </div>` : ''}`;

  el.onclick = async (e) => {
    const t = e.target;
    if (t.closest('[data-back]')) return ctx.go('#/invoices');
    if (t.closest('[data-print]')) return printHtml(receiptHTML(inv, s));
    if (t.closest('[data-pay]')) return openPayment(inv, ctx);
    if (t.closest('[data-void]')) {
      const ok = await confirmBox(`Void invoice ${inv.number}? Its money is removed from reports and product stock is put back.`, { okText: 'Void invoice', danger: true });
      if (!ok) return;
      voidInvoice(inv);
      toast(`${inv.number} voided`);
      return ctx.refresh();
    }
  };
}

function openPayment(inv, ctx) {
  const bal = invoiceBalance(inv);
  const methods = Store.settings().paymentMethods || ['Cash'];
  openModal({
    title: `Payment for ${inv.number}`,
    html: `
      <form id="payForm" class="form-grid">
        <div class="field full"><label>Balance due</label><div class="money" style="font-size:22px;color:var(--danger)">${money(bal)}</div></div>
        <div class="field"><label>Amount received (Rs)</label><input class="input" name="amount" type="number" min="1" max="${bal}" step="10" required value="${bal}"></div>
        <div class="field"><label>Method</label><select class="input" name="method">${methods.map((m) => `<option>${esc(m)}</option>`).join('')}</select></div>
      </form>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-ok" form="payForm" type="submit"><i class="bi bi-check2"></i> Save payment</button>',
    onMount(box, close) {
      box.querySelector('#payForm').onsubmit = (e) => {
        e.preventDefault();
        const f = readForm(e.target);
        const amount = round(Math.min(bal, Math.max(0, num(f.amount))));
        if (amount <= 0) return toast('Enter an amount', 'error');
        Store.update('invoices', inv.id, {
          paid: round(num(inv.paid) + amount),
          payments: [...(inv.payments || []), { amount, method: f.method, date: new Date().toISOString().slice(0, 10) }],
        });
        toast(`${money(amount)} received`, 'ok');
        close();
        ctx.refresh();
      };
    },
  });
}

// Restores product stock and reopens the linked appointment so nothing is lost.
export function voidInvoice(inv) {
  for (const l of inv.lines.filter((x) => x.type === 'product')) {
    const p = Store.find('products', l.refId);
    if (p) Store.update('products', p.id, { stock: num(p.stock) + num(l.qty) });
  }
  if (inv.apptId && Store.find('appointments', inv.apptId)) {
    Store.update('appointments', inv.apptId, { status: 'arrived', invoiceId: '' });
  }
  Store.update('invoices', inv.id, { voided: true, voidedAt: new Date().toISOString() });
}
