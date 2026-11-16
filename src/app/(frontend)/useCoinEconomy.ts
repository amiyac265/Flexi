'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { flexiAPI } from '@/lib/flexi-api'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { buyDemoItem, EMPTY_DEMO, logDemoWorkout, workoutCoins, type DemoEconomy } from '@/lib/coin-economy'
import type { Wallet } from '@/backend/database.types'
import { workoutInput, type WorkoutInput } from '@/backend/domain'

type Train = Awaited<ReturnType<typeof flexiAPI.train>>
type ShopItem = Awaited<ReturnType<typeof flexiAPI.shop>>['docs'][number]
const storageKey = 'flexi-demo-coins-v1'
export function useCoinEconomy() {
  const [demo, setDemo] = useState<DemoEconomy>(EMPTY_DEMO)
  const demoRef = useRef(EMPTY_DEMO)
  const [userId, setUserId] = useState<string | null>(null)
  const account = useRef<string | null>(null)
  const generation = useRef(0)
  const loadSequence = useRef(0)
  const [ready, setReady] = useState(false)
  const [wallet, setWallet] = useState<Wallet>({ balance: 0, lifetimeWorkouts: 0 })
  const [train, setTrain] = useState<Train | null>(null)
  const [catalog, setCatalog] = useState<ShopItem[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [pendingWorkout, setPendingWorkout] = useState<WorkoutInput | null>(null)
  const pending = useRef<WorkoutInput | null>(null)
  const [paymentMessage, setPaymentMessage] = useState('')
  const [pendingOrder, setPendingOrder] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    const owner = account.current, version = generation.current, load = ++loadSequence.current
    if (!owner) return
    try {
      const [nextWallet, nextTrain, shop] = await Promise.all([flexiAPI.wallet(), flexiAPI.train(), flexiAPI.shop(1, 100)])
      if (account.current !== owner || generation.current !== version || load !== loadSequence.current) return
      setWallet(nextWallet); setTrain(nextTrain); setCatalog(shop.docs); setReady(true); setError(''); return true
    } catch {
      if (account.current === owner && generation.current === version && load === loadSequence.current) setError('Unable to load your account. Check the backend setup and retry.')
      return false
    }
  }, [])
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (value && Number.isSafeInteger(value.workouts) && value.workouts >= 0 && Number.isSafeInteger(value.coins) && value.coins >= 0 && Array.isArray(value.owned) && value.owned.every((id: unknown) => typeof id === 'string')) {
        demoRef.current = value; setDemo(value)
      }
    } catch { /* Storage may be unavailable; demo still works for this session. */ }
    if (!isSupabaseConfigured()) { setReady(true); return }
    let disposed = false
    const sync = (id: string | null) => {
      if (disposed) return
      generation.current++
      account.current = id; setUserId(id); setReady(!id); setTrain(null); setCatalog([])
      setWallet({ balance: 0, lifetimeWorkouts: 0 }); setPaymentMessage(''); setPendingOrder(null); pending.current = null; setPendingWorkout(null); setError('')
      if (id) {
        try { const raw = sessionStorage.getItem(`flexi-pending-workout:${id}`); if (raw) { const draft = workoutInput(JSON.parse(raw)); pending.current = draft; setPendingWorkout(draft) } } catch { /* Invalid/unavailable local drafts are ignored. */ }
        void refresh()
      }
    }
    // Defer API calls until the Auth callback releases its internal session lock.
    let authEvent = false
    const { data: subscription } = flexiAPI.onAuthStateChange((_event, session) => {
      authEvent = true
      const id = session?.user.id ?? null
      if (id === account.current && _event !== 'INITIAL_SESSION') return
      setTimeout(() => sync(id), 0)
    })
    void flexiAPI.session().then(({ data, error: sessionError }) => {
      if (disposed || authEvent) return
      if (sessionError) { setError('Unable to read your session. Please sign in again.'); setReady(false); return }
      sync(data.session?.user.id ?? null)
    }).catch(() => { if (!disposed) { setError('Unable to read your session. Please reload.'); setReady(false) } })
    return () => { disposed = true; subscription.subscription.unsubscribe(); generation.current++ }
  }, [refresh])

  const saveDemo = (next: DemoEconomy) => {
    demoRef.current = next; setDemo(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* In-memory fallback. */ }
  }
  const logWorkout = async (input: { title: string; durationMinutes: number }) => {
    if (locked.current || !ready) throw new Error('Please wait for your account to finish loading.')
    locked.current = true; setBusy(true)
    const owner = account.current, version = generation.current
    try {
      const draft = pending.current ?? workoutInput({ ...input, requestId: crypto.randomUUID(), exercises: [] })
      if (!owner) {
        const next = logDemoWorkout(demoRef.current); saveDemo(next)
        return { coins: workoutCoins(next.workouts), ordinal: next.workouts }
      }
      pending.current = draft; setPendingWorkout(draft)
      try { sessionStorage.setItem(`flexi-pending-workout:${owner}`, JSON.stringify(draft)) } catch { /* Retry identity still survives while this page is open. */ }
      const result = await flexiAPI.logWorkout(draft)
      if (account.current !== owner || generation.current !== version) throw new Error('Your session changed. Reload your account before continuing.')
      loadSequence.current++
      setWallet(result.wallet); pending.current = null; setPendingWorkout(null)
      try { sessionStorage.removeItem(`flexi-pending-workout:${owner}`) } catch { /* Safe RPC retries handle an old stored draft. */ }
      await refresh()
      return { coins: result.replayed ? 0 : result.workout.coinReward, ordinal: result.wallet.lifetimeWorkouts }
    } finally { locked.current = false; setBusy(false) }
  }
  const purchase = async (id: string, price: number) => {
    if (locked.current || !ready) throw new Error('Please wait for your account to finish loading.')
    locked.current = true; setBusy(true)
    const owner = account.current, version = generation.current
    try {
      if (!owner) { saveDemo(buyDemoItem(demoRef.current, { id, price })); return }
      const result = await flexiAPI.claimCosmetic(id)
      if (account.current !== owner || generation.current !== version) throw new Error('Your session changed. Please refresh.')
      loadSequence.current++
      setWallet(result.wallet)
      setCatalog(current => current.map(item => item.id === id ? { ...item, owned: true } : item))
    } finally { locked.current = false; setBusy(false) }
  }
  const checkPayment = useCallback(async (id: string) => {
    const owner = account.current, version = generation.current
    if (!owner) return false
    try {
      const order = await flexiAPI.coinOrder(id)
      if (account.current !== owner || generation.current !== version) return false
      if (order.status !== 'paid') return false
      const refreshed = await refresh()
      if (account.current !== owner || generation.current !== version) return false
      if (!refreshed) { setPaymentMessage('Payment confirmed. Please retry refreshing your wallet.'); return false }
      setPaymentMessage(`${order.coins} coins purchased! Your wallet has been refreshed.`)
      setPendingOrder(null)
      const url = new URL(window.location.href); url.searchParams.delete('coin_order'); window.history.replaceState(null, '', url)
      return true
    } catch { return false }
  }, [refresh])
  useEffect(() => {
    const url = new URL(window.location.href), id = url.searchParams.get('coin_order')
    if (url.searchParams.get('coin_checkout') === 'cancelled') { setPaymentMessage('Checkout cancelled. No coins were added.'); url.searchParams.delete('coin_checkout'); window.history.replaceState(null, '', url) }
    if (!id || !userId || !/^[a-f0-9-]{36}$/i.test(id)) return
    setPendingOrder(id); setPaymentMessage('Confirming your coin purchase…')
    let stopped = false, timer: ReturnType<typeof setTimeout>, attempts = 0
    const poll = async () => {
      if (stopped) return
      const paid = await checkPayment(id)
      if (stopped || paid) return
      if (++attempts < 8) timer = setTimeout(() => { void poll() }, 1500)
      else setPaymentMessage('Payment is still processing. Check again in a moment; your coins arrive after payment confirmation.')
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [userId, checkPayment])
  return {
    ready, busy, error, userId, train, catalog, pendingWorkout, refresh, logWorkout, purchase,
    coins: userId ? wallet.balance : demo.coins,
    workouts: userId ? train?.progress.totalWorkouts ?? 0 : demo.workouts,
    lifetimeWorkouts: userId ? wallet.lifetimeWorkouts : demo.workouts,
    owned: userId ? catalog.filter(item => item.owned).map(item => item.id) : demo.owned,
    paymentMessage, pendingOrder, checkPayment,
  }
}
