// send-push — delivers phone notifications. The database calls this (see migration 009)
// whenever something lands in a person's bell, a message arrives, or an announcement is posted.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy new function → name "send-push",
// paste this file, and turn OFF "Verify JWT" (the database calls it with its own secret instead).
// Secrets (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  — from `npx web-push generate-vapid-keys`
//   VAPID_SUBJECT                        — e.g. mailto:you@yourcompany.com (push services contact this if there's a problem)
//   PUSH_WEBHOOK_SECRET                  — any long random string; the same value goes in the push_config table

import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import webpush from 'npm:web-push@3.6.7'

type Payload = { employee_ids: string[]; title: string; body?: string; open?: string; tag?: string }

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
  if (!secret || !timingSafeEqual(req.headers.get('x-push-secret') ?? '', secret)) return json({ error: 'Forbidden' }, 403)

  let p: Payload
  try { p = await req.json() } catch { return json({ error: 'Bad request' }, 400) }
  const ids = Array.isArray(p.employee_ids) ? p.employee_ids.filter(id => /^[0-9a-f-]{36}$/i.test(id)) : []
  if (!ids.length || !p.title) return json({ sent: 0 })

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: subs, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('employee_id', ids)
  if (error) return json({ error: error.message }, 500)

  const message = JSON.stringify({ title: String(p.title).slice(0, 120), body: String(p.body ?? '').slice(0, 240), open: p.open ?? 'notifications', tag: p.tag ?? undefined })
  const gone: string[] = []
  let sent = 0
  await Promise.all((subs ?? []).map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 12 * 60 * 60, urgency: 'high' })
      sent++
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) gone.push(s.id)   // phone unsubscribed or app removed
      else console.error('push failed', code, (err as Error).message)
    }
  }))
  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone)
  return json({ sent, removed: gone.length })
})
