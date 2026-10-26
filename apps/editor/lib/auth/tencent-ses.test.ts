import { expect, mock, spyOn, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createAuthMailSenders } from './tencent-ses'

const env = {
  DIASTAGE_AUTH_EMAIL_ENABLED: 'true',
  TENCENTCLOUD_SECRET_ID: 'AKIDTESTID',
  TENCENTCLOUD_SECRET_KEY: 'test-secret-do-not-use',
  TENCENT_SES_REGION: 'ap-hongkong',
  TENCENT_SES_FROM_EMAIL: 'DiaStage <noreply@mail.example.com>',
  TENCENT_SES_RESET_TEMPLATE_ID: '101',
  TENCENT_SES_VERIFY_TEMPLATE_ID: '102',
  BETTER_AUTH_URL: 'https://diastage.art',
}
const message = {
  user: { email: 'member@example.com' },
  url: 'https://diastage.art/api/auth/reset-password/fake-reset-token?callbackURL=%2Flogin%3Fnext%3D%252Fscenes#finish',
}
const now = () => Date.parse('2026-10-26T00:05:06.000Z')
const accepted = () => Response.json({ Response: { MessageId: 'test-message-id' } })

test('authentication email stays disabled without explicit opt-in, even with credentials', () => {
  const fetcher = mock(async () => accepted())
  expect(createAuthMailSenders({}, { fetcher })).toBeNull()
  expect(createAuthMailSenders({ ...env, DIASTAGE_AUTH_EMAIL_ENABLED: '' }, { fetcher })).toBeNull()
  expect(
    createAuthMailSenders({ ...env, DIASTAGE_AUTH_EMAIL_ENABLED: 'false' }, { fetcher }),
  ).toBeNull()
  expect(
    createAuthMailSenders(
      { ...env, DIASTAGE_AUTH_EMAIL_ENABLED: 'false', BETTER_AUTH_URL: 'http://localhost:4329' },
      { fetcher },
    ),
  ).toBeNull()
  expect(fetcher).not.toHaveBeenCalled()
})

test('explicit enablement requires every SES setting and never sends partial configuration', () => {
  const fetcher = mock(async () => accepted())
  for (const name of Object.keys(env).filter((key) => key !== 'DIASTAGE_AUTH_EMAIL_ENABLED')) {
    expect(() => createAuthMailSenders({ ...env, [name]: '' }, { fetcher })).toThrow(
      `Invalid authentication email configuration: ${name}`,
    )
  }
  expect(fetcher).not.toHaveBeenCalled()
})

test('malformed configuration fails with field names without exposing values', () => {
  const invalid = [
    ['TENCENTCLOUD_SECRET_ID', 'bad,id/credential'],
    ['TENCENTCLOUD_SECRET_KEY', 'secret with space'],
    ['TENCENT_SES_REGION', 'ap-beijing'],
    ['TENCENT_SES_FROM_EMAIL', 'Injected\r\nfrom@example.com'],
    ['TENCENT_SES_FROM_EMAIL', 'broken <from@example.com'],
    ['TENCENT_SES_RESET_TEMPLATE_ID', '1.5'],
    ['TENCENT_SES_VERIFY_TEMPLATE_ID', '9007199254740992'],
    ['BETTER_AUTH_URL', 'http://diastage.art'],
    ['BETTER_AUTH_URL', 'https://another.example'],
    ['BETTER_AUTH_URL', 'https://www.diastage.art'],
    ['BETTER_AUTH_URL', 'https://diastage.art:4329'],
    ['BETTER_AUTH_URL', 'http://localhost:4329'],
    ['BETTER_AUTH_URL', 'https://localhost:4329'],
    ['BETTER_AUTH_URL', 'http://127.0.0.1:4329'],
    ['BETTER_AUTH_URL', 'http://[::1]:4329'],
    ['BETTER_AUTH_URL', 'https://user:password@diastage.art'],
    ['BETTER_AUTH_URL', 'https://diastage.art/path?token=private'],
    ['BETTER_AUTH_URL', 'https://diastage.art/?token=private'],
    ['BETTER_AUTH_URL', 'https://diastage.art/#private'],
    ['BETTER_AUTH_URL', 'not a URL'],
  ]
  for (const [name, value] of invalid) {
    expect(() => createAuthMailSenders({ ...env, [name]: value })).toThrow(
      `Invalid authentication email configuration: ${name}`,
    )
  }
})

test('reset email uses the approved template, an isolated recipient and a fixed TC3 signature', async () => {
  const fetcher = mock(async (_url: string, _options: RequestInit) => accepted())
  await createAuthMailSenders(env, { fetcher, now })!.sendResetPassword(message)
  expect(fetcher).toHaveBeenCalledTimes(1)
  const [endpoint, options] = fetcher.mock.calls[0]!
  expect(endpoint).toBe('https://ses.tencentcloudapi.com/')
  expect(options.method).toBe('POST')
  expect(options.redirect).toBe('error')
  expect(options.cache).toBe('no-store')
  expect(options.signal).toBeInstanceOf(AbortSignal)
  expect(options.headers).toEqual({
    'Content-Type': 'application/json; charset=utf-8',
    Host: 'ses.tencentcloudapi.com',
    'X-TC-Action': 'SendEmail',
    'X-TC-Version': '2020-10-02',
    'X-TC-Region': 'ap-hongkong',
    'X-TC-Timestamp': '1792973106',
    Authorization:
      'TC3-HMAC-SHA256 Credential=AKIDTESTID/2026-10-26/ses/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=d6709f5b5973e0ffdf1874f6d6c8654a73b967e49efaab57cb4e8b53b2146d41',
  })
  expect(JSON.parse(options.body as string)).toEqual({
    FromEmailAddress: env.TENCENT_SES_FROM_EMAIL,
    Destination: [message.user.email],
    Subject: '重置 DiaStage 密码',
    Template: {
      TemplateID: 101,
      TemplateData:
        '{"url":"api/auth/reset-password/fake-reset-token?callbackURL=%2Flogin%3Fnext%3D%252Fscenes#finish"}',
    },
    TriggerType: 1,
  })
  expect(JSON.stringify(options.headers)).not.toContain(env.TENCENTCLOUD_SECRET_KEY)
  expect(options.body as string).not.toContain(env.TENCENTCLOUD_SECRET_ID)
})

test('verification email selects its own template and preserves the relative token link', async () => {
  const fetcher = mock(async (_url: string, _options: RequestInit) => accepted())
  const senders = createAuthMailSenders(
    { ...env, TENCENT_SES_REGION: 'ap-guangzhou' },
    { fetcher, now },
  )!
  await senders.sendVerificationEmail({
    ...message,
    url: 'https://diastage.art/api/auth/verify-email?token=fake.verify.token&callbackURL=%2Flogin%3Fverified%3D1%26next%3D%252Fscenes#verified',
  })
  const options = fetcher.mock.calls[0]![1]
  const body = JSON.parse(options.body as string)
  expect(body.Template.TemplateID).toBe(102)
  expect(body.Subject).toBe('验证 DiaStage 邮箱')
  expect(body.Template.TemplateData).toBe(
    '{"url":"api/auth/verify-email?token=fake.verify.token&callbackURL=%2Flogin%3Fverified%3D1%26next%3D%252Fscenes#verified"}',
  )
  expect(new Headers(options.headers).get('X-TC-Region')).toBe('ap-guangzhou')
})

test('both templates retain a fixed HTTPS brand host and reconstruct the original links exactly', async () => {
  const fetcher = mock(async (_url: string, _options: RequestInit) => accepted())
  const senders = createAuthMailSenders(env, { fetcher, now })!
  const verificationURL =
    'https://diastage.art/api/auth/verify-email?token=fake.verify.token&callbackURL=%2Flogin%3Fverified%3D1%26next%3D%252Fscenes#verified'
  for (const [name, sender, url] of [
    ['reset-password', senders.sendResetPassword, message.url],
    ['verify-email', senders.sendVerificationEmail, verificationURL],
  ] as const) {
    await sender({ ...message, url })
    const template = readFileSync(
      new URL(`../../../../deploy/email-templates/${name}.html`, import.meta.url),
      'utf8',
    )
    const href = template.match(/href="([^"]+)"/)?.[1]
    expect(href).toBe('https://diastage.art/{{url}}')
    expect(template.match(/\{\{[^}]+\}\}/g)).toEqual(['{{url}}'])
    const body = JSON.parse(fetcher.mock.calls.at(-1)![1].body as string)
    const relative = JSON.parse(body.Template.TemplateData).url
    expect(relative.startsWith('/')).toBe(false)
    expect(relative).not.toContain('https://')
    expect(href!.replace('{{url}}', relative)).toBe(url)
  }
})

test('optional replies target one plain mailbox and reject header injection or multiple recipients', async () => {
  const fetcher = mock(async (_url: string, _options: RequestInit) => accepted())
  const senders = createAuthMailSenders(
    { ...env, TENCENT_SES_REPLY_TO_EMAIL: '21@example.com' },
    { fetcher, now },
  )!
  await senders.sendResetPassword(message)
  expect(JSON.parse(fetcher.mock.calls[0]![1].body as string).ReplyToAddresses).toBe(
    '21@example.com',
  )
  for (const reply of [
    '21@example.com\r\nBcc: other@example.com',
    '21@example.com\r\n',
    '21@example.com,other@example.com',
    '21@example.com;other@example.com',
    '21@example.com,',
    'DiaStage <21@example.com>',
    'mailto:21@example.com',
  ]) {
    expect(() => createAuthMailSenders({ ...env, TENCENT_SES_REPLY_TO_EMAIL: reply })).toThrow(
      'Invalid authentication email configuration: TENCENT_SES_REPLY_TO_EMAIL',
    )
  }
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('cross-origin, credentialed and malformed links cannot be sent', async () => {
  const fetcher = mock(async () => accepted())
  const senders = createAuthMailSenders(env, { fetcher, now })!
  for (const url of [
    'https://attacker.example/reset?token=private',
    'https://user:password@diastage.art/reset?token=private',
    'http://diastage.art/reset?token=private',
    'https://localhost/reset?token=private',
    'http://localhost:4329/reset?token=private',
    '/relative/reset?token=private',
    'javascript:alert(1)',
  ]) {
    await expect(senders.sendResetPassword({ ...message, url })).rejects.toThrow(
      'Authentication email delivery failed',
    )
  }
  await expect(
    senders.sendVerificationEmail({ ...message, user: { email: 'bad\r\naddress@example.com' } }),
  ).rejects.toThrow('Authentication email delivery failed')
  expect(fetcher).not.toHaveBeenCalled()
})

test('provider, HTTP, JSON and network failures never expose credentials or token links', async () => {
  const privateMessage = `${env.TENCENTCLOUD_SECRET_KEY} ${message.url}`
  const failures = [
    async () => Response.json({ Response: { Error: { Code: 'Denied', Message: privateMessage } } }),
    async () => new Response(privateMessage, { status: 503 }),
    async () => new Response(privateMessage),
    async () => Response.json({ Response: { RequestId: 'missing-message-id' } }),
    async () => {
      throw new Error(privateMessage)
    },
  ]
  for (const fetcher of failures) {
    const senders = createAuthMailSenders(env, { fetcher, now })!
    try {
      await senders.sendResetPassword(message)
      throw new Error('Expected delivery failure')
    } catch (error) {
      expect((error as Error).message).toBe('Authentication email delivery failed')
      expect((error as Error).cause).toBeUndefined()
    }
  }
})

test('delivery has a ten-second abort deadline and sanitizes timeout failures', async () => {
  const controller = new AbortController()
  const timeout = spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
  const fetcher = mock(
    async (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener('abort', () => reject(new Error(message.url)), {
          once: true,
        })
      }),
  )
  try {
    const senders = createAuthMailSenders(env, { fetcher, now })!
    const delivery = senders.sendResetPassword(message)
    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    controller.abort()
    await expect(delivery).rejects.toThrow('Authentication email delivery failed')
  } finally {
    timeout.mockRestore()
  }
})
