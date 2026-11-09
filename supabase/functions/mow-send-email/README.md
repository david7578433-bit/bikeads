# mow-send-email (Supabase Edge Function)

Sends the Media on Wheels emails: "Your bike request was received", "New request" (to you), "Approved", "Declined",
the invoice, and the test email from Admin → Email. The website never holds a mail password.

## Connect your email (about 5 minutes)

1. Deploy the function (once), from this repo folder:
   `supabase functions deploy mow-send-email --project-ref exfszekxbgrtpbgggsin`
   (or Supabase dashboard → Edge Functions → Deploy a new function → name `mow-send-email`, paste `index.ts`).
2. Supabase → Edge Functions → Secrets, add:
   - `MAIL_FROM` — the From address (e.g. your Gmail address)
   - `MAIL_ADMIN_TO` — where "new request" emails go (e.g. david7578433@gmail.com)
   - Gmail: `SMTP_HOST` = smtp.gmail.com, `SMTP_PORT` = 465, `SMTP_USER` = your Gmail address,
     `SMTP_PASS` = a Google **app password** (Google Account → Security → 2-Step Verification → App passwords).
   - Or Resend instead of Gmail: `RESEND_API_KEY` (from resend.com; the From address must be on a domain you verified there).
3. Open the site → Admin → Email → **Send a test email**. It turns green ("Connected").

Until then every email is kept on its booking as "not sent — email not connected"; nothing else changes.
