import * as Store from '../store.js';
import { esc, money, todayStr, fmtDate, fmtTime, monthOf, countUp, initials, num, $, toMin } from '../util.js';
import { apptsOn, apptEnd, liveInvoices, sumInvoices, invoicesInMonth, lastDays, APPT_STATUS, staffName, staffById } from '../domain.js';

export function render(el, ctx) {
  const today = todayStr();
  const s = Store.settings();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const todayAppts = apptsOn(today);
  const todaySales = sumInvoices(liveInvoices().filter((i) => i.date === today));
  const monthSales = sumInvoices(invoicesInMonth(monthOf(today)));
  const dueAll = sumInvoices(liveInvoices());
  const days = lastDays(today, 7);
  const maxDay = Math.max(1, ...days.map((d) => d.total));

  const upcoming = Store.all('appointments')
    .filter((a) => a.date >= today && (a.status === 'booked' || a.status === 'arrived'))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .slice(0, 6);

  const lowStock = Store.all('products').filter((p) => num(p.stock) <= num(p.minStock));
  const staffToday = Store.all('staff').filter((x) => x.active !== false).map((st) => ({
    ...st, count: todayAppts.filter((a) => a.staffId === st.id).length,
  }));

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

    <section class="grid grid-stats" style="margin-top:18px">
      ${statCard('Today\'s bookings', todayAppts.length, 'calendar-check', false)}
      ${statCard('Today\'s sales', todaySales.sales, 'cash-coin', true)}
      ${statCard('This month', monthSales.sales, 'graph-up-arrow', true)}
      ${statCard('Money to collect', dueAll.balance, 'wallet2', true)}
    </section>

    <section class="grid grid-2" style="margin-top:18px">
      <div class="card">
        <div class="card-head"><h3>Sales, last 7 days</h3><span class="tag">${money(days.reduce((s2, d) => s2 + d.total, 0))}</span></div>
        <div class="bars">
          ${days.map((d, i) => `
            <div class="bar" title="${fmtDate(d.date)}: ${money(d.total)}">
              <span class="bar-val">${d.total ? money(d.total).replace('Rs ', '') : '–'}</span>
              <div class="bar-fill" style="--i:${i};height:${Math.max(2, (d.total / maxDay) * 100)}%"></div>
              <span class="bar-day">${fmtDate(d.date, { weekday: 'short' })}</span>
            </div>`).join('')}
        </div>
      </div>

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
    </section>

    <section class="grid grid-2" style="margin-top:18px">
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

      <div class="card">
        <div class="card-head"><h3>Low stock</h3><button class="btn btn-sm btn-ghost" data-go="products">Products</button></div>
        ${lowStock.length ? `<div class="list">${lowStock.slice(0, 6).map((p, i) => `
          <div class="list-item" style="--i:${i};cursor:default">
            <div class="grow"><b>${esc(p.name)}</b><div class="small muted">Minimum ${p.minStock}</div></div>
            <span class="tag ${num(p.stock) === 0 ? 'danger' : 'warn'} pulse">${p.stock} left</span>
          </div>`).join('')}</div>`
          : `<div class="empty"><i class="bi bi-check2-circle"></i>Stock levels look good.</div>`}
      </div>
    </section>

    <section style="margin-top:18px">
      <div class="quick">
        <button data-go="calendar?new=1"><i class="bi bi-calendar-plus"></i><b>Book appointment</b><div class="small muted">Single or multi-day</div></button>
        <button data-go="billing"><i class="bi bi-receipt-cutoff"></i><b>Bill a customer</b><div class="small muted">Services &amp; products</div></button>
        <button data-go="invoices"><i class="bi bi-file-earmark-check"></i><b>Invoices</b><div class="small muted">Print, share, collect</div></button>
        <button data-go="payroll"><i class="bi bi-cash-stack"></i><b>Run payroll</b><div class="small muted">Salary &amp; commission</div></button>
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

function statCard(label, value, icon, isMoney) {
  return `
    <div class="card stat">
      <div class="stat-label">${label}</div>
      <div class="stat-value" data-count="${num(value)}" ${isMoney ? 'data-fmt="money"' : ''}>${isMoney ? money(0) : 0}</div>
      <i class="bi bi-${icon} stat-icon"></i>
    </div>`;
}
