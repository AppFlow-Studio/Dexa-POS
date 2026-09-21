import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const read = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), 'utf8')

const senderPaths = [
  'supabase/functions/notify-waitlist-guest/index.ts',
  'supabase/functions/notify-reservation-guest/index.ts',
  'supabase/functions/send-receipt/index.ts'
]

const originalDenoDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'Deno'
)
const originalFetch = globalThis.fetch

function loadSender(env: Record<string, string | undefined>) {
  jest.resetModules()
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: {
      env: {
        get: (name: string) => env[name]
      }
    }
  })
  let senderModule: typeof import('../supabase/functions/_shared/telnyx')
  jest.isolateModules(() => {
    senderModule = jest.requireActual(
      '../supabase/functions/_shared/telnyx'
    )
  })
  return senderModule!
}

afterEach(() => {
  jest.restoreAllMocks()
  globalThis.fetch = originalFetch
  if (originalDenoDescriptor) {
    Object.defineProperty(globalThis, 'Deno', originalDenoDescriptor)
  } else {
    Reflect.deleteProperty(globalThis, 'Deno')
  }
})

describe('shared Telnyx sender', () => {
  it('enables profile webhooks and sends primary and failover callback URLs', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 'msg-success',
          to: [{ status: 'queued' }],
          from: { phone_number: '+12025550199' },
          messaging_profile_id: 'profile-1'
        }
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { sendSMS } = loadSender({
      TELNYX_API_KEY: 'test-key',
      TELNYX_MESSAGING_PROFILE_ID: 'profile-1',
      TELNYX_WEBHOOK_URL: 'https://example.test/telnyx',
      TELNYX_WEBHOOK_FAILOVER_URL: 'https://failover.test/telnyx'
    })

    await expect(sendSMS('(202) 555-0100', 'Test body')).resolves.toEqual({
      id: 'msg-success',
      status: 'queued',
      fromNumber: '+12025550199',
      messagingProfileId: 'profile-1'
    })

    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body))).toEqual({
      to: '+12025550100',
      text: 'Test body',
      use_profile_webhooks: true,
      messaging_profile_id: 'profile-1',
      webhook_url: 'https://example.test/telnyx',
      webhook_failover_url: 'https://failover.test/telnyx'
    })
  })

  it('preserves provider metadata for an immediate sending failure', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 'msg-failed',
          to: [{ status: 'sending_failed' }],
          from: '+12025550199',
          messaging_profile_id: 'profile-2',
          errors: [
            {
              code: '40306',
              detail: 'Sender is not configured'
            }
          ]
        }
      })
    }) as unknown as typeof fetch

    const { sendSMS } = loadSender({
      TELNYX_API_KEY: 'test-key',
      TELNYX_FROM_NUMBER: '+12025550199'
    })

    await expect(sendSMS('+12025550100', 'Test body')).resolves.toEqual({
      error: 'Sender is not configured',
      errorCode: '40306',
      id: 'msg-failed',
      status: 'sending_failed',
      fromNumber: '+12025550199',
      messagingProfileId: 'profile-2'
    })
  })

  it('preserves provider metadata from a non-2xx response when available', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        data: {
          id: 'msg-http-failed',
          to: [{ status: 'delivery_failed' }],
          from: { phone_number: '+12025550199' },
          messaging_profile_id: 'profile-3'
        },
        errors: [{ code: '10002', detail: 'Invalid destination' }]
      })
    }) as unknown as typeof fetch

    const { sendSMS } = loadSender({
      TELNYX_API_KEY: 'test-key',
      TELNYX_MESSAGING_PROFILE_ID: 'profile-3'
    })

    await expect(sendSMS('+19401284', 'Test body')).resolves.toEqual({
      error: 'Invalid destination',
      errorCode: '10002',
      id: 'msg-http-failed',
      status: 'delivery_failed',
      fromNumber: '+12025550199',
      messagingProfileId: 'profile-3'
    })
  })

  it('fails closed without credentials and never calls Telnyx', async () => {
    const fetchMock = jest.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const { sendSMS } = loadSender({})

    await expect(sendSMS('+12025550100', 'Test body')).resolves.toMatchObject({
      error: expect.stringContaining('SMS service not configured')
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('POS-owned Telnyx send paths', () => {
  it.each(senderPaths)('%s uses the shared sender and complete ledger contract', path => {
    const source = read(path)

    expect(source).toContain("from '../_shared/telnyx.ts'")
    expect(source).toContain('sendSMS(')
    expect(source).toContain("'log_outbound_message'")
    expect(source).toContain('p_merchant_id:')
    expect(source).toContain('p_to_number:')
    expect(source).toContain('p_telnyx_message_id: smsResult.id ?? null')
    expect(source).toContain('p_status:')
    expect(source).toContain('p_error_code:')
    expect(source).toContain('p_from_number: smsResult.fromNumber ?? null')
    expect(source).toContain(
      'p_messaging_profile_id: smsResult.messagingProfileId ?? null'
    )
    expect(source).not.toContain('https://api.telnyx.com/v2/messages')
  })

  it('keeps the POS kiosk receipt confirmation behavior', () => {
    const source = read('supabase/functions/send-receipt/index.ts')
    expect(source).toContain('confirmation: confirmation === true')
    expect(source).toContain('RECEIPT_BASE_URL')
    expect(source).toContain('p_customer_id:')
  })

  it('does not duplicate the Website-owned ledger migration', () => {
    expect(
      existsSync(
        join(
          repoRoot,
          'supabase/migrations/20260918120000_telnyx_message_ledger_go_live.sql'
        )
      )
    ).toBe(false)
  })

  it.each(senderPaths)('%s does not log SMS payload fields', path => {
    const source = read(path)
    expect(source).not.toMatch(
      /console\.(?:log|info|debug|warn|error)\([^)]*\b(?:e164Phone|recipient|customMessage|p_body|text)\b/s
    )
  })
})
