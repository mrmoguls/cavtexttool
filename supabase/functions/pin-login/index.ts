// pin-login — signs an employee in with their name + 4-digit PIN (last 4 of their phone).
//
// Supabase Auth needs a strong password, so the PIN is only checked here. Once it matches,
// this function signs the person in with a long password derived on the server
// (HMAC of their employee id) and hands the session back to the app.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy new function → name "pin-login",
// paste this file, and turn OFF "Verify JWT" (people aren't signed in yet when they call it).
// Optional secret: PIN_LOGIN_SECRET (any long random string). Falls back to the service role key.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const MAX_FAILURES = 5
const LOCKOUT_MINUTES = 15

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function derivePassword(employeeId: string): Promise<string> {
  const secret = Deno.env.get('PIN_LOGIN_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`cav-login:${employeeId}`))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let employeeId = '', pin = ''
  try {
    const body = await req.json()
    employeeId = String(body.employee_id ?? '')
    pin = String(body.pin ?? '')
  } catch {
    return json({ error: 'Bad request' }, 400)
  }
  if (!/^[0-9a-f-]{36}$/i.test(employeeId) || !/^\d{4}$/.test(pin)) {
    return json({ error: 'Enter your 4-digit PIN.' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // Lockout check
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000).toISOString()
  const { data: recent } = await admin
    .from('login_attempts')
    .select('succeeded, attempted_at')
    .eq('employee_id', employeeId)
    .gte('attempted_at', since)
    .order('attempted_at', { ascending: false })
    .limit(MAX_FAILURES)
  const recentFailures = (recent ?? []).findIndex(r => r.succeeded)
  const failuresInRow = recentFailures === -1 ? (recent ?? []).length : recentFailures
  if (failuresInRow >= MAX_FAILURES) {
    return json({ error: `Too many wrong tries. Wait ${LOCKOUT_MINUTES} minutes or call dispatch.` }, 429)
  }

  const { data: emp } = await admin
    .from('employees')
    .select('id, active, auth_user_id, employee_contacts(phone)')
    .eq('id', employeeId)
    .maybeSingle()
  if (!emp || !emp.active) return json({ error: 'Account not found. Ask dispatch.' }, 404)

  const contact = Array.isArray(emp.employee_contacts) ? emp.employee_contacts[0] : emp.employee_contacts
  const digits = String(contact?.phone ?? '').replace(/\D/g, '')
  if (digits.length < 4) {
    return json({ error: "No phone number on file yet. Ask dispatch to add it." }, 409)
  }

  const ok = timingSafeEqual(digits.slice(-4), pin)
  await admin.from('login_attempts').insert({ employee_id: employeeId, succeeded: ok })
  if (!ok) return json({ error: 'Wrong PIN. It is the last 4 digits of your phone number.' }, 401)

  const email = `${employeeId}@employees.careavan.invalid`
  const password = await derivePassword(employeeId)

  // Create the login the first time, or keep its password in sync.
  let authUserId = emp.auth_user_id as string | null
  if (!authUserId) {
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !created.user) return json({ error: 'Could not create login. Ask dispatch.' }, 500)
    authUserId = created.user.id
    await admin.from('employees').update({ auth_user_id: authUserId }).eq('id', employeeId)
  }

  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
  let { data: signed, error: signErr } = await anon.auth.signInWithPassword({ email, password })
  if (signErr) {
    await admin.auth.admin.updateUserById(authUserId, { email, password, email_confirm: true })
    ;({ data: signed, error: signErr } = await anon.auth.signInWithPassword({ email, password }))
  }
  if (signErr || !signed.session) return json({ error: 'Sign-in failed. Try again.' }, 500)

  return json({
    access_token: signed.session.access_token,
    refresh_token: signed.session.refresh_token,
  })
})
