import * as Store from '../store.js';
import { esc, money, num, initials, openModal, readForm, toast, confirmBox, waLink, fmtDate, digits, normPhone, fmtTime, todayStr, $ } from '../util.js';
import { liveInvoices, APPT_STATUS, invoiceStatus, STATUS_LABEL, staffName } from '../domain.js';

let q = '';

// Customers are linked by id; invoices created before a customer existed are matched by phone.
function historyOf(c) {
  const ph = digits(c.phone);
  return liveInvoices()
    .filter((i) => i.customerId === c.id || (ph && digits(i.customerPhone) === ph))
    .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
}

export function render(el, ctx) {
  const list = Store.all('customers');
  const rows = list
    .map((c) => ({ c, hist: historyOf(c) }))
    .map((r) => ({ ...r, spent: r.hist.reduce((s, i) => s + num(i.total), 0) }))
    .filter((r) => !q || r.c.name.toLowerCase().includes(q) || digits(r.c.phone).includes(digits(q)))
    .sort((a, b) => b.spent - a.spent);

  el.innerHTML = `
    <div class="toolbar">
      <div class="search"><i class="bi bi-search"></i><input class="input" id="custSearch" placeholder="Search name or phone" value="${esc(q)}"></div>
      <button class="btn btn-primary" data-act="add"><i class="bi bi-person-plus"></i> New customer</button>
    </div>

    ${list.length === 0 ? `<div class="card empty"><i class="bi bi-person-hearts"></i><p>Customers are saved automatically when you book or bill them. You can also add them here.</p></div>` : ''}

    <div class="list">
      ${rows.map((r, i) => `
        <div class="list-item" style="--i:${i}" data-open="${r.c.id}">
          <div class="avatar">${initials(r.c.name)}</div>
          <div class="grow">
            <b>${esc(r.c.name)}</b>
            <div class="small muted">${esc(r.c.phone || 'No phone')} · ${r.hist.length} bill${r.hist.length === 1 ? '' : 's'}${r.c.notes ? ' · ' + esc(r.c.notes) : ''}</div>
          </div>
          <div style="text-align:right">
            <div class="money">${money(r.spent)}</div>
            <div class="small muted">${r.hist[0] ? 'Last ' + fmtDate(r.hist[0].date, { day: 'numeric', month: 'short' }) : 'No visits'}</div>
          </div>
        </div>`).join('')}
    </div>
    ${list.length && !rows.length ? '<div class="empty"><i class="bi bi-search"></i>No customer matches.</div>' : ''}
  `;

  const search = $('#custSearch', el);
  search.oninput = () => { q = search.value.trim().toLowerCase(); render(el, ctx); const s2 = $('#custSearch', el); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); };
  el.onclick = (e) => {
    if (e.target.closest('[data-act="add"]')) return openForm(null, ctx);
    const row = e.target.closest('[data-open]');
    if (row) openDetail(row.dataset.open, ctx);
  };
}

function openDetail(id, ctx) {
  const c = Store.find('customers', id);
  if (!c) return;
  const hist = historyOf(c);
  const spent = hist.reduce((s, i) => s + num(i.total), 0);
  const balance = hist.reduce((s, i) => s + Math.max(0, num(i.total) + num(i.tip) - num(i.paid)), 0);
  const upcoming = Store.all('appointments')
    .filter((a) => a.customerId === c.id && a.date >= todayStr() && a.status !== 'cancelled')
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const msg = `Assalam o Alaikum ${c.name}! ${Store.settings().businessName} here. `;

  openModal({
    title: c.name,
    wide: true,
    html: `
      <div class="row" style="margin-bottom:16px">
        <div class="avatar lg">${initials(c.name)}</div>
        <div class="grow">
          <div class="money" style="font-size:18px">${esc(c.phone || 'No phone')}</div>
          <div class="small muted">${esc(c.notes || 'No notes')}</div>
        </div>
      </div>
      <div class="grid grid-stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
        <div class="card" style="padding:14px"><div class="small muted">Total spent</div><div class="money" style="font-size:18px">${money(spent)}</div></div>
        <div class="card" style="padding:14px"><div class="small muted">Visits / bills</div><div class="money" style="font-size:18px">${hist.length}</div></div>
        <div class="card" style="padding:14px"><div class="small muted">Balance due</div><div class="money" style="font-size:18px;color:${balance > 0 ? 'var(--danger)' : 'var(--ok)'}">${money(balance)}</div></div>
      </div>
      <h4 style="margin:6px 0 10px">Upcoming bookings</h4>
      ${upcoming.length ? `<div class="list">${upcoming.map((a) => `
        <div class="list-item" style="cursor:default"><div class="grow"><b>${fmtDate(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(a.start)}</b>
        <div class="small muted">${esc(a.items.map((x) => x.name).join(', '))} · ${esc(staffName(a.staffId))}</div></div>
        <span class="tag ${APPT_STATUS[a.status][1]}">${APPT_STATUS[a.status][0]}</span></div>`).join('')}</div>`
        : '<p class="muted small">No upcoming bookings.</p>'}
      <h4 style="margin:18px 0 10px">Bill history</h4>
      ${hist.length ? `<div class="list">${hist.slice(0, 10).map((i) => {
        const st = STATUS_LABEL[invoiceStatus(i)];
        return `<div class="list-item" data-inv="${i.id}"><div class="grow"><b>${esc(i.number)}</b>
          <div class="small muted">${fmtDate(i.date)} · ${i.lines.length} item${i.lines.length === 1 ? '' : 's'}</div></div>
          <div class="money">${money(i.total)}</div><span class="tag ${st[1]}">${st[0]}</span></div>`;
      }).join('')}</div>` : '<p class="muted small">No bills yet.</p>'}
    `,
    footer: `${normPhone(c.phone) ? `<a class="btn btn-ok" target="_blank" rel="noopener" href="${esc(waLink(c.phone, msg))}"><i class="bi bi-whatsapp"></i> WhatsApp</a>` : ''}
      <button class="btn" data-edit><i class="bi bi-pencil"></i> Edit</button>
      <button class="btn btn-primary" data-bill><i class="bi bi-receipt"></i> New bill</button>`,
    onMount(box, close) {
      box.querySelector('[data-edit]').onclick = () => { close(); openForm(c, ctx); };
      box.querySelector('[data-bill]').onclick = () => { close(); ctx.go(`#/billing?customer=${c.id}`); };
      box.querySelectorAll('[data-inv]').forEach((row) => row.onclick = () => { close(); ctx.go(`#/invoices/${row.dataset.inv}`); });
    },
  });
}

function openForm(c, ctx) {
  const v = c || { name: '', phone: '', notes: '' };
  openModal({
    title: c ? 'Edit customer' : 'New customer',
    html: `
      <form id="custForm" class="form-grid">
        <div class="field full"><label>Name</label><input class="input" name="name" required value="${esc(v.name)}"></div>
        <div class="field"><label>Phone</label><input class="input" name="phone" inputmode="tel" value="${esc(v.phone)}" placeholder="0300-1234567"></div>
        <div class="field"><label>Notes (allergies, preferences)</label><input class="input" name="notes" value="${esc(v.notes || '')}"></div>
      </form>`,
    footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" form="custForm" type="submit"><i class="bi bi-check2"></i> Save</button>`,
    onMount(box, close) {
      box.querySelector('#custForm').onsubmit = (e) => {
        e.preventDefault();
        const f = readForm(e.target);
        const data = { name: f.name.trim(), phone: f.phone.trim(), notes: f.notes.trim() };
        if (c) Store.update('customers', c.id, data); else Store.add('customers', data);
        toast('Customer saved', 'ok');
        close();
        ctx.refresh();
      };
    },
  });
}

// Used by booking and billing: find a customer by phone, or create one. Returns the record or null.
export function findOrCreateCustomer(name, phone) {
  const ph = digits(phone);
  if (ph) {
    const hit = Store.all('customers').find((c) => digits(c.phone) === ph);
    if (hit) {
      if (name && hit.name !== name) Store.update('customers', hit.id, { name });
      return Store.find('customers', hit.id);
    }
  }
  if (!name && !ph) return null;
  return Store.add('customers', { name: name || 'Customer ' + ph.slice(-4), phone: phone || '', notes: '' });
}
