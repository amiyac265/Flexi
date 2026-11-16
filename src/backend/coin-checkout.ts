import { BackendError } from './domain.ts'
import type { CoinOrderRow } from './database.types.ts'

export function coinCheckoutEnabled() {
  return process.env.STRIPE_COIN_CHECKOUT_ENABLED === 'true' && Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_SITE_URL)
}
export function requireCoinCheckout() {
  if (!coinCheckoutEnabled()) throw new BackendError('PAYMENTS_NOT_CONFIGURED', 'Coin purchases are not available yet. You can still earn coins by logging workouts.', 503)
}
/** The amount, currency, owner and coin count come from an immutable database order. */
export async function createCoinCheckout(order: CoinOrderRow, fetcher: typeof fetch = fetch) {
  requireCoinCheckout()
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL!)
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) {
    throw new BackendError('PAYMENTS_NOT_CONFIGURED', 'Configure a secure app URL before enabling payments.', 503)
  }
  if (order.status === 'paid') throw new BackendError('CONFLICT', 'This order is already paid. Refresh your wallet.', 409)
  // Stripe may prune idempotency keys after 24h. Never reuse an old order for a new charge.
  if (Date.now() - Date.parse(order.created_at) > 23 * 60 * 60 * 1000) throw new BackendError('CHECKOUT_EXPIRED', 'This checkout expired. Start a new coin purchase.', 409)
  const params = new URLSearchParams({
    mode: 'payment', 'payment_method_types[0]': 'card',
    client_reference_id: order.owner,
    'metadata[flexi_order_id]': order.id,
    'metadata[flexi_product]': 'coins',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': order.currency,
    'line_items[0][price_data][unit_amount]': String(order.amount_cents),
    'line_items[0][price_data][product_data][name]': `${order.coins} Flexi coins`,
    success_url: `${origin.origin}/?coin_order=${order.id}`,
    cancel_url: `${origin.origin}/?coin_checkout=cancelled`,
  })
  const response = await fetcher('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `flexi-coins-${order.id}`, 'Stripe-Version': '2026-10-28.endive' },
    body: params,
  })
  if (!response.ok) throw new BackendError('CHECKOUT_UNAVAILABLE', 'Unable to start checkout. Please retry.', 503)
  const session = await response.json() as { url?: string }
  if (!session.url || new URL(session.url).origin !== 'https://checkout.stripe.com') throw new BackendError('CHECKOUT_UNAVAILABLE', 'Unable to start checkout. Please retry.', 503)
  return { orderId: order.id, url: session.url }
}
