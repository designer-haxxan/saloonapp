# Salon Pro — Parlor & Barber management

Offline-first web app (installable PWA) for beauty parlors and barber shops in Pakistan.
No build step: plain HTML, ES modules, CSS. All data stays on the device.

## Screens

| Screen | What it does |
|---|---|
| **Home** | Today's bookings, sales today / this month, money to collect, 7-day sales chart, upcoming bookings, team today, low stock |
| **Calendar** | Day view with one column per staff member (shift hatching, now-line, tap an empty slot to book). Week view. Staff filter |
| **Bookings** | Single appointments or **multi-day packages** (e.g. bridal: trial, mehndi, wedding day) grouped under one booking name |
| **New Bill** | Services and products, staff who performed each service, discount (Rs or %), sales tax (optional), tip and who gets it, part payments, payment method |
| **Invoices** | List with filters, printable receipt, record later payments, WhatsApp the receipt, void (restores stock) |
| **Services** | Price, duration, category, active/inactive |
| **Staff** | Role, shift, monthly salary, commission %, calendar colour |
| **Customers** | History, total spent, balance due, notes, WhatsApp button |
| **Products** | Retail stock with quick +/− and low-stock alerts |
| **Payroll** | Monthly salary + commission (from billed services) + tips − advances − deductions, pay, printable payslip |
| **Reports** | Sales, payment methods, staff and service performance, expenses, estimated profit, CSV export |
| **Settings** | Business profile (name, Urdu name, address, phone, receipt footer), opening hours, sales tax, invoice prefix, payment methods, backup/restore, sample data, erase |

## Pakistan-specific details

- Amounts shown as `Rs 2,500` (en-PK grouping).
- Phone numbers like `0300-1234567` are turned into `wa.me/923001234567` links for WhatsApp.
- Default payment methods: Cash, Card, JazzCash, EasyPaisa, Bank Transfer (editable).
- Optional Urdu business name on receipts, Nastaleeq font on the splash screen.

## Scheduling rules

- A booking clash (same staff member, overlapping time on the same day) asks for confirmation.
- Overlaps inside one multi-day booking are flagged too.
- Bookings outside opening hours ask for confirmation.
- Cancelled bookings never block a slot. No-shows do.

## Billing rules

- Subtotal − discount = taxable amount. Sales tax (if set) is applied to that.
- Tip is kept out of sales and paid to the staff member chosen on the bill.
- Paid now can be less than the total. The rest shows as balance on the customer's invoice.
- Product lines reduce stock in the same save. Billing more than is in stock is refused.
- Billing an appointment marks it **done** and links the invoice back to it.

## Running it

From the project root:

```bash
python -m http.server 8766 --directory salon-app
```

Then open http://localhost:8766. On a phone, use HTTPS (for example GitHub Pages) so the app can be installed and works offline.

The `.claude/launch.json` file already has a `salonpro` entry for the same command.

## Data

- Stored in `localStorage` under the key `salonpro.v1`. Browsers allow roughly 5 MB per site, which is enough for years of a small shop's records. The app warns if storage fills.
- **Settings → Backup** downloads a JSON file. **Restore** replaces all data after confirmation. Back up regularly.
- Multiple phones do not sync. Each device has its own data. Use one device as the shop's main device, or restore the same backup on another device.

## Known limits

- No automatic SMS or WhatsApp sending. Reminders open WhatsApp with the message ready to send.
- No staff logins or PINs yet. Anyone with the device can open the app.
- Commission is calculated on the amount of each service line before the bill's discount.
- Profit is an estimate. For formal accounts, use an accountant.
- Urdu is supported in names, receipts and the splash screen. The menus and labels are in English.

## Files

```
index.html               App shell
manifest.json            PWA manifest
service-worker.js        Offline cache (bump VERSION when shell files change)
css/style.css            Theme (light/dark), animations, print styles
icons/icon.svg           App icon
js/app.js                Router, navigation, boot
js/store.js              Data layer (localStorage), backup, sample data
js/domain.js             Shared business rules: balances, statuses, clash checks
js/util.js               Formatting, dates, WhatsApp links, modals, print
js/views/*.js            One file per screen
```
