'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFlexiAPI, type Character, type ShopItem, type Train } from '@/lib/flexi-api'
import { allPages, monthRange } from '@/lib/frontend-data'
import type { CalendarEvent, WorkoutLog } from '@/backend/data'

export type Snapshot = {
  train: Train
  character: Character
  balance: number | null
  shop: ShopItem[]
  history: WorkoutLog[]
  archivedItems: number
}
export const messageFor = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to complete the request. Please retry.'

export function useFlexi(userId: string) {
  const api = useMemo(() => createFlexiAPI('/api', userId), [userId])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const lock = useRef(false)
  const sequence = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      sequence.current++
    }
  }, [])
  const refresh = useCallback(async () => {
    const ticket = ++sequence.current
    setLoading(true)
    try {
      const [train, character, shop, history, inventory, balance] = await Promise.all([
        api.train(),
        api.character(),
        allPages(api.shop),
        allPages(api.workouts),
        allPages(api.inventory),
        api
          .wallet()
          .then((wallet) => wallet.balance)
          .catch(() => null),
      ])
      if (!alive.current || ticket !== sequence.current || train.profile.id !== userId) return null
      const next = {
        train,
        character,
        shop,
        history,
        balance,
        archivedItems: inventory.filter((item) => !item.item).length,
      }
      setSnapshot(next)
      setError('')
      return next
    } catch (error) {
      if (alive.current && ticket === sequence.current) setError(messageFor(error))
      return null
    } finally {
      if (alive.current && ticket === sequence.current) setLoading(false)
    }
  }, [api, userId])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const run = async (
    action: () => Promise<void>,
    onError: (message: string) => void = setError,
  ) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (error) {
      if (alive.current) onError(messageFor(error))
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }
  return { api, snapshot, error, loading, busy, refresh, run }
}

export function useCalendar(
  api: ReturnType<typeof createFlexiAPI>,
  month: string,
  zone: string,
  revision: number,
) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setEvents([])
    setError('')
    const range = monthRange(month, zone)
    allPages((page) => api.calendar(range.from, range.to, page))
      .then((events) => {
        if (active) setEvents(events)
      })
      .catch((error) => {
        if (active) setError(messageFor(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [api, month, zone, revision, retry])
  return { events, error, loading, retry: () => setRetry((value) => value + 1) }
}
