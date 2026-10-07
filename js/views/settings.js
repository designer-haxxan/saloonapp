// Settings: business profile (shown on receipts), opening hours, tax, payment methods, backup and restore.
import * as Store from '../store.js';
import { esc, num, readForm, toast, confirmBox } from '../util.js';

export function render(el, ctx) {
  const s = Store.settings();
  const hasData = Store.all('services').length > 0 || Store.all('staff').length > 0;

  el.innerHTML = `
    <form id="setForm" class="grid" style="gap:18px">
      <div class="card">
        <div class="card-head"><h3><i class="bi bi-shop"></i> Business profile</h3><span class="small muted">Printed on every receipt</span></div>
        <div class="form-grid">
          <div class="field"><label>Business name</label><input class="input" name="businessName" required value="${esc(s.businessName)}"></div>
          <div class="field"><label>Name in Urdu (optional)</label><input class="input urdu" name="urduName" value="${esc(s.urduName)}" placeholder="سیلون"></div>
          <div class="field full"><label>Tagline</label><input class="input" name="tagline" value="${esc(s.tagline)}" placeholder="Beauty & Grooming"></div>
          <div class="field full"><label>Address</label><input class="input" name="address" value="${esc(s.address)}"></div>
          <div class="field"><label>Phone</label><input class="input" name="phone" inputmode="tel" value="${esc(s.phone)}" placeholder="0300-1234567"></div>
          <div class="field"><label>Receipt footer message</label><input class="input" name="footer" value="${esc(s.footer)}"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3><i class="bi bi-clock"></i> Hours, tax and numbering</h3></div>
        <div class="form-grid">
          <div class="field"><label>Opening time</label><input class="input" type="time" name="openTime" value="${s.openTime}"></div>
          <div class="field"><label>Closing time</label><input class="input" type="time" name="closeTime" value="${s.closeTime}"></div>
          <div class="field"><label>Sales tax on bills (%)</label><input class="input" type="number" min="0" max="100" step="0.5" name="taxPct" value="${num(s.taxPct)}">
            <span class="small muted">Leave 0 if you do not charge sales tax.</span></div>
          <div class="field"><label>Invoice number prefix</label><input class="input" name="invoicePrefix" maxlength="8" value="${esc(s.invoicePrefix)}">
            <span class="small muted">Invoices are numbered like ${esc(s.invoicePrefix)}-00001.</span></div>
          <div class="field full"><label>Payment methods (comma separated)</label><input class="input" name="paymentMethods" value="${esc((s.paymentMethods || []).join(', '))}">
            <span class="small muted">These appear in the bill and payment screens.</span></div>
        </div>
      </div>

      <div class="row" style="justify-content:flex-end">
        <button class="btn btn-primary" type="submit"><i class="bi bi-check2"></i> Save settings</button>
      </div>
    </form>

    <div class="grid grid-2" style="margin-top:18px">
      <div class="card">
        <div class="card-head"><h3><i class="bi bi-cloud-arrow-down"></i> Backup</h3></div>
        <p class="muted small" style="line-height:1.6">Everything is stored on this device. Download a backup file regularly and keep it safe (WhatsApp it to yourself or save to Google Drive).</p>
        <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:12px">
          <button class="btn btn-primary" data-export><i class="bi bi-download"></i> Download backup</button>
          <label class="btn" style="cursor:pointer"><i class="bi bi-upload"></i> Restore from file
            <input type="file" accept="application/json,.json" id="importFile" hidden></label>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3><i class="bi bi-magic"></i> Start quickly</h3></div>
        <p class="muted small" style="line-height:1.6">Add demo services, three staff members and some products to see how the app works. You can edit or delete them any time.</p>
        <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:12px">
          <button class="btn btn-gold" data-sample ${hasData ? 'disabled' : ''}><i class="bi bi-stars"></i> Load sample data</button>
        </div>
        ${hasData ? '<p class="small muted" style="margin-top:8px">Sample data is only added to an empty app.</p>' : ''}
      </div>
    </div>

    <div class="card" style="margin-top:18px;border-color:#f3c4c4">
      <div class="card-head"><h3 style="color:var(--danger)"><i class="bi bi-exclamation-octagon"></i> Danger zone</h3></div>
      <p class="muted small">Erase every service, staff member, customer, bill and payment on this device. Download a backup first.</p>
      <button class="btn btn-danger" data-reset style="margin-top:10px"><i class="bi bi-trash"></i> Erase all data</button>
    </div>
  `;

  $form(el).onsubmit = (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    const openT = f.openTime || '10:00';
    const closeT = f.closeTime || '21:00';
    if (openT >= closeT) return toast('Closing time must be after opening time', 'error');
    Store.setSettings({
      businessName: f.businessName.trim() || 'My Salon',
      urduName: (f.urduName || '').trim(),
      tagline: (f.tagline || '').trim(),
      address: (f.address || '').trim(),
      phone: (f.phone || '').trim(),
      footer: (f.footer || '').trim(),
      openTime: openT,
      closeTime: closeT,
      taxPct: Math.min(100, Math.max(0, num(f.taxPct))),
      invoicePrefix: (f.invoicePrefix || 'INV').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'INV',
      paymentMethods: String(f.paymentMethods || '').split(',').map((x) => x.trim()).filter(Boolean),
    });
    document.dispatchEvent(new CustomEvent('settings:changed'));
    toast('Settings saved', 'ok');
  };

  el.onclick = async (e) => {
    const t = e.target;
    if (t.closest('[data-export]')) return downloadBackup();
    if (t.closest('[data-sample]')) {
      Store.seedSample();
      toast('Sample data added', 'ok');
      return ctx.refresh();
    }
    if (t.closest('[data-reset]')) {
      if (!await confirmBox('Erase ALL data on this device? This cannot be undone. Make sure you downloaded a backup.', { okText: 'Erase everything', danger: true })) return;
      Store.resetAll();
      toast('All data erased');
      ctx.refresh();
    }
  };

  el.querySelector('#importFile').onchange = (e) => restoreFrom(e.target.files[0], ctx);
}

const $form = (el) => el.querySelector('#setForm');

function downloadBackup() {
  const payload = JSON.stringify(Store.exportAll(), null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = `salonpro-backup-${stamp}.json`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Backup downloaded', 'ok');
}

async function restoreFrom(file, ctx) {
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!data || data.format !== 'salonpro-backup') throw new Error('not a backup');
  } catch {
    return toast('This file is not a Salon Pro backup', 'error');
  }
  const counts = ['services', 'staff', 'customers', 'appointments', 'invoices'].map((k) => `${(data.data?.[k] || []).length} ${k}`).join(', ');
  const ok = await confirmBox(`Restore this backup from ${new Date(data.createdAt).toLocaleString('en-PK')}? It contains ${counts}. Current data on this device will be replaced.`, { okText: 'Restore', danger: true });
  if (!ok) return;
  try {
    Store.importAll(data);
    document.dispatchEvent(new CustomEvent('settings:changed'));
    toast('Backup restored', 'ok');
    ctx.refresh();
  } catch (err) {
    toast(err.message || 'Restore failed', 'error');
  }
}
