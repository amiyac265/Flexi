'use client'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import Script from 'next/script'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabaseConfig } from '@/lib/supabase/config'
import { createSwaggerAuthBridge, type SwaggerSystem, type SwaggerRequest } from '@/lib/swagger-auth'

declare global {
  interface Window { SwaggerUIBundle?: (options: Record<string, unknown>) => SwaggerSystem }
}
export default function APIExplorer() {
  const container = useRef<HTMLDivElement>(null)
  const swagger = useRef<SwaggerSystem | null>(null)
  const client = useRef<SupabaseClient | null>(null)
  const authBridge = useRef(createSwaggerAuthBridge())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signedInAs, setSignedInAs] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const configured = isSupabaseConfigured()

  function applyToken(value: string | null) {
    authBridge.current.setToken(value)
  }
  useEffect(() => {
    if (!configured) return
    const { url, key } = supabaseConfig()
    // Docs-only in-memory session. Does not read or overwrite the application's saved session.
    const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'flexi-api-docs' } })
    client.current = auth
    const { data: { subscription } } = auth.auth.onAuthStateChange((_event, session) => {
      applyToken(session?.access_token ?? null)
      setSignedInAs(session?.user.email ?? null)
    })
    return () => { subscription.unsubscribe(); auth.auth.stopAutoRefresh(); client.current = null }
  }, [configured])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client.current) return
    setBusy(true); setError('')
    try {
      const { error: authError } = await client.current.auth.signInWithPassword({ email, password })
      if (authError) setError(authError.message)
    } catch { setError('Could not reach Supabase. Check the connection settings and try again.') }
    finally { setPassword(''); setBusy(false) }
  }
  async function logout() {
    setBusy(true); setError('')
    try {
      const result = await client.current?.auth.signOut({ scope: 'local' })
      if (result?.error) setError(result.error.message)
    } catch { setError('Could not complete logout. Authorization has been cleared from this page.') }
    finally { applyToken(null); setSignedInAs(null); setBusy(false) }
  }
  function initializeSwagger() {
    if (!container.current || swagger.current || !window.SwaggerUIBundle) return
    swagger.current = window.SwaggerUIBundle({
      domNode: container.current,
      url: '/api/openapi',
      deepLinking: true, docExpansion: 'list', defaultModelsExpandDepth: -1,
      persistAuthorization: false, validatorUrl: null,
      requestInterceptor: (request: SwaggerRequest) => authBridge.current.intercept(request, window.location.origin),
      onComplete: () => {
        authBridge.current.onComplete()
        setLoaded(true)
      },
    })
    authBridge.current.attach(swagger.current)
  }
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <link rel="stylesheet" href="/api-docs/assets/swagger-ui.css" />
      <header className="mb-6 space-y-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-700">Flexi · Developer tools</p>
        <h1 className="text-3xl font-bold">API explorer</h1>
        <p className="max-w-3xl text-slate-600">Sign in with a confirmed Supabase test account, expand an endpoint, then choose <strong>Try it out → Execute</strong>. These requests read and write your configured database.</p>
        <a className="inline-block text-sm font-medium text-violet-700 underline" href="/api/openapi" target="_blank" rel="noreferrer">OpenAPI JSON · import into Postman or Insomnia</a>
      </header>
      <section aria-label="Test account authentication" className="mb-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="mb-2 text-lg font-semibold">Test account</h2>
        {!configured ? <p role="status">Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart the server. You can browse the documentation now.</p> : signedInAs ? (
          <div className="flex flex-wrap items-center gap-4">
            <p role="status">Authorized as <strong>{signedInAs}</strong>.</p>
            <button onClick={logout} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium disabled:opacity-50">Sign out</button>
          </div>
        ) : (
          <form onSubmit={login} className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium">Email
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="username" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Password
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <button disabled={busy} className="rounded-lg bg-violet-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in and authorize'}</button>
          </form>
        )}
        <p className="mt-3 text-sm text-slate-600">Create a confirmed user in Supabase → Authentication → Users after applying the migration. This page keeps its session in memory only. You can also use Swagger’s Authorize button with an existing access token.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </section>
      {!loaded && <p role="status" className="mb-4 text-slate-600">Loading API documentation…</p>}
      <div ref={container} />
      <Script src="/api-docs/assets/swagger-ui-bundle.js" strategy="afterInteractive" onReady={initializeSwagger} onError={() => { setLoaded(true); setError('Could not load Swagger UI. Restart the server after installing dependencies.') }} />
    </main>
  )
}
