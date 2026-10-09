// Calendar: day view (one column per staff member) and week view, booking form with multi-day visits,
// clash detection against staff schedules and opening hours, and the appointment detail sheet.
import * as Store from '../store.js';
import { esc, money, num, todayStr, addDays, startOfWeek, fmtDate, fmtTime, toMin, fromMin, openModal, readForm, toast, confirmBox, waLink, $, $$, initials } from '../util.js';
import { apptsOn, apptEnd, clash, APPT_STATUS, staffById, staffName } from '../domain.js';
import { findOrCreateCustomer } from './customers.js';

const PX = 1.2;   // pixels per minute (72px per hour, matches the grid lines in style.css)
const SNAP = 15;  // booking start times snap to 15 minutes
const COLORS = { booked: '#4c7ef3', arrived: '#d4a84b', done: '#3aa27a', cancelled: '#9a9a9a', noshow: '#e0655f' };

const state = { view: 'day', date: todayStr(), staff: '' };
let lastQuery = null;

const activeStaff = () => Store.all('staff').filter((s) => s.active !== false);
const openMin = () => toMin(Store.settings().openTime || '10:00');
const closeMin = () => toMin(Store.settings().closeTime || '21:00');

// Pack overlapping appointments in one lane into side-by-side columns.
function pack(list) {
  const ends = [];
  const placed = list.map((a) => {
    let c = ends.findIndex((e) => e <= toMin(a.start));
    if (c < 0) { c = ends.length; ends.push(0); }
    ends[c] = apptEnd(a);
    return { a, c };
  });
  return placed.map((p) => {
    let cols = p.c;
    for (const q of placed) {
      if (q !== p && toMin(q.a.start) < apptEnd(p.a) && toMin(p.a.start) < apptEnd(q.a)) cols = Math.max(cols, q.c);
    }
    return { ...p, cols: cols + 1 };
  });
}

export function render(el, ctx) {
  // Apply URL parameters once (so refreshing the view does not reset the date the user moved to).
  const qs = ctx.query.toString();
  let openNew = false;
  if (qs !== lastQuery) {
    lastQuery = qs;
    if (ctx.query.get('date')) state.date = ctx.query.get('date');
    openNew = ctx.query.get('new') === '1';
  }

  const label = state.view === 'day'
    ? fmtDate(state.date, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    : weekLabel(state.date);

  el.innerHTML = `
    <div class="cal-bar">
      <div class="row" style="gap:6px">
        <button class="icon-btn" data-nav="-1" aria-label="Previous"><i class="bi bi-chevron-left"></i></button>
        <button class="btn btn-sm" data-today>Today</button>
        <button class="icon-btn" data-nav="1" aria-label="Next"><i class="bi bi-chevron-right"></i></button>
      </div>
      <div class="cal-date">${label}</div>
      <div class="seg">
        <button data-view="day" class="${state.view === 'day' ? 'on' : ''}">Day</button>
        <button data-view="week" class="${state.view === 'week' ? 'on' : ''}">Week</button>
      </div>
      <select class="input w-sm" id="staffFilter">
        <option value="">All staff</option>
        ${Store.all('staff').map((s) => `<option value="${s.id}" ${s.id === state.staff ? 'selected' : ''}>${esc(s.name)}${s.active === false ? ' (left)' : ''}</option>`).join('')}
      </select>
      <button class="btn btn-primary" data-new><i class="bi bi-calendar-plus"></i> New booking</button>
    </div>
    <div class="legend">
      ${Object.entries(COLORS).map(([k, c]) => `<span><i style="background:${c}"></i>${APPT_STATUS[k][0]}</span>`).join('')}
    </div>
    <div id="calBody"></div>`;

  const body = $('#calBody', el);
  if (state.view === 'day') dayView(body);
  else weekView(body);

  $('#staffFilter', el).onchange = (e) => { state.staff = e.target.value; ctx.refresh(); };
  el.onclick = (e) => {
    const t = e.target;
    const nav = t.closest('[data-nav]');
    if (nav) { state.date = addDays(state.date, num(nav.dataset.nav) * (state.view === 'week' ? 7 : 1)); return ctx.refresh(); }
    if (t.closest('[data-today]')) { state.date = todayStr(); return ctx.refresh(); }
    const v = t.closest('[data-view]');
    if (v) { state.view = v.dataset.view; return ctx.refresh(); }
    if (t.closest('[data-new]')) return openBooking({ date: state.date }, ctx);
    const ap = t.closest('[data-appt]');
    if (ap) return openDetail(ap.dataset.appt, ctx);
    const gd = t.closest('[data-goday]');
    if (gd) { state.view = 'day'; state.date = gd.dataset.goday; return ctx.refresh(); }
    const lane = t.closest('.lane');
    if (lane) {
      // Click an empty part of a column to book that time with that staff member.
      const r = lane.getBoundingClientRect();
      const min = openMin() + Math.round((e.clientY - r.top) / PX / SNAP) * SNAP;
      return openBooking({ date: state.date, staffId: lane.dataset.lane, start: fromMin(Math.max(openMin(), min)) }, ctx);
    }
  };

  if (openNew) {
    history.replaceState(null, '', '#/calendar');
    openBooking({ date: state.date }, ctx);
  }
}

function weekLabel(date) {
  const s = startOfWeek(date);
  return `${fmtDate(s, { day: 'numeric', month: 'short' })} – ${fmtDate(addDays(s, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// ---------- Day view ----------
function dayView(body) {
  const open = openMin();
  const close = closeMin();
  const H = (close - open) * PX;
  const appts = apptsOn(state.date);

  // Columns: every active staff member, staff who have bookings today even if they left, and Unassigned.
  let lanes = activeStaff();
  const extra = [...new Set(appts.map((a) => a.staffId).filter((id) => id && !lanes.some((s) => s.id === id)))]
    .map((id) => staffById(id)).filter(Boolean);
  lanes = [...lanes, ...extra];
  if (appts.some((a) => !a.staffId)) lanes.push({ id: '', name: 'Unassigned', color: '#9a8a93', shiftStart: '', shiftEnd: '' });
  if (state.staff) lanes = lanes.filter((l) => l.id === state.staff);

  if (!lanes.length) {
    body.innerHTML = `<div class="card empty"><i class="bi bi-people"></i><p>Add staff first, then bookings appear in their columns.</p><a class="btn btn-primary" href="#/staff"><i class="bi bi-person-plus"></i> Add staff</a></div>`;
    return;
  }

  const cols = `62px repeat(${lanes.length}, minmax(170px, 1fr))`;
  const hours = [];
  for (let m = open; m <= close; m += 60) hours.push(m);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isToday = state.date === todayStr();

  body.innerHTML = `
    <div class="day-grid">
      <div class="day-head" style="grid-template-columns:${cols}">
        <div class="tcol"></div>
        ${lanes.map((l) => {
          const n = appts.filter((a) => (a.staffId || '') === l.id).length;
          return `<div class="hcell">
            <div class="avatar" style="background:${esc(l.color || '#b5476b')}">${initials(l.name)}</div>
            <div><b>${esc(l.name)}</b><small>${l.shiftStart ? fmtTime(l.shiftStart) + ' – ' + fmtTime(l.shiftEnd) : 'Any time'} · ${n} booking${n === 1 ? '' : 's'}</small></div>
          </div>`;
        }).join('')}
      </div>
      <div class="day-body" style="grid-template-columns:${cols};height:${H}px">
        <div class="time-col">
          ${hours.map((m) => `<div style="top:${(m - open) * PX}px">${fmtTime(fromMin(m))}</div>`).join('')}
        </div>
        ${lanes.map((l) => {
          const mine = appts.filter((a) => (a.staffId || '') === l.id);
          const packed = pack(mine);
          const shade = (from, to) => `<div style="position:absolute;left:0;right:0;top:${from}px;height:${Math.max(0, to - from)}px;pointer-events:none;background:repeating-linear-gradient(45deg,transparent 0 8px,rgba(120,90,110,.10) 8px 9px)"></div>`;
          let off = '';
          if (l.shiftStart) {
            const ss = Math.min(close, Math.max(open, toMin(l.shiftStart)));
            const se = Math.min(close, Math.max(open, toMin(l.shiftEnd)));
            off = shade(0, (ss - open) * PX) + shade((se - open) * PX, H);
          }
          const now = isToday && nowMin >= open && nowMin <= close
            ? `<div class="now-line" style="top:${(nowMin - open) * PX}px"></div>` : '';
          return `<div class="lane" data-lane="${l.id}">
            ${off}${now}
            ${packed.map((p) => `
              <div class="appt st-${p.a.status}" data-appt="${p.a.id}"
                style="top:${(toMin(p.a.start) - open) * PX}px;height:${Math.max(30, num(p.a.duration) * PX - 3)}px;left:calc(${(p.c * 100) / p.cols}% + 4px);width:calc(${100 / p.cols}% - 8px);right:auto">
                <b>${fmtTime(p.a.start)} · ${esc(p.a.customerName)}</b>
                <span>${esc(p.a.items.map((i) => i.name).join(', '))}</span>
              </div>`).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>
    <p class="small muted" style="margin-top:10px"><i class="bi bi-info-circle"></i> Tap an empty spot in a column to book that time. Hatched areas are outside shift hours.</p>`;
}

// ---------- Week view ----------
function weekView(body) {
  const start = startOfWeek(state.date);
  const today = todayStr();
  body.innerHTML = `<div class="week-grid">
    ${Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d, i) => {
      const list = apptsOn(d).filter((a) => !state.staff || a.staffId === state.staff);
      return `<div class="week-col ${d === today ? 'today' : ''}" style="--i:${i}">
        <h4 data-goday="${d}"><span>${fmtDate(d, { weekday: 'short', day: 'numeric' })}</span><span class="tag">${list.length}</span></h4>
        ${list.length ? list.map((a) => `
          <div class="appt st-${a.status}" data-appt="${a.id}">
            <b>${fmtTime(a.start)} · ${esc(a.customerName)}</b>
            <span>${esc(staffName(a.staffId))} · ${esc(a.items.map((x) => x.name).join(', '))}</span>
          </div>`).join('')
          : '<div class="small muted" style="text-align:center;padding:24px 0">Free</div>'}
      </div>`;
    }).join('')}
  </div>`;
}

// ---------- Booking form (new, multi-day, or edit) ----------
export function openBooking(opts, ctx) {
  const editing = opts.appt ? Store.find('appointments', opts.appt) : null;
  const services = () => Store.all('services').filter((s) => s.active !== false || (editing && editing.items.some((i) => i.refId === s.id)));
  let visits = editing
    ? [{ date: editing.date, start: editing.start, staffId: editing.staffId || '', serviceIds: editing.items.map((i) => i.refId) }]
    : [{ date: opts.date || state.date, start: opts.start || fromMin(openMin()), staffId: opts.staffId ?? '', serviceIds: [] }];

  const staffChoices = (sel) => {
    const list = activeStaff();
    if (sel && !list.some((s) => s.id === sel) && staffById(sel)) list.push(staffById(sel));
    return `<option value="">Any / not assigned yet</option>` +
      list.map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}${s.role ? ' · ' + esc(s.role) : ''}</option>`).join('');
  };

  const sumOf = (ids) => {
    const picked = ids.map((id) => Store.find('services', id)).filter(Boolean);
    return { price: picked.reduce((s, x) => s + num(x.price), 0), duration: picked.reduce((s, x) => s + num(x.duration), 0), picked };
  };

  const visitsHTML = () => visits.map((v, i) => {
    const sel = new Set(v.serviceIds);
    const sum = sumOf(v.serviceIds);
    return `<div class="visit">
      <div class="row between" style="margin-bottom:10px">
        <b>${editing ? 'Appointment' : 'Visit ' + (i + 1)}</b>
        ${!editing && visits.length > 1 ? `<button type="button" class="btn btn-sm btn-danger" data-rm="${i}"><i class="bi bi-x-lg"></i> Remove</button>` : ''}
      </div>
      <div class="form-grid">
        <div class="field"><label>Date</label><input class="input v-date" type="date" value="${v.date}" required></div>
        <div class="field"><label>Start time</label><input class="input v-start" type="time" step="900" value="${v.start}" required></div>
        <div class="field full"><label>Staff</label><select class="input v-staff">${staffChoices(v.staffId)}</select></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Services</label>
        <div class="chips">${services().map((s) => `
          <label><input type="checkbox" class="v-svc" value="${s.id}" ${sel.has(s.id) ? 'checked' : ''}>${esc(s.name)} <small>${money(s.price)}</small></label>`).join('')}
        </div>
      </div>
      <div class="small muted" style="margin-top:10px" data-sum>${sumText(sum)}</div>
    </div>`;
  }).join('');

  const sumText = (sum) => `${sum.picked.length} service${sum.picked.length === 1 ? '' : 's'} · ${sum.duration} min · <b class="money" style="color:var(--brand-deep)">${money(sum.price)}</b>`;

  const syncVisits = (box) => {
    visits = $$('.visit', box).map((card) => ({
      date: card.querySelector('.v-date').value,
      start: card.querySelector('.v-start').value,
      staffId: card.querySelector('.v-staff').value,
      serviceIds: [...card.querySelectorAll('.v-svc:checked')].map((x) => x.value),
    }));
  };

  openModal({
    title: editing ? 'Edit appointment' : 'New booking',
    wide: true,
    html: `
      <form id="bookForm">
        <div class="form-grid">
          <div class="field"><label>Customer name</label>
            <input class="input" name="name" required value="${esc(editing?.customerName || '')}" placeholder="e.g. Sara Ahmed"></div>
          <div class="field"><label>Phone (WhatsApp)</label>
            <input class="input" name="phone" inputmode="tel" value="${esc(editing?.customerPhone || '')}" placeholder="0300-1234567"></div>
          ${editing ? '' : `<div class="field full"><label>Booking name (optional, for packages across days)</label>
            <input class="input" name="title" placeholder="e.g. Bridal package: trial, mehndi and wedding day"></div>`}
        </div>
        <div id="visitList" style="margin-top:16px">${visitsHTML()}</div>
        ${editing ? '' : `<button type="button" class="btn btn-block" data-addvisit style="margin-top:12px;border-style:dashed"><i class="bi bi-calendar-plus"></i> Add another day to this booking</button>`}
        <p class="small muted" id="bookTotal" style="margin-top:14px"></p>
      </form>`,
    footer: `<button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" form="bookForm" type="submit"><i class="bi bi-check2-circle"></i> ${editing ? 'Save changes' : 'Confirm booking'}</button>`,
    onMount(box, close) {
      const form = box.querySelector('#bookForm');
      const list = box.querySelector('#visitList');
      const updateTotal = () => {
        syncVisits(box);
        const total = visits.reduce((s, v) => s + sumOf(v.serviceIds).price, 0);
        box.querySelector('#bookTotal').innerHTML = `${visits.length} ${visits.length === 1 ? 'visit' : 'visits'} · total <b class="money">${money(total)}</b>`;
        list.querySelectorAll('.visit').forEach((card, i) => {
          card.querySelector('[data-sum]').innerHTML = sumText(sumOf(visits[i].serviceIds));
        });
      };
      // Callers sync from the DOM before changing `visits`, so rerender must not read the DOM again.
      const rerender = () => { list.innerHTML = visitsHTML(); updateTotal(); };

      list.onchange = updateTotal;
      list.onclick = (e) => {
        const rm = e.target.closest('[data-rm]');
        if (rm) { syncVisits(box); visits.splice(num(rm.dataset.rm), 1); rerender(); }
      };
      box.querySelector('[data-addvisit]')?.addEventListener('click', () => {
        syncVisits(box);
        const last = visits[visits.length - 1];
        visits.push({ date: addDays(last.date, 1), start: last.start, staffId: last.staffId, serviceIds: [] });
        rerender();
      });
      updateTotal();

      form.onsubmit = (e) => {
        e.preventDefault();
        const f = readForm(form);
        syncVisits(box);
        const name = f.name.trim();
        const phone = (f.phone || '').trim();
        if (!name) return toast('Enter the customer name', 'error');

        for (const [i, v] of visits.entries()) {
          if (!v.date || !v.start) return toast(`${editing ? 'Pick a date and time' : 'Visit ' + (i + 1) + ': pick a date and time'}`, 'error');
          if (!v.serviceIds.length) return toast(`${editing ? 'Choose at least one service' : 'Visit ' + (i + 1) + ': choose at least one service'}`, 'error');
        }

        const built = visits.map((v) => {
          const sum = sumOf(v.serviceIds);
          return {
            ...v,
            items: sum.picked.map((x) => ({ refId: x.id, name: x.name, price: num(x.price), duration: num(x.duration) })),
            price: sum.price,
            duration: Math.max(15, sum.duration),
          };
        });

        // Problems to confirm: clashes with other bookings, overlaps inside this booking, outside opening hours.
        const problems = [];
        built.forEach((b, i) => {
          const c = clash(b.staffId, b.date, b.start, b.duration, editing?.id);
          if (c) problems.push(`${fmtDate(b.date)} ${fmtTime(b.start)}: ${staffName(b.staffId)} already has ${c.customerName} at ${fmtTime(c.start)}`);
          built.forEach((o, j) => {
            if (j > i && o.date === b.date && o.staffId && o.staffId === b.staffId &&
                toMin(b.start) < toMin(o.start) + o.duration && toMin(o.start) < toMin(b.start) + b.duration) {
              problems.push(`Visits ${i + 1} and ${j + 1} overlap on ${fmtDate(b.date)}`);
            }
          });
          const s = toMin(b.start);
          if (s < openMin() || s + b.duration > closeMin()) problems.push(`${fmtDate(b.date)} ${fmtTime(b.start)} is outside opening hours`);
        });

        const save = () => {
          const cust = findOrCreateCustomer(name, phone);
          const base = { customerId: cust?.id || '', customerName: name, customerPhone: phone };
          if (editing) {
            const b = built[0];
            Store.update('appointments', editing.id, { ...base, date: b.date, start: b.start, duration: b.duration, staffId: b.staffId, items: b.items, price: b.price });
            toast('Appointment updated', 'ok');
          } else {
            let bookingId = null;
            const title = (f.title || '').trim();
            if (built.length > 1 || title) {
              bookingId = Store.add('bookings', { customerId: base.customerId, title: title || `Booking of ${built.length} visits`, visits: built.length }).id;
            }
            for (const b of built) {
              Store.add('appointments', { ...base, bookingId, date: b.date, start: b.start, duration: b.duration, staffId: b.staffId, items: b.items, price: b.price, status: 'booked' });
            }
            toast(built.length > 1 ? `${built.length} visits booked` : 'Appointment booked', 'ok');
          }
          close();
          ctx.refresh();
        };

        if (problems.length) {
          confirmBox(problems.join('\n') + '\n\nBook anyway?', { okText: 'Book anyway', danger: true }).then((ok) => ok && save());
        } else save();
      };
    },
  });
}

// ---------- Appointment detail ----------
export function openDetail(id, ctx) {
  const a = Store.find('appointments', id);
  if (!a) return;
  const st = APPT_STATUS[a.status];
  const booking = a.bookingId ? Store.find('bookings', a.bookingId) : null;
  const siblings = a.bookingId
    ? Store.all('appointments').filter((x) => x.bookingId === a.bookingId).sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start))
    : [];
  const inv = a.invoiceId ? Store.find('invoices', a.invoiceId) : null;
  const open = a.status === 'booked' || a.status === 'arrived';
  const msg = `Assalam o Alaikum ${a.customerName}! Your appointment at ${Store.settings().businessName} is on ${fmtDate(a.date, { weekday: 'long', day: 'numeric', month: 'long' })} at ${fmtTime(a.start)} (${a.items.map((i) => i.name).join(', ')}). See you soon!`;

  openModal({
    title: a.customerName,
    wide: true,
    html: `
      <div class="row between wrap" style="margin-bottom:14px">
        <span class="tag ${st[1]}">${st[0]}</span>
        <span class="small muted">${fmtDate(a.date, { weekday: 'long', day: 'numeric', month: 'short' })} · ${fmtTime(a.start)} – ${fmtTime(fromMin(apptEnd(a)))}</span>
      </div>
      <div class="grid-kv">
        <div><div class="small muted">Phone</div><b>${esc(a.customerPhone || '–')}</b></div>
        <div><div class="small muted">Staff</div><b>${esc(staffName(a.staffId))}</b></div>
      </div>
      <h4 style="margin:18px 0 8px">Services</h4>
      <div class="list">${a.items.map((i) => `
        <div class="list-item" style="cursor:default;padding:10px"><div class="grow"><b>${esc(i.name)}</b><div class="small muted">${i.duration} min</div></div>
        <div class="money">${money(i.price)}</div></div>`).join('')}</div>
      <div class="row between" style="margin-top:12px;font-size:17px"><b>Total</b><span class="money" style="color:var(--brand-deep)">${money(a.price)}</span></div>
      ${booking ? `
        <div class="card" style="margin-top:16px;padding:14px;box-shadow:none">
          <b><i class="bi bi-calendar2-range"></i> ${esc(booking.title)}</b>
          <div class="list" style="margin-top:10px">${siblings.map((x) => `
            <div class="list-item" data-sib="${x.id}" style="padding:8px 10px;${x.id === a.id ? 'border-color:var(--brand)' : ''}">
              <div class="grow small"><b>${fmtDate(x.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(x.start)}</b> <span class="muted">${esc(staffName(x.staffId))}</span></div>
              <span class="tag ${APPT_STATUS[x.status][1]}">${APPT_STATUS[x.status][0]}</span></div>`).join('')}</div>
        </div>` : ''}`,
    footer: `
      ${a.status === 'booked' ? '<button class="btn btn-ok" data-st="arrived"><i class="bi bi-person-check"></i> Arrived</button>' : ''}
      ${open ? '<button class="btn btn-gold" data-bill><i class="bi bi-receipt"></i> Bill now</button>' : ''}
      ${inv ? '<button class="btn btn-ok" data-inv><i class="bi bi-file-earmark-text"></i> Invoice</button>' : ''}
      ${open ? '<button class="btn" data-st="noshow">No-show</button><button class="btn btn-danger" data-st="cancelled">Cancel</button>' : ''}
      ${a.customerPhone ? `<a class="btn" target="_blank" rel="noopener" href="${esc(waLink(a.customerPhone, msg))}"><i class="bi bi-whatsapp"></i> Remind</a>` : ''}
      <button class="btn" data-edit><i class="bi bi-pencil"></i> Edit</button>
      <button class="btn btn-danger" data-del aria-label="Delete"><i class="bi bi-trash"></i></button>`,
    onMount(box, close) {
      box.onclick = async (e) => {
        const t = e.target;
        const st2 = t.closest('[data-st]');
        if (st2) {
          Store.update('appointments', a.id, { status: st2.dataset.st });
          toast(`Marked ${APPT_STATUS[st2.dataset.st][0].toLowerCase()}`, 'ok');
          close();
          return ctx.refresh();
        }
        if (t.closest('[data-bill]')) { close(); return ctx.go(`#/billing?appt=${a.id}`); }
        if (t.closest('[data-inv]')) { close(); return ctx.go(`#/invoices/${a.invoiceId}`); }
        if (t.closest('[data-edit]')) { close(); return openBooking({ appt: a.id }, ctx); }
        const sib = t.closest('[data-sib]');
        if (sib) { close(); return openDetail(sib.dataset.sib, ctx); }
        if (t.closest('[data-del]')) {
          if (!await confirmBox('Delete this appointment?', { okText: 'Delete', danger: true })) return;
          Store.remove('appointments', a.id);
          toast('Appointment deleted');
          close();
          ctx.refresh();
        }
      };
    },
  });
}

