import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountForm } from './account-panel'

test('email recovery controls are available only when the server has enabled mail', () => {
  const disabled = renderToStaticMarkup(<AccountForm />)
  expect(disabled).toContain('邮件找回暂未开放')
  expect(disabled).not.toContain('忘记密码</button>')
  const enabled = renderToStaticMarkup(<AccountForm emailEnabled />)
  expect(enabled).toContain('忘记密码</button>')
  expect(enabled).toContain('重发验证邮件</button>')
  expect(enabled).not.toContain('邮件找回暂未开放')
})

test('forgot password and resend verification request only an email address', () => {
  for (const mode of ['forgot', 'verify'] as const) {
    const markup = renderToStaticMarkup(<AccountForm emailEnabled initialMode={mode} />)
    expect(markup).toContain('type="email"')
    expect(markup).not.toContain('type="password"')
    expect(markup).toContain(mode === 'forgot' ? '申请重置密码邮件' : '重新发送验证邮件')
  }
  const disabled = renderToStaticMarkup(<AccountForm initialMode="forgot" />)
  expect(disabled).toContain('type="password"')
  expect(disabled).not.toContain('申请重置密码邮件')
})

test('verification registration and token password reset have distinct required fields', () => {
  const register = renderToStaticMarkup(<AccountForm emailEnabled initialMode="register" />)
  expect(register).toContain('注册并验证邮箱')
  expect(register.match(/type="password"/g)).toHaveLength(2)
  const reset = renderToStaticMarkup(<AccountForm resetToken="private-test-token" emailEnabled />)
  expect(reset).not.toContain('type="email"')
  expect(reset).not.toContain('private-test-token')
  expect(reset.match(/type="password"/g)).toHaveLength(2)
  expect(reset).toContain('保存密码')
})
