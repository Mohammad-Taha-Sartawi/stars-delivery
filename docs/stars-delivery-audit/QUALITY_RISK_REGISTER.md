# Stars Delivery: Quality and Risk Register

Branch: `docs/stars-delivery-audit`. This register comes from reading the code. RISK-001 to RISK-043 come from reading the code. The only tool behind them was `dart analyze lib`, which found 15 issues: all lints or unused imports, none of them `use_build_context_synchronously`. RISK-044 to RISK-050 were added later. They were confirmed at runtime, either by the project's test runs or by the screenshot capture (see [TEST_AUDIT.md](TEST_AUDIT.md#execution-results) and [SCREENSHOT_MANIFEST.md](SCREENSHOT_MANIFEST.md)). No application code was changed. Security architecture and data handling are covered in [DATA_AND_SECURITY.md](DATA_AND_SECURITY.md).

**Evidence classes**

- **Confirmed defect**: the code path shows the wrong behaviour as written.
- **Strongly suspected defect**: the code makes the failure very likely, but its size or trigger has not been measured.
- **Potential risk**: a weakness that depends on data, scale, deployment or abuse.
- **Requires runtime verification**: cannot be settled without running the app or the infrastructure.

## Summary

| Severity | Count | Confirmed defect | Strongly suspected defect | Potential risk | Requires runtime verification |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High | 2 | 0 | 2 | 0 | 0 |
| Medium | 16 | 8 | 0 | 6 | 2 |
| Low | 32 | 16 | 2 | 12 | 2 |
| **Total** | **50** | **24** | **4** | **18** | **4** |

No Critical findings. Object-level authorization, transactional offer acceptance, secret validation and session revocation are well built. The largest risks are client performance and lifecycle problems, plus operational and privacy gaps.

| ID | Sev | Evidence | Title |
|---|---|---|---|
| RISK-001 | High | Strongly suspected | App start is blocked on the location prompt, a GPS fix and a 46 MB JSON parse before the first frame |
| RISK-002 | High | Strongly suspected | The 46 MB JSON is decoded again on the UI isolate on every location sync, every 30 s while a delivery is active |
| RISK-003 | Medium | Confirmed | Driver live tracking only works while the app is in the foreground |
| RISK-004 | Medium | Confirmed | `ProviderBloc` handlers drop `offeredOrders`, so the "Offered orders" tile often does nothing |
| RISK-005 | Medium | Confirmed | Push tokens survive logout and session revocation, and the push service keeps a stale auth token |
| RISK-006 | Medium | Confirmed | Heavy client polling, which keeps running while the app is in the background |
| RISK-007 | Medium | Requires runtime verification | Server binds `0.0.0.0:3000` with `trust proxy 1`, so the IP rate limit and TLS can be bypassed if the port is reachable |
| RISK-008 | Medium | Potential risk | Unpaginated list endpoints, and `GET /orders` runs a global expiry sweep on every call |
| RISK-009 | Medium | Potential risk | Legacy order images are still served from `/uploads/*` without authentication |
| RISK-010 | Medium | Potential risk | Admin TOTP is optional |
| RISK-011 | Medium | Confirmed | `phones`, `frequentItems` and `fullName` have no type, length or count limits and no rate limit |
| RISK-012 | Medium | Requires runtime verification | The whole order lifecycle depends on Mongo transactions (replica set) |
| RISK-013 | Medium | Potential risk | Customer GPS is collected and kept indefinitely, and there is no retention policy for PII |
| RISK-014 | Medium | Potential risk | Providers with no registered area see every order and join a socket room the client chooses |
| RISK-015 | Medium | Potential risk | Backups are unencrypted and contain plaintext TOTP secrets and ID documents |
| RISK-016 | Low | Confirmed | No in-flight guard on provider and customer action buttons |
| RISK-017 | Low | Potential risk | The expired-offer sweeper runs outside a transaction |
| RISK-018 | Low | Confirmed | A single `sessionVersion` means any logout logs out every device, tokens last 7 days with no refresh, and the docs call them "short-lived" |
| RISK-019 | Low | Potential risk | Phone masking shows 7 of 10 digits, and the address is broadcast before an offer is accepted |
| RISK-020 | Low | Confirmed | The provider phone is never filled in for offers (the field does not exist) |
| RISK-021 | Low | Confirmed | `OfferModel.orderId` becomes the `toString()` of a Map |
| RISK-022 | Low | Confirmed | The `User` schema declares `governorate` twice |
| RISK-023 | Low | Strongly suspected | Body-less PUTs return 500 under Express 5 (`req.body` is undefined) |
| RISK-024 | Low | Confirmed | An invalid ObjectId returns 500 instead of 400/404 on several routes |
| RISK-025 | Low | Strongly suspected | Login timing reveals whether an account exists (bcrypt cost 10 vs dummy cost 12) |
| RISK-026 | Low | Potential risk | TOTP codes can be replayed within the window, and a recovery code can be used twice in a race |
| RISK-027 | Low | Confirmed | Recovery-code HMAC is keyed with `JWT_SECRET` and has a hard-coded fallback |
| RISK-028 | Low | Potential risk | Rate limiters use the in-memory store |
| RISK-029 | Low | Potential risk | Model `fromJson` uses untyped dynamic casts, and the accept-offer error path assumes a Map body |
| RISK-030 | Low | Potential risk | Offer expiry uses the device clock, and the offers screen rebuilds fully every second |
| RISK-031 | Low | Potential risk | The web target crashes at startup because of `dart:io` `Platform` |
| RISK-032 | Low | Confirmed | `FirebaseMessaging.onMessage` listener leaks on every push start |
| RISK-033 | Low | Confirmed | Tapping a push notification is not handled |
| RISK-034 | Low | Requires runtime verification | Stale iOS photo-library permission string, and the FCM default channel is never created |
| RISK-035 | Low | Potential risk | Uses the public OSM tile server in production |
| RISK-036 | Low | Confirmed | Localization: raw server messages are shown, and the client compares against Arabic display strings |
| RISK-037 | Low | Potential risk | If the re-login after a forced password change fails, a dead token is left behind |
| RISK-038 | Low | Confirmed | Registration does not validate `fullName`, `phone` or `privacyPolicy` on the server |
| RISK-039 | Low | Potential risk | `PUT /users/password` has no rate limit (current-password guessing with a stolen token) |
| RISK-040 | Low | Confirmed | Test coverage gaps for the defects above, and no end-to-end tests |
| RISK-041 | Low | Requires runtime verification | Socket re-connect after re-login may reuse a cached manager |
| RISK-042 | Low | Potential risk | Android debug LAN discovery trusts any host on the subnet |
| RISK-043 | Low | Potential risk | Global Helmet CSP is disabled for non-admin static files, and HSTS lacks `includeSubDomains` |
| RISK-044 | Medium | Confirmed | The driver dashboard can never show its error state, so a failed load displays zeroed earnings and commission as if they were real |
| RISK-045 | Medium | Confirmed | My Orders shows "No orders" when loading fails (errors are swallowed) |
| RISK-046 | Medium | Confirmed | The CI Flutter analyzer gate fails: 15 issues against an approved baseline of 12 |
| RISK-047 | Low | Confirmed | `MyOrdersScreen._loadOrders` calls `setState` after dispose |
| RISK-048 | Low | Confirmed | The ad banner overflows at large text scale (1.6×) |
| RISK-049 | Low | Confirmed | The admin dashboard does not work at phone width: the sidebar does not collapse and the content is clipped |
| RISK-050 | Low | Confirmed | Cancelled and expired orders show the raw English status in My Orders |

---

## High

### RISK-001: App start is blocked on the location prompt, a GPS fix and a 46 MB JSON parse before the first frame
- **Severity:** High
- **Evidence:** Strongly suspected defect
- **Location:** [main.dart:17-18](../../lib/main.dart#L17-L18), [location_service.dart:11-24](../../lib/services/location_service.dart#L11-L24), [location_service.dart:43-48](../../lib/services/location_service.dart#L43-L48), [location_service.dart:54-60](../../lib/services/location_service.dart#L54-L60)
- **Description:** `main()` awaits `LocationService.initialize()` before `runApp`. That call (a) shows the OS location permission dialog with no app UI or explanation behind it, (b) waits up to 10 s for a high-accuracy GPS fix, and (c) loads and `jsonDecode`s `assets/countries+states+cities.json`, which is **46.5 MB**, on the main isolate. Only a "nearest governorate" string comes out of all that. The native splash stays on screen the whole time. Asking for location before login with no explanation also goes against Play/App Store prominent-disclosure expectations.
- **Reproduction:** Cold-start a release build on a low-end Android device with location services on and no cached fix. Measure time to first frame (`flutter run --profile`, timeline `Frame 0`). Repeat with location permission not yet granted.
- **Impact:** Startup of several seconds (possibly an ANR or watchdog kill on low-end devices), a memory spike of hundreds of MB from the decoded tree, an APK about 46 MB larger, and poor first-run UX and store-review risk.
- **Recommended validation:** Profile-mode timeline and memory on a 2–3 GB RAM device. Fix direction: move the call after `runApp`, ask for permission in context, and replace the asset with a pre-computed Palestine-only centroid list (a few KB) parsed with `compute`.

### RISK-002: The 46 MB JSON is decoded again on the UI isolate on every location sync
- **Severity:** High
- **Evidence:** Strongly suspected defect
- **Location:** [location_service.dart:122-129](../../lib/services/location_service.dart#L122-L129), [location_service.dart:54-60](../../lib/services/location_service.dart#L54-L60), [provider_home_screen.dart:240-246](../../lib/screens/provider_home_screen.dart#L240-L246), [provider_active_orders_screen.dart:38-42](../../lib/screens/provider_active_orders_screen.dart#L38-L42), [provider_home_screen.dart:199](../../lib/screens/provider_home_screen.dart#L199), [provider_home_screen.dart:442](../../lib/screens/provider_home_screen.dart#L442), [home_screen.dart:97](../../lib/screens/home_screen.dart#L97), [home_screen.dart:361](../../lib/screens/home_screen.dart#L361)
- **Description:** `syncToBackend` calls `_findNearestArea`. `rootBundle.loadString` caches the string, but `jsonDecode` of 46 MB and the walk over every city run again on the UI isolate each time. A provider with an active order triggers this every 30 s from **both** the home dashboard timer and the active-orders screen timer, which run together when the latter is pushed. It also runs on every app resume and on customer home init and resume. The detected `area` is then ignored by the server for any user who already has a registered area ([users.js:176-184](../../stars_delivery_backend/src/routes/users.js#L176-L184)).
- **Reproduction:** As a provider, accept an order and keep the active-orders screen open. Watch the DevTools performance overlay and memory for a few minutes and look for jank spikes every 30 s.
- **Impact:** Dropped frames and GC pressure throughout the driver's delivery session, more battery use, and two location PUTs per 30 s.
- **Recommended validation:** DevTools CPU profiler (look for `jsonDecode` on the UI thread). Check the location-update rate limit headroom (120/min per user). Fix: compute the nearest area once, in an isolate, from a small asset, and de-duplicate the two timers.

---

## Medium

### RISK-003: Driver live tracking only works while the app is in the foreground
- **Severity:** Medium
- **Evidence:** Confirmed defect (design limitation)
- **Location:** [provider_active_orders_screen.dart:38-42](../../lib/screens/provider_active_orders_screen.dart#L38-L42), [provider_home_screen.dart:240-246](../../lib/screens/provider_home_screen.dart#L240-L246), [AndroidManifest.xml:2-5](../../android/app/src/main/AndroidManifest.xml#L2-L5), [Info.plist:58-63](../../ios/Runner/Info.plist#L58-L63), [order_tracking_screen.dart:42-46](../../lib/screens/order_tracking_screen.dart#L42-L46)
- **Description:** Provider location is pushed only by Dart `Timer.periodic` in widgets. There is no background location permission, no foreground service, and no `location` UIBackgroundMode. A driver who switches to a navigation app or locks the phone stops updating. The customer tracking screen polls every 15 s and keeps showing the last fix.
- **Reproduction:** Accept an order as a provider and start fulfilling. Put the app in the background for 5 minutes while moving. On the customer side, the tracking position and `updatedAt` stop advancing.
- **Impact:** The core "live tracking" promise does not hold during real deliveries, and customers see stale positions with no staleness warning.
- **Recommended validation:** Field test on Android 14 and iOS 17. Decide whether to add a foreground service with notification (Android) and background location (iOS), or show "last updated N min ago" in the UI.

### RISK-004: `ProviderBloc` handlers drop `offeredOrders`, so the "Offered orders" tile often does nothing
- **Severity:** Medium
- **Evidence:** Confirmed defect
- **Location:** [provider_bloc.dart:30-33](../../lib/bloc/provider/provider_bloc.dart#L30-L33), [provider_bloc.dart:67](../../lib/bloc/provider/provider_bloc.dart#L67), [provider_bloc.dart:38-55](../../lib/bloc/provider/provider_bloc.dart#L38-L55), [provider_bloc.dart:73-90](../../lib/bloc/provider/provider_bloc.dart#L73-L90), [provider_home_screen.dart:831-863](../../lib/screens/provider_home_screen.dart#L831-L863)
- **Description:** The three handlers share one `ProviderStatsLoaded` state. `_onLoadStats` and `_onLoadPendingOrders` (both success and error paths) emit a new state **without carrying over `offeredOrders`**, which resets it to `null`. Stats and pending loads are dispatched together with or after offered loads: in `initState`, every 30 s, on every socket `new_order`, and on resume. The tile's `onTap` opens the list only when `offeredOrders` is non-empty. Otherwise it only dispatches a reload, so the tap appears to do nothing. Handlers run concurrently and there is no request sequencing, so an older response can also overwrite a newer one.
- **Reproduction:** As a provider with at least one submitted offer, wait for the 30 s refresh (or trigger a `new_order`). Tap "Offered orders": nothing opens on the first tap, and a second tap works.
- **Impact:** Broken navigation, stale or contradictory dashboard data, and provider frustration.
- **Recommended validation:** Write a bloc test that dispatches `LoadOfferedOrders` then `LoadProviderStats` and asserts `offeredOrders` is kept. Consider `copyWith` plus separate state slices, or a `restartable()` transformer per event type.

### RISK-005: Push tokens survive logout and session revocation, and the push service keeps a stale auth token
- **Severity:** Medium (applies once FCM is configured; it is disabled by default)
- **Evidence:** Confirmed defect
- **Location:** [routes/auth.js:252-305](../../stars_delivery_backend/src/routes/auth.js#L252-L305), [users.js:83-101](../../stars_delivery_backend/src/routes/users.js#L83-L101), [push_notification_service.dart:27-30](../../lib/services/push_notification_service.dart#L27-L30), [push_notification_service.dart:76-96](../../lib/services/push_notification_service.dart#L76-L96), [home_screen.dart:833-835](../../lib/screens/home_screen.dart#L833-L835), [provider_home_screen.dart:686-688](../../lib/screens/provider_home_screen.dart#L686-L688), [profile_screen.dart:303-314](../../lib/screens/profile_screen.dart#L303-L314), [auth_bloc.dart:151-156](../../lib/bloc/auth/auth_bloc.dart#L151-L156)
- **Description:** The server never deletes `PushToken` rows when `sessionVersion` changes (logout, password or email change, recovery, admin block). Cleanup depends on the client sending `DELETE /users/push-token` from `PushNotificationService.stop()` **with the old JWT**. That request is rejected with 401 when:
  - (a) the logout button fires `revokeSession` unawaited, and it can finish before the DELETE;
  - (b) after an email change, where the server has already rotated the session ([profile_screen.dart:303-314](../../lib/screens/profile_screen.dart#L303-L314));
  - (c) on remote revocation (logout on another device, admin block), where the app learns of it through a 401;
  - (d) after `SessionUpdatedEvent` (in-app password change), because `start()` returns early (`_started`) and keeps the old auth token.

  The row stays mapped to the user, so `sendPushToUser` keeps delivering that user's order notifications to a signed-out device.
- **Reproduction:** Enable FCM. Log in on device A and log out from device B (or change the email on A). Create an order event for that user. Device A still shows the notification while it is on the login screen.
- **Impact:** Order details shown on a device after sign-out (shared or handed-over phones), and push tokens piling up.
- **Recommended validation:** Integration test that asserts no `PushToken` remains for the user after `POST /auth/logout`. Fix server-side by deleting a user's tokens wherever `sessionVersion` is incremented, and on the client await the DELETE before revoking.

### RISK-006: Heavy client polling, which keeps running while the app is in the background
- **Severity:** Medium
- **Evidence:** Confirmed defect (cost to be measured)
- **Location:** [home_screen.dart:122-129](../../lib/screens/home_screen.dart#L122-L129), [home_screen.dart:252-254](../../lib/screens/home_screen.dart#L252-L254), [provider_home_screen.dart:231-246](../../lib/screens/provider_home_screen.dart#L231-L246), [my_orders_screen.dart:49-57](../../lib/screens/my_orders_screen.dart#L49-L57), [notifications_screen.dart:35](../../lib/screens/notifications_screen.dart#L35), [order_tracking_screen.dart:42-46](../../lib/screens/order_tracking_screen.dart#L42-L46), [support_chat_screen.dart:32](../../lib/screens/support_chat_screen.dart#L32)
- **Description:** On top of a live Socket.IO connection that already pushes these events:
  - Customer home polls 4 endpoints every 15 s: notifications, support unread, the full order list, and the available-driver count.
  - Provider home polls 2 every 15 s and 3 more every 30 s.
  - My Orders, Notifications, Tracking and Support Chat each add their own timers.

  `didChangeAppLifecycleState` only handles `resumed`. Timers are never paused on `paused` or `inactive`, so Android keeps polling while the process is alive in the background. The socket also fires extra reloads, so many requests are duplicates.
- **Reproduction:** Run a proxy (mitmproxy or Charles) on a debug build. Leave customer home open, then background the app for 5 minutes and count requests.
- **Impact:** Battery and data drain, and backend load that grows linearly with online users (see RISK-008 for the server-side multiplier).
- **Recommended validation:** Measure request counts. Pause timers on `paused` and rely on socket events with a slow fallback poll.

### RISK-007: Server binds `0.0.0.0:3000` with `trust proxy 1`, so the IP rate limit and TLS can be bypassed if the port is reachable
- **Severity:** Medium
- **Evidence:** Requires runtime verification
- **Location:** [index.js:553](../../stars_delivery_backend/src/index.js#L553), [index.js:61](../../stars_delivery_backend/src/index.js#L61), [deployment/README.md:30](../../deployment/README.md#L30), [stars-delivery.conf:14-16](../../deployment/nginx/stars-delivery.conf#L14-L16)
- **Description:** The docs say port 3000 must not be public and that nginx proxies to `127.0.0.1`. The code still listens on all interfaces. With `trust proxy 1`, a request sent straight to `:3000` with a forged `X-Forwarded-For` gets a forged `req.ip`. That defeats every per-IP limiter (login, register, recovery, orders) and skips TLS entirely.
- **Reproduction:** On the production host, run `ss -ltnp | grep 3000` and an external `nmap -p3000 <host>`. If it is open, send `curl -H 'X-Forwarded-For: 1.2.3.<n>' http://host:3000/api/auth/login ...` while rotating `n`, and confirm 429 is never returned.
- **Impact:** Credential stuffing across many accounts (per-account limits still cap a single account at 10 per 15 min), and cleartext traffic if anything is ever pointed at `:3000`.
- **Recommended validation:** Check firewall rules. Bind to `127.0.0.1` in production (for example a `HOST` env var).

### RISK-008: Unpaginated list endpoints, and `GET /orders` runs a global expiry sweep on every call
- **Severity:** Medium
- **Evidence:** Potential risk
- **Location:** [orders.js:182-186](../../stars_delivery_backend/src/routes/orders.js#L182-L186), [orders.js:239-240](../../stars_delivery_backend/src/routes/orders.js#L239-L240), [offers.js:198-199](../../stars_delivery_backend/src/routes/offers.js#L198-L199), [provider.js:272](../../stars_delivery_backend/src/routes/provider.js#L272), [provider.js:293](../../stars_delivery_backend/src/routes/provider.js#L293), [provider.js:368-396](../../stars_delivery_backend/src/routes/provider.js#L368-L396), [provider.js:450](../../stars_delivery_backend/src/routes/provider.js#L450), [orderLifecycle.js:146-222](../../stars_delivery_backend/src/services/orderLifecycle.js#L146-L222)
- **Description:** `GET /api/orders` (the customer's full history, no limit) calls `expireStaleOffers()` and `finalizeExpiredOrders()` with **no order filter**. That is a database-wide scan and write on every customer list fetch, and the customer home polls it every 15 s (RISK-006). Order detail and offer list GETs also write. Provider pending, offered, rejected and all-orders lists have no `limit`. Legacy providers with no area get the whole pending table (RISK-014).
- **Reproduction:** Seed 10k orders and 1k expired offers. Run 50 simulated customers polling `/api/orders` and watch Mongo ops/s and p95 latency.
- **Impact:** Write amplification and response size grow with data, which affects p95 latency and Atlas cost.
- **Recommended validation:** Load test (k6/autocannon). Rely on the 30 s background sweeper, and add pagination (`limit` plus a cursor).

### RISK-009: Legacy order images are still served from `/uploads/*` without authentication
- **Severity:** Medium
- **Evidence:** Potential risk
- **Location:** [index.js:107-127](../../stars_delivery_backend/src/index.js#L107-L127), [SECURITY_HARDENING.md](../security/SECURITY_HARDENING.md) ("Existing order images … remain on disk")
- **Description:** Commit `9b50ca3` removed order-image upload and the `images` field. Old customer-uploaded JPGs in `uploads/` (3 locally, unknown in production) are still served to anyone with the filename, with no ownership check. Filenames are `timestamp-random` (about 30 bits of randomness). They are now orphaned: no record points to them, so there is no product reason to keep them public.
- **Reproduction:** List `uploads/*.jpg` in production and `curl -I https://host/uploads/<name>.jpg` without auth.
- **Impact:** Customer photos (possibly showing addresses or IDs) can be exposed if the URLs leak (logs, screenshots, old client caches).
- **Recommended validation:** Inventory production `uploads/`. Delete or archive the orphaned files, or limit the static mount to `uploads/ads/`.

### RISK-010: Admin TOTP is optional
- **Severity:** Medium
- **Evidence:** Potential risk
- **Location:** [adminAuth.js:98-125](../../stars_delivery_backend/src/routes/adminAuth.js#L98-L125), [adminAuth.js:320-388](../../stars_delivery_backend/src/routes/adminAuth.js#L320-L388)
- **Description:** 2FA is checked only when `adminTotpEnabled === true`. Nothing forces enrolment, and an admin can turn it off (password plus code). The hardening checklist asks for it but the code does not enforce it.
- **Reproduction:** Bootstrap an admin and log in with only a password.
- **Impact:** A phished or reused admin password gives full control: driver approval, ID documents, commissions, broadcast.
- **Recommended validation:** Query `users.countDocuments({role:'admin', adminTotpEnabled:{$ne:true}})` in production. Consider forcing enrolment on first login.

### RISK-011: `phones`, `frequentItems` and `fullName` have no type, length or count limits and no rate limit
- **Severity:** Medium
- **Evidence:** Confirmed defect
- **Location:** [users.js:574-640](../../stars_delivery_backend/src/routes/users.js#L574-L640), [users.js:651-731](../../stars_delivery_backend/src/routes/users.js#L651-L731)
- **Description:** `POST /users/phones` and `POST /users/frequent-items` push any truthy `number` or `item` (any length, any JSON type) into arrays on the `User` document, with no maximum count. `PUT /users/profile` stores `fullName` unchecked. None of these routes has a limiter. Each request can be up to about 100 kB, so a scripted client can push its own User document toward Mongo's 16 MB limit. Every authenticated request loads that document, which slows it down.
- **Reproduction:** Loop `POST /api/users/frequent-items {"item":"<90kB string + i>"}` about 200 times, then time `GET /api/auth/me`.
- **Impact:** Self-inflicted account breakage, extra DB and network load, and odd data showing up in admin views (escaped).
- **Recommended validation:** Write unit tests for the bounds. Use `boundedTrimmedString`, cap the array sizes, and add a limiter.

### RISK-012: The whole order lifecycle depends on Mongo transactions (replica set)
- **Severity:** Medium
- **Evidence:** Requires runtime verification
- **Location:** [transaction.js:1-13](../../stars_delivery_backend/src/services/transaction.js#L1-L13), [orderLifecycle.js:57-59](../../stars_delivery_backend/src/services/orderLifecycle.js#L57-L59), [offers.js:133](../../stars_delivery_backend/src/routes/offers.js#L133)
- **Description:** Submit, accept, reset, cancel, every status transition and delivery confirmation all run in `withTransaction`. On a standalone `mongod` (common in self-hosting and local dev) each one returns 503. Duplicate-offer prevention also relies on transaction write conflicts, because the `{providerId, orderId}` index is non-unique ([Offer.js:18-21](../../stars_delivery_backend/src/models/Offer.js#L18-L21)).
- **Reproduction:** Point `MONGODB_URI` at a standalone instance and submit an offer: 503 "Order service is temporarily unavailable".
- **Impact:** A total outage of the delivery workflow if the deployment target ever changes, and duplicate offers if transactions are bypassed.
- **Recommended validation:** Add a startup check (`hello.setName`) that fails fast. Run `npm run offers:audit-duplicates`, then make the index unique.

### RISK-013: Customer GPS is collected and kept indefinitely, and there is no retention policy for PII
- **Severity:** Medium
- **Evidence:** Potential risk
- **Location:** [home_screen.dart:97](../../lib/screens/home_screen.dart#L97), [users.js:147-196](../../stars_delivery_backend/src/routes/users.js#L147-L196), [User.js:94-97](../../stars_delivery_backend/src/models/User.js#L94-L97)
- **Description:** Customer devices upload high-accuracy coordinates on every home open and resume. They are stored in `User.lastLatitude/Longitude`, and this review found no customer-side consumer (only provider coordinates are shown to customers). `orders`, `chatmessages`, `contactrequests`, `ratings` and the last GPS fix have no TTL or purge job.
- **Reproduction:** Log in as a customer and inspect the user document: `lastLatitude` is populated.
- **Impact:** Unneeded precise location history (one point per user) and privacy and regulatory exposure, with no documented retention.
- **Recommended validation:** Confirm with the product owner whether customer GPS is needed. Define retention periods and add TTLs or purge scripts.

### RISK-014: Providers with no registered area see every order and join a socket room the client chooses
- **Severity:** Medium
- **Evidence:** Potential risk
- **Location:** [orderVisibility.js:16-21](../../stars_delivery_backend/src/services/orderVisibility.js#L16-L21), [orderVisibility.js:45](../../stars_delivery_backend/src/services/orderVisibility.js#L45), [index.js:437](../../stars_delivery_backend/src/index.js#L437), [users.js:177-184](../../stars_delivery_backend/src/routes/users.js#L177-L184)
- **Description:** "Legacy" providers with an empty `area` get an unrestricted feed and can submit offers on any order. Their socket joins `area:<handshake.query.area>`, which the client controls. Their first location sync sets `area` to a governorate name derived from GPS, not a validated village.
- **Reproduction:** `db.users.countDocuments({role:'provider', $or:[{area:''},{area:{$exists:false}}]})`.
- **Impact:** Order details (description, location, masked phone) reach drivers outside the area, and area-based fairness breaks.
- **Recommended validation:** Run the count above in production. Migrate the affected accounts, then remove the fallback.

### RISK-015: Backups are unencrypted and contain plaintext TOTP secrets and ID documents
- **Severity:** Medium
- **Evidence:** Potential risk
- **Location:** [backupRestore.js:299-440](../../stars_delivery_backend/src/scripts/backupRestore.js#L299-L440), [User.js:59](../../stars_delivery_backend/src/models/User.js#L59)
- **Description:** `mongodump` output and copies of the provider documents are written with `0600` permissions but not encrypted. `adminTotpSecret` is stored in plain text, so a leaked backup lets someone generate admin 2FA codes.
- **Reproduction:** Run `npm run ops:backup` and inspect the output.
- **Impact:** If backup media is compromised, everything is exposed, 2FA included.
- **Recommended validation:** Encrypt backups (age/gpg/KMS) before they leave the host, and consider encrypting TOTP secrets with a key outside the DB.

---

### RISK-044: The driver dashboard can never show its error state, so a failed load displays zeroed earnings and commission as if they were real
- **Evidence:** Confirmed defect (code, plus a widget-test render in which every request returned HTTP 500)
- **Location:** [provider_bloc.dart:11](../../lib/bloc/provider/provider_bloc.dart#L11), [provider_bloc.dart:34-56](../../lib/bloc/provider/provider_bloc.dart#L34-L56), [provider_home_screen.dart:549-555](../../lib/screens/provider_home_screen.dart#L549-L555), [provider_state.dart:24](../../lib/bloc/provider/provider_state.dart#L24)
- **Description:** `ProviderBloc` starts in `ProviderStatsLoaded` with all-zero stats. Nothing in `lib/` ever constructs `ProviderError`, so the `AppErrorState` + retry branch in `ProviderHomeScreen` is unreachable. If the first `GET /provider/stats` fails, the driver sees "ILS 0" earnings, "ILS 0" commission due and 0 orders, presented as real data, with no error message and no retry. The stats-failure fallback also rebuilds `ProviderStats` without `totalCommissionDue`, `averageRating`, `ratingCount` and `ratingStars`, so one failed refresh after a good load resets those values to 0.
- **Reproduction:** Make `/api/provider/stats` return 500, or go offline, and open the driver home. Screenshot: `screenshots/SCREEN-017-error-ar-light.png`.
- **Impact:** Drivers may think they earned nothing or owe no commission, and get no prompt to retry.
- **Recommended validation:** A bloc test asserting that `ProviderError` is emitted when `getStats` fails on first load, and a widget test asserting the retry view appears.

### RISK-045: My Orders shows "No orders" when loading fails (errors are swallowed)
- **Evidence:** Confirmed defect (code, plus a widget-test render with HTTP 500)
- **Location:** [my_orders_screen.dart:87-105](../../lib/screens/my_orders_screen.dart#L87-L105)
- **Description:** The `catch` branch only clears `_loading`. With `_orders` empty, the screen shows the empty-state text "لا توجد طلبات" ("No orders"). A customer with active orders who hits a network or server error is told they have no orders, and there is no retry. The same swallow-and-show-empty pattern should be checked on the other list screens (their error captures are in the manifest).
- **Reproduction:** Return 500 from `GET /api/orders`. Screenshot: `screenshots/SCREEN-008-error-ar-light.png`.
- **Impact:** Customers may re-create orders they already have (duplicates), or think an order was lost.
- **Recommended validation:** A widget test for the error state, using the existing `MobileApiClient.testAdapter` hook.

### RISK-046: The CI Flutter analyzer gate fails: 15 issues against an approved baseline of 12
- **Evidence:** Confirmed (`flutter analyze`, run with the same Flutter 3.47.4 that CI pins)
- **Location:** [ci.yml](../../.github/workflows/ci.yml), [login_screen.dart:12](../../lib/screens/login_screen.dart#L12), [offered_orders_screen.dart:12](../../lib/screens/offered_orders_screen.dart#L12), [pending_orders_screen.dart:9](../../lib/screens/pending_orders_screen.dart#L9)
- **Description:** The CI step requires exactly 12 analyzer issues. HEAD has 15: the extra three are `unused_import` warnings. The gate also fails when issues are *fixed*, which discourages cleanup.
- **Impact:** The Flutter CI job is red. A red CI that people stop looking at can hide real regressions.
- **Recommended validation:** Check the GitHub Actions run for `9b50ca3`. Replace the equality check with "no errors and no new warnings".

## Low

### RISK-016: No in-flight guard on provider and customer action buttons
- **Evidence:** Confirmed defect (server stays consistent)
- **Location:** [provider_active_orders_screen.dart:175-217](../../lib/screens/provider_active_orders_screen.dart#L175-L217), [order_detail_screen.dart:168-204](../../lib/screens/order_detail_screen.dart#L168-L204), [my_orders_screen.dart:175-268](../../lib/screens/my_orders_screen.dart#L175-L268), [offer_bloc.dart:53-72](../../lib/bloc/offer/offer_bloc.dart#L53-L72)
- **Description:** Mark fulfilling, mark complete, rate, cancel, resend and accept do not disable their button while the request is in flight. The server's compare-and-set (`status: from`) rejects the duplicate with 409, so data stays consistent, but the user sees a success toast followed by an error toast.
- **Reproduction:** Double-tap "Mark complete" on a slow network.
- **Impact:** Confusing feedback and wasted requests.
- **Recommended validation:** Widget test with a delayed mock adapter. Add `_busy` flags or `droppable()` transformers.

### RISK-017: The expired-offer sweeper runs outside a transaction
- **Evidence:** Potential risk
- **Location:** [orderLifecycle.js:146-222](../../stars_delivery_backend/src/services/orderLifecycle.js#L146-L222), [index.js:231-246](../../stars_delivery_backend/src/index.js#L231-L246)
- **Description:** It runs `find` for expired offers, then upserts `RejectedOrder` rows, then `deleteMany(filter)` with the same time-based filter. Offers that expire between the `find` and the `deleteMany` are deleted without a `RejectedOrder` row, so the provider can resubmit. It runs every 30 s on every instance and also on many GETs (RISK-008), so the runs overlap. Errors are swallowed (`catch (_) {}`).
- **Reproduction:** Use a load test with many offers expiring together and compare `RejectedOrder` counts with deleted offers.
- **Impact:** Small inconsistencies in the re-offer rules.
- **Recommended validation:** Restrict `deleteMany` to the `_id`s that were found.

### RISK-018: A single `sessionVersion` means any logout logs out every device, tokens last 7 days with no refresh, and the docs disagree
- **Evidence:** Confirmed defect (design and doc mismatch)
- **Location:** [routes/auth.js:224-234](../../stars_delivery_backend/src/routes/auth.js#L224-L234), [routes/auth.js:269-295](../../stars_delivery_backend/src/routes/auth.js#L269-L295), [SECURITY_HARDENING.md:67-73](../security/SECURITY_HARDENING.md#L67-L73)
- **Description:** Logout increments the account-wide version, which kills every device. The JWT lasts 7 days and there is no refresh flow, while the hardening doc calls tokens "short-lived". A stolen token stays valid for up to 7 days unless the user logs out or changes their password.
- **Impact:** UX friction for multi-device users, and a long exposure window for stolen tokens.
- **Recommended validation:** Make a product decision. Consider per-device session records and a shorter access token with a refresh token.

### RISK-019: Phone masking shows 7 of 10 digits, and the address is broadcast before an offer is accepted
- **Evidence:** Potential risk
- **Location:** [orders.js:37-43](../../stars_delivery_backend/src/routes/orders.js#L37-L43), [orders.js:290](../../stars_delivery_backend/src/routes/orders.js#L290), [provider.js:73](../../stars_delivery_backend/src/routes/provider.js#L73), [orders.js:96-126](../../stars_delivery_backend/src/routes/orders.js#L96-L126)
- **Description:** `slice(0,-3)+'***'` hides only the last 3 digits (1,000 candidates). The free-text `location` and the customer `fullName` go to every eligible provider in the area as soon as the order is created.
- **Impact:** Customer can be re-identified by nearby drivers who never get the job.
- **Recommended validation:** Privacy review. Show only coarse location before acceptance.

### RISK-020: The provider phone is never filled in for offers
- **Evidence:** Confirmed defect
- **Location:** [offers.js:202](../../stars_delivery_backend/src/routes/offers.js#L202), [orderLifecycle.js:571](../../stars_delivery_backend/src/services/orderLifecycle.js#L571), [offers.js:115-116](../../stars_delivery_backend/src/routes/offers.js#L115-L116), [offer_model.dart:63](../../lib/models/offer_model.dart#L63), [order_offers_screen.dart:571-586](../../lib/screens/order_offers_screen.dart#L571-L586)
- **Description:** `User` has `phoneNumbers[]` and no `phone` field. `populate('providerId','… phone …')` and `provider.phone` therefore always come back undefined, so the customer's phone UI branch never renders. This may be the intended privacy outcome, but it is accidental and the code contradicts itself.
- **Recommended validation:** Decide whether the driver phone should be shown after acceptance, and implement that explicitly.

### RISK-021: `OfferModel.orderId` becomes the `toString()` of a Map
- **Evidence:** Confirmed defect (latent: the field is currently unused)
- **Location:** [offer_model.dart:60](../../lib/models/offer_model.dart#L60), [offers.js:203](../../stars_delivery_backend/src/routes/offers.js#L203)
- **Description:** `orderId` is populated as an object, so `json['orderId']?.toString()` yields `{_id: …, description: …}`. Any future use (navigation, comparison) will silently fail.
- **Recommended validation:** Unit test `OfferModel.fromJson` with the populated shape.

### RISK-022: The `User` schema declares `governorate` twice
- **Evidence:** Confirmed defect
- **Location:** [User.js:74](../../stars_delivery_backend/src/models/User.js#L74), [User.js:101](../../stars_delivery_backend/src/models/User.js#L101)
- **Description:** In a JS object literal the second key wins, so `governorate` loses its `default: ''`. Documents are created without the field, and code relies on `governorateKey()` fallbacks.
- **Recommended validation:** Remove the duplicate and check the admin filters on `governorate`.

### RISK-023: Body-less PUTs return 500 under Express 5
- **Evidence:** Strongly suspected defect
- **Location:** [users.js:208-213](../../stars_delivery_backend/src/routes/users.js#L208-L213), [users.js:230-238](../../stars_delivery_backend/src/routes/users.js#L230-L238), [users.js:574-597](../../stars_delivery_backend/src/routes/users.js#L574-L597)
- **Description:** Express 5 leaves `req.body` `undefined` when no body is parsed. `req.body.enabled`, `req.body.governorate` and `hasOwnProperty.call(req.body, …)` then throw, and the request returns 500 instead of 400.
- **Reproduction:** `curl -X PUT -H 'Authorization: Bearer …' https://host/api/users/governorate-level` with no body.
- **Recommended validation:** Supertest case for each route.

### RISK-024: An invalid ObjectId returns 500 instead of 400/404
- **Evidence:** Confirmed defect
- **Location:** [offers.js:192](../../stars_delivery_backend/src/routes/offers.js#L192), [orderLifecycle.js:246](../../stars_delivery_backend/src/services/orderLifecycle.js#L246), [notifications.js:26](../../stars_delivery_backend/src/routes/notifications.js#L26), [orderLifecycle.js:575-614](../../stars_delivery_backend/src/services/orderLifecycle.js#L575-L614)
- **Description:** The raw `req.params` value reaches Mongoose without `isValidObjectId`, so a `CastError` produces a 500 and pollutes the error logs.
- **Recommended validation:** Supertest with `/api/offers/abc/accept`.

### RISK-025: Login timing reveals whether an account exists
- **Evidence:** Strongly suspected defect
- **Location:** [routes/auth.js:40-41](../../stars_delivery_backend/src/routes/auth.js#L40-L41), [routes/auth.js:102](../../stars_delivery_backend/src/routes/auth.js#L102), [routes/auth.js:193-197](../../stars_delivery_backend/src/routes/auth.js#L193-L197)
- **Description:** Real hashes use cost 10, while the dummy hash for unknown emails uses cost 12 (about 4× slower). Registration already reveals "Email already registered", so the extra exposure is small.
- **Recommended validation:** Time 50 logins each for existing and missing emails. Align the cost factors.

### RISK-026: TOTP codes can be replayed within the window, and a recovery code can be used twice in a race
- **Evidence:** Potential risk
- **Location:** [totp.js:101-145](../../stars_delivery_backend/src/security/totp.js#L101-L145), [adminAuth.js:109-124](../../stars_delivery_backend/src/routes/adminAuth.js#L109-L124)
- **Description:** The last accepted time step is not stored, so a captured code works again within ±30 s. Recovery-code consumption is `indexOf` + `splice` + `save()` with no atomic `$pull` condition, so two concurrent logins can both use the same code.
- **Recommended validation:** Store `lastTotpStep` and use `updateOne({_id, adminTotpRecoveryCodeHashes: digest}, {$pull: …})`.

### RISK-027: Recovery-code HMAC is keyed with `JWT_SECRET` and has a hard-coded fallback
- **Evidence:** Confirmed defect
- **Location:** [totp.js:175-187](../../stars_delivery_backend/src/security/totp.js#L175-L187)
- **Description:** Rotating `JWT_SECRET` silently invalidates every admin recovery code. If the variable is ever missing in a script context, the key falls back to a constant committed in the source.
- **Recommended validation:** Use a dedicated secret validated in `config.js`.

### RISK-028: Rate limiters use the in-memory store
- **Evidence:** Potential risk
- **Location:** [mobileAuthRateLimit.js](../../stars_delivery_backend/src/security/mobileAuthRateLimit.js), [actionRateLimit.js](../../stars_delivery_backend/src/security/actionRateLimit.js), [adminAuth.js:23-55](../../stars_delivery_backend/src/routes/adminAuth.js#L23-L55)
- **Description:** Counters reset on every restart (systemd `Restart=on-failure`) and are not shared if more than one instance runs.
- **Recommended validation:** If you scale out, use a Mongo or Redis store.

### RISK-029: Model `fromJson` uses untyped dynamic casts, and the accept-offer error path assumes a Map body
- **Evidence:** Potential risk
- **Location:** [order_model.dart:20-33](../../lib/models/order_model.dart#L20-L33), [offer_model.dart:58-68](../../lib/models/offer_model.dart#L58-L68), [user_model.dart:26-38](../../lib/models/user_model.dart#L26-L38), [provider_stats.dart:40-58](../../lib/models/provider_stats.dart#L40-L58), [offer_service.dart:59-68](../../lib/services/offer_service.dart#L59-L68), [auth_bloc.dart:88-90](../../lib/bloc/auth/auth_bloc.dart#L88-L90)
- **Description:** Patterns such as `type: json['type'] ?? ''` or `(json['price'] ?? 0).toDouble()` throw a `TypeError` if the server ever sends a number or string of the wrong type. `acceptOffer` indexes `data['conflict']` without checking `data is Map`, so an HTML 502 from nginx raises an obscure error. In `_onLogin`, `Map.from(data['user'])` throws on a missing user. These are caught by the blocs, so the result is a confusing message rather than a crash.
- **Recommended validation:** Fuzz `fromJson` with wrong types in unit tests.

### RISK-030: Offer expiry uses the device clock, and the offers screen rebuilds fully every second
- **Evidence:** Potential risk
- **Location:** [order_offers_screen.dart:76-106](../../lib/screens/order_offers_screen.dart#L76-L106), [order_offers_screen.dart:1055-1062](../../lib/screens/order_offers_screen.dart#L1055-L1062)
- **Description:** Countdown and "expired" badges compare the server `expiresAt` with `DateTime.now()`, so a skewed device clock shows wrong states. The server stays authoritative. A 1 s `setState(() {})` rebuilds the whole 1,100-line screen, every offer card included.
- **Recommended validation:** Set the device clock 2 minutes off and observe. Move the countdown into small `StatefulWidget`s or a `ValueListenable`.

### RISK-031: The web target crashes at startup
- **Evidence:** Potential risk (only if web is shipped)
- **Location:** [api_config.dart:2](../../lib/services/api_config.dart#L2), [api_config.dart:299-306](../../lib/services/api_config.dart#L299-L306), [firebase_bootstrap.dart:36](../../lib/services/firebase_bootstrap.dart#L36)
- **Description:** `Platform.isAndroid` throws `UnsupportedError` on web, yet `web/` is kept in the repo.
- **Recommended validation:** Run `flutter run -d chrome`. Either drop `web/` or guard with `kIsWeb`.

### RISK-032: `FirebaseMessaging.onMessage` listener leaks on every push start
- **Evidence:** Confirmed defect
- **Location:** [push_notification_service.dart:53-55](../../lib/services/push_notification_service.dart#L53-L55)
- **Description:** The subscription is never stored or cancelled. Each logout and login cycle adds another listener (it only logs today).
- **Recommended validation:** Store the subscription and cancel it in `stop()`.

### RISK-033: Tapping a push notification is not handled
- **Evidence:** Confirmed defect
- **Location:** [push_notification_service.dart:27-59](../../lib/services/push_notification_service.dart#L27-L59)
- **Description:** `onMessageOpenedApp` and `getInitialMessage` are never used. The `data.orderId` the server sends ([orders.js:166-170](../../stars_delivery_backend/src/routes/orders.js#L166-L170)) is ignored, so a tap only opens the app.
- **Recommended validation:** Product decision. If implemented, open the order through the authorised `GET /orders/:id`.

### RISK-034: Stale iOS photo-library permission string, and the FCM default channel is never created
- **Evidence:** Requires runtime verification
- **Location:** [Info.plist:56-57](../../ios/Runner/Info.plist#L56-L57), [AndroidManifest.xml:39-41](../../android/app/src/main/AndroidManifest.xml#L39-L41)
- **Description:** `NSPhotoLibraryUsageDescription` still describes document upload, which was removed, and App Review may flag it as unused. The manifest names the channel `stars_delivery_default`, but no Kotlin or Dart code creates it, so Android 8+ falls back to the "Miscellaneous" channel.
- **Recommended validation:** Check the notification channel settings on a device after the first push.

### RISK-035: Uses the public OSM tile server in production
- **Evidence:** Potential risk
- **Location:** [order_tracking_screen.dart:139-140](../../lib/screens/order_tracking_screen.dart#L139-L140)
- **Description:** `tile.openstreetmap.org` usage policy forbids heavy or commercial app use and may block the UA. Each tile request also sends the customer's IP and the area being viewed to OSMF.
- **Recommended validation:** Move to a commercial or self-hosted tile provider, and mention it in the privacy policy.

### RISK-036: Localization shows raw server messages, and the client compares against Arabic display strings
- **Evidence:** Confirmed defect
- **Location:** [auth_service.dart:158-169](../../lib/services/auth_service.dart#L158-L169), [routes/auth.js:43](../../stars_delivery_backend/src/routes/auth.js#L43), [routes/auth.js:207-211](../../stars_delivery_backend/src/routes/auth.js#L207-L211), [order_offers_screen.dart:973-986](../../lib/screens/order_offers_screen.dart#L973-L986), [order_detail_screen.dart:229](../../lib/screens/order_detail_screen.dart#L229), [order_offers_screen.dart:933-962](../../lib/screens/order_offers_screen.dart#L933-L962)
- **Description:** Server error text, a mix of English ("Invalid credentials") and Arabic, is shown as-is in both locales. UI logic depends on server-generated Arabic labels (`'غير محدد'`, `'من المحافظة نفسها'`). Some dialog strings are hard-coded in Arabic. Each screen also wraps itself in a manual `Directionality`, which duplicates what `MaterialApp` already does from `locale`. RTL and accessibility tests exist (`test/ux0*`), but a screen-reader pass has not been run.
- **Recommended validation:** Switch to English and trigger login, offer and conflict errors. Use stable `code` values from the server to look up localized strings. Do a manual TalkBack/VoiceOver pass.

### RISK-037: If the re-login after a forced password change fails, a dead token is left behind
- **Evidence:** Potential risk
- **Location:** [force_change_password_screen.dart:68-110](../../lib/screens/force_change_password_screen.dart#L68-L110)
- **Description:** The server rotates `sessionVersion`. The client then has to log in again. If that call fails (rate limit, network), the error shows but secure storage still holds the revoked token, and the user cannot tell whether the password actually changed.
- **Recommended validation:** Simulate a network drop after the PUT succeeds. Have the server return a fresh token from `PUT /users/password`.

### RISK-038: Registration does not validate `fullName`, `phone` or `privacyPolicy` on the server
- **Evidence:** Confirmed defect
- **Location:** [routes/auth.js:54-63](../../stars_delivery_backend/src/routes/auth.js#L54-L63), [routes/auth.js:106-136](../../stars_delivery_backend/src/routes/auth.js#L106-L136)
- **Description:** These fields are stored unchecked (any type or length), and an account can be created without accepting the privacy policy. Only the Flutter validators enforce the phone format.
- **Recommended validation:** Supertest with a non-string or very large `fullName` and `privacyPolicy:false`.

### RISK-039: `PUT /users/password` has no rate limit
- **Evidence:** Potential risk
- **Location:** [users.js:270-399](../../stars_delivery_backend/src/routes/users.js#L270-L399)
- **Description:** Anyone holding a stolen JWT can brute-force the current password without limit, then take over the account by changing it.
- **Recommended validation:** Add a per-user limiter consistent with login.

### RISK-040: Test coverage gaps
- **Evidence:** Confirmed defect (missing coverage)
- **Location:** [test/](../../test), [stars_delivery_backend/test/](../../stars_delivery_backend/test), [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- **Description:** Coverage is broad: 43 backend `node:test` suites (about 387 cases) and about 47 Flutter widget/unit test files. None of them covers the defects in RISK-001, 002, 004, 005, 008 or 011. There are no `integration_test`/e2e flows on a device. CI never checks startup time, APK size or performance.
- **Recommended validation:** Add a `ProviderBloc` merge test, a push-token revocation test, an APK size budget, and a startup timeline check.

### RISK-041: Socket re-connect after re-login may reuse a cached manager
- **Evidence:** Requires runtime verification
- **Location:** [socket_service.dart:87-99](../../lib/services/socket_service.dart#L87-L99), [socket_service.dart:206-210](../../lib/services/socket_service.dart#L206-L210)
- **Description:** `io.io(uri, …)` is called without `enableForceNew()`. `socket_io_client` caches Managers per URI, so after logout and login as a different user, check that the new `auth.token` is actually sent and no stale listeners remain.
- **Recommended validation:** Log in as A, log out, log in as B, and confirm on the server side that `socket.userId` is B.

### RISK-042: Android debug LAN discovery trusts any host on the subnet
- **Evidence:** Potential risk (debug builds only)
- **Location:** [api_config.dart:172-292](../../lib/services/api_config.dart#L172-L292)
- **Description:** A debug build probes the whole /24 over HTTP and adopts the first host that answers `/api/config`. On shared Wi-Fi, a malicious host could capture test credentials and tokens.
- **Recommended validation:** Prefer an explicit `STARS_SERVER_URL` even in debug builds.

### RISK-043: Global Helmet CSP is disabled for non-admin static files, and HSTS lacks `includeSubDomains`
- **Evidence:** Potential risk
- **Location:** [index.js:65-71](../../stars_delivery_backend/src/index.js#L65-L71), [index.js:129-130](../../stars_delivery_backend/src/index.js#L129-L130), [stars-delivery.conf:42-44](../../deployment/nginx/stars-delivery.conf#L42-L44)
- **Description:** `src/public` (css/js/data) is served at the root with no CSP. Only `/admin` gets the strict policy. The impact is limited because there are no user-generated HTML pages, but defence in depth is missing.
- **Recommended validation:** Apply a restrictive default CSP globally, and review the HSTS preload intent.

### RISK-047: `MyOrdersScreen._loadOrders` calls `setState` after dispose
- **Evidence:** Confirmed defect (seen at runtime in the widget-test renderer)
- **Location:** [my_orders_screen.dart:98-104](../../lib/screens/my_orders_screen.dart#L98-L104)
- **Description:** There is no `mounted` check after `await getMyOrders`. Leaving the screen before the response arrives throws `setState() called after dispose()`. This was captured during the audit with a 3 s delayed response.
- **Recommended validation:** A widget test that pumps the screen, replaces it before the response arrives, and asserts no exception. Then audit every `await`→`setState` in `lib/screens`.

### RISK-048: The ad banner overflows at large text scale (1.6×)
- **Evidence:** Confirmed defect (visual: Flutter's overflow stripe in the render)
- **Location:** [ad_banner_carousel.dart](../../lib/widgets/ui/ad_banner_carousel.dart)
- **Description:** With accessibility text scaling at 1.6, the fixed-height ad card overflows (the yellow/black debug stripe appears) and the countdown is clipped. Screenshot: `screenshots/SCREEN-006-textscale160-ar-light.png`.
- **Recommended validation:** Golden or widget tests at text scales 1.0, 1.3 and 2.0.

### RISK-049: The admin dashboard does not work at phone width
- **Evidence:** Confirmed (visual: real browser screenshot at 390x844)
- **Location:** [style.css](../../stars_delivery_backend/src/public/css/style.css), [sidebar.ejs](../../stars_delivery_backend/src/views/admin/partials/sidebar.ejs)
- **Description:** At 390 px the sidebar stays expanded and takes most of the viewport. The main content (KPI cards, order table) is pushed off-screen and clipped. Screenshots: `screenshots/ADMIN-002-populated-mobile.png` and `screenshots/ADMIN-003-populated-mobile.png`.
- **Recommended validation:** Responsive breakpoints for the sidebar, plus Playwright viewport tests.

### RISK-050: Cancelled and expired orders show the raw English status in My Orders
- **Evidence:** Confirmed defect (visual and code)
- **Location:** [my_orders_screen.dart:293-307](../../lib/screens/my_orders_screen.dart#L293-L307)
- **Description:** `_statusLabel` handles only `pending`, `offered`, `accepted`, `fulfilling` and `completed`. Its `default` returns the raw value, so `cancelled` and `expired` (both valid `Order.status` values) appear untranslated, even in Arabic. The key `status_cancelled` exists in `localization_service.dart` but is never used here. Screenshot: `screenshots/DIALOG-007-default-ar-light.png` (the chip is visible behind the dialog).
- **Recommended validation:** A unit test asserting every `Order.status` enum value maps to a localized label in both locales.
