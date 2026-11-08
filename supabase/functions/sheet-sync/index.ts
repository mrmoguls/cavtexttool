// sheet-sync — returns the Roster and Schedule tabs of the "Master Contact and Schedule" Google
// Sheet to an admin. The app shows a preview of the changes and applies them.
//
// Setup (once):
//   1. Google Cloud console → create a service account → create a JSON key.
//      Enable the "Google Sheets API" for that project.
//   2. Share the Google Sheet with the service account's email as **Viewer**.
//   3. Supabase → Edge Functions → Secrets:
//        GOOGLE_SERVICE_ACCOUNT_JSON = the whole JSON key file
//        SHEET_ID (optional)         = the spreadsheet ID (defaults to the Master Contact sheet)
//   4. Deploy this function as "sheet-sync" with "Verify JWT" ON.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const DEFAULT_SHEET_ID = '1RBSP7__bkn_D5kwlK2CnCfxekQqTR548V8hTDoMyq8A'
const RANGES = ['Roster!A1:F300', 'Schedule!A1:N300']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function googleToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(sig)}` }),
  })
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}). Check the service account key.`)
  return (await res.json()).access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Only admins may read the sheet.
  const auth = req.headers.get('Authorization') ?? ''
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  })
  const { data: isAdmin } = await asCaller.rpc('is_admin')
  if (isAdmin !== true) return json({ error: 'Only admins can sync from the sheet.' }, 403)

  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!raw) return json({ error: 'The sheet sync is not set up yet (GOOGLE_SERVICE_ACCOUNT_JSON secret is missing). See SETUP.md.' }, 500)

  try {
    const token = await googleToken(JSON.parse(raw))
    const id = Deno.env.get('SHEET_ID') || DEFAULT_SHEET_ID
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?` +
      RANGES.map(r => `ranges=${encodeURIComponent(r)}`).join('&')
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 403 || res.status === 404) {
      return json({ error: 'Google says the sheet is not shared with the service account. Share it as Viewer.' }, 502)
    }
    if (!res.ok) return json({ error: `Could not read the sheet (${res.status}).` }, 502)
    const body = await res.json()
    const [roster, schedule] = (body.valueRanges ?? []).map((v: { values?: string[][] }) => v.values ?? [])
    return json({ roster: roster ?? [], schedule: schedule ?? [] })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Sheet sync failed.' }, 500)
  }
})
