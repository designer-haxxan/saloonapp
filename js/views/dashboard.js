import * as Store from '../store.js';
import { esc, money, todayStr, fmtDate, fmtTime, monthOf, countUp, initials, num, addDays, toMin, parseYMD } from '../util.js';
import { apptsOn, liveInvoices, invoicesInMonth, sumInvoices, periodResult, APPT_STATUS, staffName, staffById } from '../domain.js';

export function render(el, ctx) {
  const today = todayStr();
  const s = Store.settings();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const monthStart = monthOf(today) + '-01';

  const todayAppts = apptsOn(today);
  const todaySales = sumInvoices(liveInvoices().filter((i) => i.date === today));
  const todayR = periodResult(today, today);
  const monthR = periodResult(monthStart, today);
  const dueAll = liveInvoices().reduce((t, i) => t + Math.max(0, num(i.total) + num(i.tip) - num(i.paid)), 0);

  // Net profit for each of the last 7 days, oldest first
  const days = [];
  for (let k = 6; k >= 0; k--) {
    const d = addDays(today, -k);
    days.push({ date: d, net: periodResult(d, d).net });
  }
  const maxDay = Math.max(1, ...days.map((d) => Math.abs(d.net)));
  const week = days.reduce((t, d) => t + d.net, 0);

  const upcoming = Store.all('appointments')
    .filter((a) => a.date >= today && (a.status === 'booked' || a.status === 'arrived'))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .slice(0, 6);

  const lowStock = Store.all('products').filter((p) => num(p.stock) <= num(p.minStock));
  const staffToday = Store.all('staff').filter((x) => x.active !== false).map((st) => ({
    ...st, count: todayAppts.filter((a) => a.staffId === st.id).length,
  }));

  const row = (label, t, m, cls = '') => `
    <tr class="${cls}"><td>${label}</td><td class="num money">${money(t)}</td><td class="num money">${money(m)}</td></tr>`;

  el.innerHTML = `
    <section class="hero">
      <i class="bi bi-stars sparkle"></i>
      <div>
        <div class="small" style="opacity:.85">${greet} · ${fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h2>${esc(s.businessName)}</h2>
        <p>${todayAppts.length} booking${todayAppts.length === 1 ? '' : 's'} today${todayAppts.length ? ' · next at ' + fmtTime(todayAppts.find((a) => toMin(a.start) >= hour * 60)?.start || todayAppts[0].start) : ''}</p>
      </div>
      <div class="row wrap">
        <button class="btn btn-gold" data-go="calendar?new=1"><i class="bi bi-calendar-plus"></i> New booking</button>
        <button class="btn" style="background:rgba(255,255,255,.18);color:#fff;border-color:transparent" data-go="billing"><i class="bi bi-receipt"></i> New bill</button>
      </div>
    </section>

    <section class="top-actions" style="margin-top:18px">
      <button class="top-action sale" data-go="invoices?date=${today}">
        <span class="top-icon"><i class="bi bi-receipt-cutoff"></i></span>
        <span><small>Today's sale</small><b>${money(todaySales.sales)}</b></span>
        <i class="bi bi-chevron-right top-arrow"></i>
      </button>
      <button class="top-action exp" data-go="reports?tab=expenses">
        <span class="top-icon"><i class="bi bi-wallet2"></i></span>
        <span><small>Expenses</small><b>Add &amp; view</b></span>
        <i class="bi bi-chevron-right top-arrow"></i>
      </button>
    </section>

    <section class="grid grid-stats" style="margin-top:18px">
      ${statCard('Today\'s bookings', todayAppts.length, 'calendar-check', false)}
      ${statCard(todayR.net >= 0 ? 'Today\'s profit' : 'Today\'s loss', todayR.net, 'graph-up-arrow', true, todayR.net < 0)}
      ${statCard(monthR.net >= 0 ? 'This month\'s profit' : 'This month\'s loss', monthR.net, 'cash-stack', true, monthR.net < 0)}
      ${statCard('Money to collect', dueAll, 'wallet2', true)}
    </section>

    <section class="grid grid-2" style="margin-top:18px">
      <div class="card">
        <div class="card-head"><h3>Profit &amp; loss</h3><span class="small muted">Automatic: sales − costs − expenses − staff</span></div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th></th><th class="num">Today</th><th class="num">This month</th></tr></thead>
          <tbody>
            ${row('Service profit', todayR.service, monthR.service)}
            ${row('Product profit', todayR.product, monthR.product)}
            ${row('− Expenses', -todayR.expenses, -monthR.expenses)}
            ${row('− Staff (salary + commission)', -todayR.staff, -monthR.staff)}
          </tbody>
          <tfoot><tr>
            <th>${todayR.net >= 0 ? 'Net profit' : 'Net loss'}</th>
            <th class="num money" style="color:${todayR.net < 0 ? 'var(--danger)' : 'var(--ok)'}">${money(todayR.net)}</th>
            <th class="num money" style="color:${monthR.net < 0 ? 'var(--danger)' : 'var(--ok)'}">${money(monthR.net)}</th>
          </tr></tfoot>
        </table></div>
        <p class="small muted" style="margin:10px 0 0">Staff salary is counted by day (monthly salary ÷ days in the month). Tips are not counted.</p>
      </div>

      <div class="card">
        <div class="card-head"><h3>Net profit, last 7 days</h3><span class="tag ${week < 0 ? 'danger' : 'ok'}">${money(week)}</span></div>
        <div class="bars">
          ${days.map((d, i) => `
            <div class="bar" title="${fmtDate(d.date)}: ${money(d.net)}">
              <span class="bar-val">${d.net ? money(d.net).replace('Rs ', '') : '–'}</span>
              <div class="bar-fill" style="--i:${i};height:${Math.max(2, (Math.abs(d.net) / maxDay) * 100)}%;${d.net < 0 ? 'background:var(--danger)' : ''}"></div>
              <span class="bar-day">${fmtDate(d.date, { weekday: 'short' })}</span>
            </div>`).join('')}
        </div>
      </div>
    </section>

    <section class="grid grid-2" style="margin-top:18px">
      <div class="card">
        <div class="card-head"><h3>Upcoming bookings</h3><button class="btn btn-sm btn-ghost" data-go="calendar">View all</button></div>
        ${upcoming.length ? `<div class="list">${upcoming.map((a, i) => `
          <div class="list-item" style="--i:${i}" data-go="calendar?date=${a.date}">
            <div class="avatar" style="background:${esc(staffById(a.staffId)?.color || '#b5476b')}">${initials(a.customerName)}</div>
            <div class="grow">
              <b>${esc(a.customerName)}</b>
              <div class="small muted">${fmtDate(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(a.start)} · ${esc(staffName(a.staffId))}</div>
            </div>
            <span class="tag ${APPT_STATUS[a.status][1]}">${APPT_STATUS[a.status][0]}</span>
          </div>`).join('')}</div>`
          : `<div class="empty"><i class="bi bi-calendar-heart"></i>No upcoming bookings. Create one from the Calendar.</div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>Team today</h3><button class="btn btn-sm btn-ghost" data-go="staff">Manage</button></div>
        ${staffToday.length ? `<div class="list">${staffToday.map((st, i) => `
          <div class="list-item" style="--i:${i};cursor:default">
            <div class="avatar" style="background:${esc(st.color)}">${initials(st.name)}</div>
            <div class="grow"><b>${esc(st.name)}</b><div class="small muted">${esc(st.role || '')} · ${esc(st.shiftStart || '')}–${esc(st.shiftEnd || '')}</div></div>
            <span class="tag ${st.count ? 'info' : 'mute'}">${st.count} booking${st.count === 1 ? '' : 's'}</span>
          </div>`).join('')}</div>`
          : `<div class="empty"><i class="bi bi-person-plus"></i>Add your staff in the Staff screen.</div>`}
      </div>
    </section>

    <section class="grid grid-2" style="margin-top:18px">
      <div class="card">
        <div class="card-head"><h3>Low stock</h3><button class="btn btn-sm btn-ghost" data-go="products">Products</button></div>
        ${lowStock.length ? `<div class="list">${lowStock.slice(0, 6).map((p, i) => `
          <div class="list-item" style="--i:${i};cursor:default">
            <div class="grow"><b>${esc(p.name)}</b><div class="small muted">Minimum ${p.minStock}</div></div>
            <span class="tag ${num(p.stock) === 0 ? 'danger' : 'warn'} pulse">${p.stock} left</span>
          </div>`).join('')}</div>`
          : `<div class="empty"><i class="bi bi-check2-circle"></i>Stock levels look good.</div>`}
      </div>
      <div class="card">
        <div class="card-head"><h3>Quick actions</h3></div>
        <div class="quick">
          <button data-go="calendar?new=1"><i class="bi bi-calendar-plus"></i><b>Book appointment</b><div class="small muted">Single or multi-day</div></button>
          <button data-go="billing"><i class="bi bi-receipt-cutoff"></i><b>Bill a customer</b><div class="small muted">Services &amp; products</div></button>
          <button data-go="invoices"><i class="bi bi-file-earmark-check"></i><b>Invoices</b><div class="small muted">Print, share, collect</div></button>
          <button data-go="payroll"><i class="bi bi-cash-stack"></i><b>Run payroll</b><div class="small muted">Salary &amp; commission</div></button>
        </div>
      </div>
    </section>
  `;

  el.querySelectorAll('.stat').forEach((c, i) => c.style.setProperty('--i', i));
  countUp(el);

  el.onclick = (e) => {
    const t = e.target.closest('[data-go]');
    if (t) ctx.go('#/' + t.dataset.go);
  };
}

function statCard(label, value, icon, isMoney, isLoss = false) {
  return `
    <div class="card stat" ${isLoss ? 'style="background:linear-gradient(135deg,#c83b3b,#8e1f1f)"' : ''}>
      <div class="stat-label">${label}</div>
      <div class="stat-value" data-count="${num(value)}" ${isMoney ? 'data-fmt="money"' : ''}>${isMoney ? money(0) : 0}</div>
      <i class="bi bi-${icon} stat-icon"></i>
    </div>`;
}
