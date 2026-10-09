// Reports: sales, payment methods, staff and service performance, expenses and an estimated profit.
// Every figure is calculated from invoices, payments, expenses and payroll records (no stored totals).
import * as Store from '../store.js';
import { esc, money, num, round, todayStr, addDays, startOfWeek, monthOf, fmtDate, $, toast, openModal, readForm, printHtml, confirmBox } from '../util.js';
import { liveInvoices, invoiceBalance } from '../domain.js';

const EXPENSE_CATS = ['Rent', 'Electricity', 'Gas & water', 'Products & supplies', 'Equipment', 'Internet & phone', 'Marketing', 'Repairs', 'Other'];
const TABS = [['sales', 'Sales'], ['staff', 'Staff'], ['services', 'Services'], ['expenses', 'Expenses'], ['profit', 'Profit']];

const state = { tab: 'sales', preset: 'month', from: '', to: '' };

function range() {
  const t = todayStr();
  if (state.preset === 'today') return { from: t, to: t };
  if (state.preset === '7') return { from: addDays(t, -6), to: t };
  if (state.preset === 'week') return { from: startOfWeek(t), to: t };
  if (state.preset === 'custom' && state.from && state.to) return { from: state.from, to: state.to };
  return { from: monthOf(t) + '-01', to: t };
}

const inRange = (d, r) => d >= r.from && d <= r.to;

// Payments made in the range. Older invoices without a payments log count their paid amount on the invoice date.
function paymentsIn(r) {
  const out = [];
  for (const inv of liveInvoices()) {
    if (inv.payments?.length) {
      for (const p of inv.payments) if (inRange(p.date, r)) out.push({ amount: num(p.amount), method: p.method || 'Cash' });
    } else if (num(inv.paid) > 0 && inRange(inv.date, r)) {
      out.push({ amount: num(inv.paid), method: inv.method || 'Cash' });
    }
  }
  return out;
}

export function render(el, ctx) {
  const r = range();
  el.innerHTML = `
    <div class="toolbar" style="justify-content:space-between">
      <div class="seg" style="flex-wrap:wrap">
        ${[['today', 'Today'], ['7', 'Last 7 days'], ['week', 'This week'], ['month', 'This month'], ['custom', 'Custom']].map(([k, l]) =>
          `<button data-preset="${k}" class="${state.preset === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      ${state.preset === 'custom' ? `
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <input class="input auto" type="date" id="fromD" value="${r.from}">
          <span class="muted">to</span>
          <input class="input auto" type="date" id="toD" value="${r.to}">
        </div>` : `<span class="small muted">${fmtDate(r.from)} – ${fmtDate(r.to)}</span>`}
    </div>
    <div class="seg" style="margin-bottom:18px;flex-wrap:wrap">
      ${TABS.map(([k, l]) => `<button data-tab="${k}" class="${state.tab === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    <div id="rep"></div>`;

  const rep = $('#rep', el);
  const tabs = { sales: salesTab, staff: staffTab, services: servicesTab, expenses: expensesTab, profit: profitTab };
  tabs[state.tab](rep, r, ctx);

  el.onclick = (e) => {
    const p = e.target.closest('[data-preset]');
    if (p) { state.preset = p.dataset.preset; if (state.preset === 'custom' && !state.from) { state.from = r.from; state.to = r.to; } return ctx.refresh(); }
    const t = e.target.closest('[data-tab]');
    if (t) { state.tab = t.dataset.tab; return ctx.refresh(); }
    if (e.target.closest('[data-print]')) return printHtml(`<div class="receipt">${rep.innerHTML}</div>`);
    if (e.target.closest('[data-csv]')) return exportCsv(r);
  };
  const onDates = () => {
    const f = $('#fromD', el)?.value; const to = $('#toD', el)?.value;
    if (f && to) { state.from = f; state.to = to; ctx.refresh(); }
  };
  $('#fromD', el)?.addEventListener('change', onDates);
  $('#toD', el)?.addEventListener('change', onDates);
}

const kpi = (label, value, icon, i = 0) => `
  <div class="card stat" style="--i:${i}">
    <div class="stat-label">${label}</div>
    <div class="stat-value" style="font-size:22px">${value}</div>
    <i class="bi bi-${icon} stat-icon"></i>
  </div>`;

// ---------- Sales ----------
function salesTab(rep, r) {
  const invs = liveInvoices().filter((i) => inRange(i.date, r));
  const sales = invs.reduce((s, i) => s + num(i.total), 0);
  const tips = invs.reduce((s, i) => s + num(i.tip), 0);
  const discounts = invs.reduce((s, i) => s + num(i.discount), 0);
  const pays = paymentsIn(r);
  const collected = pays.reduce((s, p) => s + p.amount, 0);
  const balance = invs.reduce((s, i) => s + Math.max(0, invoiceBalance(i)), 0);
  const byMethod = {};
  for (const p of pays) byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
  const methods = Object.entries(byMethod).sort((a, b) => b[1] - a[1]);
  const maxM = Math.max(1, ...methods.map((m) => m[1]));

  const days = {};
  for (const i of invs) {
    const d = (days[i.date] ||= { bills: 0, total: 0, paid: 0 });
    d.bills += 1;
    d.total += num(i.total);
    d.paid += num(i.paid);
  }
  const dayRows = Object.entries(days).sort((a, b) => b[0].localeCompare(a[0]));

  rep.innerHTML = `
    <div class="grid grid-stats stats-fit">
      ${kpi('Sales (excl. tips)', money(sales), 'graph-up', 0)}
      ${kpi('Bills', invs.length, 'receipt', 1)}
      ${kpi('Average bill', money(invs.length ? sales / invs.length : 0), 'calculator', 2)}
      ${kpi('Balance outstanding', money(balance), 'hourglass-split', 3)}
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>Payments by method</h3><span class="tag ok">${money(collected)} collected</span></div>
        ${methods.length ? `<div class="list">${methods.map(([m, v], i) => `
          <div class="list-item" style="--i:${i};cursor:default">
            <div class="grow"><div class="row between"><b>${esc(m)}</b><span class="money">${money(v)}</span></div>
            <div style="height:8px;border-radius:8px;background:var(--line);margin-top:8px;overflow:hidden">
              <div style="height:100%;width:${(v / maxM) * 100}%;background:linear-gradient(90deg,var(--brand),var(--brand-2));border-radius:8px;animation:growY .8s both;transform-origin:left"></div></div></div>
          </div>`).join('')}</div>` : '<div class="empty"><i class="bi bi-cash"></i>No payments in this period.</div>'}
        <p class="small muted" style="margin-top:14px">Tips: ${money(tips)} · Discounts given: ${money(discounts)}</p>
      </div>
      <div class="card">
        <div class="card-head"><h3>Export</h3></div>
        <p class="muted small">Download the invoices in this period as a spreadsheet (CSV), or print this report.</p>
        <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:10px">
          <button class="btn btn-primary" data-csv><i class="bi bi-filetype-csv"></i> Download CSV</button>
          <button class="btn" data-print><i class="bi bi-printer"></i> Print report</button>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:18px;padding:0">
      <div class="card-head" style="padding:18px 18px 0"><h3>Day by day</h3></div>
      ${dayRows.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th class="num">Bills</th><th class="num">Sales</th><th class="num">Collected</th></tr></thead>
        <tbody>${dayRows.map(([d, v]) => `<tr><td>${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td class="num">${v.bills}</td><td class="num money">${money(v.total)}</td><td class="num money">${money(v.paid)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th>Total</th><th class="num">${invs.length}</th><th class="num money">${money(sales)}</th><th class="num money">${money(collected)}</th></tr></tfoot>
      </table></div>` : '<div class="empty">No sales in this period.</div>'}
    </div>`;
}

// ---------- Staff ----------
function staffTab(rep, r) {
  const invs = liveInvoices().filter((i) => inRange(i.date, r));
  const lines = invs.flatMap((i) => i.lines.filter((l) => l.type === 'service'));
  const rows = Store.all('staff').map((s) => {
    const mine = lines.filter((l) => l.staffId === s.id);
    const revenue = mine.reduce((t, l) => t + num(l.amount), 0);
    const tips = invs.filter((i) => i.tipStaffId === s.id).reduce((t, i) => t + num(i.tip), 0);
    return { s, count: mine.length, revenue, tips, commission: round(revenue * num(s.commissionPct) / 100) };
  }).sort((a, b) => b.revenue - a.revenue);
  const max = Math.max(1, ...rows.map((x) => x.revenue));

  rep.innerHTML = rows.length ? `
    <div class="card" style="padding:0"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Staff</th><th class="num">Services</th><th class="num">Service sales</th><th class="num">Commission</th><th class="num">Tips</th></tr></thead>
      <tbody>${rows.map((x, i) => `
        <tr style="animation:fadeUp .35s both;animation-delay:${i * 40}ms">
          <td><div class="row" style="gap:10px"><span style="width:10px;height:10px;border-radius:50%;background:${esc(x.s.color)}"></span><div><b>${esc(x.s.name)}</b>
            <div style="height:6px;width:160px;max-width:40vw;border-radius:6px;background:var(--line);margin-top:6px;overflow:hidden"><div style="height:100%;width:${(x.revenue / max) * 100}%;background:${esc(x.s.color)};border-radius:6px;animation:growY .8s both;transform-origin:left"></div></div></div></div></td>
          <td class="num">${x.count}</td>
          <td class="num money">${money(x.revenue)}</td>
          <td class="num money">${money(x.commission)}</td>
          <td class="num money">${money(x.tips)}</td>
        </tr>`).join('')}</tbody>
    </table></div></div>
    <p class="small muted" style="margin-top:10px">Commission uses each staff member's current commission %.</p>`
    : '<div class="card empty"><i class="bi bi-people"></i><p>Add staff to see performance.</p></div>';
}

// ---------- Services ----------
function servicesTab(rep, r) {
  const map = {};
  for (const inv of liveInvoices().filter((i) => inRange(i.date, r))) {
    for (const l of inv.lines) {
      if (l.type !== 'service') continue;
      const k = l.name;
      (map[k] ||= { name: k, count: 0, revenue: 0 });
      map[k].count += num(l.qty);
      map[k].revenue += num(l.amount);
    }
  }
  const rows = Object.values(map).sort((a, b) => b.revenue - a.revenue);
  const max = Math.max(1, ...rows.map((x) => x.revenue));
  rep.innerHTML = rows.length ? `
    <div class="card" style="padding:0"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Service</th><th class="num">Times done</th><th class="num">Revenue</th></tr></thead>
      <tbody>${rows.map((x, i) => `
        <tr style="animation:fadeUp .35s both;animation-delay:${i * 35}ms"><td><b>${esc(x.name)}</b>
          <div style="height:6px;width:220px;max-width:50vw;border-radius:6px;background:var(--line);margin-top:6px;overflow:hidden"><div style="height:100%;width:${(x.revenue / max) * 100}%;background:linear-gradient(90deg,var(--brand),var(--brand-2));border-radius:6px;animation:growY .8s both;transform-origin:left"></div></div></td>
          <td class="num">${x.count}</td><td class="num money">${money(x.revenue)}</td></tr>`).join('')}</tbody>
    </table></div></div>`
    : '<div class="card empty"><i class="bi bi-scissors"></i><p>No services billed in this period.</p></div>';
}

// ---------- Expenses ----------
function expensesTab(rep, r, ctx) {
  const list = Store.all('expenses').filter((x) => inRange(x.date, r)).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, x) => s + num(x.amount), 0);
  rep.innerHTML = `
    <div class="toolbar" style="justify-content:space-between">
      <div><b>${money(total)}</b> <span class="muted">spent in this period</span></div>
      <button class="btn btn-primary" data-exp><i class="bi bi-plus-lg"></i> Add expense</button>
    </div>
    ${list.length ? `<div class="card" style="padding:0"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Category</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead>
      <tbody>${list.map((x, i) => `<tr style="animation:fadeUp .3s both;animation-delay:${i * 25}ms">
        <td>${fmtDate(x.date)}</td><td><span class="tag">${esc(x.category)}</span></td><td class="muted">${esc(x.note || '')}</td>
        <td class="num money">${money(x.amount)}</td>
        <td style="text-align:right"><button class="btn btn-sm btn-ghost" data-expdel="${x.id}" aria-label="Delete"><i class="bi bi-trash"></i></button></td></tr>`).join('')}</tbody>
    </table></div></div>` : '<div class="card empty"><i class="bi bi-receipt"></i><p>No expenses in this period. Record rent, electricity, supplies and other costs to see real profit.</p></div>'}`;

  rep.onclick = async (e) => {
    if (e.target.closest('[data-exp]')) return openExpense(ctx);
    const d = e.target.closest('[data-expdel]');
    if (d) {
      if (!await confirmBox('Delete this expense?', { okText: 'Delete', danger: true })) return;
      Store.remove('expenses', d.dataset.expdel);
      toast('Expense deleted');
      ctx.refresh();
    }
  };
}

function openExpense(ctx) {
  openModal({
    title: 'Add expense',
    html: `
      <form id="expForm" class="form-grid">
        <div class="field"><label>Date</label><input class="input" type="date" name="date" value="${todayStr()}" required></div>
        <div class="field"><label>Category</label><select class="input" name="category">${EXPENSE_CATS.map((c) => `<option>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Amount (Rs)</label><input class="input" type="number" min="1" step="50" name="amount" required></div>
        <div class="field"><label>Note</label><input class="input" name="note" placeholder="e.g. May electricity bill"></div>
      </form>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" form="expForm" type="submit"><i class="bi bi-check2"></i> Save</button>',
    onMount(box, close) {
      box.querySelector('#expForm').onsubmit = (e) => {
        e.preventDefault();
        const f = readForm(e.target);
        const amount = num(f.amount);
        if (amount <= 0) return toast('Enter an amount', 'error');
        Store.add('expenses', { date: f.date, category: f.category, amount, note: f.note || '' });
        toast('Expense saved', 'ok');
        close();
        ctx.refresh();
      };
    },
  });
}

// ---------- Profit (estimate) ----------
function profitTab(rep, r) {
  const invs = liveInvoices().filter((i) => inRange(i.date, r));
  let serviceRev = 0; let productRev = 0; let productCost = 0;
  for (const inv of invs) {
    for (const l of inv.lines) {
      if (l.type === 'service') serviceRev += num(l.amount);
      else {
        productRev += num(l.amount);
        productCost += num(l.qty) * num(Store.find('products', l.refId)?.cost);
      }
    }
  }
  const expenses = Store.all('expenses').filter((x) => inRange(x.date, r)).reduce((s, x) => s + num(x.amount), 0);
  const advances = Store.all('payroll').filter((p) => p.type === 'advance' && inRange(p.date, r)).reduce((s, p) => s + num(p.amount), 0);
  const salariesPaid = Store.all('payroll').filter((p) => p.type === 'salary' && inRange(p.paidOn, r)).reduce((s, p) => s + num(p.net), 0);
  const staffCash = advances + salariesPaid;
  const revenue = serviceRev + productRev;
  const profit = round(revenue - productCost - expenses - staffCash);

  const lines = [
    ['Service sales', serviceRev, ''],
    ['Product sales', productRev, ''],
    ['Cost of products sold', -productCost, 'Current purchase cost × quantity sold'],
    ['Expenses', -expenses, 'Rent, electricity, supplies and other costs'],
    ['Staff paid out (salaries and advances)', -staffCash, 'Cash paid to staff in this period'],
  ];
  rep.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>Estimated profit</h3></div>
        <table class="tbl">
          <tbody>${lines.map(([l, v, note]) => `<tr><td>${l}${note ? `<div class="small muted">${note}</div>` : ''}</td>
            <td class="num money" style="color:${v < 0 ? 'var(--danger)' : 'var(--ink)'}">${v < 0 ? '− ' + money(-v) : money(v)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><th>Estimated profit</th><th class="num money" style="font-size:20px;color:${profit < 0 ? 'var(--danger)' : 'var(--ok)'}">${money(profit)}</th></tr></tfoot>
        </table>
      </div>
      <div class="card">
        <div class="card-head"><h3>How this is worked out</h3></div>
        <p class="muted small" style="line-height:1.7">This is a cash-style estimate, not an audited accounts statement. Tips are passed to staff and are not counted as sales. Product cost uses today's cost price. Add all expenses (rent, bills, supplies) for a true picture.</p>
        <div class="stack" style="margin-top:12px">
          <div class="row between"><span class="muted">Revenue</span><b class="money">${money(revenue)}</b></div>
          <div class="row between"><span class="muted">Profit margin</span><b class="money">${revenue ? Math.round((profit / revenue) * 100) : 0}%</b></div>
        </div>
      </div>
    </div>`;
}

// ---------- CSV ----------
function exportCsv(r) {
  const invs = liveInvoices().filter((i) => inRange(i.date, r)).sort((a, b) => a.date.localeCompare(b.date));
  const head = ['Invoice', 'Date', 'Customer', 'Phone', 'Subtotal', 'Discount', 'Tax', 'Total', 'Tip', 'Paid', 'Balance', 'Method'];
  const csv = [head, ...invs.map((i) => [i.number, i.date, i.customerName, i.customerPhone, i.subtotal, i.discount, i.tax, i.total, i.tip, i.paid, Math.max(0, invoiceBalance(i)), i.method])]
    .map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sales_${r.from}_to_${r.to}.csv`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`${invs.length} invoices exported`, 'ok');
}
