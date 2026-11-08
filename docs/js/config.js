/* Media on Wheels: feature switches and connection settings.
 * delivery — the separate DELIVERY business (drivers, stores, boss/dispatch, delivery orders, tracking,
 *   customer texts, invoices). Saved in the code, OFF for now (David, Nov 4 2026): no delivery pages, tabs,
 *   roles, logins or mentions show while this is false. Set it to true to bring all of it back.
 *   Nothing is deleted either way. */
window.FEATURES = Object.freeze({
  delivery: false
});

/* SHARED DATABASE + SIGN-IN (Supabase). Paste the two values from Supabase → Project Settings → API:
 *   SUPABASE_URL      = "Project URL", e.g. https://abcdefghijklmnop.supabase.co
 *   SUPABASE_ANON_KEY = the "anon public" / "publishable" key (safe to publish; NEVER the service_role / secret key)
 * Then run supabase/schema.sql once in the Supabase SQL editor, and turn on Google under Authentication → Providers
 * (steps in PRODUCTION.md). While both are empty the site keeps working in "this device" mode: accounts and data
 * are saved in each browser only, exactly like before. */
window.SUPABASE = Object.freeze({
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  /* supabase-js, loaded from the CDN only when the keys above are set (pinned version + integrity hash). */
  libUrl: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js',
  libIntegrity: 'sha384-uteMfOloLDGt042uDz+xHGF3ym63/WQ6rFq7murQRG8Ih7QrXGEGNtWd8688sb4O',
  /* Google sign-in shows as ready once the keys are set AND the Google provider is turned on in Supabase. */
  google: true
});

/* The site's public address: the chosen own domain (Nov 8 2026, not bought / connected yet). Today the site also
 * runs at https://david7578433-bit.github.io/bikeads/ and https://bikeads.sites.tab.bot/ . */
window.SITE = Object.freeze({
  url: 'https://mediaonwheelsnyc.com/',
  /* Emails that get the Admin role. In the database this list lives in the table mow_admin_emails (schema.sql);
   * in "this device" mode this list is used. */
  adminEmails: ['david7578433@gmail.com']
});
