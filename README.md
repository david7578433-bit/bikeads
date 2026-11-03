# BikeAds — bike advertising fleet (v1 demo)

A simple two-sided web app for a bike-advertising business: every bike carries an ad and a GPS tracker; advertisers ("clients") book bikes.

Live demo: https://bikeads.sites.tab.bot/ and https://david7578433-bit.github.io/bikeads/

In this repo the site lives in `docs/` (GitHub Pages serves that folder).

## Demo logins
- Admin: `admin@bikeads.demo` / `admin123`
- Client: `client@bikeads.demo` / `client123`
- Anyone can create a new client account from the login page.

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
- `site/vendor/leaflet/` — Leaflet 1.9.4 (BSD-2), served locally
- `test/` — `node --test`

Map tiles © OpenStreetMap contributors. For heavy traffic use a tile provider with a key (MapTiler, Stadia, etc.) per OSM's tile policy.
