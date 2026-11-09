// Media on Wheels — send one email (Supabase Edge Function "mow-send-email").
// The website calls it with the signed-in person's session. NO password or key is in the website or in this file:
// the mail account comes from this function's secrets (Supabase → Edge Functions → Secrets):
//   MAIL_FROM        the From address, e.g. david7578433@gmail.com (Gmail) or bookings@mediaonwheelsnyc.com (Resend)
//   MAIL_ADMIN_TO    where "new request" emails go, e.g. david7578433@gmail.com
//   and EITHER  RESEND_API_KEY  (resend.com)
//   OR          SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS   (Gmail: smtp.gmail.com, 465, your Gmail, an "app password")
// Rules: an admin (mow_is_admin) may send any email. A client may only send "requested" to their OWN email address
// and "newRequest" to MAIL_ADMIN_TO. Without the secrets it answers { ok: false, error: "email not connected" }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const env = (k: string) => (Deno.env.get(k) || "").trim();
const okEmail = (s: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "use POST" }, 405);
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
  const { data: who } = await sb.auth.getUser();
  if (!who || !who.user) return json({ ok: false, error: "please sign in" }, 401);
  const { data: isAdmin } = await sb.rpc("mow_is_admin");

  let b: Record<string, string> = {};
  try { b = await req.json(); } catch { return json({ ok: false, error: "bad request" }, 400); }
  const kind = String(b.kind || "");
  let to = String(b.to || "").trim().toLowerCase();
  const subject = String(b.subject || "").slice(0, 200);
  const text = String(b.text || "").slice(0, 8000);
  const fromName = String(b.fromName || "Media on Wheels").replace(/[<>"\r\n]/g, "").slice(0, 80);
  const replyTo = String(b.replyTo || "").trim();
  if (!isAdmin) {
    if (kind === "requested") to = String(who.user.email || "").toLowerCase();
    else if (kind === "newRequest") to = env("MAIL_ADMIN_TO").toLowerCase();
    else return json({ ok: false, error: "not allowed" }, 403);
  }
  if (!okEmail(to) || !subject) return json({ ok: false, error: "no email address" }, 400);

  const from = env("MAIL_FROM");
  if (!from || !(env("RESEND_API_KEY") || env("SMTP_HOST"))) return json({ ok: false, error: "email not connected" }, 503);
  try {
    if (env("RESEND_API_KEY")) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + env("RESEND_API_KEY"), "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromName + " <" + from + ">", to: [to], subject, text, ...(okEmail(replyTo) ? { reply_to: replyTo } : {}) }),
      });
      if (!r.ok) return json({ ok: false, error: "mail service said " + r.status }, 502);
    } else {
      const port = Number(env("SMTP_PORT") || "465");
      const client = new SMTPClient({ connection: { hostname: env("SMTP_HOST"), port, tls: port === 465, auth: { username: env("SMTP_USER"), password: env("SMTP_PASS") } } });
      await client.send({ from: fromName + " <" + from + ">", to, subject, content: text, ...(okEmail(replyTo) ? { replyTo } : {}) });
      await client.close();
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "could not send (" + String((e && (e as Error).message) || e).slice(0, 120) + ")" }, 502);
  }
});
