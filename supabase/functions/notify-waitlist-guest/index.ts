// notify-waitlist-guest
//
// Hardened path (Lane D) + server-side template registry.
//
// Security guarantees:
//   - verify_jwt = true (caller must be authenticated)
//   - User-scoped supabase client reads waitlist + location via RLS
//   - Template registry is server-side: caller picks a `template_key`, never
//     supplies the rendered SMS body (except for the explicit 'custom' key)
//   - Rate-limited per-merchant via claim_waitlist_sms_slot RPC
//   - CORS allowlist: *.dexapos.com, localhost, 127.0.0.1
//
// Request shape:
//   { waitlist_id: string, template_key?: string, message?: string }
//   - template_key defaults to 'waitlist.tableReady' for back-compat
//   - message is only honored when template_key === 'custom'

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  resolveWaitlistMessage,
  type MerchantTemplateConfig,
  type WaitlistTemplateContext
} from '../_shared/notifyTemplates.ts'

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*dexapos\.com$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/
]

function corsHeadersFor(origin: string | null): Record<string, string> {
  if (!origin) return {}
  const allowed = ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))
  if (!allowed) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  }
}

const SMS_RATE_LIMIT_PER_HOUR = 10

function formatStoreAddress(loc: any): string {
  if (!loc) return ''
  const street = [loc.address_line1, loc.address_line2].filter(Boolean).join(', ')
  const cityStateZip = [loc.city, loc.state, loc.postal_code]
    .filter(Boolean)
    .join(' ')
  return [street, cityStateZip].filter(Boolean).join(', ')
}

/** Merchant-editable templates live in `locations.pos_config.waitlist`. */
function readWaitlistTemplateConfig(
  posConfig: any
): MerchantTemplateConfig | null {
  const waitlist = posConfig?.waitlist
  if (!waitlist || typeof waitlist !== 'object') return null
  return {
    messageTemplates: waitlist.messageTemplates ?? null,
    smsTemplate: waitlist.smsTemplate ?? null
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
  waitlist_id?: string
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
    const waitlistId =
      typeof body.waitlist_id === 'string' ? body.waitlist_id : null
    const templateKey =
      typeof body.template_key === 'string' && body.template_key.length > 0
        ? body.template_key
        : 'waitlist.tableReady'
    const customMessage =
      typeof body.message === 'string' ? body.message : null

    if (!waitlistId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'bad_request',
          message: 'waitlist_id required'
        }),
        { status: 400, headers: jsonHeaders }
      )
    }

    // Read waitlist via user-scoped client. RLS gates access.
    const { data: waitlist, error: waitlistErr } = await userClient
      .from('waitlist')
      .select(
        'id, merchant_id, location_id, party_name, party_size, phone, status, quoted_wait_minutes'
      )
      .eq('id', waitlistId)
      .maybeSingle()

    if (waitlistErr) {
      console.error('waitlist read failed', waitlistErr)
      return new Response(
        JSON.stringify({ success: false, error: 'db_error' }),
        { status: 500, headers: jsonHeaders }
      )
    }

    if (!waitlist) {
      return new Response(
        JSON.stringify({ success: false, error: 'not_found' }),
        { status: 404, headers: jsonHeaders }
      )
    }

    // Fetch location for store name + address. Service role is OK here — the
    // RLS check above proved the caller has access to the merchant/location.
    const { data: location } = await adminClient
      .from('locations')
      .select(
        'name, address_line1, address_line2, city, state, postal_code, pos_config'
      )
      .eq('id', waitlist.location_id)
      .maybeSingle()

    const e164Phone = normalizeToE164(waitlist.phone)

    if (!e164Phone) {
      return new Response(
        JSON.stringify({ success: true, sms: false, reason: 'no_valid_phone' }),
        { headers: jsonHeaders }
      )
    }

    // Render server-side. Caller picks the key; the body is assembled here from
    // the merchant's saved template (falling back to the built-in default) or,
    // for 'custom', the caller-supplied message.
    const ctx: WaitlistTemplateContext = {
      partyName: (waitlist.party_name ?? '').trim() || 'Guest',
      storeName: location?.name ?? 'our restaurant',
      storeAddress: formatStoreAddress(location),
      quotedWaitMinutes: waitlist.quoted_wait_minutes ?? null,
      partySize: waitlist.party_size ?? null
    }
    const templateConfig = readWaitlistTemplateConfig(location?.pos_config)
    const message = resolveWaitlistMessage(
      templateKey,
      ctx,
      templateConfig,
      customMessage
    )
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

    // Atomic rate-limit claim.
    const { data: claim, error: claimErr } = await adminClient.rpc(
      'claim_waitlist_sms_slot',
      {
        p_merchant_id: waitlist.merchant_id,
        p_max_per_hour: SMS_RATE_LIMIT_PER_HOUR
      }
    )

    if (claimErr) {
      console.error('rate limit claim failed', claimErr)
      return new Response(
        JSON.stringify({ success: false, error: 'rate_limit_check_failed' }),
        { status: 500, headers: jsonHeaders }
      )
    }

    if (!claim?.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'rate_limited',
          message: `SMS rate limit reached for this merchant (${claim?.count}/${claim?.limit} this hour). Try again later.`,
          retry_after_seconds: 600
        }),
        { status: 429, headers: jsonHeaders }
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

    await adminClient.rpc('record_waitlist_sms_result', {
      p_waitlist_id: waitlistId,
      p_success: smsOk,
      p_notification_type: 'sms'
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
    console.error('notify-waitlist-guest error:', err)
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
