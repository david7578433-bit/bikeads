# Media on Wheels — going to production

Status (Nov 8, 2026): branch `production-prep`. All test / demo members and demo logins are removed, the real
sign-in (email + password and "Continue with Google") and the shared database are in the code, and the site is
ready for Google search. Until the database keys are added, the site keeps working in "this device" mode
(accounts and data are saved in each browser only), so nothing breaks before the keys arrive.

## 1. The database (Supabase)

For now Media on Wheels lives inside one of David's existing Supabase projects (his free plan already has 2
projects). Every table, function, policy and trigger it adds is named `mow_…`, so it sits safely beside the other
app's tables. Later it moves to the client's own project: see `supabase/MOVE.md`.

1. Supabase dashboard → open the project → **SQL Editor** → New query → paste all of `supabase/schema.sql` → **Run**.
   It only ADDS `mow_` things (no DROP, nothing of the other app is changed). Safe to run twice.
2. **Project Settings → API**: copy the **Project URL** and the **anon public / publishable** key.
3. In `docs/js/config.js` paste them:
   `SUPABASE_URL: 'https://xxxx.supabase.co'`, `SUPABASE_ANON_KEY: '…'`.
   Never paste the `service_role` / secret key into the site.
4. **Authentication → URL Configuration → Redirect URLs**: ADD (do not replace the other app's Site URL):
   - `https://david7578433-bit.github.io/bikeads/`
   - `https://bikeads.sites.tab.bot/`
   - `https://mediaonwheels-preview.sites.tab.bot/`
   - `https://mediaonwheelsnyc.com/` and `https://www.mediaonwheelsnyc.com/` (the chosen domain)
5. **Authentication → Emails** (optional): the confirmation / reset emails use the project's template; if the
   project is shared, keep the wording general or turn "Confirm email" off for now.
6. David signs up with **david7578433@gmail.com** (email or Google) → he is the admin automatically
   (table `mow_admin_emails`). Everyone else who signs up is a client.

Note while the project is shared: sign-in accounts (auth users) belong to the whole project, so a person who
already has an account in the other app can log in to Media on Wheels with it (they get a client profile and see
nothing of anyone else). The other app does not see Media on Wheels data.

## 2. Google sign-in

1. https://console.cloud.google.com → create (or pick) a project → **APIs & Services → OAuth consent screen**:
   External, app name "Media on Wheels", support email, logo optional → Publish.
2. **Credentials → Create credentials → OAuth client ID** → Web application.
   - Authorized JavaScript origins: `https://david7578433-bit.github.io`, `https://mediaonwheelsnyc.com`, `https://www.mediaonwheelsnyc.com`
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase shows it on the Google provider page)
3. Copy the **Client ID** and **Client secret** into Supabase → **Authentication → Providers → Google** → Enable → Save.
   (The secret goes ONLY into Supabase, never into the site.)
4. The "Continue with Google" button works from then on. Before that it shows "not configured yet".

## 3. Google search

Already in the site: title, description, canonical address, Open Graph / social preview image
(`media/og-image.jpg`), structured data (LocalBusiness + Service, Williamsburg & Boro Park, 6 days a week —
not on Shabbos), `robots.txt`, `sitemap.xml`, favicon.

1. https://search.google.com/search-console → Add property → URL prefix → the site address.
2. Pick "HTML tag", copy the `google-site-verification` code into `docs/index.html` (placeholder comment is there),
   push, then press Verify.
3. Sitemaps → submit `sitemap.xml`.
4. Optional but strong for local search: a free **Google Business Profile** for Media on Wheels
   (service-area business, areas Williamsburg + Borough Park, hours Sunday–Friday).

## 4. Own domain: mediaonwheelsnyc.com (chosen Nov 8, NOT bought yet)

The site already names `https://mediaonwheelsnyc.com/` as its address (canonical, og:url, structured data,
robots.txt, sitemap.xml, js/config.js). There is deliberately NO `docs/CNAME` file yet: adding it before the DNS
exists would send the github.io site to a domain that does not answer.

After the domain is bought:

1. At the registrar's DNS:
   - `A` records, host `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - optional `AAAA`, host `@`: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `CNAME` record, host `www` → `david7578433-bit.github.io`
   - remove any registrar "parking" / forwarding records for `@` and `www`
2. Add the file `docs/CNAME` with exactly one line: `mediaonwheelsnyc.com` (push to main).
3. GitHub → repo **Settings → Pages** → Custom domain `mediaonwheelsnyc.com` → Save → when the DNS check is green,
   tick **Enforce HTTPS** (the certificate can take up to ~1 hour). `www` then forwards to the bare domain.
   Recommended: verify the domain under GitHub account **Settings → Pages → Verified domains** (stops take-overs).
4. Add the domain to Supabase Redirect URLs and the Google OAuth origins (above), then Search Console (§3).
5. Optional: change og:image / logo in index.html to the new domain (they work either way).

## Still demo (not changed here)

- Payments: card / Google Pay / Apple Pay are demo (nothing is charged). Real ones need a payment account (e.g. Stripe).
  Zelle needs David's Zelle name + email/phone in Admin → Settings.
- Main page stats / reviews / story are SAMPLE (marked) until real ones are given.
- Prices are SAMPLE (75 dollars printing & setup per bike, 150 dollars per bike per week) until David sets real ones.
- GPS trackers: simulator until the tracker brand / IDs are known.
- An uploaded main-page video is saved in that browser only (a pasted link works for everyone).
- Delivery business: saved in the code behind `FEATURES.delivery = false`. Its logins (driver / store / boss) will need
  Supabase invites when it is turned on.
