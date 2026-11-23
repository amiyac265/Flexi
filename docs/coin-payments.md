# Workout coins and Stripe coin packs

Workout rewards and shop spending work without Stripe. Real-money checkout is **disabled by default**. This change does not create a Stripe account, deploy a webhook, charge a card or modify a hosted database.

## Prices and milestones

Each new workout earns 10 coins; entries 25, 50, 75, 100 earn **50 total**, replacing the usual 10. Only those four milestones are special. Reward identity is the immutable workout ID, not the calendar day. Voided entries keep earned coins and consume their lifetime ordinal. Currency is separate from XP and rankings.

Initial proposed packs are 100 coins for USD 0.99, 550 for USD 4.99, and 1,200 for USD 9.99. Review pricing before activation. Prices and quantities live in `coin_packs`; adjust via a **new migration**, not client code. Orders retain the quantity/price at creation even if packs change later. New users receive no free starting balance. Existing completed workouts receive a one-time migration backfill; old inventory is preserved.

## Configure in test mode first

1. Apply versioned migrations to the intended Supabase project using its normal migration workflow. Existing production data is preserved. Do not edit the core migration.
2. In the Next.js deployment's secret environment settings, set `STRIPE_SECRET_KEY` to the appropriate Stripe test secret. Set the public `NEXT_PUBLIC_SITE_URL` to the app's exact origin. Production must use HTTPS. Keep `STRIPE_COIN_CHECKOUT_ENABLED` unset/false until the webhook is working. Secret names are documented here only; `.env.example` intentionally lists public configuration only. Never put actual credentials in git, chat or browser variables.
3. Deploy `supabase/functions/coin-payments` to the **same Supabase project**. Its configuration uses `verify_jwt = false` because Stripe authenticates the original request with its HMAC signature. The handler still rejects missing/invalid/stale signatures. The Edge Function needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in its secret settings; `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Edge runtime. Never copy the service-role key into the Next.js app. That credential is confined to the trusted payment receiver and one bounded fulfillment RPC.
4. In Stripe test mode, create an event destination pointing at `https://<project-ref>.supabase.co/functions/v1/coin-payments`. Select `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Set the resulting endpoint signing secret on the Edge Function. Use matching Stripe API and webhook secrets from the same account/mode. Secrets for Stripe CLI local forwarding and Dashboard destinations differ.
5. Once the destination is reachable, set `STRIPE_COIN_CHECKOUT_ENABLED=true` in the app's secret settings and restart/redeploy. Sign in and use Shop → Get coins. The API creates an immutable order via the user's authenticated database RPC, then creates a Stripe-hosted Checkout session using the stored USD amount and coin quantity. Neither card details nor payment credentials touch Flexi's browser code.
6. The verified Edge Function reads canonical payment state from Stripe. Only `payment_status=paid`, `status=complete`, `mode=payment` sessions marked as Flexi coin purchases are eligible. The database verifies owner/amount/currency and deduplicates the Checkout session and order before crediting coins. No success-page URL or browser callback can add coins. The app polls **owned order status** after return and refreshes the wallet after fulfillment. If the notification is delayed, it shows pending and offers Check payment.

## Required validation before accepting live payments

- Sign up/confirm email/sign in and log an entry; reload and verify wallet + progress persisted.
- Verify 24→25, 49→50, 74→75, 99→100, 100→101; the new award is 50 only at the four named milestones.
- Retry a saved workout and repeat a purchased cosmetic; neither changes the balance twice.
- Complete a Stripe test purchase and verify one credit, correct account and quantity, persisted wallet, and a purchase with the credited coins.
- Replay the signed notification; only one credit appears. Try a forged signature, edited body, stale signature, unpaid session, different owner, wrong amount and wrong currency; none should credit coins.
- Cancel checkout, decline payment and close the tab before returning. Cancellation/decline grants no coins; an actual successful payment is still fulfilled by the webhook even if the user never returns.
- Delay or fail the webhook once, then allow the retry; the UI stays pending until the order is paid, then updates. Reconcile paid sessions against orders if a destination has prolonged failures.
- Test with two accounts; neither can read the other's wallet/order or spend the other's balance. Test concurrent distinct purchases with insufficient combined funds.
- Test pack price changes against existing pending orders: original order terms remain immutable. Checkout retries reuse the same order/idempotency key. Orders older than 23 hours require a fresh request identity to avoid Stripe's 24-hour idempotency expiry.

## Current limits and launch decisions

This implements one-time USD card purchases. Purchases are not subscriptions. Refunds, disputes/chargebacks, taxes, support workflows, receipts/purchase-history UI and legal/store policy review still need a launch decision. Refund/dispute reversals are **not automated**: reconcile affected payment orders and handle them through an audited operational process before enabling live money. Do not enable live checkout until that process is defined and test payments have been smoke-tested. To stop new checkouts, unset `STRIPE_COIN_CHECKOUT_ENABLED`; keep the webhook active so already-paid sessions can finish fulfillment. Monitor retry failures without logging private bodies or credentials. The database/API checks do not replace the hosted Auth and Stripe smoke tests.

## References

- [Stripe: Fulfill orders](https://docs.stripe.com/checkout/fulfillment)
- [Stripe: Create a Checkout Session](https://docs.stripe.com/api/checkout/sessions/create)
- [Supabase: Handling Stripe webhooks](https://supabase.com/docs/guides/functions/examples/stripe-webhooks)
