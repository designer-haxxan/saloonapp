import * as Store from '../store.js';
import { esc, money, num, $, openModal, readForm, toast, confirmBox } from '../util.js';

const CATEGORIES = ['Hair', 'Hair & Barber', 'Skin & Facial', 'Waxing', 'Nails', 'Mehndi', 'Bridal', 'Makeup', 'Massage', 'Other'];
let filter = { q: '', cat: '' };

export function render(el, ctx) {
  const list = Store.all('services');
  const cats = [...new Set([...list.map((s) => s.category).filter(Boolean), ...CATEGORIES])].sort();
  const shown = list.filter((s) =>
    (!filter.cat || s.category === filter.cat) &&
    (!filter.q || s.name.toLowerCase().includes(filter.q.toLowerCase())));

  const groups = {};
  for (const s of shown) (groups[s.category || 'Other'] ||= []).push(s);

  el.innerHTML = `
    <div class="toolbar">
      <div class="search"><i class="bi bi-search"></i>
        <input class="input" id="svcSearch" placeholder="Search services" value="${esc(filter.q)}"></div>
      <select class="input w-sm" id="svcCat">
        <option value="">All categories</option>
        ${cats.map((c) => `<option ${c === filter.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <button class="btn btn-primary" data-act="add"><i class="bi bi-plus-lg"></i> Add service</button>
    </div>

    ${list.length === 0 ? `
      <div class="card empty"><i class="bi bi-scissors"></i>
        <p>No services yet. Add what your shop offers and its price. Customers' bills are built from this list.</p>
        <div class="row wrap" style="justify-content:center;gap:10px">
          <button class="btn btn-primary" data-act="add"><i class="bi bi-plus-lg"></i> Add service</button>
          <button class="btn" data-act="sample"><i class="bi bi-magic"></i> Load sample services</button>
        </div>
      </div>` : ''}

    ${Object.keys(groups).sort().map((cat, gi) => `
      <section style="margin-bottom:22px">
        <h3 style="font-size:14px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">${esc(cat)} · ${groups[cat].length}</h3>
        <div class="grid grid-cards">
          ${groups[cat].map((s, i) => `
            <div class="card" style="animation-delay:${(gi * 4 + i) * 40}ms;${s.active === false ? 'opacity:.55' : ''}" data-edit="${s.id}" role="button">
              <div class="row between">
                <i class="bi bi-scissors" style="font-size:22px;color:var(--brand)"></i>
                <span class="tag ${s.active === false ? 'mute' : 'ok'}">${s.active === false ? 'Inactive' : 'Active'}</span>
              </div>
              <h4 style="margin:12px 0 4px;font-size:16px">${esc(s.name)}</h4>
              <div class="small muted"><i class="bi bi-clock"></i> ${s.duration} min</div>
              <div class="row between" style="margin-top:14px">
                <span class="money" style="font-size:18px;color:var(--brand-deep)">${money(s.price)}</span>
                <span class="small muted">Edit <i class="bi bi-chevron-right"></i></span>
              </div>
            </div>`).join('')}
        </div>
      </section>`).join('')}
    ${list.length && !shown.length ? `<div class="empty"><i class="bi bi-search"></i>No services match your search.</div>` : ''}
  `;

  const search = $('#svcSearch', el);
  search.oninput = () => { filter.q = search.value; const pos = search.selectionStart; render(el, ctx); const again = $('#svcSearch', el); again.focus(); again.setSelectionRange(pos, pos); };
  $('#svcCat', el).onchange = (e) => { filter.cat = e.target.value; render(el, ctx); };
  el.onclick = (e) => {
    if (e.target.closest('[data-act="add"]')) return openForm(null, ctx);
    if (e.target.closest('[data-act="sample"]')) { Store.seedSample(); toast('Sample services, staff and products added', 'ok'); return ctx.refresh(); }
    const card = e.target.closest('[data-edit]');
    if (card) openForm(Store.find('services', card.dataset.edit), ctx);
  };
}

function openForm(svc, ctx) {
  const v = svc || { name: '', category: 'Hair', duration: 30, price: '', active: true };
  openModal({
    title: svc ? 'Edit service' : 'New service',
    html: `
      <form id="svcForm" class="form-grid">
        <div class="field full"><label>Service name</label>
          <input class="input" name="name" required value="${esc(v.name)}" placeholder="e.g. Haircut (Women)"></div>
        <div class="field"><label>Category</label>
          <input class="input" name="category" list="catList" value="${esc(v.category)}">
          <datalist id="catList">${CATEGORIES.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label>Duration (minutes)</label>
          <input class="input" name="duration" type="number" min="5" step="5" required value="${v.duration}"></div>
        <div class="field"><label>Price (Rs)</label>
          <input class="input" name="price" type="number" min="0" step="50" required value="${v.price}"></div>
        <div class="field"><label>Status</label>
          <select class="input" name="active"><option value="1" ${v.active !== false ? 'selected' : ''}>Active</option><option value="0" ${v.active === false ? 'selected' : ''}>Inactive (hidden from billing)</option></select></div>
      </form>`,
    footer: `${svc ? '<button class="btn btn-danger" data-del><i class="bi bi-trash"></i> Delete</button>' : ''}
      <button class="btn" data-close>Cancel</button><button class="btn btn-primary" form="svcForm" type="submit"><i class="bi bi-check2"></i> Save</button>`,
    onMount(box, close) {
      box.querySelector('#svcForm').onsubmit = (e) => {
        e.preventDefault();
        const f = readForm(e.target);
        const data = {
          name: f.name.trim(), category: f.category.trim() || 'Other',
          duration: Math.max(5, num(f.duration)), price: Math.max(0, num(f.price)), active: f.active === '1',
        };
        if (svc) Store.update('services', svc.id, data); else Store.add('services', data);
        toast(svc ? 'Service updated' : 'Service added', 'ok');
        close();
        ctx.refresh();
      };
      box.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!await confirmBox(`Delete "${svc.name}"? Past bills keep their details.`, { okText: 'Delete', danger: true })) return;
        Store.remove('services', svc.id);
        toast('Service deleted');
        close();
        ctx.refresh();
      });
    },
  });
}
