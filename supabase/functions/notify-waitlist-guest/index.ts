import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type'
}

interface NotifyRequest {
  phone: string
  message: string
  waitlist_id: string
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phone, message, waitlist_id }: NotifyRequest = await req.json()

    if (!waitlist_id || !message) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'bad_request',
          message: 'waitlist_id and message required'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Normalize phone to E.164 format
    const digits = phone?.replace(/\D/g, '') ?? ''
    let e164Phone: string | null = null

    if (digits.length === 10) {
      e164Phone = `+1${digits}`
    } else if (digits.length === 11 && digits[0] === '1') {
      e164Phone = `+${digits}`
    } else if (digits.length > 0) {
      // Assume international format
      e164Phone = `+${digits}`
    }

    // No valid phone — record as in_app, return success
    if (!e164Phone) {
      return new Response(
        JSON.stringify({ success: true, sms: false, reason: 'no_valid_phone' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER')!

    if (!accountSid || !authToken || !fromNumber) {
      console.error('Missing Twilio credentials')
      return new Response(
        JSON.stringify({
          success: false,
          sms: false,
          error: 'sms_failed',
          message:
            'SMS provider is not configured. Please notify guest verbally and contact admin.'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Send SMS via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const twilioBody = new URLSearchParams({
      To: e164Phone,
      From: fromNumber,
      Body: message
    })

    const twilioResp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: twilioBody.toString()
    })

    let twilioJson: Record<string, any> = {}
    try {
      twilioJson = await twilioResp.json()
    } catch {
      twilioJson = {}
    }
    const smsOk =
      twilioResp.ok &&
      twilioJson.status !== 'failed' &&
      twilioJson.status !== 'undelivered'

    // Record result in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    await supabase.rpc('record_waitlist_sms_result', {
      p_waitlist_id: waitlist_id,
      p_success: smsOk,
      p_notification_type: 'sms'
    })

    if (smsOk) {
      return new Response(JSON.stringify({ success: true, sms: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          sms: false,
          error: 'sms_failed',
          message:
            twilioJson.message ||
            'Could not send SMS. Please notify guest verbally.',
          twilio_error: twilioJson.message
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (err) {
    console.error('notify-waitlist-guest error:', err)
    return new Response(
      JSON.stringify({
        success: false,
        sms: false,
        error: 'sms_failed',
        message:
          'Unexpected error while sending SMS. Please notify guest verbally.',
        details: String(err)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
