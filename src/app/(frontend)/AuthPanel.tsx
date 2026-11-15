'use client'

import { useState, type FormEvent } from 'react'
import { flexiAPI } from '@/lib/flexi-api'
import { messageFor } from './use-flexi'

export default function AuthPanel({
  recovery = false,
  onRecovered,
}: {
  recovery?: boolean
  onRecovered: () => void
}) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const email = String(data.get('email') ?? '').trim(),
        password = String(data.get('password') ?? '')
      if (recovery) {
        await flexiAPI.updatePassword(password)
        onRecovered()
      } else if (mode === 'reset') {
        await flexiAPI.resetPassword(email)
        setNotice(
          'If an account exists for that address, check your email for a password reset link.',
        )
      } else if (mode === 'signup') {
        const result = await flexiAPI.signup({
          email,
          password,
          displayName: String(data.get('displayName') ?? ''),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        if (result.requiresEmailConfirmation) {
          setNotice('Check your email to confirm your account, then sign in.')
          setMode('login')
          form.reset()
        }
      } else await flexiAPI.login(email, password)
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="onboarding-shell auth-shell">
      <header className="onboarding-top">
        <div className="brand">FLEXI</div>
        <span>Your next chapter starts here.</span>
      </header>
      <section className="onboarding-card auth-card">
        <img
          src="/avatars/bunny-starter.png"
          alt="Pip, your bunny training companion"
          className="auth-buddy"
        />
        <span className="eyebrow">YOUR TRAINING COMPANION</span>
        <h1>
          {recovery
            ? 'Set a new password.'
            : mode === 'signup'
              ? 'Let’s grow together.'
              : mode === 'reset'
                ? 'Get back on track.'
                : 'Welcome back.'}
        </h1>
        <p>
          {recovery
            ? 'Choose a new password for your Flexi account.'
            : mode === 'signup'
              ? 'Create your account to save your workouts and grow your buddy.'
              : mode === 'reset'
                ? 'We’ll email you a link to reset your password.'
                : 'Sign in to pick up where you left off.'}
        </p>
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            {mode === 'signup' && !recovery && (
              <label className="full-field">
                <span>Your name</span>
                <input name="displayName" autoComplete="nickname" maxLength={60} required />
              </label>
            )}
            {!recovery && (
              <label className="full-field">
                <span>Email</span>
                <input name="email" type="email" autoComplete="email" required />
              </label>
            )}
            {(recovery || mode !== 'reset') && (
              <label className="full-field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete={recovery || mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={mode === 'signup' || recovery ? 8 : 1}
                  required
                />
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="status-notice" role="status">
                {notice}
              </p>
            )}
            <button type="submit" className="primary">
              {busy
                ? 'Please wait…'
                : recovery
                  ? 'Save password'
                  : mode === 'signup'
                    ? 'Create account'
                    : mode === 'reset'
                      ? 'Send reset link'
                      : 'Sign in'}
            </button>
          </fieldset>
        </form>
        {!recovery && (
          <div className="auth-links">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login')
                setError('')
                setNotice('')
              }}
            >
              {mode === 'login' ? 'New here? Create an account' : 'Back to sign in'}
            </button>
            {mode === 'login' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode('reset')
                  setError('')
                  setNotice('')
                }}
              >
                Forgot password?
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
