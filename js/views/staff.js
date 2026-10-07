import * as Store from '../store.js';
import { esc, money, num, initials, openModal, readForm, toast, confirmBox, todayStr, fmtTime } from '../util.js';
import { apptsOn } from '../domain.js';

const ROLES = ['Hair Stylist', 'Barber', 'Beautician', 'Nail Technician', 'Makeup Artist', 'Mehndi Artist', 'Receptionist', 'Helper', 'Other'];
const COLORS = ['#b5476b', '#c99a3c', '#4c7ef3', '#3aa27a', '#8e5cd9', '#e0655f', '#2c9bb0', '#7b6d5a'];

export function render(el, ctx) {
  const today = todayStr();
  const list = Store.all('staff');
  const todays = apptsOn(today);

  el.innerHTML = `
    <div class="toolbar">
      <div class="grow"><p class="muted" style="margin:0">Manage your team, their shifts, salary and commission. Commission and salary feed the Payroll screen.</p></div>
      <button class="btn btn-primary" data-act="add"><i class="bi bi-person-plus"></i> Add staff</button>
    </div>

    ${list.length === 0 ? `<div class="card empty"><i class="bi bi-people"></i><p>No staff yet. Add the barbers and beauticians who take bookings.</p>
      <button class="btn btn-primary" data-act="add"><i class="bi bi-person-plus"></i> Add first staff member</button></div>` : ''}

    <div class="grid grid-cards">
      ${list.map((s, i) => {
        const count = todays.filter((a) => a.staffId === s.id).length;
        return `
        <div class="card" style="animation-delay:${i * 60}ms;cursor:pointer;${s.active === false ? 'opacity:.55' : ''}" data-edit="${s.id}" role="button">
          <div class="row">
            <div class="avatar lg" style="background:${esc(s.color)}">${initials(s.name)}</div>
            <div class="grow">
              <h4 style="font-size:16px">${esc(s.name)}</h4>
              <div class="small muted">${esc(s.role || 'Staff')}</div>
            </div>
            ${s.active === false ? '<span class="tag mute">Left</span>' : `<span class="tag ${count ? 'info' : 'mute'}">${count} today</span>`}
          </div>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
            <div><div class="small muted">Shift</div><b>${fmtTime(s.shiftStart || '10:00')} – ${fmtTime(s.shiftEnd || '21:00')}</b></div>
            <div><div class="small muted">Commission</div><b>${num(s.commissionPct)}%</b></div>
            <div><div class="small muted">Salary</div><b class="money">${money(s.salary)}</b></div>
            <div><div class="small muted">Phone</div><b>${esc(s.phone || '–')}</b></div>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  el.onclick = (e) => {
    if (e.target.closest('[data-act="add"]')) return openForm(null, ctx);
    const card = e.target.closest('[data-edit]');
    if (card) openForm(Store.find('staff', card.dataset.edit), ctx);
  };
}

function openForm(member, ctx) {
  const v = member || { name: '', role: 'Hair Stylist', phone: '', color: COLORS[Store.all('staff').length % COLORS.length], salary: 0, commissionPct: 0, shiftStart: '10:00', shiftEnd: '21:00', active: true };
  openModal({
    title: member ? 'Edit staff' : 'New staff member',
    wide: true,
    html: `
      <form id="staffForm" class="form-grid">
        <div class="field"><label>Full name</label><input class="input" name="name" required value="${esc(v.name)}"></div>
        <div class="field"><label>Role</label>
          <select class="input" name="role">${ROLES.map((r) => `<option ${r === v.role ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="field"><label>Phone (WhatsApp)</label><input class="input" name="phone" inputmode="tel" value="${esc(v.phone)}" placeholder="0300-1234567"></div>
        <div class="field"><label>Monthly salary (Rs)</label><input class="input" name="salary" type="number" min="0" step="500" value="${v.salary}"></div>
        <div class="field"><label>Commission on services (%)</label><input class="input" name="commissionPct" type="number" min="0" max="100" step="0.5" value="${v.commissionPct}"></div>
        <div class="field"><label>Calendar colour</label>
          <div class="chips" id="colorPick">${COLORS.map((c) => `
            <label style="padding:6px"><input type="radio" name="color" value="${c}" ${c === v.color ? 'checked' : ''}>
              <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${c}"></span></label>`).join('')}</div></div>
        <div class="field"><label>Shift start</label><input class="input" type="time" name="shiftStart" value="${v.shiftStart}"></div>
        <div class="field"><label>Shift end</label><input class="input" type="time" name="shiftEnd" value="${v.shiftEnd}"></div>
        <div class="field full"><label>Status</label>
          <select class="input" name="active"><option value="1" ${v.active !== false ? 'selected' : ''}>Working</option><option value="0" ${v.active === false ? 'selected' : ''}>Left (hide from calendar and billing)</option></select></div>
      </form>`,
    footer: `${member ? '<button class="btn btn-danger" data-del><i class="bi bi-trash"></i> Delete</button>' : ''}
      <button class="btn" data-close>Cancel</button><button class="btn btn-primary" form="staffForm" type="submit"><i class="bi bi-check2"></i> Save</button>`,
    onMount(box, close) {
      box.querySelector('#staffForm').onsubmit = (e) => {
        e.preventDefault();
        const f = readForm(e.target);
        const data = {
          name: f.name.trim(), role: f.role, phone: f.phone.trim(), color: f.color || v.color,
          salary: Math.max(0, num(f.salary)), commissionPct: Math.min(100, Math.max(0, num(f.commissionPct))),
          shiftStart: f.shiftStart || '10:00', shiftEnd: f.shiftEnd || '21:00', active: f.active === '1',
        };
        if (member) Store.update('staff', member.id, data); else Store.add('staff', data);
        toast(member ? 'Staff updated' : 'Staff added', 'ok');
        close();
        ctx.refresh();
      };
      box.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!await confirmBox(`Delete ${member.name}? Their past bills stay, but the name will show as Unassigned. Consider marking them as Left instead.`, { okText: 'Delete', danger: true })) return;
        Store.remove('staff', member.id);
        toast('Staff deleted');
        close();
        ctx.refresh();
      });
    },
  });
}
