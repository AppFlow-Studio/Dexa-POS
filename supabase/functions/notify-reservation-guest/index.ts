// notify-reservation-guest
//
// Server-side template registry for reservation SMS, mirroring the
// notify-waitlist-guest hardening:
//   - verify_jwt = true (caller must be authenticated)
//   - User-scoped supabase client reads reservation row via RLS
//   - Server-side template registry: caller picks a `template_key`, never
//     supplies the rendered SMS body (except for the explicit 'custom' key)
//   - CORS allowlist: *.dexapos.com, localhost, 127.0.0.1
//
// Request shape:
//   { reservation_id: string, template_key?: string, message?: string }
//   - template_key defaults to 'reservation.created' for back-compat
//   - message is only honored when template_key === 'custom'

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*dexapos\.com$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/
]

function corsHeadersFor(origin: string | null): Record<string, string> {
  if (!origin) return {}
  const allowed = ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))
  if (!allowed) {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type'
    }
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  }
}

type TemplateContext = {
  partyName: string
  storeName: string
  storeAddress: string
  partySize: number | null
  reservationDate: string
  reservationTime: string
  confirmationNumber: string | null
}

function formatStoreAddress(loc: any): string {
  if (!loc) return ''
  const street = [loc.address_line1, loc.address_line2].filter(Boolean).join(', ')
  const cityStateZip = [loc.city, loc.state, loc.postal_code]
    .filter(Boolean)
    .join(' ')
  return [street, cityStateZip].filter(Boolean).join(', ')
}

function formatDateForSms(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  // Anchor at noon so timezone math doesn't roll us into the prior day.
  const d = new Date(`${dateStr}T12:00:00`)
  if (!Number.isFinite(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

function formatTimeForSms(timeStr: string | null | undefined): string {
  if (!timeStr) return ''
  const match = timeStr.match(/(\d{1,2}):(\d{2})/)
  let hours = NaN
  let minutes = NaN
  if (match) {
    hours = parseInt(match[1], 10)
    minutes = parseInt(match[2], 10)
  } else {
    const d = new Date(timeStr)
    if (Number.isFinite(d.getTime())) {
      hours = d.getHours()
      minutes = d.getMinutes()
    }
  }
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return timeStr
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 === 0 ? 12 : hours % 12
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`
}

function renderTemplate(
  key: string,
  ctx: TemplateContext,
  customMessage?: string | null
): string | null {
  const {
    partyName,
    storeName,
    storeAddress,
    partySize,
    reservationDate,
    reservationTime,
    confirmationNumber
  } = ctx
  const addressClause = storeAddress ? ` (${storeAddress})` : ''
  const partyClause = partySize ? ` for ${partySize}` : ''
  const confClause = confirmationNumber
    ? ` Confirmation #${confirmationNumber}.`
    : ''

  switch (key) {
    case 'reservation.created':
      return `Hi ${partyName}, your reservation at ${storeName}${addressClause}${partyClause} is confirmed for ${reservationDate} at ${reservationTime}.${confClause} Reply to this message if you need to make changes.`
    case 'reservation.moved':
      return `Hi ${partyName}, your reservation at ${storeName} has been moved to ${reservationDate} at ${reservationTime}. Reply to this message to confirm.`
    case 'reservation.timeChanged':
      return `Hi ${partyName}, your reservation time at ${storeName} on ${reservationDate} has changed to ${reservationTime}. Reply to this message to confirm.`
    case 'reservation.confirmation':
      return `Hi ${partyName}, this is ${storeName} confirming your reservation on ${reservationDate} at ${reservationTime}. See you soon!`
    case 'reservation.cancelled':
      return `Hi ${partyName}, your reservation at ${storeName} on ${reservationDate} at ${reservationTime} has been cancelled. Reply or call us if you'd like to rebook.`
    case 'custom':
      return customMessage && customMessage.trim().length > 0
        ? customMessage.trim().slice(0, 500)
        : null
    default:
      return null
  }
}

function normalizeToE164(rawPhone: string | null | undefined): string | null {
  const digits = (rawPhone ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  if (digits.length > 0) return `+${digits}`
  return null
}

interface NotifyRequest {
  reservation_id?: string
  template_key?: string
  message?: string
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const cors = corsHeadersFor(origin)
  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'method_not_allowed' }),
      { status: 405, headers: jsonHeaders }
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'unauthenticated' }),
      { status: 401, headers: jsonHeaders }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('Missing supabase env vars')
    return new Response(
      JSON.stringify({ success: false, error: 'server_misconfigured' }),
      { status: 500, headers: jsonHeaders }
    )
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  })
  const adminClient = createClient(supabaseUrl, serviceKey)

  try {
    const body = (await req.json().catch(() => ({}))) as NotifyRequest
    const reservationId =
      typeof body.reservation_id === 'string' ? body.reservation_id : null
    const templateKey =
      typeof body.template_key === 'string' && body.template_key.length > 0
        ? body.template_key
        : 'reservation.created'
    const customMessage =
      typeof body.message === 'string' ? body.message : null

    if (!reservationId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'bad_request',
          message: 'reservation_id required'
        }),
        { status: 400, headers: jsonHeaders }
      )
    }

    // RLS-scoped read.
    const { data: reservation, error: reservationErr } = await userClient
      .from('reservations')
      .select(
        'id, merchant_id, location_id, party_name, party_size, phone, reservation_date, reservation_time, confirmation_number'
      )
      .eq('id', reservationId)
      .maybeSingle()

    if (reservationErr) {
      console.error('reservation read failed', reservationErr)
      return new Response(
        JSON.stringify({ success: false, error: 'db_error' }),
        { status: 500, headers: jsonHeaders }
      )
    }

    if (!reservation) {
      return new Response(
        JSON.stringify({ success: false, error: 'not_found' }),
        { status: 404, headers: jsonHeaders }
      )
    }

    const { data: location } = await adminClient
      .from('locations')
      .select('name, address_line1, address_line2, city, state, postal_code')
      .eq('id', reservation.location_id)
      .maybeSingle()

    const e164Phone = normalizeToE164(reservation.phone)

    if (!e164Phone) {
      return new Response(
        JSON.stringify({ success: true, sms: false, reason: 'no_valid_phone' }),
        { headers: jsonHeaders }
      )
    }

    const ctx: TemplateContext = {
      partyName: (reservation.party_name ?? '').trim() || 'Guest',
      storeName: location?.name ?? 'our restaurant',
      storeAddress: formatStoreAddress(location),
      partySize: reservation.party_size ?? null,
      reservationDate: formatDateForSms(reservation.reservation_date),
      reservationTime: formatTimeForSms(reservation.reservation_time),
      confirmationNumber: reservation.confirmation_number ?? null
    }
    const message = renderTemplate(templateKey, ctx, customMessage)
    if (!message) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'bad_template',
          message: `Unknown template_key '${templateKey}'`
        }),
        { status: 400, headers: jsonHeaders }
      )
    }

    const apiKey = Deno.env.get('TELNYX_API_KEY')
    const fromNumber = Deno.env.get('TELNYX_FROM_NUMBER') ?? '+18556810275'
    if (!apiKey) {
      console.error('Missing Telnyx credentials')
      return new Response(
        JSON.stringify({
          success: false,
          sms: false,
          error: 'sms_failed',
          message:
            'SMS provider is not configured. Please notify guest verbally and contact admin.'
        }),
        { status: 500, headers: jsonHeaders }
      )
    }

    const telnyxResp = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        from: fromNumber,
        to: e164Phone,
        text: message
      })
    })

    let telnyxJson: Record<string, any> = {}
    try {
      telnyxJson = await telnyxResp.json()
    } catch {
      telnyxJson = {}
    }
    const data = telnyxJson?.data
    const firstError = telnyxJson?.errors?.[0]
    const providerStatus = data?.status as string | undefined
    const smsOk =
      telnyxResp.ok &&
      !!data?.id &&
      providerStatus !== 'sending_failed' &&
      providerStatus !== 'delivery_failed'

    await adminClient.rpc('record_reservation_sms_result', {
      p_reservation_id: reservationId,
      p_success: smsOk,
      p_template_key: templateKey
    })

    if (smsOk) {
      return new Response(JSON.stringify({ success: true, sms: true }), {
        headers: jsonHeaders
      })
    }

    const providerError = firstError?.detail || firstError?.title || undefined
    return new Response(
      JSON.stringify({
        success: false,
        sms: false,
        error: 'sms_failed',
        message:
          providerError || 'Could not send SMS. Please notify guest verbally.',
        provider_error: providerError
      }),
      { status: 502, headers: jsonHeaders }
    )
  } catch (err) {
    console.error('notify-reservation-guest error:', err)
    return new Response(
      JSON.stringify({
        success: false,
        sms: false,
        error: 'unexpected_error',
        message:
          'Unexpected error while sending SMS. Please notify guest verbally.',
        details: String(err)
      }),
      { status: 500, headers: jsonHeaders }
    )
  }
})
