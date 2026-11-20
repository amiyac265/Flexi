'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Friends } from '@/backend/database.types'
import type { createFlexiAPI } from '@/lib/flexi-api'
import { AvatarArt } from './FlexiVisuals'
import { Icon } from './Icon'
import { messageFor } from './use-flexi'
import './friends.css'

export default function FriendsPanel({ api }: { api: ReturnType<typeof createFlexiAPI> }) {
  const [data, setData] = useState<Friends | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const mounted = useRef(false)
  const lock = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api
      .friends()
      .then((result) => {
        if (active) setData(result)
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
  }, [api, revision])

  async function addFriend(event: FormEvent) {
    event.preventDefault()
    if (lock.current || loading || !data) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api.addFriend(code.trim().toUpperCase())
      if (!mounted.current) return
      setData(
        (current) =>
          current && {
            ...current,
            friends: [
              result.friend,
              ...current.friends.filter((friend) => friend.id !== result.friend.id),
            ],
          },
      )
      setCode('')
      setNotice(
        result.replayed
          ? `You and ${result.friend.displayName} are already friends.`
          : `${result.friend.displayName} joined your circle!`,
      )
    } catch (error) {
      if (mounted.current) setError(messageFor(error))
    } finally {
      lock.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function copyCode() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.code)
      if (mounted.current) setNotice('Friend code copied! Share it with your workout buddy.')
    } catch {
      if (mounted.current) setNotice('Select your friend code below and copy it to share.')
    }
  }

  return (
    <section className="friends-panel" aria-labelledby="friends-title" aria-busy={loading || busy}>
      <header className="friends-heading">
        <div>
          <span className="eyebrow">YOUR CIRCLE</span>
          <h2 id="friends-title">Good company. Better habits.</h2>
        </div>
        <button
          className="secondary"
          disabled={loading || busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh friends
        </button>
      </header>
      <div className="friend-connect-grid">
        <div className="friend-code-card">
          <span className="friend-card-icon">
            <Icon name="users" />
          </span>
          <h3>Bring your buddy.</h3>
          <p>Share your code to connect. You’ll appear in each other’s friend list right away.</p>
          <label htmlFor="own-friend-code">Your friend code</label>
          <div className="friend-code-row">
            <input
              id="own-friend-code"
              readOnly
              value={data?.code ?? ''}
              placeholder={loading ? 'Loading…' : 'Unavailable'}
              onFocus={(event) => event.target.select()}
            />
            <button className="secondary" disabled={!data} onClick={() => void copyCode()}>
              Copy code
            </button>
          </div>
        </div>
        <form className="friend-add-card" onSubmit={(event) => void addFriend(event)}>
          <span className="friend-card-icon">
            <Icon name="plus" />
          </span>
          <h3>A little stronger, together.</h3>
          <p>Got a friend’s code? Add them to your circle.</p>
          <label htmlFor="add-friend-code">Their friend code</label>
          <input
            id="add-friend-code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value)
              setNotice('')
              setError('')
            }}
            placeholder="e.g. A1B2C3D4E5F6"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={32}
            required
            aria-describedby="friend-code-hint"
          />
          <small id="friend-code-hint">12 letters and numbers. No spaces needed.</small>
          <button
            className="primary"
            disabled={loading || busy || !data || !/^[a-fA-F0-9]{12}$/.test(code.trim())}
          >
            <Icon name="plus" />
            {busy ? 'Adding friend…' : 'Add friend'}
          </button>
        </form>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="friend-notice" role="status">
        {notice}
      </p>
      <div className="friends-list-heading">
        <h3>
          Your friends <span>{data?.friends.length ?? 0}</span>
        </h3>
        <p>A familiar face for every step.</p>
      </div>
      {loading && !data ? (
        <p role="status">Finding your circle…</p>
      ) : (
        data &&
        (data.friends.length ? (
          <ul className="friends-grid">
            {data.friends.map((friend) => (
              <li className="friend-person" key={friend.id}>
                <div className="friend-portrait">
                  <AvatarArt avatar={friend.avatar} />
                </div>
                <div>
                  <h4>{friend.displayName}</h4>
                  <span>
                    <Icon name="check" />
                    Friends
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="friends-empty">
            <div className="friend-empty-art">
              <AvatarArt avatar="bunny" />
              <AvatarArt avatar="turtle" />
            </div>
            <h3>Your circle starts with one friend.</h3>
            <p>Swap codes with a buddy and take the first step together.</p>
          </div>
        ))
      )}
    </section>
  )
}
