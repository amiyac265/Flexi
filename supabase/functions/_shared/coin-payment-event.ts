/** Web Crypto works in both the isolated Deno webhook and Node tests. */
export async function verifyStripeSignature(body: string, header: string, secret: string, nowSeconds = Date.now() / 1000) {
  const parts = header.split(',').map(value => value.trim().split('='))
  const timestamp = parts.find(([name]) => name === 't')?.[1]
  const signatures = parts.filter(([name]) => name === 'v1').map(([, value]) => value)
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > 300) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  for (const signature of signatures) {
    if (!/^[a-f0-9]{64}$/.test(signature ?? '')) continue
    const bytes = Uint8Array.from(signature.match(/.{2}/g)!, value => parseInt(value, 16))
    if (await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${timestamp}.${body}`))) return true
  }
  return false
}
export type PaidCoinSession = { id: string; client_reference_id: string; metadata: { flexi_order_id: string; flexi_product: 'coins' }; amount_total: number; currency: string }
export function paidCoinSession(value: unknown): PaidCoinSession | null {
  if (!value || typeof value !== 'object') return null
  const s = value as Record<string, unknown>, meta = s.metadata as Record<string, unknown> | null
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
  if (s.mode !== 'payment' || s.status !== 'complete' || s.payment_status !== 'paid' || meta?.flexi_product !== 'coins') return null
  if (typeof s.id !== 'string' || !/^cs_[a-zA-Z0-9_]+$/.test(s.id) || typeof s.client_reference_id !== 'string' || !uuid.test(s.client_reference_id) || typeof meta.flexi_order_id !== 'string' || !uuid.test(meta.flexi_order_id) || !Number.isSafeInteger(s.amount_total) || Number(s.amount_total) < 50 || s.currency !== 'usd') return null
  return s as PaidCoinSession
}
