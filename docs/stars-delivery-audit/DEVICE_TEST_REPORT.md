# Device Test Report (Android emulator, local backend)

**Date:** 2026-11-13. Back to the [master report](STARS_DELIVERY_MASTER_REPORT.md).

This was the first time the real app was run on an Android device during the audit. Earlier screenshots came from the Flutter test renderer (see [SCREENSHOT_MANIFEST.md](SCREENSHOT_MANIFEST.md)). The device screenshots are in [screenshots/device/](screenshots/device/).

## Environment

| Item | Value |
|---|---|
| Device | Android emulator `Medium_Phone_API_37.1`, 1080×2400, system dark mode, Arabic UI |
| App build | Debug APK from branch `fix/error-states-and-status-labels`, which is `main` plus PRs #2 and #3. Built with `--dart-define=STARS_SERVER_URL=http://10.0.2.2:3999`; plain HTTP is only allowed in Android debug builds. |
| Backend | The real `stars_delivery_backend/src/index.js`, run against a throwaway in-memory **MongoDB 8.2.6 replica set**, so transactions work. Every environment variable was overridden: no production database, SMTP or Firebase was used. |
| Accounts | Synthetic only (`customer@local.test`, `driver@local.test`, `admin@local.test`) with generated passwords. The customer and driver were created through the real `POST /api/auth/register`. The driver was approved through the real admin dashboard. |
| Production | **Not used.** The production server (`api.swifora.com`) and the real accounts shared in chat were not used, so no real data was created or changed. |
| Driving the UI | `adb` input plus UI Automator. The other party in each journey was simulated through the server's real mobile API. |

## Journeys executed

| # | Journey | Result | Evidence |
|---|---|---|---|
| 1 | Customer registration (API) → driver registration (API) → admin approval (dashboard) | Customer: ✅. **Driver approval initially failed** (finding D-1). It worked after the fix. | — |
| 2 | Customer login | ✅ | [DEVICE-02](screenshots/device/DEVICE-02-customer-after-login.png) |
| 3 | Customer creates a product order | ✅ | [DEVICE-03](screenshots/device/DEVICE-03-create-order.png), [DEVICE-04](screenshots/device/DEVICE-04-create-order-filled.png), [DEVICE-05](screenshots/device/DEVICE-05-after-submit.png) |
| 4 | Driver submits an offer (API). The customer receives it live, and the Offers screen **opens by itself**. | ✅ (auto-open confirms UX-09) | [DEVICE-06](screenshots/device/DEVICE-06-customer-home-offer-arrived.png) |
| 5 | Customer accepts the offer | ✅. No driver phone is shown to the customer (intended, per the owner), and there is no next-step guidance. | [DEVICE-08](screenshots/device/DEVICE-08-after-accept.png) |
| 6 | Driver starts, then completes (API). The customer's confirm screen opens by itself → Approve delivery → rating prompt → 5★ | ✅ | [DEVICE-10](screenshots/device/DEVICE-10-customer-delivery-confirmation.png), [DEVICE-11](screenshots/device/DEVICE-11-rating-prompt.png) |
| 7 | Customer logs out → driver logs in **in the same app session** | ❌ **Driver thrown back to login** (finding D-2). ✅ after the fix. | [DEVICE-14](screenshots/device/DEVICE-14-driver-dashboard.png) (back on login, before the fix), [DEVICE-16](screenshots/device/DEVICE-16-driver-dashboard.png) (after the fix) |
| 8 | Login with the wrong role card selected | Shows "Invalid credentials" **in English** inside the Arabic UI, although the credentials are correct | [DEVICE-15](screenshots/device/DEVICE-15-wrong-role-invalid-credentials.png) |
| 9 | Customer creates an order (API). New Orders **opens by itself** on the driver's phone. | ✅ | [DEVICE-18](screenshots/device/DEVICE-18-driver-new-order-autopushed.png) |
| 10 | Driver submits an offer through the UI (price/ETA chips) | ✅ | [DEVICE-19](screenshots/device/DEVICE-19-submit-offer.png), [DEVICE-20](screenshots/device/DEVICE-20-submit-offer-filled.png) |
| 11 | Customer accepts (API) while the driver is on New Orders | ⚠️ **The driver gets no visible signal**: the screen just says "no new orders" | [DEVICE-22](screenshots/device/DEVICE-22-driver-order-accepted.png) |
| 12 | Driver: Active deliveries → Start → Complete; customer confirms (API) | ✅. The customer's phone and the address details are hidden until the driver starts, and the free-text address never appears on this screen. | [DEVICE-24](screenshots/device/DEVICE-24-driver-active-orders.png), [DEVICE-25](screenshots/device/DEVICE-25-driver-start-tapped.png), [DEVICE-26](screenshots/device/DEVICE-26-driver-complete-tapped.png) |
| 13 | Driver dashboard after one accepted-but-undelivered order | ✅ Earnings and commission include the accepted, undelivered order. This is intended (finding D-3). | [DEVICE-23](screenshots/device/DEVICE-23-driver-dashboard-after-accept.png) |
| 14 | Server stopped while the driver dashboard is open (PR #3 fix) | ✅ The last good figures stay, and "تعذّر تحديث البيانات…" ("couldn't refresh the data") is shown | [DEVICE-28](screenshots/device/DEVICE-28-driver-refresh-failed-keeps-figures.png) |
| 15 | Cold start with the server unreachable and a saved session | Lands on login. The token is **kept** and revalidated next time, but there's no retry and it looks like a sign-out. | [DEVICE-29](screenshots/device/DEVICE-29-cold-start-server-down.png) |

## New findings from runtime

| ID | Severity | Status | Finding |
|---|---|---|---|
| **D-1** | **High** | **Fixed in PR #4** | **No new driver can be approved.** Commit `9b50ca3` removed document upload, and the review list always enables Approve. But `approveProvider()` in `src/public/js/main.js` still required complete documents, so every approval failed with "لا يمكن قبول المزود قبل اكتمال رخصة القيادة" ("cannot approve the driver before the driving licence is complete"). A source-text test (`admin-dom-injection-safety.test.js`) asserted that the gate exists, which kept the bug in place. |
| **D-2** | **High** | **Fixed in PR #4** | **Any login after a logout in the same app session is ended immediately.** `socket_io_client` reused the cached Manager and the previous socket, with the previous user's revoked token. The server rejected it, and the app treated that as "session revoked". This confirms RISK-041, which was "requires runtime verification". The fix is `enableForceNew()`. It was verified on the device for customer → driver → customer. |
| **D-3** | Info | **By design (owner decision, 2026-11-13)** | **Earnings and commission are counted when an order is accepted, not when it is delivered.** The project owner confirmed this is intended, so it stays as is. `routes/provider.js:87` includes `accepted` and `fulfilling` orders. On the device the dashboard showed 33 ILS earnings and 2 ILS commission due with only 1 delivered order (14 ILS / 1 ILS). |
| D-4 | Medium | Confirmed (UX) | When the customer accepts while the driver is on another screen, the driver gets no in-app signal. `_openAcceptedOrder` only acts when the dashboard is the top route. |
| D-5 | Medium | Confirmed | Startup jank and one ANR. Every cold start logged "Skipped 33–139 frames … too much work on its main thread". One relaunch produced an **ANR** ("Input dispatching timed out"): [DEVICE-17](screenshots/device/DEVICE-17-anr-app-not-responding.png). Login became usable after 2.4 s on warm relaunches and **12.6 s** on the relaunch after the ANR. This supports RISK-001 and RISK-002; the exact culprit still needs a profiler trace. |
| D-6 | Low | Confirmed (UX) | Signing in requires choosing a role card, and the wrong card produces an English "Invalid credentials" message (UX-13, RISK-036). |
| D-7 | Low | Confirmed | The customer's free-text address (`location`) never appears on the driver's Active deliveries card; only the area does. The customer never sees the driver's phone; the owner confirmed on 2026-11-13 that this is intended. |

## Confirmed working at runtime

- Registration, login, logout confirmation, session revocation on logout.
- Order creation, real-time offer delivery over Socket.IO, offer acceptance in a transaction on a replica set, the start → complete → confirm handshake, the rating prompt, and the commission ledger arithmetic (15 ILS order → 14 to the driver + 1 commission).
- The PR #3 refresh-failure behaviour, and offline cold start without losing the stored token.

## Reproducing

Scripts used (not part of the app): local server `tooling/local_env_server.js.txt`, UI driver `tooling/ui_driver.py.txt`, API actors `tooling/driver_api.py.txt` and `tooling/customer_api.py.txt`, account-switch check `tooling/switch_test.py.txt`. Steps:

1. Start the server script (it needs `npm ci` in the backend and the cached MongoDB 8.2.6 binary).
2. Register the accounts through `/api/auth/register` and approve the driver in `http://localhost:3999/admin`.
3. `flutter build apk --debug --dart-define=STARS_SERVER_URL=http://10.0.2.2:3999`, then `adb install -r`.
4. Run the journeys above.
