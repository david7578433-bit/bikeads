# BikeAds — bike advertising fleet + BikeAds Deliver (v2 demo)

A simple two-sided web app for a bike-advertising business: every bike carries an ad and a GPS tracker; advertisers ("clients") book bikes.

Live demo: https://bikeads.sites.tab.bot/ and https://david7578433-bit.github.io/bikeads/

In this repo the site lives in `docs/` (GitHub Pages serves that folder).

## Demo logins
- Admin: `admin@bikeads.demo` / `admin123` (runs both the bike ads and BikeAds Deliver)
- Client: `client@bikeads.demo` / `client123`
- Driver: `driver@bikeads.demo` / `driver123` (Yoel, Monroe/KJ) · also `driver2@bikeads.demo` (Shimon, Monroe/KJ) and `driver3@bikeads.demo` (Avrum, Williamsburg), same password
- Store: `store@bikeads.demo` / `store123` (Bakertown Fresh Market, Monroe/KJ) · also `store2@bikeads.demo` (Lee Ave Grocery, Williamsburg), same password
- Boss / dispatch: `boss@bikeads.demo` / `boss123`
- Anyone can create a new client account from the login page. Admin → Deliver → Users & roles adds stores, drivers and bosses.

## BikeAds Deliver (v2): delivery plugins
Local stores hand deliveries to BikeAds riders. Four plugins share one data layer:
- **Driver** (phone first, installable, works with no signal): today's route as an ordered list + map; Start shift turns the phone into the GPS (it moves the driver's bike on the same live map as the trackers); "Scan bags" with the phone camera (QR on the bag label; the phone's own barcode reader where it has one, jsQR otherwise; typed code as fallback) — a bag that belongs to another driver's route beeps red; Start route texts every customer their arrival time; Navigate opens the phone's maps app; Call / Text the customer; I'm here → Delivered with photo + finger signature + cash/card collected, or Couldn't deliver with a reason; My day shows delivered, failed, cash to hand in and pay.
- **Store**: add orders one by one or many at once (CSV/Excel file or paste from Excel; columns are auto-detected); addresses are pinned on the map; print bag labels with QR codes (one per bag); each order's live status, driver and ETA; proof (photo, signature, amount collected); history by day/week/month with CSV export; billing (price, unbilled charges, invoices, cash collected for the store).
- **Boss / dispatch**: live dispatch map of all drivers (and the ad bikes, optional); one click builds routes for the day — stops are split across the working drivers per area (sweep), each route is ordered by nearest neighbour + 2-opt, and the order that keeps the most customers inside their delivery window wins; drag a stop to another driver (computer) or "Move to…" (phone), ▲▼ to re-order, re-plan from the driver's position; late and failed list; end of day per driver and per store (delivered, failed, late, cash, card, charges, driver pay) with CSV; "Try again tomorrow" for failed stops; Money: price per store, invoices to stores (Mark paid → Books "Delivery income"), driver pay (→ Books "Driver pay").
- **Admin** (Admin → Deliver tab): overview + live map, every order with its proof, stores, drivers (linked to a bike), users and roles, prices and routing settings, plugins on/off, customer text templates + the "would send" log, and the "Connect later" list. "Open a plugin" shows exactly what a boss/store/driver sees, with a bar back to Admin.

### What is simulated in the Deliver demo
- **Customer texts**: written from the templates and kept in a log as "would send"; nothing is sent until a texting number is connected.
- **Data**: like v1, everything lives in this browser (localStorage), so each phone has its own copy — a driver's phone and the boss's computer do not see each other's changes until the shared database is connected (`js/data.js` adapter). Photos are shrunk to about 40 KB; past 3.5 MB the oldest door photos (over a week) are dropped, signatures stay.
- **Driver positions**: real phone GPS while a shift is on (browser geolocation); without it the demo moves the driver along the route.
- **Addresses**: pinned with OpenStreetMap's free search (Nominatim, one request per second); an address it cannot find gets an approximate pin that dispatch can drag ("Fix pin"). Routes use straight-line distance × a street detour factor (no paid map key).
- **Payments at the door**: the driver records cash/card collected; no card is charged.
- Every new day the demo replaces yesterday's untouched sample orders with 25 fresh ones (Monroe/KJ + Williamsburg), with windows starting about an hour ahead.

## What it does
**Admin**
- **Map** — pick a location (Williamsburg, Monroe / KJ, Borough Park, Lakewood, Monsey, or all; the list is editable under "Locations"). Street map (OpenStreetMap) shows each bike with a **red flag** (advertising company) and a **blue flag** (marketing company). Raise/lower each flag on its own (tap the flag, the bike's popup, or the list), or all flags / all red / all blue at once. "Move bikes" lets the admin drag a bike to place it by hand.
- **Bikes** — add a tracker (tracker ID / IMEI) and name it by bike number; set its location and both flag names; edit or delete.
- **Bookings** — calendar view and list view. Requests waiting for approval are on top with Approve / Decline. History is kept (every change is logged on the booking); any booking can be added or edited by hand.
- **Books** — bookkeeping: money in / out with date, description, category and optional linked booking; running bank balance; tick transactions as reconciled; a reconcile screen against a bank statement's ending balance; search and filters; CSV export. Approving a booking with a paid deposit adds the deposit to the books automatically.
- **Settings** — business name, price per bike per day, deposit percent (20 by default), bank opening balance, reset demo data.

**Client**
- **Map** — first choose a location, then see that area's street map with every bike and its red/blue flags (each flag or all flags up/down).
- **Book** — tap a start day → "Book from this day" → pick the last day ("Till what day?", or 1 week / 2 weeks / 30 days) → choose bike numbers, or "Any 5" / "Any 10" available → deposit screen with 20% of the total → request is sent as **Pending** until the admin approves.
- **My bookings** — status of every request; a pending request can be cancelled.

## What is simulated in v1
- **GPS positions**: `js/trackers.js` runs a simulator (bikes drift slowly around their location) until real trackers are connected. Positions are matched to bikes by tracker ID, so plugging in a real feed is one provider: see the `TraccarProvider` sketch in that file. Most GPS tracker brands can report to a Traccar server, or a vendor webhook can post positions to a small server that the provider reads.
- **Payments**: the deposit screen is a demo; no card is charged and no card details are asked for. To take real deposits, create a Stripe account and, on submit, call a small server endpoint that creates a Stripe Checkout Session for the deposit amount (`mode: "payment"`) and redirects to it; Stripe's webhook (`checkout.session.completed`) marks the booking `depositPaid: true`. Card data never touches this app.
- **Data**: everything is saved in the browser (localStorage), so each phone or computer has its own copy. All reads/writes go through `js/data.js` (`Data`); replace `LocalAdapter` with a `RemoteAdapter` that talks to a shared database (e.g. Supabase/Firebase/Postgres API) and the rest of the app stays the same. Demo passwords are stored in plain text in the browser — fine for a demo, not for production (a real backend handles sign-in).

## Files
- `site/` (= `docs/` in the GitHub repo): `index.html`, `site/styles.css` — page and styles (system fonts, mobile first)
- `site/js/data.js` — data layer + demo seed (12 bikes, 3 advertisers, bookings, transactions)
- `site/js/trackers.js` — tracker feed (simulator now, real provider later)
- `site/js/ui.js` — map with flags, calendar, dialogs
- `site/js/admin.js`, `site/js/client.js`, `site/js/app.js` — the two sides and the app shell
- `site/js/deliver-core.js` (routing, ETAs, Excel/CSV parsing, text templates), `deliver-seed.js` (demo data), `deliver.js` (delivery logic), `deliver-ui.js` (route map, labels, proof, scanner, signature pad), `driver.js`, `store.js`, `boss.js`, `platform.js` (Admin → Deliver) and `site/deliver.css`
- `site/sw.js` + `site/manifest.webmanifest` + `site/icons/` — installable app that opens with no signal
- `site/vendor/qrcode` (qrcode-generator, MIT), `site/vendor/jsqr` (jsQR, Apache-2.0, loaded only when scanning), `site/vendor/xlsx` (SheetJS CE mini, Apache-2.0, loaded only for Excel files)
- `site/vendor/leaflet/` — Leaflet 1.9.4 (BSD-2), served locally
- `test/` — `node --test`

Map tiles © OpenStreetMap contributors. For heavy traffic use a tile provider with a key (MapTiler, Stadia, etc.) per OSM's tile policy.
