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
  paid: ['Paid', 'ok'], partial: ['Part paid', 'warn'], unpaid: ['Unpaid', 'danger'], void: ['Cancelled', 'mute'],
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

// Profit of one bill, split into service and product profit.
// Revenue is each line's amount after the bill discount (tax and tip are not income).
// Cost is the cost price stored on the line (older bills fall back to the current product cost).
export function invoiceProfit(inv) {
  const subtotal = num(inv.subtotal);
  const ratio = subtotal > 0 ? (subtotal - num(inv.discount)) / subtotal : 1;
  let service = 0;
  let product = 0;
  for (const l of inv.lines || []) {
    const revenue = num(l.amount) * ratio;
    const unitCost = l.cost != null ? num(l.cost) : (l.type === 'product' ? num(Store.find('products', l.refId)?.cost) : 0);
    const profit = revenue - num(l.qty) * unitCost;
    if (l.type === 'service') service += profit;
    else product += profit;
  }
  return { service: round(service), product: round(product), total: round(service + product) };
}

// Sum of invoiceProfit over a list of bills.
export function sumProfit(list) {
  return list.reduce((t, inv) => {
    const p = invoiceProfit(inv);
    t.service += p.service;
    t.product += p.product;
    t.total += p.total;
    return t;
  }, { service: 0, product: 0, total: 0 });
}

export const invoicesInMonth =(month) => liveInvoices().filter((i) => monthOf(i.date) === month);
export { startOfWeek, addDays };
