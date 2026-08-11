# Soothe Quest

A gentle match-3 game for people living with chronic pain and fatigue.
Most games punish you for resting. This one is built around it.

Companion to *Managing Life With Chronic Pain: The Resilient Path*
by Pendleton B. Wickersham, MD — [theresilientpathbook.com](https://theresilientpathbook.com)

- Marketing site: <https://pennwickersham.github.io/SootheQuest/>
- Bundle ID: `com.brewsterwickershampublications.soothequest`

## Design commitments

These are product rules, not features to be optimized away later:

- **No pushy timers.** Battles have a clock, but "Softer effects" grants extra
  time free, so anyone who needs room can have it without paying.
- **Rest is never punished.** No streak that punishes a missed day.
- **Nothing is pay-to-win.** Lives, power-ups, and wishes are all earned by
  playing. The only thing for sale is comfort (Soothe Plus).
- **No gambling mechanics.** The Wishing Lantern always grants something —
  there is no "you lost" outcome, and no casino framing.
- **Data stays on the device.** No accounts, no servers, no analytics.
  Backups are files the player exports and keeps.

## Stack

Single-file HTML game (`soothe-quest.html`) bundled by Vite into `www/`,
wrapped by Capacitor for iOS and Android.

| File | Purpose |
|---|---|
| `soothe-quest.html` | The entire game: markup, styles, and logic |
| `billing.js` | RevenueCat subscription module (Soothe Plus) |
| `encouragements.json` | Quotes from the book shown on the win card |
| `level-validator.js` | Dev tool: checks level definitions are solvable |
| `www/` | Build output loaded by the native shells |

## Getting started

```bash
npm install
npm run build      # bundles into www/
npx cap sync       # copies www/ into the native projects
```

Open `www/index.html` in a browser to play the web build. In-app purchases
are simulated on the web and are clearly labeled as such; real billing runs
only in the native apps.

## Release signing (Android)

The release keystore and its passwords are **not** in this repository, and
must never be committed. Together they are the credential that lets someone
publish an update that Google Play accepts as genuinely yours.

To build a signed release:

1. Put `soothe-quest-release.keystore` in `android/app/`.
2. Copy `keystore.properties.example` to `keystore.properties` and fill in
   the real values.
3. Build as usual — see `APK-BUILD-GUIDE.md`.

Both files are git-ignored. Keep the keystore in a password manager or an
encrypted backup; if it is lost, you cannot ship updates to the existing
Play listing.

## In-app purchases

Soothe Plus is a subscription: $3.99/month or $34.99/year, each with a 7-day
free trial, granted through the `SootheQuest Pro` entitlement in RevenueCat.
There are also three consumables (`five_lives`, `power_pack`,
`mega_power_pack`) sold one-time without an entitlement. See
`REVENUECAT-INTEGRATION.md` for the store-side setup checklist and the exact
product IDs per store.

Billing is implemented by the standalone module `billing.js` (loaded as a
classic `<script src="billing.js">`, exposes `window._billing`, reaches the
RevenueCat Capacitor plugin at runtime via `window.Capacitor.Plugins.Purchases`).
On the plain web it resolves to unavailable and the paywall runs in
clearly-labeled demo mode.

## License

Copyright © Brewster Wickersham Publications. All rights reserved.
