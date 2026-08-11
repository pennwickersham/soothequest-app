/* =====================================================================
   Soothe Quest — RevenueCat billing module (standalone, no bundler needed)
   Loads as a classic <script src="billing.js"> and exposes window._billing.
   Accesses Capacitor plugins via window.Capacitor.Plugins at runtime.
   Products:
     Subscriptions (auto-renewable, entitlement: 'SootheQuest Pro'):
       com.brewsterwickershampublications.soothequest.monthly  — $3.99/mo
       com.brewsterwickershampublications.soothequest.yearly   — $34.99/yr
     Consumables (one-time, no entitlement):
       five_lives     — $1.99
       power_pack     — $2.99
       mega_power_pack — $4.99
   Entitlement: 'SootheQuest Pro'  (both subscriptions attach to it in RevenueCat)
   ===================================================================== */

const ENTITLEMENT = 'SootheQuest Pro';
const APPLE_KEY  = 'appl_DqHFTJSIZiHexGkiEVKZdbPknxJ';
const GOOGLE_KEY = 'goog_QFIeTqrGNbArrZhWvOsFUecXeJw';
const PRODUCTS = {
  monthly:      'com.brewsterwickershampublications.soothequest.monthly',
  yearly:       'com.brewsterwickershampublications.soothequest.yearly',
  fiveLives:    'five_lives',
  powerPack:    'power_pack',
  megaPowerPack:'mega_power_pack',
};

const _RC_LOG_LEVEL = Object.freeze({ DEBUG:'DEBUG', INFO:'INFO', WARN:'WARN', ERROR:'ERROR' });
const _ENTITLEMENT_VERIFICATION_MODE = Object.freeze({ DISABLED:'DISABLED', INFORMATIONAL:'INFORMATIONAL', ENFORCED:'ENFORCED' });
const _PURCHASES_ARE_COMPLETED_BY_TYPE = Object.freeze({ DEVELOPER:'DEVELOPER', REVENUECAT:'REVENUECAT' });
const _PRODUCT_CATEGORY = Object.freeze({ NON_SUBSCRIPTION:'NON_SUBSCRIPTION', SUBSCRIPTION:'SUBSCRIPTION', UNKNOWN:'UNKNOWN' });

function _getProductId(key) {
  const id = PRODUCTS[key];
  if (!id) return null;
  if ((key === 'monthly' || key === 'yearly') && window.Capacitor?.getPlatform?.() === 'android') {
    return key === 'monthly' ? 'com.soothequest:premiummonthly' : 'com.soothequest:premium-yearly';
  }
  return id;
}

let _billingOnChange = null;
let _isConfigured = false;
let _customerInfoListenerRemover = null;

function _isPurchaseCancelled(err) {
  if (!err) return false;
  if (err.code === 1 || err.code === '1') return true;
  if (err.userCancelled === true) return true;
  const msg = (err.message || err.readableErrorCode || '').toLowerCase();
  return msg.includes('cancelled') || msg.includes('canceled') || msg.includes('user cancelled')
    || msg.includes('purchase_cancelled');
}

function _statusFromCustomerInfo(customerInfo) {
  const ent = customerInfo?.entitlements?.active?.[ENTITLEMENT] || null;
  return {
    premium: !!ent,
    productIdentifier: ent ? ent.productIdentifier : null,
    willRenew: ent ? !!ent.willRenew : false,
    expirationDate: ent ? ent.expirationDate : null,
  };
}

async function _ensureConfigured() {
  if (_isConfigured) return true;
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return false;
  const Purchases = window.Capacitor.Plugins.Purchases;
  if (!Purchases) return false;
  try {
    const platform = window.Capacitor.getPlatform();
    const apiKey = platform === 'ios' ? APPLE_KEY : GOOGLE_KEY;
    await Purchases.setLogLevel({ level: _RC_LOG_LEVEL.DEBUG });
    await Purchases.configure({
      apiKey,
      entitlementVerificationMode: _ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
      pendingTransactionsForPrepaidPlansEnabled: true,
      diagnosticsEnabled: true,
      purchasesAreCompletedBy: _PURCHASES_ARE_COMPLETED_BY_TYPE.REVENUECAT,
    });
    _isConfigured = true;
    return true;
  } catch (err) {
    console.error('[Billing] configure failed:', err);
    return false;
  }
}

async function _billingInit(onChange) {
  _billingOnChange = onChange || null;
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return { available: false, premium: false };
  if (!(await _ensureConfigured())) return { available: false, premium: false };
  const Purchases = window.Capacitor.Plugins.Purchases;
  try {
    if (_customerInfoListenerRemover) {
      try { _customerInfoListenerRemover.remove(); } catch (_) {}
      _customerInfoListenerRemover = null;
    }
    _customerInfoListenerRemover = await Purchases.addCustomerInfoUpdateListener(
      ({ customerInfo }) => {
        if (_billingOnChange) _billingOnChange(_statusFromCustomerInfo(customerInfo));
      }
    );
    const { customerInfo } = await Purchases.getCustomerInfo();
    const status = _statusFromCustomerInfo(customerInfo);
    if (_billingOnChange) _billingOnChange(status);
    return { available: true, ...status };
  } catch (err) {
    console.error('[Billing] init error:', err);
    return { available: false, premium: false };
  }
}

async function _billingGetPrices() {
  if (!(await _ensureConfigured())) return { monthly:'$3.99', yearly:'$34.99', lives:'$1.99', pack:'$2.99', mega:'$4.99' };
  const Purchases = window.Capacitor.Plugins.Purchases;
  const fallback = { monthly:'$3.99', yearly:'$34.99', lives:'$1.99', pack:'$2.99', mega:'$4.99' };
  try {
    const offerings = await Purchases.getOfferings();
    const cur = offerings?.current;
    const prices = { ...fallback };
    if (cur?.monthly?.product?.priceString) prices.monthly = cur.monthly.product.priceString;
    if (cur?.annual?.product?.priceString)  prices.yearly  = cur.annual.product.priceString;
    try {
      const prodResult = await Purchases.getProducts({
        productIdentifiers: ['five_lives','power_pack','mega_power_pack'],
        type: _PRODUCT_CATEGORY.NON_SUBSCRIPTION,
      });
      console.log('[Billing] getProducts result:', prodResult?.products?.length ?? 0, 'products', prodResult);
      const prods = prodResult?.products || [];
      for (const p of prods) {
        if (p.identifier === 'five_lives')        prices.lives = p.priceString || fallback.lives;
        else if (p.identifier === 'power_pack')      prices.pack = p.priceString || fallback.pack;
        else if (p.identifier === 'mega_power_pack') prices.mega = p.priceString || fallback.mega;
      }
    } catch(err) { console.error('[Billing] getProducts error:', err); }
    console.log('[Billing] live prices:', prices);
    return prices;
  } catch { return fallback; }
}

async function _billingPurchasePlus(kind) {
  if (!(await _ensureConfigured())) return { ok: false, error: 'Subscription service unavailable.' };
  const Purchases = window.Capacitor.Plugins.Purchases;
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = kind === 'yearly' ? offerings?.current?.annual : offerings?.current?.monthly;
    if (!pkg) return { ok: false, error: 'Store not ready' };
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const status = _statusFromCustomerInfo(customerInfo);
    if (_billingOnChange) _billingOnChange(status);
    return { ok: status.premium, ...status };
  } catch (e) {
    console.log('[Billing] purchasePlus error:', e);
    if (_isPurchaseCancelled(e)) return { ok: false, cancelled: true };
    return { ok: false, error: e?.message || 'Purchase failed.' };
  }
}

async function _billingPurchaseItem(productKey) {
  const productId = _getProductId(productKey);
  if (!productId) return { ok: false, error: 'Unknown product.' };
  if (!(await _ensureConfigured())) return { ok: false, error: 'Store not ready.' };
  const Purchases = window.Capacitor.Plugins.Purchases;
  try {
    console.log('[Billing] purchaseItem lookup:', productId);
    const { products } = await Purchases.getProducts({
      productIdentifiers: [productId],
      type: _PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });
    console.log('[Billing] getProducts result:', products?.length ?? 0, 'products');
    if (!products || products.length === 0) {
      return { ok: false, error: 'Item unavailable' };
    }
    const { customerInfo } = await Purchases.purchaseStoreProduct({ product: products[0] });
    if (_billingOnChange) _billingOnChange(_statusFromCustomerInfo(customerInfo));
    return { ok: true };
  } catch (e) {
    if (_isPurchaseCancelled(e)) return { ok: false, cancelled: true };
    console.error('[Billing] purchaseItem error:', e);
    return { ok: false, error: e?.message || 'Purchase failed.' };
  }
}

async function _billingRestore() {
  if (!(await _ensureConfigured())) return { ok: false, error: 'Subscription service unavailable.' };
  const Purchases = window.Capacitor.Plugins.Purchases;
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    const status = _statusFromCustomerInfo(customerInfo);
    if (_billingOnChange) _billingOnChange(status);
    return { ok: true, ...status };
  } catch (e) {
    return { ok: false, error: e?.message || 'Restore failed.' };
  }
}

async function _billingManage() {
  if (!(await _ensureConfigured())) return;
  const Purchases = window.Capacitor.Plugins.Purchases;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    const url = customerInfo?.managementURL;
    if (url) window.open(url, '_blank');
  } catch { /* non-fatal */ }
}

window._billing = {
  init: _billingInit,
  getPrices: _billingGetPrices,
  purchasePlus: _billingPurchasePlus,
  purchaseItem: _billingPurchaseItem,
  restore: _billingRestore,
  manage: _billingManage,
  ENTITLEMENT, PRODUCTS,
};