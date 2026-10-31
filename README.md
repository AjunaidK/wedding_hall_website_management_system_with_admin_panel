# Gul Makkai Palace — Website, Bookings & Business Admin

A website and admin system for **Gul Makkai Palace & Arena** (wedding and event venue, Northern Bypass, Peshawar).

## What's included

### Public website (`/`)
- **Hero:** date checker, key facts and a photo slideshow inside a Mughal-arch frame.
- **About & facilities**, **Halls** (capacity and features), and **Packages & menus** (price per head, dishes, "most popular" badge).
- **Availability calendar:**
  - Each day is marked green (free), amber (some slots booked) or red (full).
  - Click a date to see every hall's **Lunch** and **Dinner** status.
  - Tap a free slot to fill in the booking form.
- **Booking request form:** shows a live price estimate (guests × per-head) and the advance needed. The customer gets a reference such as `GM-4JK6N` and can send it on WhatsApp in one tap.
- **"Check my booking":** the customer enters their reference and phone number and sees the status, total, amount paid and balance.
- **Offers, Gallery** (with zoom) and **Reviews**. Each section appears only once it has content.
- **Contact:** both phone numbers, WhatsApp, a Google map and directions.

### Admin panel (`/admin`)
| Section | What the owner can do |
|---|---|
| **Dashboard** | New requests, upcoming events, events this month, income / expenses / net this month, **balance still to collect**, staff count and monthly salary bill, a 6-month cashflow chart, and the next events. |
| **Bookings** | Filter (upcoming, new requests, this month, past, all), search, and confirm in one click. Open a booking to: edit it, add extras and discounts, **record advance and balance payments**, see total / paid / balance, WhatsApp or call the customer with a ready-written message, cancel, or mark it completed. Export to CSV. |
| **Calendar** | Month view of every booking, coloured by status. Click a day to add a booking for walk-ins and phone calls. |
| **Cashflow** | Every rupee in and out: income and expenses by category (electricity, gas, generator fuel, food supplies, decoration, maintenance and more) and payment method (cash, bank, JazzCash, Easypaisa, cheque). Shows totals, net and a category breakdown for this month, last month, this year or any date range. Booking payments and salaries are added here automatically. Export to CSV. |
| **Payroll** | Pick a month and see each active employee's salary. Add a bonus or a deduction/advance, then **Pay**, which records it and adds it to Cashflow under "Salaries". Undo is available. Shows paid and still-to-pay totals. Export to CSV. |
| **Employees** | Staff records: name, role, phone, CNIC, monthly salary, joining date, status (active/left), address, emergency contact, photo, notes, and full salary history. Export to CSV. |
| **Halls, Packages, Offers, Reviews** | Add and edit everything shown on the website, including multiple photos. |
| **Gallery** | Drag and drop photos. Phone photos are resized automatically. |
| **Settings** | Venue name, phones, WhatsApp, address and map, headline texts, homepage slideshow photos, logo, facilities list, **time slots** (Lunch/Dinner, editable), event types, how far ahead people can book, **advance %**, closed dates, online bookings on/off, colours and social links. |
| **Account** | Change the admin username and password. |

### Team: several admins, one owner
- **The owner (grand admin)** has full access and is the only one who can open **Admins**. From there the owner can:
  - add admins with their own name, username and password
  - tick what each admin may do: bookings & calendar, booking payments, cashflow, payroll, employee records, website content, settings, delete records. There are one-click presets for "Bookings + payments only" and "Everything".
  - reset an admin's password, switch an account off (they're logged out immediately), or hand ownership to someone else
- **Everyone sees the same bookings and records.** Menus and buttons an admin isn't allowed to use are hidden, and the server refuses those actions anyway.
- **Every action is signed:** who booked, confirmed, cancelled or edited a booking (and exactly what changed), who received each payment, who added each expense, who paid each salary, who changed prices, settings, halls or staff.
  - Each booking shows its full **History**.
  - The bookings list shows "by …" under each status.
  - Cashflow has a **By** column.
  - Payroll shows who paid each salary.
- **Activity:** each admin sees **My activity**, a list of everything they've done. The owner sees **everyone's**, can filter by admin or by type, and can export it to CSV.
- Existing databases upgrade automatically: the first admin account becomes the owner.

### Menus on bookings (per-head packages)
- When an admin picks a package on a booking, a **menu pop-up** opens with that package's dishes (from **Packages & menus → Menu items**). Every admin who can handle bookings can use it.
- **Swap a dish:** click ✕ to remove it, then add the new one, either by typing a name or by tapping it in the quick-add list.
- **Price box:** every dish has an extra price, charged **per head** or **per event**. Package dishes start at 0 (included). Any price you enter is added to the booking total, e.g. Mutton Karahi +350/head × 800 guests = +Rs 280,000.
- **Menu dishes** (admin → Website) is the list of dishes and their usual extra charge, which fills in automatically when you add one. The starting prices are placeholders, so set your own.
- Bookings from the website start with the package's dishes. Open the booking and click **Change menu** to adjust it.
- The menu and every extra-charge dish appear on the booking receipt. Changes are recorded in the booking history (who removed or added what, and price changes). A **Menu changes** option is available under "Payment for".

### Add-ons & special arrangements
- **Add-ons & extras** (admin → Website): DJ & sound system, Stage decor, Flower decoration, Special lighting and Separate family arrangement are set up. You can add more or edit them.
  - Each one has a price **per event** or **per head**, or no price, which shows as "price on request".
  - The prices are blank to start; set your own.
- **On the website,** customers tick the extras they want. The estimate adds them up, and a **Special arrangements** box is there for anything else (e.g. naat khwan, a stage theme).
- **In the admin booking form,** tick or untick add-ons. Use "Other extras" to add a price for "on request" items.
- **Recording a payment** asks **what it's for**: Advance, Part payment, Remaining balance, Full payment, any add-on on that booking (e.g. *Stage decor*), Special arrangement or Other. There's also an optional details line, e.g. "red & gold theme".
  - The amount box suggests the right figure: the advance %, the remaining balance, the full total, or the add-on's price.
  - What the payment was for appears on the receipt title ("Stage decor payment receipt"), the booking receipt's payments table, Cashflow, the CSV export and the audit reports.

### Receipts
- **Booking confirmation receipt.** When a booking is confirmed, the admin panel offers "Send confirmation receipt". The receipt shows:
  - customer, event, date and time, hall and guests
  - charges, total, payments received and balance due
  - your terms (edit them in Settings → Receipts)
  - signature boxes for the **Manager** and the **Customer**
- **A receipt for every payment**, each with its own number (R-000001…):
  - booking payments are labelled automatically: **Advance payment**, **Part payment**, **Final payment** or **Full payment**. They show the amount in words (e.g. "Five Lakh Rupees Only"), the total paid so far and the balance remaining.
  - salary receipts show basic pay, bonus, deductions and net, with Manager and Employee signatures
  - every cashflow entry also has a printable receipt (payer or payee signature)
- **Sharing:**
  - **Print / Save as PDF:** A4 layout, one page, ready for both signatures.
  - **Send on WhatsApp:** opens WhatsApp to the customer's number with a ready-written message and a private link to their receipt.
  - **Send by email:** opens your email app with the message filled in.
  - **Copy customer link:** a private link the customer can open and print without logging in. Links can't be guessed.
- Printing and sending receipts is recorded in the booking's history and the activity log.

### Financial reports & audit (Reports & audit page)
- **Day book every evening:** one click prints today's report, with money in and out, totals by payment method (including the cash-in-hand change), totals by category, every entry with its receipt number and who recorded it, booking activity, balances still owed, and **Prepared by / Checked & approved by** signature lines.
- **Monthly, yearly or any date range:** the same report plus a month-by-month table, ready for an income tax officer or an auditor. Use **Print / Save as PDF**, or export every entry to Excel (CSV).
- **Automatic day closing every night at midnight (Pakistan time):**
  - Each finished day is counted, totalled and **sealed with a fingerprint**. If the server was asleep at midnight (e.g. Render free), it catches up as soon as it wakes.
  - After a day is closed, **only the owner** can add, change or delete entries for it. Other admins are refused.
  - Any change made after closing makes the report show **"⚠ Changed after closing"**, with the before and after totals, who changed it and when. Untouched days show **"✔ Day closed and verified unchanged"**.
  - The owner can also **close today early** with one click after the last payment of the day.
- Who can see it: the owner, plus any admin given the **Cashflow** permission.

### Rules built in
- A hall + date + slot can only have **one confirmed booking**. A second confirmation is refused, and that slot shows as "Booked" on the website.
- Pending requests don't block the date (several families can ask), but the slot shows "Requested — ask us".
- You can't delete a booking that has payments (cancel it instead), a hall with bookings (hide it instead), or an employee with salary history (set them to "left").
- Times use **Pakistan time** (Asia/Karachi) wherever the server runs.

## Run it locally
```bash
npm install
npm start
```
- Website: http://localhost:3000
- Admin: http://localhost:3000/admin (first login **admin / changeme123**; change it in Account)

To choose your own first login:
`ADMIN_USER=owner ADMIN_PASSWORD='StrongPass123' npm start`

## Hosting: works free or paid, no code changes needed
Data and **photos are stored in the database**, so you have two options:

**A. Free: Render (free) + Turso (free database)**
1. Create a free database at **turso.tech**. Copy its **Database URL** (starts with `libsql://`) and create an **Auth token**.
2. Push this project to GitHub.
3. On Render, choose **New → Web Service**, pick the repo, set **Build** to `npm install`, **Start** to `npm start`, and **Instance** to **Free**.
4. Add these environment variables:
   | Key | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://…` |
   | `TURSO_AUTH_TOKEN` | your token |
   | `ADMIN_USER` | owner's username |
   | `ADMIN_PASSWORD` | strong password |
5. Free Render services sleep after 15 minutes without visitors. Use a free monitor (e.g. UptimeRobot) to ping `https://YOUR-SITE.onrender.com/health` every 5 minutes so the site stays awake.

**B. Any server or paid host:** run it without the Turso variables and it uses a local file at `data/venue.db`. Back up the `data/` folder regularly.

## First steps for the owner
1. Change the admin password.
2. **Settings:** add the WhatsApp number (e.g. `923229022097`). This turns on all WhatsApp buttons. Upload homepage photos and a logo.
3. **Packages:** replace the placeholder prices and menus (Classic 1,500 / Royal 2,200 / Grand 3,000 per head) with real ones.
4. **Halls:** add photos and the real capacities. Add any other halls or the arena/lawn.
5. **Employees:** add staff with their salaries. Payroll then works each month.
6. **Gallery and Reviews:** add photos from real events and real customer quotes.

## Files
```
server.js   routes, booking rules, payments, cashflow, payroll, CSV export
db.js       database (local file or Turso), tables, first-run data
schema.js   every editable field, categories, payment methods, first-run content
public/     website (index.html, css/site.css, js/site.js) and admin panel (public/admin/)
```
