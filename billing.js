/* =====================================================================
   Soothe Quest — RevenueCat billing module (final pricing model)
   Products:  soothe_plus_monthly   auto-renewing sub, $3.99/mo, 7-day trial
              soothe_plus_yearly    auto-renewing sub, $34.99/yr, 7-day trial
   Entitlement: 'plus'  (both products attach to it in RevenueCat)
   Offering 'default' packages: $rc_monthly + $rc_annual
   NOTE: RevenueCat's SDK exposes the yearly package as `.annual`
   (there is no `.yearly` getter) — the offering package must be the
   standard $rc_annual slot for this module to find it.
   Dependency:  npm i @capacitor/core @revenuecat/purchases-capacitor
                npx cap sync
   See REVENUECAT-INTEGRATION.md for the full store-side checklist.
   ===================================================================== */
import { Capacitor } from '@capacitor/core';
import { Purchases, LOG_LEVEL, PURCHASES_ERROR_CODE }
  from '@revenuecat/purchases-capacitor';

const ENTITLEMENT = 'plus';

// 🔑 Paste your PUBLIC SDK keys from RevenueCat → Project → API keys.
// (Public keys are safe in the app. The secret sk_ key must NEVER be here.)
const APPLE_KEY  = 'appl_DqHFTJSIZiHexGkiEVKZdbPknxJ';
const GOOGLE_KEY = 'goog_QFIeTqrGNbArrZhWvOsFUecXeJw';

let onEntitlementChange = null;   // (status) => void, wired to game state

function statusFrom(customerInfo) {
  const ent = customerInfo?.entitlements?.active?.[ENTITLEMENT] || null;
  return {
    plus: !!ent,
    yearly: !!ent && /yearly|annual/i.test(ent.productIdentifier || ''),
    willRenew: ent ? !!ent.willRenew : false,
    expirationDate: ent ? ent.expirationDate : null,
  };
}

/* Call once at startup. Returns current status (or {available:false} on web). */
export async function initBilling(onChange) {
  onEntitlementChange = onChange || null;
  if (!Capacitor.isNativePlatform()) return { available: false, plus: false };

  await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
  await Purchases.configure({
    apiKey: Capacitor.getPlatform() === 'ios' ? APPLE_KEY : GOOGLE_KEY,
    // No appUserID: RevenueCat generates an anonymous id — matches the
    // privacy policy ("randomly generated app user identifier").
  });
  await Purchases.addCustomerInfoUpdateListener((customerInfo) => {
    if (onEntitlementChange) onEntitlementChange(statusFrom(customerInfo));
  });
  const { customerInfo } = await Purchases.getCustomerInfo();
  const status = statusFrom(customerInfo);
  if (onEntitlementChange) onEntitlementChange(status);
  return { available: true, ...status };
}

/* Live store prices for the paywall (falls back to hardcoded on failure).
   Always display these, not hardcoded strings — they localize per country. */
export async function getPlusPrices() {
  try {
    const { offerings } = await Purchases.getOfferings();
    const cur = offerings?.current;
    return {
      /* .annual, not .yearly — see note in the header */
      monthly: cur?.monthly?.product?.priceString || '$3.99',
      yearly:  cur?.annual?.product?.priceString  || '$34.99',
      _packages: { monthly: cur?.monthly, yearly: cur?.annual },
    };
  } catch {
    return { monthly: '$3.99', yearly: '$34.99', _packages: {} };
  }
}

/* kind: 'monthly' | 'yearly'. Resolves {ok, plus, cancelled, error} */
export async function purchasePlus(kind) {
  try {
    const { offerings } = await Purchases.getOfferings();
    const pkg = kind === 'yearly'
      ? offerings?.current?.annual   /* .annual, not .yearly */
      : offerings?.current?.monthly;
    if (!pkg) return { ok: false, error: 'Store not ready — try again shortly.' };
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const status = statusFrom(customerInfo);
    if (onEntitlementChange) onEntitlementChange(status);
    return { ok: status.plus, ...status };
  } catch (e) {
    if (e?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return { ok: false, cancelled: true };
    }
    return { ok: false, error: e?.message || 'Purchase failed.' };
  }
}

/* App Store requirement: a visible Restore button must call this. */
export async function restorePurchases() {
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    const status = statusFrom(customerInfo);
    if (onEntitlementChange) onEntitlementChange(status);
    return { ok: true, ...status };
  } catch (e) {
    return { ok: false, error: e?.message || 'Restore failed.' };
  }
}

/* Opens the OS subscription-management screen (cancel / change plan). */
export async function manageSubscription() {
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    const url = customerInfo?.managementURL;
    if (url) window.open(url, '_blank');
  } catch { /* non-fatal */ }
}
