'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { flexiAPI } from '@/lib/flexi-api'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type { WorkoutInput } from '@/backend/domain'

export function EconomyDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close() } }, [])
  return <dialog ref={ref} className="economy-dialog" aria-labelledby="economy-dialog-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose() } }}><div className="economy-dialog-heading"><h2 id="economy-dialog-title">{title}</h2><button aria-label="Close dialog" onClick={onClose}>×</button></div>{children}</dialog>
}

export function WorkoutDialog({ pending, busy, onSave, onClose }: { pending: WorkoutInput | null; busy: boolean; onSave: (input: { title: string; durationMinutes: number }) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState(pending?.title ?? '')
  const [minutes, setMinutes] = useState(String(pending?.durationMinutes ?? 30))
  const [error, setError] = useState('')
  return <EconomyDialog title="Log your workout" onClose={busy ? () => {} : onClose}><p>Every entry earns 10 coins. Your 25th, 50th, 75th, and 100th entries earn 50 coins each.</p><form onSubmit={async event => { event.preventDefault(); setError(''); try { await onSave({ title, durationMinutes: Number(minutes) }) } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save. Please retry.') } }}><label>Workout name<input autoFocus required maxLength={120} value={title} readOnly={busy || Boolean(pending)} onChange={event => setTitle(event.target.value)} placeholder="e.g. Upper body strength" /></label><label>Duration in minutes<input type="number" required min={1} max={1440} step={1} value={minutes} readOnly={busy || Boolean(pending)} onChange={event => setMinutes(event.target.value)} /></label>{pending && <p className="economy-hint">Retrying the same entry checks its saved result without awarding coins twice.</p>}{error && <p role="alert" className="economy-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Saving…' : pending ? 'Retry save' : 'Save workout & earn coins'}</button></form></EconomyDialog>
}

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const [signup, setSignup] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  return <EconomyDialog title={signup ? 'Create your Flexi account' : 'Welcome back'} onClose={onClose}>{!isSupabaseConfigured() ? <p>Account sign-in is not available yet. You can try earning and spending demo coins while setup is completed.</p> : <><p>Save your coins and closet to your account.</p><form onSubmit={async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage('')
    try {
      if (signup) {
        const result = await flexiAPI.signup({ email: String(form.get('email')), password: String(form.get('password')), displayName: String(form.get('displayName')), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        if (result.requiresEmailConfirmation) { setMessage('Check your email to confirm your account, then sign in here.'); return }
      } else await flexiAPI.login(String(form.get('email')), String(form.get('password')))
      onClose()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to sign in. Please try again.') } finally { setBusy(false) }
  }}>{signup && <label>Name<input name="displayName" required maxLength={60} autoComplete="nickname" /></label>}<label>Email<input autoFocus name="email" required type="email" autoComplete="email" /></label><label>Password<input name="password" required minLength={8} type="password" autoComplete={signup ? 'new-password' : 'current-password'} /></label><p role="status">{message}</p><button className="primary" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button></form><button className="economy-link" disabled={busy} onClick={() => { setSignup(value => !value); setMessage('') }}>{signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</button></>}</EconomyDialog>
}

export function CoinPacksDialog({ signedIn, onSignIn, onClose }: { signedIn: boolean; onSignIn: () => void; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof flexiAPI.coinPacks>> | null>(null)
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const request = useRef<{ packId: string; requestId: string } | null>(null)
  useEffect(() => { if (!signedIn) return; let active = true; void flexiAPI.coinPacks().then(value => { if (active) setData(value) }).catch(() => { if (active) setMessage('Unable to load coin packs. Please close and try again.') }); return () => { active = false } }, [signedIn])
  return <EconomyDialog title="A little coin boost" onClose={busy ? () => {} : onClose}><p>Keep earning through workouts, or top up your wallet with a one-time purchase.</p>{!signedIn ? <><p>Sign in to buy coins and keep them in your account. Demo coins cannot be purchased with real money.</p><button className="primary" onClick={onSignIn}>Sign in to buy coins</button></> : <>{!data && !message && <p role="status">Loading coin packs…</p>}{data && !data.enabled && <p className="economy-hint">Coin purchases are coming soon. You can still earn coins with every workout.</p>}<div className="coin-pack-grid">{data?.packs.map(pack => <button key={pack.id} disabled={!data.enabled || busy} onClick={async () => {
    if (busy) return
    setBusy(true); setMessage('')
    if (!request.current || request.current.packId !== pack.id) request.current = { packId: pack.id, requestId: crypto.randomUUID() }
    try {
      const checkout = await flexiAPI.coinCheckout(pack.id, request.current.requestId)
      window.location.assign(checkout.url)
    } catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'CHECKOUT_EXPIRED') request.current = null; setMessage(error instanceof Error ? error.message : 'Unable to open checkout. Please retry.'); setBusy(false) }
  }}><span aria-hidden="true">✦</span><b>{pack.coins.toLocaleString()} coins</b><small>{new Intl.NumberFormat('en-US', { style: 'currency', currency: pack.currency }).format(pack.amountCents / 100)}</small></button>)}</div><p className="economy-hint">Checkout opens securely with Stripe. Coins arrive after your payment is confirmed.</p></>}{message && <p role="alert" className="economy-error">{message}</p>}{busy && <p role="status">Opening secure checkout…</p>}</EconomyDialog>
}
