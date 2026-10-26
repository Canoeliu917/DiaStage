import { createHash, createHmac } from 'node:crypto'

type AuthMailMessage = { user: { email: string }; url: string }

export function createAuthMailSenders(
  env: NodeJS.ProcessEnv = process.env,
  {
    fetcher = fetch,
    now = Date.now,
  }: {
    fetcher?: (url: string, options: RequestInit) => Promise<Response>
    now?: () => number
  } = {},
) {
  if (env.DIASTAGE_AUTH_EMAIL_ENABLED !== 'true') return null

  const invalidConfig = (name: string): never => {
    throw new Error(`Invalid authentication email configuration: ${name}`)
  }
  const required = (name: string) => {
    const value = env[name]?.trim()
    return value || invalidConfig(name)
  }
  const secretId = required('TENCENTCLOUD_SECRET_ID')
  const secretKey = required('TENCENTCLOUD_SECRET_KEY')
  if (!/^[A-Za-z0-9]+$/.test(secretId)) invalidConfig('TENCENTCLOUD_SECRET_ID')
  if (/\s/.test(secretKey)) invalidConfig('TENCENTCLOUD_SECRET_KEY')
  const region = required('TENCENT_SES_REGION')
  if (!['ap-guangzhou', 'ap-hongkong'].includes(region)) invalidConfig('TENCENT_SES_REGION')
  const fromEmailAddress = required('TENCENT_SES_FROM_EMAIL')
  const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
  const senderAddress = fromEmailAddress.match(/^[^<>:\r\n]+ <([^<>]+)>$/)?.[1] || fromEmailAddress
  if (!emailPattern.test(senderAddress)) invalidConfig('TENCENT_SES_FROM_EMAIL')
  const replyToEmail = env.TENCENT_SES_REPLY_TO_EMAIL || ''
  if (replyToEmail && (!emailPattern.test(replyToEmail) || /[,;:\r\n]/.test(replyToEmail)))
    invalidConfig('TENCENT_SES_REPLY_TO_EMAIL')
  const templateId = (name: string) => {
    const value = required(name)
    const id = Number(value)
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) invalidConfig(name)
    return id
  }
  const resetTemplateId = templateId('TENCENT_SES_RESET_TEMPLATE_ID')
  const verifyTemplateId = templateId('TENCENT_SES_VERIFY_TEMPLATE_ID')
  let baseURL: URL
  try {
    baseURL = new URL(env.BETTER_AUTH_URL || 'http://127.0.0.1:4329')
  } catch {
    return invalidConfig('BETTER_AUTH_URL')
  }
  if (
    baseURL.origin !== 'https://diastage.art' ||
    baseURL.username ||
    baseURL.password ||
    baseURL.pathname !== '/' ||
    baseURL.search ||
    baseURL.hash
  )
    invalidConfig('BETTER_AUTH_URL')

  async function send(template: number, subject: string, { user, url }: AuthMailMessage) {
    try {
      const link = new URL(url)
      if (
        !emailPattern.test(user.email) ||
        link.origin !== baseURL.origin ||
        link.username ||
        link.password
      )
        throw new Error()
      const host = 'ses.tencentcloudapi.com'
      const contentType = 'application/json; charset=utf-8'
      const body = JSON.stringify({
        FromEmailAddress: fromEmailAddress,
        Destination: [user.email],
        Subject: subject,
        Template: {
          TemplateID: template,
          TemplateData: JSON.stringify({ url: link.pathname.slice(1) + link.search + link.hash }),
        },
        TriggerType: 1,
        ...(replyToEmail ? { ReplyToAddresses: replyToEmail } : {}),
      })
      const timestamp = Math.floor(now() / 1000)
      const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
      const scope = `${date}/ses/tc3_request`
      const signedHeaders = 'content-type;host;x-tc-action'
      const hash = (value: string) => createHash('sha256').update(value).digest('hex')
      const canonical = [
        'POST',
        '/',
        '',
        `content-type:${contentType}\nhost:${host}\nx-tc-action:sendemail\n`,
        signedHeaders,
        hash(body),
      ].join('\n')
      const dateKey = createHmac('sha256', `TC3${secretKey}`).update(date).digest()
      const serviceKey = createHmac('sha256', dateKey).update('ses').digest()
      const signingKey = createHmac('sha256', serviceKey).update('tc3_request').digest()
      const signature = createHmac('sha256', signingKey)
        .update(`TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`)
        .digest('hex')
      const response = await fetcher(`https://${host}/`, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          Host: host,
          'X-TC-Action': 'SendEmail',
          'X-TC-Version': '2020-10-02',
          'X-TC-Region': region,
          'X-TC-Timestamp': String(timestamp),
          Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        },
        body,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error()
      const result = (await response.json()) as {
        Response?: { Error?: unknown; MessageId?: unknown }
      }
      if (
        result.Response?.Error ||
        typeof result.Response?.MessageId !== 'string' ||
        !result.Response.MessageId
      )
        throw new Error()
    } catch {
      throw new Error('Authentication email delivery failed')
    }
  }

  return {
    sendResetPassword: (message: AuthMailMessage) =>
      send(resetTemplateId, '重置 DiaStage 密码', message),
    sendVerificationEmail: (message: AuthMailMessage) =>
      send(verifyTemplateId, '验证 DiaStage 邮箱', message),
  }
}
