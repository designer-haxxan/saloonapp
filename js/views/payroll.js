// Payroll: monthly salary + commission on billed services + tips − advances − deductions.
// Commission and tips are computed from invoices; advances and paid salaries are saved records.
import * as Store from '../store.js';
import { esc, money, num, round, todayStr, monthOf, fmtMonth, parseYMD, ymd, fmtDate, initials, openModal, readForm, toast, printHtml } from '../util.js';
import { liveInvoices } from '../domain.js';

const state = { month: monthOf(todayStr()) };

const shiftMonth = (m, n) => {
  const d = parseYMD(m + '-01');
  d.setMonth(d.getMonth() + n);
  return ymd(d).slice(0, 7);
};

// Everything paid to, or owed to, one staff member for a month.
export function payFor(staff, month) {
  const invs = liveInvoices().filter((i) => monthOf(i.date) === month);
  let serviceSales = 0;
  let tips = 0;
  for (const inv of invs) {
    for (const l of inv.lines) if (l.type === 'service' && l.staffId === staff.id) serviceSales += num(l.amount);
    if (inv.tipStaffId === staff.id) tips += num(inv.tip);
  }
  const commission = round(serviceSales * num(staff.commissionPct) / 100);
  const advances = Store.all('payroll').filter((p) => p.type === 'advance' && p.staffId === staff.id && monthOf(p.date) === month)
    .reduce((s, p) => s + num(p.amount), 0);
  const paidRec = Store.all('payroll').find((p) => p.type === 'salary' && p.staffId === staff.id && p.month === month) || null;
  return { serviceSales: round(serviceSales), commission, tips: round(tips), advances: round(advances), salary: num(staff.salary), paidRec };
}

export function render(el, ctx) {
  const month = state.month;
  const staff = Store.all('staff').filter((s) => s.active !== false);
  const rows = staff.map((s) => ({ s, p: payFor(s, month) }));
  const totals = rows.reduce((t, r) => {
    t.salary += r.p.salary; t.commission += r.p.commission; t.tips += r.p.tips; t.advances += r.p.advances;
    return t;
  }, { salary: 0, commission: 0, tips: 0, advances: 0 });
  const grossOwed = totals.salary + totals.commission + totals.tips - totals.advances;

  el.innerHTML = `
    <div class="toolbar" style="justify-content:space-between">
      <div class="row" style="gap:6px">
        <button class="icon-btn" data-m="-1"><i class="bi bi-chevron-left"></i></button>
        <div class="cal-date">${fmtMonth(month)}</div>
        <button class="icon-btn" data-m="1"><i class="bi bi-chevron-right"></i></button>
        <button class="btn btn-sm" data-m="0">This month</button>
      </div>
      <button class="btn" data-act="advance"><i class="bi bi-cash"></i> Record advance</button>
    </div>

    <div class="grid grid-stats stats-fit">
      <div class="card stat" style="--i:0"><div class="stat-label">Salaries</div><div class="stat-value" style="font-size:21px">${money(totals.salary)}</div><i class="bi bi-wallet2 stat-icon"></i></div>
      <div class="card stat" style="--i:1"><div class="stat-label">Commission</div><div class="stat-value" style="font-size:21px">${money(totals.commission)}</div><i class="bi bi-percent stat-icon"></i></div>
      <div class="card stat" style="--i:2"><div class="stat-label">Tips</div><div class="stat-value" style="font-size:21px">${money(totals.tips)}</div><i class="bi bi-heart stat-icon"></i></div>
      <div class="card stat" style="--i:3"><div class="stat-label">Net to pay (before deductions)</div><div class="stat-value" style="font-size:21px">${money(grossOwed)}</div><i class="bi bi-cash-stack stat-icon"></i></div>
    </div>

    ${!staff.length ? '<div class="card empty"><i class="bi bi-people"></i><p>Add staff with salary and commission first.</p><a class="btn btn-primary" href="#/staff">Go to Staff</a></div>' : `
    <div class="card" style="padding:0">
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Staff</th><th class="num">Salary</th><th class="num">Commission</th><th class="num">Tips</th><th class="num">Advances</th><th class="num">Net</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map(({ s, p }, i) => {
            const net = round(p.salary + p.commission + p.tips - p.advances);
            return `<tr style="animation:fadeUp .35s both;animation-delay:${i * 50}ms">
              <td><div class="row" style="gap:10px"><div class="avatar" style="width:34px;height:34px;border-radius:12px;font-size:13px;background:${esc(s.color)}">${initials(s.name)}</div>
                <div><b>${esc(s.name)}</b><div class="small muted">${esc(s.role || '')} · ${num(s.commissionPct)}% of ${money(p.serviceSales)}</div></div></div></td>
              <td class="num money">${money(p.salary)}</td>
              <td class="num money">${money(p.commission)}</td>
              <td class="num money">${money(p.tips)}</td>
              <td class="num money" style="color:${p.advances ? 'var(--danger)' : ''}">${p.advances ? '− ' + money(p.advances) : '–'}</td>
              <td class="num money" style="font-size:15px">${money(net)}</td>
              <td>${p.paidRec
                ? `<span class="tag ok"><i class="bi bi-check2"></i> Paid ${fmtDate(p.paidRec.paidOn, { day: 'numeric', month: 'short' })}</span>`
                : '<span class="tag warn">Unpaid</span>'}</td>
              <td style="text-align:right;white-space:nowrap">
                ${p.paidRec ? `<button class="btn btn-sm" data-slip="${s.id}"><i class="bi bi-printer"></i> Slip</button>`
                  : `<button class="btn btn-sm btn-primary" data-pay="${s.id}"><i class="bi bi-check2-circle"></i> Pay</button>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>
    <p class="small muted" style="margin-top:10px"><i class="bi bi-info-circle"></i> Commission = staff's percentage of the service amounts they performed on bills this month. Tips go to the person chosen on the bill.</p>`}
  `;

  el.onclick = (e) => {
    const t = e.target;
    const m = t.closest('[data-m]');
    if (m) {
      state.month = m.dataset.m === '0' ? monthOf(todayStr()) : shiftMonth(state.month, num(m.dataset.m));
      return ctx.refresh();
    }
    if (t.closest('[data-act="advance"]')) return openAdvance(ctx, staff);
    const pay = t.closest('[data-pay]');
    if (pay) return openPay(Store.find('staff', pay.dataset.pay), month, ctx);
    const slip = t.closest('[data-slip]');
    if (slip) return openSlip(Store.find('staff', slip.dataset.slip), month);
  };
}

function openAdvance(ctx, staff) {
  if (!staff.length) return toast('Add staff first', 'error');
  openModal({
    title: 'Record advance',
    html: `
      <form id="advForm" class="form-grid">
        <div class="field full"><label>Staff</label><select class="input" name="staffId">${staff.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Amount (Rs)</label><input class="input" name="amount" type="number" min="1" step="100" required></div>
        <div class="field"><label>Date</label><input class="input" name="date" type="date" value="${todayStr()}" required></div>
        <div class="field full"><label>Note (optional)</label><input class="input" name="note" placeholder="e.g. Eid advance"></div>
      </form>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" form="advForm" type="submit"><i class="bi bi-check2"></i> Save advance</button>',
    onMount(box, close) {
      box.querySelector('#advForm').onsubmit = (e) => {
        e.preventDefault();
        const f = readForm(e.target);
        const amount = num(f.amount);
        if (amount <= 0) return toast('Enter an amount', 'error');
        Store.add('payroll', { type: 'advance', staffId: f.staffId, amount, date: f.date, month: monthOf(f.date), note: f.note || '' });
        toast('Advance recorded', 'ok');
        close();
        ctx.refresh();
      };
    },
  });
}

function openPay(s, month, ctx) {
  if (!s) return;
  const p = payFor(s, month);
  const base = { ...p };
  const calcNet = (ded) => round(base.salary + base.commission + base.tips - base.advances - num(ded));
  openModal({
    title: `Pay ${s.name} · ${fmtMonth(month)}`,
    html: `
      ${slipLines(s, base, 0)}
      <form id="payForm" class="form-grid" style="margin-top:16px">
        <div class="field"><label>Other deductions (Rs)</label><input class="input" name="deductions" type="number" min="0" step="100" value="0"></div>
        <div class="field"><label>Paid by</label><select class="input" name="method"><option>Cash</option><option>Bank Transfer</option><option>JazzCash</option><option>EasyPaisa</option></select></div>
      </form>
      <div class="row between" style="margin-top:16px;font-size:18px"><b>Net pay</b><span class="money" id="netOut" style="color:var(--brand-deep)">${money(calcNet(0))}</span></div>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn btn-ok" form="payForm" type="submit"><i class="bi bi-check2-circle"></i> Mark as paid</button>',
    onMount(box, close) {
      const form = box.querySelector('#payForm');
      form.oninput = () => {
        const ded = num(form.querySelector('[name=deductions]').value);
        box.querySelector('#netOut').textContent = money(calcNet(ded));
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        if (payFor(s, month).paidRec) return toast('Already paid for this month', 'error');
        const f = readForm(e.target);
        const deductions = num(f.deductions);
        const rec = Store.add('payroll', {
          type: 'salary', staffId: s.id, month,
          salary: base.salary, commission: base.commission, tips: base.tips, advances: base.advances,
          deductions, net: calcNet(deductions), method: f.method, paidOn: todayStr(),
        });
        toast(`Salary paid to ${s.name}`, 'ok');
        close();
        printSlipPrompt(rec, s, month, ctx);
      };
    },
  });
}

function printSlipPrompt(rec, s, month, ctx) {
  ctx.refresh();
  openSlip(s, month, rec);
}

function slipLines(s, p, deductions) {
  const rows = [
    ['Monthly salary', p.salary],
    [`Commission (${num(s.commissionPct)}% of ${money(p.serviceSales)})`, p.commission],
    ['Tips', p.tips],
    ['Advances taken', -p.advances],
    ['Other deductions', -deductions],
  ];
  return `<table class="tbl" style="font-size:14px">${rows.map(([l, v]) =>
    `<tr><td>${esc(l)}</td><td class="num money" style="color:${v < 0 ? 'var(--danger)' : ''}">${v < 0 ? '− ' + money(-v) : money(v)}</td></tr>`).join('')}</table>`;
}

export function payslipHTML(s, month, rec) {
  const biz = Store.settings();
  const p = rec
    ? { salary: rec.salary, commission: rec.commission, tips: rec.tips, advances: rec.advances, serviceSales: payFor(s, month).serviceSales }
    : payFor(s, month);
  const deductions = rec ? rec.deductions : 0;
  const net = rec ? rec.net : round(p.salary + p.commission + p.tips - p.advances - deductions);
  return `
    <div class="receipt">
      <h2>${esc(biz.businessName)}</h2>
      <div class="small" style="color:#777">Salary slip · ${fmtMonth(month)}</div>
      <div class="small" style="margin:12px 0"><b>${esc(s.name)}</b> · ${esc(s.role || '')}${s.phone ? ' · ' + esc(s.phone) : ''}</div>
      <table>
        <tbody>
          <tr><td>Monthly salary</td><td class="r">${money(p.salary)}</td></tr>
          <tr><td>Commission (${num(s.commissionPct)}% of ${money(p.serviceSales)})</td><td class="r">${money(p.commission)}</td></tr>
          <tr><td>Tips</td><td class="r">${money(p.tips)}</td></tr>
          <tr><td>Advances taken</td><td class="r">− ${money(p.advances)}</td></tr>
          <tr><td>Other deductions</td><td class="r">− ${money(deductions)}</td></tr>
          <tr class="total"><td>Net pay</td><td class="r">${money(net)}</td></tr>
        </tbody>
      </table>
      <p class="small" style="color:#777;margin-top:14px">${rec ? 'Paid on ' + fmtDate(rec.paidOn) + (rec.method ? ' by ' + esc(rec.method) : '') : 'Not paid yet'}</p>
      <p class="small" style="color:#999;margin-top:20px">Signature: _______________________</p>
    </div>`;
}

function openSlip(s, month, rec = null) {
  if (!s) return;
  const record = rec || Store.all('payroll').find((x) => x.type === 'salary' && x.staffId === s.id && x.month === month);
  openModal({
    title: `Payslip · ${s.name}`,
    html: `<div style="background:var(--bg);padding:6px;border-radius:14px">${payslipHTML(s, month, record)}</div>`,
    footer: '<button class="btn" data-close>Close</button><button class="btn btn-primary" data-print><i class="bi bi-printer"></i> Print</button>',
    onMount(box, close) {
      box.querySelector('[data-print]').onclick = () => printHtml(payslipHTML(s, month, record));
    },
  });
}
