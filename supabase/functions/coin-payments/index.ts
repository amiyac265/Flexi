// Trusted payment receiver only. Never import this function into the Next.js app.
// The service-role credential stays in Edge Function secrets and is used for ONE bounded RPC.
import { paidCoinSession, verifyStripeSignature } from '../_shared/coin-payment-event.ts'

Deno.serve(async (req: Request) => {
  const headers = { 'Cache-Control': 'no-store' }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'POST' } })
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET'), stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const supabaseURL = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret || !stripeKey || !supabaseURL || !serviceKey) return new Response('Webhook not configured', { status: 503, headers })
  // Verify the ORIGINAL bounded body, not a reserialized JSON representation.
  const reader = req.body?.getReader()
  if (!reader) return new Response('Missing body', { status: 400, headers })
  const chunks: Uint8Array[] = []; let size = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 131072) { await reader.cancel(); return new Response('Body too large', { status: 413, headers }) }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const raw = new TextDecoder().decode(bytes)
  if (!await verifyStripeSignature(raw, req.headers.get('stripe-signature') ?? '', secret)) return new Response('Invalid signature', { status: 400, headers })
  try {
    const event = JSON.parse(raw)
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return new Response('Ignored', { headers })
    const eventSession = event.data?.object
    if (eventSession?.metadata?.flexi_product !== 'coins') return new Response('Ignored', { headers })
    if (!/^cs_[a-zA-Z0-9_]+$/.test(eventSession.id ?? '')) return new Response('Invalid session', { status: 400, headers })
    // Read canonical payment state from Stripe, using the matching test/live account key.
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(eventSession.id)}`, {
      headers: { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': '2026-10-28.endive' }, signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return new Response('Payment lookup failed', { status: 503, headers })
    const canonical = await response.json()
    if (canonical.payment_status !== 'paid') return new Response('Payment pending', { headers })
    const session = paidCoinSession(canonical)
    if (!session) return new Response('Invalid paid coin session', { status: 400, headers })
    const result = await fetch(`${supabaseURL}/rest/v1/rpc/flexi_fulfill_coin_order`, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_order: session.metadata.flexi_order_id, p_session: session.id, p_owner: session.client_reference_id, p_amount: session.amount_total, p_currency: session.currency }),
    })
    // Non-2xx prompts Stripe retries. Never expose or log credentials or private response bodies.
    return new Response(result.ok ? 'Received' : 'Fulfillment failed', { status: result.ok ? 200 : 503, headers })
  } catch {
    return new Response('Retry later', { status: 503, headers })
  }
})
