import * as Store from '../store.js';
import { esc, money, num, openModal, readForm, toast, confirmBox, $ } from '../util.js';

let q = '';

export function render(el, ctx) {
  const list = Store.all('products').filter((p) => !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  const lowCount = Store.all('products').filter((p) => num(p.stock) <= num(p.minStock)).length;
  const stockValue = Store.all('products').reduce((s, p) => s + num(p.stock) * num(p.cost), 0);

  el.innerHTML = `
    <div class="grid grid-stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
      <div class="card stat" style="--i:0"><div class="stat-label">Products</div><div class="stat-value">${Store.all('products').length}</div><i class="bi bi-bag stat-icon"></i></div>
      <div class="card stat" style="--i:1"><div class="stat-label">Low or out of stock</div><div class="stat-value">${lowCount}</div><i class="bi bi-exclamation-triangle stat-icon"></i></div>
      <div class="card stat" style="--i:2"><div class="stat-label">Stock value (cost)</div><div class="stat-value" style="font-size:20px">${money(stockValue)}</div><i class="bi bi-box-seam stat-icon"></i></div>
    </div>
    <div class="toolbar">
      <div class="search"><i class="bi bi-search"></i><input class="input" id="prodSearch" placeholder="Search name or SKU" value="${esc(q)}"></div>
      <button class="btn btn-primary" data-act="add"><i class="bi bi-plus-lg"></i> Add product</button>
    </div>

    ${Store.all('products').length === 0 ? `<div class="card empty"><i class="bi bi-bag-heart"></i><p>Sell retail products (shampoo, oils, cosmetics) along with services. Stock goes down automatically when you bill them.</p></div>` : ''}

    ${list.length ? `
    <div class="card" style="padding:0">
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Product</th><th>SKU</th><th class="num">Price</th><th class="num">Cost</th><th style="text-align:center">Stock</th><th></th></tr></thead>
        <tbody>
          ${list.map((p, i) => {
            const low = num(p.stock) <= num(p.minStock);
            return `<tr style="animation:fadeUp .35s both;animation-delay:${i * 30}ms">
              <td><b>${esc(p.name)}</b><div class="small muted">Min ${p.minStock}</div></td>
              <td class="small muted">${esc(p.sku || '–')}</td>
              <td class="num money">${money(p.price)}</td>
              <td class="num muted">${money(p.cost)}</td>
              <td style="text-align:center">
                <div class="row" style="justify-content:center;gap:6px">
                  <button class="icon-btn" style="width:30px;height:30px;font-size:14px" data-adj="${p.id}" data-d="-1" aria-label="Remove one"><i class="bi bi-dash"></i></button>
                  <span class="tag ${num(p.stock) === 0 ? 'danger' : low ? 'warn' : 'ok'}" style="min-width:52px;justify-content:center">${p.stock}</span>
                  <button class="icon-btn" style="width:30px;height:30px;font-size:14px" data-adj="${p.id}" data-d="1" aria-label="Add one"><i class="bi bi-plus"></i></button>
                </div>
              </td>
              <td style="text-align:right"><button class="btn btn-sm btn-ghost" data-edit="${p.id}"><i class="bi bi-pencil"></i></button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>` : (Store.all('products').length ? '<div class="empty"><i class="bi bi-search"></i>No product matches.</div>' : '')}
  `;

  const search = $('#prodSearch', el);
  search.oninput = () => { q = search.value.trim().toLowerCase(); render(el, ctx); const s2 = $('#prodSearch', el); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); };

  el.onclick = (e) => {
    if (e.target.closest('[data-act="add"]')) return openForm(null, ctx);
    const adj = e.target.closest('[data-adj]');
    if (adj) {
      const p = Store.find('products', adj.dataset.adj);
      const next = Math.max(0, num(p.stock) + num(adj.dataset.d));
      Store.update('products', p.id, { stock: next });
      return ctx.refresh();
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) openForm(Store.find('products', edit.dataset.edit), ctx);
  };
}

function openForm(p, ctx) {
  const v = p || { name: '', sku: '', price: '', cost: '', stock: 0, minStock: 2 };
  openModal({
    title: p ? 'Edit product' : 'New product',
    html: `
      <form id="prodForm" class="form-grid">
        <div class="field full"><label>Product name</label><input class="input" name="name" required value="${esc(v.name)}"></div>
        <div class="field"><label>SKU / barcode (optional)</label><input class="input" name="sku" value="${esc(v.sku || '')}"></div>
        <div class="field"><label>Selling price (Rs)</label><input class="input" name="price" type="number" min="0" step="10" required value="${v.price}"></div>
        <div class="field"><label>Cost price (Rs)</label><input class="input" name="cost" type="number" min="0" step="10" value="${v.cost}"></div>
        <div class="field"><label>Stock in hand</label><input class="input" name="stock" type="number" min="0" value="${v.stock}"></div>
        <div class="field"><label>Alert when stock is at or below</label><input class="input" name="minStock" type="number" min="0" value="${v.minStock}"></div>
      </form>`,
    footer: `${p ? '<button class="btn btn-danger" data-del><i class="bi bi-trash"></i> Delete</button>' : ''}
      <button class="btn" data-close>Cancel</button><button class="btn btn-primary" form="prodForm" type="submit"><i class="bi bi-check2"></i> Save</button>`,
    onMount(box, close) {
      box.querySelector('#prodForm').onsubmit = (e) => {
        e.preventDefault();
        const f = readForm(e.target);
        const data = {
          name: f.name.trim(), sku: f.sku.trim(), price: Math.max(0, num(f.price)), cost: Math.max(0, num(f.cost)),
          stock: Math.max(0, num(f.stock)), minStock: Math.max(0, num(f.minStock)),
        };
        if (p) Store.update('products', p.id, data); else Store.add('products', data);
        toast('Product saved', 'ok');
        close();
        ctx.refresh();
      };
      box.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!await confirmBox(`Delete ${p.name}?`, { okText: 'Delete', danger: true })) return;
        Store.remove('products', p.id);
        toast('Product deleted');
        close();
        ctx.refresh();
      });
    },
  });
}
