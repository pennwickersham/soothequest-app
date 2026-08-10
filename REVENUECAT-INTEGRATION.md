# Soothe Quest — RevenueCat Integration (monthly + lifetime)

Updated for the final pricing model: **Soothe Plus at $3.99/month
(7-day free trial) or $34.99 lifetime (one-time purchase).**

A lifetime unlock is a different product *type* than the old annual plan —
a **non-consumable** (Apple) / **one-time product** (Google), not a
subscription. Two consequences worth knowing before setup:
1. **The free trial applies to monthly only.** Trials are a subscription
   feature; one-time purchases can't have them. The paywall reflects this.
2. **No cancellation concept for lifetime.** Only monthly needs a "manage
   subscription" path.

---

## 1. Information you will generate (the checklist)

| # | Item | Where it comes from | Goes where |
|---|---|---|---|
| 1 | RevenueCat **Project ID** | RevenueCat → Project Settings | Reference only |
| 2 | **Public SDK key — Apple** (`appl_…`) | RevenueCat → API Keys | `billing.js` `APPLE_KEY` |
| 3 | **Public SDK key — Google** (`goog_…`) | RevenueCat → API Keys | `billing.js` `GOOGLE_KEY` |
| 4 | **Secret key** (`sk_…`) | RevenueCat → API Keys | ⛔ Nowhere in the app. Server/dashboard use only |
| 5 | **Entitlement ID** | You create: `plus` | RevenueCat + `billing.js` (already set) |
| 6 | **Offering ID** | You create: `default` | RevenueCat |
| 7 | **Product IDs** | You create in both stores (table below) | Stores + RevenueCat |
| 8 | **Apple In-App Purchase Key** (.p8) + Key ID + Issuer ID | App Store Connect → Users & Access → Integrations → In-App Purchase | Upload into RevenueCat → Apple app config |
| 9 | **Google service-account JSON** | Google Cloud console (RevenueCat's Play setup wizard walks through it) with Play financial permissions | Upload into RevenueCat → Play app config |
| 10 | **Apple server notifications URL** | RevenueCat provides it | Paste into App Store Connect → App Information → App Store Server Notifications (production + sandbox) |
| 11 | **Play real-time notifications topic** | RevenueCat's wizard (Pub/Sub) | Play Console → Monetization setup |

Items 8–11 are what let RevenueCat verify receipts and hear about renewals,
cancellations, and refunds without you running a server — they're the whole
point of using it.

## 2. Products to create (exact spec)

Create in **App Store Connect → In-App Purchases/Subscriptions** and
**Play Console → Monetization → Products**, with identical IDs:

| Product ID | Apple type | Google type | Price | Trial |
|---|---|---|---|---|
| `soothe_plus_monthly` | Auto-renewable subscription (group: "Soothe Plus") | Subscription | $3.99/mo | 7-day free (intro offer on Apple; free-trial phase on Google) |
| `soothe_plus_lifetime` | **Non-consumable** | **One-time product** | $34.99 | — (not possible) |
| `sq_lives_5` | Consumable | One-time (consumable) | $1.99 | — |
| `sq_coins_600` | Consumable | One-time (consumable) | $4.99 | — |
| `sq_power_pack` | Consumable | One-time (consumable) | $2.99 | — |

## 3. RevenueCat dashboard configuration

1. **Project:** `Soothe Quest`, with an App Store app and a Play app, both
   on `com.brewsterwickershampublications.soothequest`.
2. **Products:** import/attach the five products above.
3. **Entitlement `plus`:** attach **both** `soothe_plus_monthly` and
   `soothe_plus_lifetime`. The app checks exactly one thing —
   `entitlements.active['plus']` — and doesn't care which product granted it.
4. **Offering `default`:** two packages —
   - `$rc_lifetime` → `soothe_plus_lifetime` (present it first / "Best value")
   - `$rc_monthly` → `soothe_plus_monthly`
   The included `billing.js` reads exactly these two package slots.

**Edge case to know:** a monthly subscriber who later buys lifetime keeps
both — the entitlement stays active forever via lifetime, but Apple/Google
will keep renewing the monthly until *the user* cancels it. Good practice
(already in the module): after a lifetime purchase, if `willRenew` is still
true for a monthly sub, show a gentle "you can cancel your monthly plan —
you own Plus forever now" note and call `manageSubscription()`.

## 4. Wiring `billing.js` into the game (developer)

```bash
npm i @revenuecat/purchases-capacitor
npx cap sync
```

The game's demo stubs map 1:1 onto the module:

| Demo stub in soothe-quest.html | Replace with |
|---|---|
| `startTrial()` (monthly picked) | `purchasePlus('monthly')` |
| `startTrial()` (lifetime picked) | `purchasePlus('lifetime')` |
| `cancelPlus()` | `manageSubscription()` (monthly only; hidden for lifetime — already handled in the UI) |
| `buy('lives'/'coins'/'pack')` | `purchaseItem('sq_lives_5' / 'sq_coins_600' / 'sq_power_pack')` then grant the items on `{ok:true}` |
| *(new, required by Apple)* | Add a **Restore purchases** button in the Plus modal → `restorePurchases()` |

Startup wiring (sets `state.plus` from the entitlement, single source of
truth):

```js
import { initBilling, getPlusPrices } from './billing';

initBilling((s) => {
  state.plus = s.plus;
  state.plusPlan = s.lifetime ? 'lifetime' : (s.plus ? 'monthly' : null);
  refreshHUD();
});
// paywall open: const p = await getPlusPrices();  → show p.monthly / p.lifetime
```

Always render `getPlusPrices()` strings in the paywall rather than the
hardcoded ones — store prices localize per country automatically.

The single-file game has no bundler; the Capacitor wrapper should use a
minimal Vite build (the same stack as RheumCompanion) so the ES-module
import works. That's a 15-minute setup the developer will recognize.

## 5. Testing before review

- **Apple:** create a Sandbox tester (App Store Connect → Users & Access →
  Sandbox). On a real device signed into the sandbox account: monthly trial
  starts (sandbox compresses time: 7-day trial ≈ 3 min), lifetime purchase
  unlocks instantly, delete/reinstall + **Restore** re-grants both.
- **Google:** add your Gmail as a **License tester** (Play Console → Setup →
  License testing); purchases are free/fake for testers. Test both products
  + restore.
- **RevenueCat dashboard** shows every sandbox event live — if a purchase
  doesn't appear there, the store credentials (items 8–9) are the problem.

## 6. Copy updates already made for the new model ✅

- **In-game paywall:** Lifetime ($34.99 once, "BEST VALUE") + Monthly
  ($3.99 with 7-day trial); button text switches between "Unlock forever"
  and "Start 7-day free trial"; lifetime owners see no cancel button.
- **Terms of Use §2:** rewritten for one-time lifetime + monthly
  subscription disclosures.
- **Store listing description:** pricing line updated.
- **Launch config sheet:** product table updated.

⚠️ If you already pushed the legal repo to GitHub, replace
`terms-of-use.html` there with the updated copy in this package.
