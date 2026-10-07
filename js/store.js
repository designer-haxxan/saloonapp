// Local data store. Everything lives in one localStorage record (small shop data, works fully offline).
import { uid } from './util.js';

const KEY = 'salonpro.v1';
export const COLLECTIONS = ['services', 'staff', 'customers', 'products', 'bookings', 'appointments', 'invoices', 'payroll', 'expenses'];

export const DEFAULT_SETTINGS = {
  businessName: 'My Salon',
  urduName: '',
  tagline: 'Beauty & Grooming',
  address: '',
  phone: '',
  openTime: '10:00',
  closeTime: '21:00',
  taxPct: 0,
  invoicePrefix: 'INV',
  paymentMethods: ['Cash', 'Card', 'JazzCash', 'EasyPaisa', 'Bank Transfer'],
  footer: 'Shukriya! Please visit again.',
};

let state = null;

function blank() {
  const s = { counters: {}, settings: { ...DEFAULT_SETTINGS } };
  for (const c of COLLECTIONS) s[c] = [];
  return s;
}

export function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
  state = normalize(raw || blank());
  return state;
}

function normalize(s) {
  for (const c of COLLECTIONS) if (!Array.isArray(s[c])) s[c] = [];
  s.counters ||= {};
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  return s;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error(err);
    document.dispatchEvent(new CustomEvent('store:error', { detail: 'Storage is full. Export a backup and remove old data.' }));
  }
}

export const all = (c) => state[c];
export const find = (c, id) => state[c].find((x) => x.id === id) || null;

export function add(c, obj) {
  const now = new Date().toISOString();
  const rec = { id: uid(), createdAt: now, ...obj };
  state[c].push(rec);
  save();
  return rec;
}

export function update(c, id, patch) {
  const rec = find(c, id);
  if (!rec) return null;
  Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
  save();
  return rec;
}

export function remove(c, id) {
  state[c] = state[c].filter((x) => x.id !== id);
  save();
}

// Sequential document numbers, e.g. INV-00012. Counter is saved with the data.
export function nextNo(prefix) {
  const n = (state.counters[prefix] || 0) + 1;
  state.counters[prefix] = n;
  save();
  return `${prefix}-${String(n).padStart(5, '0')}`;
}

export const settings = () => state.settings;
export function setSettings(patch) {
  Object.assign(state.settings, patch);
  save();
}

export function exportAll() {
  return { format: 'salonpro-backup', version: 1, createdAt: new Date().toISOString(), data: state };
}

export function importAll(backup) {
  if (!backup || backup.format !== 'salonpro-backup' || !backup.data) throw new Error('This file is not a Salon Pro backup.');
  state = normalize(backup.data);
  save();
}

export function resetAll() {
  state = blank();
  save();
}

export function seedSample() {
  const svc = (name, category, duration, price) => ({ id: uid(), name, category, duration, price, active: true });
  const services = [
    svc('Haircut (Women)', 'Hair', 45, 1500),
    svc('Haircut (Men)', 'Hair & Barber', 30, 800),
    svc('Beard Trim & Shape', 'Hair & Barber', 20, 400),
    svc('Hair Colour (Global)', 'Hair', 120, 6500),
    svc('Keratin Treatment', 'Hair', 150, 12000),
    svc('Hot Oil Massage', 'Hair', 40, 1200),
    svc('Classic Facial', 'Skin & Facial', 60, 2500),
    svc('Gold Facial', 'Skin & Facial', 75, 4000),
    svc('Full Arms Waxing', 'Waxing', 30, 900),
    svc('Full Legs Waxing', 'Waxing', 45, 1400),
    svc('Manicure', 'Nails', 40, 1000),
    svc('Pedicure', 'Nails', 50, 1300),
    svc('Mehndi (Simple)', 'Mehndi', 60, 2000),
    svc('Bridal Makeup', 'Bridal', 180, 25000),
    svc('Party Makeup', 'Makeup', 60, 5000),
  ];
  const staff = [
    { id: uid(), name: 'Ayesha Khan', role: 'Hair Stylist', phone: '0300-1112233', color: '#b5476b', salary: 30000, commissionPct: 10, shiftStart: '10:00', shiftEnd: '20:00', active: true },
    { id: uid(), name: 'Sana Malik', role: 'Beautician', phone: '0321-4445566', color: '#c99a3c', salary: 26000, commissionPct: 12, shiftStart: '11:00', shiftEnd: '21:00', active: true },
    { id: uid(), name: 'Usman Ali', role: 'Barber', phone: '0333-7778899', color: '#4c7ef3', salary: 25000, commissionPct: 15, shiftStart: '10:00', shiftEnd: '21:00', active: true },
  ];
  const products = [
    { id: uid(), name: 'Keratin Shampoo 500ml', sku: 'SH-001', price: 1800, cost: 1200, stock: 12, minStock: 3 },
    { id: uid(), name: 'Argan Hair Oil 100ml', sku: 'OIL-002', price: 1400, cost: 900, stock: 2, minStock: 3 },
    { id: uid(), name: 'Beard Oil 30ml', sku: 'BO-003', price: 1100, cost: 650, stock: 8, minStock: 2 },
  ];
  state.services.push(...services);
  state.staff.push(...staff);
  state.products.push(...products);
  save();
}
