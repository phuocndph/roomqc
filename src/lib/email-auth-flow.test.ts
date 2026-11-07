import { beforeEach, describe, expect, it } from 'vitest'
import { createEmailAuthCoordinator } from './email-auth-flow'
import { emailAuthFixture, emailActor, emailOther, emailOtherSession, emailOperation, emailToken, emailTenant, emailInvitation } from '@/test/email-auth-fixture'

const verify = (f: ReturnType<typeof emailAuthFixture>, mode: 'invite' | 'recovery' | 'signup' = 'invite') =>
  f.flow.verify(mode, ' User@Example.test ', '123456')
const deferred = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); return { promise, release } }

describe('isolated email password/receipt coordinator', () => {
  beforeEach(() => localStorage.clear())

  it('requires a new verified mode before mutation and invalidates old verification on a failed new code', async () => {
    const f = emailAuthFixture()
    await expect(f.flow.finish('invite', 'NotSent!123')).rejects.toMatchObject({ code: 'verification_required' })
    await verify(f)
    await expect(f.flow.verify('invite', 'user@example.test', 'bad')).rejects.toMatchObject({ code: 'invalid_otp' })
    await expect(f.flow.finish('invite', 'NotSent!123')).rejects.toMatchObject({ code: 'verification_required' })
    expect(f.state.puts).toBe(0)
  })

  it('supports resent invite recovery OTP but always requires native context and server acceptance', async () => {
    const f = emailAuthFixture()
    f.deps.verifyOtp.mockResolvedValueOnce({ data: {}, error: new Error('not invite') })
    await verify(f)
    expect(f.deps.verifyOtp).toHaveBeenLastCalledWith({ type: 'recovery', email: 'user@example.test', token: '123456' })
    await expect(f.flow.finish('invite', 'OwnedNew!123')).resolves.toMatchObject({ completion: 'submitted' })
    expect(f.state.puts).toBe(1); expect(f.state.accepts).toBe(1)
    expect(f.state.calls.at(-1)?.url).toContain('logout?scope=local')
    await expect(f.flow.finish('invite', 'NotSent!456')).rejects.toMatchObject({ code: 'verification_required' })
  })

  it.each(['recovery', 'invite'] as const)('cannot use an ordinary session or forged local claims to finish %s', async mode => {
    const f = emailAuthFixture(); f.state.recovery = false
    await expect(verify(f, mode)).rejects.toMatchObject({ code: 'recovery_context_required' })
    await expect(f.flow.finish(mode, 'NotSent!123')).rejects.toMatchObject({ code: 'verification_required' })
    expect(f.state.puts).toBe(0); expect(f.state.accepts).toBe(0)
  })

  it('signup verification cannot become a recovery/password capability', async () => {
    const f = emailAuthFixture()
    await verify(f, 'signup')
    await expect(f.flow.finish('signup', 'NotSent!123')).rejects.toMatchObject({ code: 'verification_required' })
    await expect(f.flow.finish('recovery', 'NotSent!123')).rejects.toMatchObject({ code: 'verification_required' })
    expect(f.state.puts).toBe(0)
  })

  it('rejects mismatched OTP email and session identity without retaining authorization', async () => {
    const f = emailAuthFixture(); f.state.user.email = 'other@example.test'
    await expect(verify(f)).rejects.toMatchObject({ code: 'invalid_otp' })
    await expect(f.flow.finish('invite', 'NotSent!123')).rejects.toMatchObject({ code: 'verification_required' })
    expect(f.state.puts).toBe(0)
  })

  it('captures endpoint/key/tenant at creation and uses explicit initiating Authorization on every step', async () => {
    const f = emailAuthFixture()
    await verify(f)
    f.deps.endpoint = 'https://not-used.invalid'; f.deps.tenantId = 'not-used'; f.deps.publishableKey = 'not-used'
    await f.flow.finish('invite', 'OwnedNew!123')
    for (const call of f.state.calls) {
      expect(call.url).toMatch(/^https:\/\/owned\.roomqc\.invalid\//)
      expect(call.options).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' })
      expect(call.options.headers).toMatchObject({ Authorization: 'Bearer ' + emailToken(), apikey: 'public-fixture' })
    }
    expect(f.state.calls.find(c => c.body?.action === 'accept')?.body).toEqual({ action: 'accept', tenantId: emailTenant, invitationId: emailInvitation })
  })

  it('rechecks exact native receipt before retrying acceptance, never sending a different typed password', async () => {
    const f = emailAuthFixture(); await verify(f); f.state.failAccept = true
    await expect(f.flow.finish('invite', 'OwnedFirst!123')).rejects.toMatchObject({ code: 'invitation_pending' })
    f.state.failAccept = false
    await expect(f.flow.finish('invite', 'MustNotBeSent!456')).resolves.toMatchObject({ changeId: emailOperation, completion: 'previous' })
    expect(f.state.puts).toBe(1); expect(f.state.accepts).toBe(2)
    expect(f.state.calls.filter(c => c.url.endsWith('/auth/v1/user'))[0].body?.password).toBe('OwnedFirst!123')
  })

  it('offers password-free result/acceptance recovery and refuses lost or wrong-session receipts', async () => {
    const f = emailAuthFixture(); await verify(f); f.state.failAccept = true
    await expect(f.flow.finish('invite', 'OwnedFirst!123')).rejects.toBeTruthy()
    f.state.failAccept = false; f.state.wrongReceipt = true
    await expect(f.flow.check('invite')).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.state.accepts).toBe(1)
    f.state.wrongReceipt = false
    await expect(f.flow.check('invite')).resolves.toMatchObject({ completion: 'previous' })
    expect(f.state.puts).toBe(1)
  })

  it('keeps an uncertain operation ID without secrets and never blindly retries PUT', async () => {
    const f = emailAuthFixture(); await verify(f); f.state.putMode = 'loss-before'
    await expect(f.flow.finish('invite', 'OwnedNotConfirmed!123')).rejects.toMatchObject({ code: 'outcome_unknown' })
    await expect(f.flow.check('invite')).rejects.toMatchObject({ code: 'outcome_unknown' })
    await expect(f.flow.finish('invite', 'MustNotBeSent!456')).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.state.puts).toBe(1); expect(f.state.accepts).toBe(0)
    const record = localStorage.getItem(localStorage.key(0)!)!
    expect(JSON.parse(record)).toMatchObject({ changeId: emailOperation, version: 1 })
    expect(record).not.toContain('OwnedNotConfirmed'); expect(record).not.toContain(emailToken())
    f.state.receipt = emailOperation
    await expect(f.flow.check('invite')).resolves.toMatchObject({ completion: 'previous' })
    expect(f.state.puts).toBe(1); expect(localStorage.length).toBe(0)
  })

  it('reconciles a response lost after commit through native readback', async () => {
    const f = emailAuthFixture(); await verify(f, 'recovery'); f.state.putMode = 'loss-after'
    await expect(f.flow.finish('recovery', 'OwnedNew!123')).resolves.toMatchObject({ completion: 'submitted' })
    expect(f.state.puts).toBe(1); expect(f.state.accepts).toBe(0)
    expect(f.state.calls.at(-1)?.url).toContain('logout?scope=global')
  })

  it('does not claim completion or repeat password/acceptance after uncertain logout', async () => {
    const f = emailAuthFixture(); await verify(f); f.state.failLogout = true
    await expect(f.flow.finish('invite', 'OwnedNew!123')).rejects.toMatchObject({ code: 'logout_unknown' })
    f.state.failLogout = false; f.state.failStatus = true // Logout may already have deleted the native session.
    await expect(f.flow.check('invite')).resolves.toMatchObject({ completion: 'previous' })
    expect(f.state.puts).toBe(1); expect(f.state.accepts).toBe(1); expect(f.state.logouts).toBe(2)
  })

  it('will not treat401 logout as confirmed global session revocation', async () => {
    const f = emailAuthFixture()
    const original = f.deps.fetch
    f.deps.fetch = (async (url, options) => String(url).includes('/logout?')
      ? new Response('{}', { status: 401 }) : original(url, options)) as typeof fetch
    const flow = createEmailAuthCoordinator(f.deps)
    await flow.verify('recovery', 'user@example.test', '123456')
    await expect(flow.finish('recovery', 'OwnedNew!123')).rejects.toMatchObject({ code: 'logout_unknown' })
    expect(f.state.puts).toBe(1)
  })

  it('single-flights duplicate finish and verify requests', async () => {
    const f = emailAuthFixture(); await verify(f)
    const gate = deferred(); f.state.onPut = () => gate.promise
    const first = f.flow.finish('invite', 'OwnedNew!123')
    await expect(f.flow.finish('invite', 'NotSent!456')).rejects.toMatchObject({ code: 'flow_busy' })
    await expect(verify(f)).rejects.toMatchObject({ code: 'flow_busy' })
    gate.release(); await first
    expect(f.state.puts).toBe(1); expect(f.state.accepts).toBe(1)
  })

  it('disposal waits for a late OTP SDK write and then clears it without authorizing finish', async () => {
    const f = emailAuthFixture(), gate = deferred(), entered = deferred()
    f.state.onVerify = () => { entered.release(); return gate.promise }
    const verifying = verify(f)
    // Wait until the mock reached its OTP request, not a sleep-based race.
    await entered.promise
    const disposed = f.flow.dispose(), rejected = expect(verifying).rejects.toMatchObject({ code: 'identity_changed' })
    gate.release(); await rejected; await disposed
    expect(f.state.session).toBeNull(); expect(f.state.clears).toBe(2)
    await expect(f.flow.finish('invite', 'NotSent!123')).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.state.puts).toBe(0)
  })

  it('does not accept or show success after disposal during a password response', async () => {
    const f = emailAuthFixture(); await verify(f)
    const gate = deferred(), entered = deferred()
    f.state.onPut = () => { entered.release(); return gate.promise }
    const finishing = f.flow.finish('invite', 'OwnedNew!123')
    await entered.promise
    const disposed = f.flow.dispose(), rejected = expect(finishing).rejects.toMatchObject({ code: 'identity_changed' })
    gate.release(); await rejected; await disposed
    expect(f.state.puts).toBe(1); expect(f.state.accepts).toBe(0); expect(f.state.logouts).toBe(0)
    expect(localStorage.length).toBe(1)
  })

  it.each(['actor', 'session'] as const)('rejects a changed %s before password dispatch', async which => {
    const f = emailAuthFixture(); await verify(f)
    f.state.session = { access_token: emailToken(which === 'actor' ? emailOther : emailActor, which === 'session' ? emailOtherSession : undefined),
      user: { id: which === 'actor' ? emailOther : emailActor, email: 'user@example.test' } }
    await expect(f.flow.finish('invite', 'NotSent!123')).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.state.puts).toBe(0); expect(f.state.accepts).toBe(0)
  })

  it('fences a same-user session switch during a password response and keeps the initiating token', async () => {
    const f = emailAuthFixture(); await verify(f)
    f.state.onPut = () => { f.state.session!.access_token = emailToken(emailActor, emailOtherSession) }
    await expect(f.flow.finish('invite', 'OwnedNew!123')).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.state.accepts).toBe(0)
    expect(f.state.calls.every(c => (c.options.headers as Record<string, string>).Authorization === 'Bearer ' + emailToken())).toBe(true)
  })

  it('same-session token refresh cannot change request Authorization mid-flow', async () => {
    const f = emailAuthFixture(); await verify(f)
    f.state.onPut = () => { f.state.session!.access_token = emailToken(emailActor, undefined, { refreshed: true }) }
    await expect(f.flow.finish('invite', 'OwnedNew!123')).resolves.toMatchObject({ completion: 'submitted' })
    expect(f.state.calls.every(c => (c.options.headers as Record<string, string>).Authorization === 'Bearer ' + emailToken())).toBe(true)
  })

  it('rejects a mismatched server tenant and never leaks raw acceptance errors', async () => {
    const f = emailAuthFixture(); await verify(f); f.state.tenantReply = 'wrong-target'
    await expect(f.flow.finish('invite', 'OwnedNew!123')).rejects.toMatchObject({ code: 'invitation_pending' })
    expect(f.state.logouts).toBe(0)
    f.state.failAccept = true
    await expect(f.flow.check('invite')).rejects.not.toThrow('private SQL')
    expect(f.state.puts).toBe(1)
  })

  it('revocation after acceptance cannot be bypassed by an accepted client cache', async () => {
    const f = emailAuthFixture(); await verify(f)
    f.state.onAccept = () => { f.state.failStatus = true }
    await expect(f.flow.finish('invite', 'OwnedNew!123')).rejects.toMatchObject({ code: 'outcome_unknown' })
    await expect(f.flow.check('invite')).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.state.accepts).toBe(1); expect(f.state.puts).toBe(1); expect(f.state.logouts).toBe(0)
  })

  it('clearing an isolated SDK session must succeed before verifying another OTP', async () => {
    const f = emailAuthFixture(); f.state.failClear = true
    await expect(verify(f)).rejects.toMatchObject({ code: 'session_cleanup_failed' })
    expect(f.deps.verifyOtp).not.toHaveBeenCalled()
    await expect(f.flow.finish('invite', 'NotSent!123')).rejects.toMatchObject({ code: 'verification_required' })
  })

  it('resending invalidates previous verification and keeps safe errors', async () => {
    const f = emailAuthFixture(); await verify(f); f.deps.send.mockRejectedValueOnce(new Error('private provider detail'))
    await expect(f.flow.send('recovery', ' User@Example.test ')).rejects.toMatchObject({ code: 'send_failed' })
    expect(f.deps.send).toHaveBeenCalledWith('recovery', 'user@example.test')
    await expect(f.flow.finish('invite', 'NotSent!123')).rejects.toMatchObject({ code: 'verification_required' })
    expect(f.state.puts).toBe(0)
  })

  it('password-free check with no pending operation cannot pretend a password was saved', async () => {
    const f = emailAuthFixture(); await verify(f)
    await expect(f.flow.check('invite')).rejects.toMatchObject({ code: 'no_pending_change' })
    expect(f.state.puts).toBe(0); expect(f.state.accepts).toBe(0)
  })

  it('reads committed acceptance after response loss without another accept or password PUT', async () => {
    const f = emailAuthFixture(); await verify(f)
    f.state.onAccept = () => { f.state.accepted = true; throw new Error('Owned lost reply') }
    await expect(f.flow.finish('invite', 'OwnedFirst!123')).rejects.toMatchObject({ code: 'invitation_pending' })
    f.state.onAccept = null
    await expect(f.flow.check('invite')).resolves.toMatchObject({ completion: 'previous' })
    expect(f.state.puts).toBe(1); expect(f.state.accepts).toBe(1); expect(f.state.invitationReads).toBe(1)
  })

  it('does not retry acceptance while its server outcome is unknown or revoked', async () => {
    const f = emailAuthFixture(); await verify(f); f.state.failAccept = true
    await expect(f.flow.finish('invite', 'OwnedFirst!123')).rejects.toMatchObject({ code: 'invitation_pending' })
    f.state.failAccept = false; f.state.failInvitationStatus = true
    await expect(f.flow.check('invite')).rejects.toMatchObject({ code: 'invitation_pending' })
    f.state.failInvitationStatus = false; f.state.invitationRevoked = true
    await expect(f.flow.check('invite')).rejects.toMatchObject({ code: 'invitation_pending' })
    expect(f.state.puts).toBe(1); expect(f.state.accepts).toBe(1); expect(f.state.logouts).toBe(0)
  })

  it.each(['revoked', 'expired'] as const)('refuses an unavailable %s invitation before a password write', async state => {
    const f = emailAuthFixture()
    if (state === 'revoked') f.state.invitationRevoked = true
    else f.state.invitationExpired = true
    await expect(verify(f)).rejects.toMatchObject({ code: 'invitation_unavailable' })
    expect(f.state.puts).toBe(0); expect(f.state.accepts).toBe(0)
  })
})

