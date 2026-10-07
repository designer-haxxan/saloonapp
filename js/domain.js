// Business rules shared by all screens: balances, appointment times, statuses.
import * as Store from './store.js';
import { toMin, num, round, addDays, startOfWeek, monthOf } from './util.js';

// Voided invoices never count toward money.
export const liveInvoices = () => Store.all('invoices').filter((i) => !i.voided);

// Amount the customer owes in total (services + products after discount/tax, plus tip).
export const invoiceGrand = (i) => round(num(i.total) + num(i.tip));
export const invoiceBalance = (i) => round(invoiceGrand(i) - num(i.paid));

export function invoiceStatus(i) {
  if (i.voided) return 'void';
  if (invoiceBalance(i) <= 0) return 'paid';
  return num(i.paid) > 0 ? 'partial' : 'unpaid';
}

export const STATUS_LABEL = {
  paid: ['Paid', 'ok'], partial: ['Part paid', 'warn'], unpaid: ['Unpaid', 'danger'], void: ['Void', 'mute'],
};

export const APPT_STATUS = {
  booked: ['Booked', 'info'], arrived: ['Arrived', 'warn'], done: ['Done', 'ok'],
  cancelled: ['Cancelled', 'mute'], noshow: ['No-show', 'danger'],
};

export const apptEnd = (a) => toMin(a.start) + num(a.duration);

// Appointments on a date that are still relevant (not cancelled), earliest first.
export function apptsOn(date) {
  return Store.all('appointments')
    .filter((a) => a.date === date && a.status !== 'cancelled')
    .sort((x, y) => toMin(x.start) - toMin(y.start));
}

export const staffById = (id) => Store.find('staff', id);
export const staffName = (id) => staffById(id)?.name || 'Unassigned';

// Overlap check for one staff member on one day. Returns the first clashing appointment or null.
export function clash(staffId, date, start, duration, ignoreId = null) {
  if (!staffId) return null;
  const s = toMin(start);
  const e = s + num(duration);
  return apptsOn(date).find((a) => a.id !== ignoreId && a.staffId === staffId && s < apptEnd(a) && toMin(a.start) < e) || null;
}

// Totals for a set of invoices (grand totals exclude tip; tips listed separately)
export function sumInvoices(list) {
  return list.reduce((acc, i) => {
    acc.sales += num(i.total);
    acc.tips += num(i.tip);
    acc.collected += num(i.paid);
    acc.balance += Math.max(0, invoiceBalance(i));
    return acc;
  }, { sales: 0, tips: 0, collected: 0, balance: 0 });
}

// Last N days ending today, oldest first: [{ date, total }]
export function lastDays(today, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    out.push({ date: d, total: liveInvoices().filter((x) => x.date === d).reduce((s, x) => s + num(x.total), 0) });
  }
  return out;
}

export const invoicesInMonth = (month) => liveInvoices().filter((i) => monthOf(i.date) === month);
export { startOfWeek, addDays };
