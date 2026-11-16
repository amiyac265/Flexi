import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { buyDemoItem, EMPTY_DEMO, logDemoWorkout, workoutCoins } from '../../src/lib/coin-economy.ts'
import { createCoinCheckout } from '../../src/backend/coin-checkout.ts'
import type { CoinOrderRow } from '../../src/backend/database.types.ts'
import { paidCoinSession, verifyStripeSignature } from '../../supabase/functions/_shared/coin-payment-event.ts'

test('milestones pay 50 total only at 25, 50, 75, 100; other entries pay 10', () => {
  for (const ordinal of [1, 24, 26, 49, 51, 74, 76, 99, 101, 125]) assert.equal(workoutCoins(ordinal), 10)
  for (const ordinal of [25, 50, 75, 100]) assert.equal(workoutCoins(ordinal), 50)
  assert.throws(() => workoutCoins(0))
  let state = EMPTY_DEMO
  for (let index = 0; index < 100; index++) state = logDemoWorkout(state)
  assert.equal(state.workouts, 100); assert.equal(state.coins, 1160)
  const bought = buyDemoItem(state, { id: 'tee', price: 120 })
  assert.equal(bought.coins, 1040)
  assert.strictEqual(buyDemoItem(bought, { id: 'tee', price: 120 }), bought)
  assert.throws(() => buyDemoItem(EMPTY_DEMO, { id: 'tee', price: 120 }), /Not enough/)
})

test('Stripe signature requires the unmodified body, valid HMAC and recent timestamp', async () => {
  const body = '{"type":"checkout.session.completed"}', time = 1234567890, secret = 'unit-test-webhook-secret'
  const signature = createHmac('sha256', secret).update(`${time}.${body}`).digest('hex')
  const header = `t=${time},v1=${'0'.repeat(64)},v1=${signature}`
  assert.equal(await verifyStripeSignature(body, header, secret, time), true)
  assert.equal(await verifyStripeSignature(`${body} `, header, secret, time), false)
  assert.equal(await verifyStripeSignature(body, header, secret, time + 301), false)
  assert.equal(await verifyStripeSignature(body, header, secret, time - 301), false)
  assert.equal(await verifyStripeSignature(body, '', secret, time), false)
  assert.equal(await verifyStripeSignature(body, `t=${time},v1=bad`, secret, time), false)
})

const orderId = '00000000-0000-4000-8000-000000000001'
const session = { id: 'cs_test_verified123', mode: 'payment', status: 'complete', payment_status: 'paid', client_reference_id: orderId, metadata: { flexi_order_id: orderId, flexi_product: 'coins' }, amount_total: 99, currency: 'usd' }
test('only complete paid coin payments with order/owner and USD amounts can be fulfilled', () => {
  assert(paidCoinSession(session))
  for (const changes of [{ payment_status: 'unpaid' }, { status: 'open' }, { mode: 'subscription' }, { amount_total: 0 }, { amount_total: 99.5 }, { currency: 'eur' }, { client_reference_id: null }, { metadata: {} }]) assert.equal(paidCoinSession({ ...session, ...changes }), null)
})

test('checkout uses immutable database prices, ownership and retry key; rejects unsafe redirects', async t => {
  const names = ['STRIPE_SECRET_KEY', 'STRIPE_COIN_CHECKOUT_ENABLED', 'NEXT_PUBLIC_SITE_URL'] as const
  const old = names.map(name => process.env[name])
  t.after(() => names.forEach((name, i) => { if (old[i] === undefined) delete process.env[name]; else process.env[name] = old[i] }))
  process.env.STRIPE_SECRET_KEY = 'unit-test-key'; process.env.STRIPE_COIN_CHECKOUT_ENABLED = 'true'; process.env.NEXT_PUBLIC_SITE_URL = 'https://flexi.example'
  const order: CoinOrderRow = { id: orderId, owner: orderId, request_id: 'request-1234', pack_id: 'pocket', coins: 100, amount_cents: 99, currency: 'usd', status: 'pending', checkout_session_id: null, paid_at: null, created_at: new Date().toISOString() }
  const checkout = await createCoinCheckout(order, async (url, init) => {
    assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions')
    const params = new URLSearchParams(String(init?.body))
    assert.equal(params.get('line_items[0][price_data][unit_amount]'), '99')
    assert.equal(params.get('metadata[flexi_order_id]'), orderId)
    assert.equal(params.get('client_reference_id'), orderId)
    assert.equal(params.get('success_url'), `https://flexi.example/?coin_order=${orderId}`)
    assert.equal(new Headers(init?.headers).get('Idempotency-Key'), `flexi-coins-${orderId}`)
    return Response.json({ url: 'https://checkout.stripe.com/c/pay/test' })
  })
  assert.equal(checkout.orderId, orderId)
  await assert.rejects(createCoinCheckout(order, async () => Response.json({ url: 'https://attacker.example' })), /Unable to start/)
  await assert.rejects(createCoinCheckout({ ...order, status: 'paid' }), /already paid/)
  await assert.rejects(createCoinCheckout({ ...order, created_at: '2000-01-01T00:00:00Z' }), /expired/)
  process.env.STRIPE_COIN_CHECKOUT_ENABLED = 'false'
  await assert.rejects(createCoinCheckout(order), /not available/)
})
