import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const base64url = (value: Uint8Array | string) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  let binary = ''
  bytes.forEach((byte) => binary += String.fromCharCode(byte))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

const importPrivateKey = async (pem: string) => {
  const raw = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
  const bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

let cachedToken = ''
let tokenExpiresAt = 0

const getGoogleToken = async () => {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken
  const credentials = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') || '{}')
  if (!credentials.client_email || !credentials.private_key) throw new Error('Google-palvelutilin avain puuttuu')

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${claim}`
  const key = await importPrivateKey(credentials.private_key)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const assertion = `${unsigned}.${base64url(new Uint8Array(signature))}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error_description || 'Google-kirjautuminen epäonnistui')
  cachedToken = result.access_token
  tokenExpiresAt = Date.now() + Number(result.expires_in || 3600) * 1000
  return cachedToken
}

const addMinutes = (date: string, time: string, minutes: number) => {
  const value = new Date(`${date}T${time.slice(0, 5)}:00Z`)
  value.setUTCMinutes(value.getUTCMinutes() + minutes)
  return value.toISOString().slice(0, 19)
}

const googleRequest = async (path: string, init: RequestInit = {}) => {
  const token = await getGoogleToken()
  return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
}

const findGoogleEvents = async (calendarId: string, rideId: string) => {
  const response = await googleRequest(`/calendars/${calendarId}/events?privateExtendedProperty=${encodeURIComponent(`rideId=${rideId}`)}&singleEvents=true&maxResults=10`)
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message || `Google-haku epäonnistui (${response.status})`)
  return Array.isArray(result.items) ? result.items : []
}

export default {
async fetch(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = request.headers.get('Authorization') || ''
    if (!authHeader) return json({ error: 'Kirjautuminen puuttuu' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const secretKey = Deno.env.get('KYYDIT_SUPABASE_SECRET_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Kirjautuminen ei kelpaa' }, 401)

    const { data: profile } = await userClient.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'dispatcher'].includes(profile.role)) return json({ error: 'Ei muokkausoikeutta' }, 403)

    const { action, rideId } = await request.json()
    if (!['upsert', 'delete'].includes(action) || !rideId) return json({ error: 'Virheellinen pyyntö' }, 400)

    const admin = createClient(supabaseUrl, secretKey)
    const { data: ride, error: rideError } = await admin.from('rides').select('*').eq('id', rideId).single()
    if (rideError || !ride) return json({ error: rideError?.message || 'Kyytiä ei löytynyt' }, 404)

    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID')
    if (!calendarId) throw new Error('Google-kalenterin tunniste puuttuu')
    const encodedCalendar = encodeURIComponent(calendarId)

    if (action === 'delete') {
      const events = await findGoogleEvents(encodedCalendar, String(ride.id))
      for (const event of events) {
        const response = await googleRequest(`/calendars/${encodedCalendar}/events/${encodeURIComponent(event.id)}?sendUpdates=none`, { method: 'DELETE' })
        if (!response.ok && response.status !== 404) throw new Error(`Google-poisto epäonnistui (${response.status})`)
      }
      return json({ ok: true })
    }

    const timeZone = Deno.env.get('GOOGLE_TIME_ZONE') || 'Europe/Helsinki'
    const duration = Math.max(5, Number(Deno.env.get('GOOGLE_EVENT_DURATION_MINUTES') || 60))
    const event = {
      summary: `Kyyti: ${ride.customer}`,
      location: ride.pickup,
      description: [
        `Nouto: ${ride.pickup}`,
        `Määränpää: ${ride.destination}`,
        ride.phone && `Puhelin: ${ride.phone}`,
        ride.notes && `Lisätiedot: ${ride.notes}`,
      ].filter(Boolean).join('\n'),
      start: { dateTime: `${ride.ride_date}T${ride.ride_time.slice(0, 5)}:00`, timeZone },
      end: { dateTime: addMinutes(ride.ride_date, ride.ride_time, duration), timeZone },
      extendedProperties: { private: { rideId: ride.id } },
    }

    const matches = await findGoogleEvents(encodedCalendar, String(ride.id))
    let response: Response
    if (matches[0]?.id) {
      response = await googleRequest(`/calendars/${encodedCalendar}/events/${encodeURIComponent(matches[0].id)}?sendUpdates=none`, { method: 'PUT', body: JSON.stringify(event) })
    } else {
      const eventId = String(ride.id).replaceAll('-', '').toLowerCase()
      response = await googleRequest(`/calendars/${encodedCalendar}/events?sendUpdates=none`, { method: 'POST', body: JSON.stringify({ ...event, id: eventId }) })
    }
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message || `Google-päivitys epäonnistui (${response.status})`)

    return json({ ok: true, eventId: result.id })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Tuntematon virhe' }, 500)
  }
}
}
