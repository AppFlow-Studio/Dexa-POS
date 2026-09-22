// Deno-native Telnyx sender. Raw fetch keeps cold start small and avoids
// pulling the Node SDK in the Edge runtime.

declare const Deno: {
  env: { get(name: string): string | undefined }
}

const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY') ?? ''
const TELNYX_FROM_NUMBER = Deno.env.get('TELNYX_FROM_NUMBER') ?? ''
const TELNYX_MESSAGING_PROFILE_ID =
  Deno.env.get('TELNYX_MESSAGING_PROFILE_ID') ?? ''
const TELNYX_WEBHOOK_URL = Deno.env.get('TELNYX_WEBHOOK_URL') ?? ''
const TELNYX_WEBHOOK_FAILOVER_URL =
  Deno.env.get('TELNYX_WEBHOOK_FAILOVER_URL') ?? ''

export interface SmsSendSuccess {
  id: string
  status: string
  fromNumber: string | null
  messagingProfileId: string | null
}

export interface SmsSendFailure {
  error: string
  errorCode?: string | null
  id?: string
  status?: string
  fromNumber?: string | null
  messagingProfileId?: string | null
}

export type SmsSendResult = SmsSendSuccess | SmsSendFailure

export function isTelnyxConfigured(): boolean {
  return (
    TELNYX_API_KEY.length > 0 &&
    (TELNYX_FROM_NUMBER.length > 0 || TELNYX_MESSAGING_PROFILE_ID.length > 0)
  )
}

export function normalizeE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  if (digits.length > 0) return `+${digits}`
  return null
}

export async function sendSMS(
  to: string,
  body: string
): Promise<SmsSendResult> {
  if (!isTelnyxConfigured()) {
    return {
      error:
        'SMS service not configured. Set TELNYX_API_KEY and either TELNYX_FROM_NUMBER or TELNYX_MESSAGING_PROFILE_ID.'
    }
  }

  const normalized = normalizeE164(to)
  if (!normalized) return { error: 'Invalid phone number' }

  const payload: Record<string, unknown> = {
    to: normalized,
    text: body,
    use_profile_webhooks: true
  }
  if (TELNYX_FROM_NUMBER) {
    payload.from = TELNYX_FROM_NUMBER
  } else if (TELNYX_MESSAGING_PROFILE_ID) {
    payload.messaging_profile_id = TELNYX_MESSAGING_PROFILE_ID
  }
  if (TELNYX_WEBHOOK_URL) payload.webhook_url = TELNYX_WEBHOOK_URL
  if (TELNYX_WEBHOOK_FAILOVER_URL) {
    payload.webhook_failover_url = TELNYX_WEBHOOK_FAILOVER_URL
  }

  try {
    const resp = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    })

    let json: {
      data?: {
        id?: string
        to?: { status?: string }[]
        from?: { phone_number?: string } | string
        messaging_profile_id?: string
        errors?: { code?: string; detail?: string; title?: string }[]
      }
      errors?: { code?: string; detail?: string; title?: string }[]
    } = {}
    try {
      json = await resp.json()
    } catch {
      json = {}
    }

    const data = json.data
    const firstError = json.errors?.[0]
    const providerStatus = data?.to?.[0]?.status
    const ok = resp.ok && !!data?.id
    const responseFrom =
      typeof data?.from === 'string' ? data.from : data?.from?.phone_number
    const fromNumber = responseFrom ?? (TELNYX_FROM_NUMBER || null)
    const responseProfile =
      data?.messaging_profile_id ?? (TELNYX_MESSAGING_PROFILE_ID || null)

    if (!ok) {
      const message =
        firstError?.detail || firstError?.title || 'Could not send SMS'
      return {
        error: message,
        errorCode: firstError?.code ?? null,
        id: data?.id,
        status: providerStatus,
        fromNumber,
        messagingProfileId: responseProfile
      }
    }

    if (
      providerStatus === 'sending_failed' ||
      providerStatus === 'delivery_failed'
    ) {
      const providerError = data.errors?.[0]
      return {
        error:
          providerError?.detail ||
          providerError?.title ||
          'Telnyx rejected the SMS',
        errorCode: providerError?.code ?? null,
        id: data.id,
        status: providerStatus,
        fromNumber,
        messagingProfileId: responseProfile
      }
    }

    return {
      id: data.id as string,
      status: providerStatus ?? 'sent',
      fromNumber,
      messagingProfileId: responseProfile
    }
  } catch (err) {
    const message =
      (err as { message?: string })?.message ?? 'Failed to send SMS'
    return { error: message }
  }
}
