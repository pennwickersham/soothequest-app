# Soothe Quest — RevenueCat Integration (monthly + yearly)

Updated for the final pricing model: **Soothe Plus at $3.99/month
(7-day free trial) or $34.99/year.**

Both monthly and yearly subscriptions unlock the same **SootheQuest Pro**
entitlement — the app checks exactly one thing:
`entitlements.active['SootheQuest Pro']` — and doesn't care which product
granted it.

---

## 1. Information you will generate (the checklist)

| # | Item | Where it comes from | Goes where |
|---|---|---|---|
| 1 | RevenueCat **Project ID** | RevenueCat → Project Settings | Reference only |
| 2 | **Public SDK key — Apple** (`appl_…`) | RevenueCat → API Keys | `billing.js` `APPLE_KEY` |
| 3 | **Public SDK key — Google** (`goog_…`) | RevenueCat → API Keys | `billing.js` `GOOGLE_KEY` |
| 4 | **Secret key** (`sk_…`) | RevenueCat → API Keys | ⛔ Nowhere in the app. Server/dashboard use only |
| 5 | **Entitlement ID** | You create: `SootheQuest Pro` | RevenueCat + `billing.js` (already set) |
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
**Play Console → Monetization → Products**. Note that iOS and Google use
different IDs for the two subscriptions — both are already set in
`billing.js` (`_getProductId` picks the Android override automatically).

| Product ID (App Store) | Product ID (Google Play) | Type | Price | Trial |
|---|---|---|---|---|
| `com.brewsterwickershampublications.soothequest.monthly` | `com.soothequest:premiummonthly` | Auto-renewable subscription (group: "Soothe Plus") | $3.99/mo | 7-day free (intro offer on Apple; free-trial phase on Google) |
| `com.brewsterwickershampublications.soothequest.yearly` | `com.soothequest:premium-yearly` | Auto-renewable subscription (group: "Soothe Plus") | $34.99/yr | 7-day free (intro offer on Apple; free-trial phase on Google) |
| `five_lives` | `five_lives` | Consumable | $1.99 | — |
| `power_pack` | `power_pack` | Consumable | $2.99 | — |
| `mega_power_pack` | `mega_power_pack` | Consumable | $4.99 | — |

## 3. RevenueCat dashboard configuration

1. **Project:** `Soothe Quest`, with an App Store app and a Play app, both
   on `com.brewsterwickershampublications.soothequest`.
2. **Products:** import/attach the five products above (using each platform's
   own ID from the table).
3. **Entitlement `SootheQuest Pro`:** attach **both** the monthly and yearly
   subscription products. The app checks exactly one thing —
   `entitlements.active['SootheQuest Pro']` — and doesn't care which product granted it.
4. **Offering `default`:** two packages —
   - `$rc_monthly` → the monthly subscription (week/monthly package)
   - `$rc_annual` → the yearly subscription
   The included `billing.js` reads exactly these two package slots
   (`.monthly` and `.annual`).
5. **Consumables** (`five_lives`, `power_pack`, `mega_power_pack`): these are
   purchased directly via `purchaseItem()` using RevenueCat's
   `getProducts` + `purchaseStoreProduct`. They do **not** affect the
   premium entitlement.

## 4. Wiring `billing.js` into the game (developer)

```bash
npm i @revenuecat/purchases-capacitor
npx cap sync
```

`billing.js` is a standalone module (no bundler needed) loaded with a classic
script tag in `soothe-quest.html`; it reaches the RevenueCat Capacitor plugin
through `window.Capacitor.Plugins.Purchases` at runtime and exposes
`window._billing`. `configure()` enables entitlement verification
(INFORMATIONAL), pending-transaction/handling and diagnostics.

The game's source functions map 1:1 onto the billing module:

| Function in soothe-quest.html | RevenueCat function |
|---|---|
| `buyPlus()` (monthly picked) | `_billing.purchasePlus('monthly')` |
| `buyPlus()` (yearly picked) | `_billing.purchasePlus('yearly')` |
| `doRestore()` | `_billing.restore()` |
| `managePlus()` | `_billing.manage()` |
| `buyLives()` | `_billing.purchaseItem('fiveLives')` then grant on `{ok:true}` |
| `buyPack()` | `_billing.purchaseItem('powerPack')` then grant on `{ok:true}` |
| `buyMega()` | `_billing.purchaseItem('megaPowerPack')` then grant on `{ok:true}` |

Startup wiring (sets `state.plus` from the entitlement, single source of
truth):

```js
/* at end of body, before the main game script: */
<script src="billing.js"></script>
/* ... then, after the game has defined applyEntitlement(): */
const billing = await _billing.init((st) => {
  state.plus = st.premium;   /* st.productIdentifier tells monthly vs yearly */
  state.plusPlan = st.premium && /yearly|annual/i.test(st.productIdentifier || '') ? 'yearly' : 'monthly';
  saveState(); refreshHUD();
});
if (billing.available) livePrices = await _billing.getPrices();
```

Always render `_billing.getPrices()` strings in the paywall rather than the
hardcoded ones — store prices localize per country automatically.

## 5. Testing before review

- **Apple:** create a Sandbox tester (App Store Connect → Users & Access →
  Sandbox). On a real device signed into the sandbox account: monthly trial
  starts (sandbox compresses time: 7-day trial ≈ 3 min), yearly purchase
  unlocks instantly, delete/reinstall + **Restore** re-grants both.
- **Google:** add your Gmail as a **License tester** (Play Console → Setup →
  License testing); purchases are free/fake for testers. Test all five products
  + restore.
- **RevenueCat dashboard** shows every sandbox event live — if a purchase
  doesn't appear there, the store credentials (items 8–9) are the problem.

## 6. Copy updates already made for the new model ✅

- **In-game paywall:** Yearly ($34.99/yr, "BEST VALUE") + Monthly
  ($3.99 with 7-day trial); button text switches between "Start 7-day free trial"
  and "Manage subscription" for active subscribers.
- **Terms of Use §2:** rewritten for subscription disclosures.
- **Store listing description:** pricing line updated.
- **Launch config sheet:** product table updated.

⚠️ If you already pushed the legal repo to GitHub, replace
`terms-of-use.html` there with the updated copy in this package.