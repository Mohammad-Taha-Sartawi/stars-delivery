# Stars Delivery — Recommended Test Plan

Companion to [TEST_AUDIT.md](TEST_AUDIT.md). Targets the actual stack: Flutter 3.47 (flutter_bloc, Dio, socket_io_client, flutter_secure_storage, geolocator, flutter_map, Firebase Messaging; default locale Arabic/RTL) and Node 24 + Express 5 + Mongoose 8 + Socket.IO 4 backend with an EJS/vanilla-JS admin dashboard.

## 1. Goals and principles

1. **Replace source-text assertions with behaviour** on business-critical journeys. Keep source-text checks only where nothing else is practical (build/CI/deployment config, "this dangerous API is never called" guards) and label them `static_guard` so they are not mistaken for feature tests.
2. **Test each contract once at the right layer**: pure rules in unit tests, route wiring + auth + validation via supertest against an in-memory MongoDB, UI behaviour via widget tests with a fake API, a thin set of full e2e journeys on device.
3. **Real-time (Socket.IO) and lifecycle (resume/background)** are first-class — this is a marketplace with 60-second offer windows and cooldowns.
4. **Arabic RTL is the default** and must be a first-class matrix dimension, not an afterthought.
5. Everything runs in CI with coverage reported; e2e/device and load suites run nightly / pre-release.

## 2. Tooling to add

| Layer | Tool | Notes |
|---|---|---|
| Flutter unit / BLoC | `flutter_test`, **`bloc_test`**, **`mocktail`**, `fake_async` | Add to `dev_dependencies`. Replace hand-written fakes progressively. |
| Flutter widget | `flutter_test` + extended **MockApi** ([mock_api_server.dart](../../test/mock_api_server.dart)) | Extend MockApi with orders/offers/rating/notifications/chat endpoints and request recording; add a `FakeSocketService` that can push events. |
| Flutter visual regression | **`alchemist`** (preferred; CI-stable "CI goldens" + platform goldens) or `golden_toolkit` | Bundle Arabic-capable font (e.g. Noto Naskh/Cairo) in test assets so Arabic glyphs render (current screenshot suite notes this limitation). |
| Flutter on-device e2e | **`integration_test`** + **`patrol`** | Patrol for native dialogs (location permission, notification permission), backgrounding, and push notification tapping. |
| Backend unit | `node:test`, `node:assert/strict`, `t.mock` (built-in) | Prefer `t.mock.method` over manual reassignment + `finally`. |
| Backend API / integration | **`supertest`**, **`mongodb-memory-server-core`** (replica set mode for transactions) | Extract an `createApp()` factory from [index.js](../../swifora_backend/src/index.js) so all routers can be mounted without starting the process. Use `MongoMemoryReplSet` because [orderLifecycle.js](../../swifora_backend/src/services/orderLifecycle.js) uses transactions. |
| Socket.IO | `socket.io-client` in node tests against an ephemeral server | Two clients (customer, provider) per test. |
| Contract | **OpenAPI 3.1** spec + `express-openapi-validator` (response validation in test mode) **or** JSON-Schema snapshots of responses; optional **Pact** (Dart consumer via `pact_dart`/HTTP-level, Node provider verification) | Start with schema snapshots — cheaper; move to Pact if a second client appears. |
| Admin web UI | **Playwright** + **@axe-core/playwright** | Covers CSRF, CSP (no inline violations reported in console), XSS escaping, login + TOTP. |
| Performance / load | **k6** (preferred, has WebSocket support) or Artillery (Socket.IO engine) | Separate `perf/` folder; nightly against staging. |
| Accessibility (app) | Flutter `meetsGuideline(androidTapTargetGuideline / iOSTapTargetGuideline / labeledTapTargetGuideline / textContrastGuideline)` | Already partly done manually in UX-01/UX-03 tests; generalise. |
| Security | `npm audit` (exists), **OSV-Scanner** (Dart + npm), **Semgrep** (Node/Express rules), **OWASP ZAP baseline** against staging admin + API, **MobSF** static scan of APK/IPA, `gitleaks` | ZAP + MobSF pre-release. |
| Coverage | `flutter test --coverage` + `lcov`; backend `node --test --experimental-test-coverage` or `c8` | Publish as CI artifact; set thresholds after a baseline. |
| Device matrix | Firebase Test Lab or BrowserStack App Automate running the `integration_test`/Patrol suite | Nightly. |
| Network shaping | Patrol + emulator network profiles; Toxiproxy for backend-side latency/drop in integration tests | |

## 3. Layer-by-layer plan

### 3.1 Unit (Flutter)

- `bloc_test` suites for **OrderBloc, OfferBloc, NotificationBloc, ProviderBloc** (none tested directly today), plus re-express AuthBloc/AppBloc tests with `bloc_test`.
- Models: `OrderModel`, `OfferModel`, `ProviderStats`, `UserModel`, `AdModel` JSON round-trips incl. missing/nullable/legacy fields and Arabic text.
- Pure helpers: countdown/expiry math for offer windows and provider cooldown (inject a clock), elapsed delivery time, phone masking, status → label/tone mapping, validators, location catalog.
- Services: `OfferService`, `OrderService`, `ProviderService`, `ReportService`, `NotificationService`, `LocationService`, `SupportChatService` against a Dio adapter — assert method, path, body, and error mapping (401 session revoked, 409 duplicate offer, 410 expired, network error).

### 3.2 Unit (backend)

- Keep [order-lifecycle.test.js](../../swifora_backend/test/order-lifecycle.test.js) / [offer-window.test.js](../../swifora_backend/test/offer-window.test.js); migrate monkey-patching to `t.mock`.
- Add unit tests for [adminAccounts.js](../../swifora_backend/src/services/adminAccounts.js), [requestInput.js](../../swifora_backend/src/security/requestInput.js), [pushNotifications.js](../../swifora_backend/src/services/pushNotifications.js) (mock `firebase-admin` messaging; token pruning on `registration-token-not-registered`), [mobileNotifications.js](../../swifora_backend/src/services/mobileNotifications.js), commission computation edge cases (rounding, percentage vs fixed, zero/negative adjustments).

### 3.3 API integration (backend, supertest + MongoMemoryReplSet)

Highest-value addition. One file per router (`integration/orders.integration.js`, `offers…`, `provider…`, `users…`, `notifications…`, `chat…`, `reports…`, `passwordRecovery…`, `admin*.integration.js`). For each endpoint cover: happy path, unauthenticated (401), wrong role (403), not owner (403/404 — IDOR), validation (400), state conflict (409), and response schema. Shared helpers: `createApp()`, `seedCustomer()`, `seedProvider({area, serviceTypes, available})`, `loginAs(role)`, `seedOrder(state)`. Run in the existing `npm run test:integration` step.

### 3.4 Real-time (Socket.IO)

Ephemeral server + two `socket.io-client` instances: new order fan-out only to eligible providers (area/governorate consent, availability, service type, not previously rejected); offer received by owning customer only; offer accepted → winning provider notified, losing providers get "not selected", stale offers cancelled; status changes reach the customer; stale-generation JWT is disconnected; customer phone never in new-order payload.

### 3.5 Widget / UI automation (Flutter)

- Extend MockApi + `FakeSocketService` and write behavioural widget tests that **replace** the source-text `_ui_test` files: order offers (accept, countdown, expired, driver-taken), submit offer (required time, cooldown, duplicate), my orders (cancel/resend gating, delivery confirm/reject, rating prompt), create order (validation, governorate banner, submit), provider active orders (start/complete), notifications routing, rejected orders, order report, support chat, commission payment, settings.
- Delete each source-text test once its behavioural replacement lands (track in a checklist).

### 3.6 End-to-end (integration_test + Patrol)

Run app against a disposable backend (docker-compose: backend + `mongo` replica set + seeded data, FCM disabled/mocked) on emulator/simulator. Two-device journeys are simulated by driving the customer in the app and the provider via API calls (or two emulators in nightly). Keep the e2e set small (≈10 journeys, P0 only).

### 3.7 API contract

- Author an OpenAPI 3.1 spec for mobile endpoints (`/api/auth`, `/api/orders`, `/api/offers`, `/api/provider`, `/api/users`, `/api/notifications`, `/api/chat`, `/api/ads`, `/api/password-recovery`).
- Backend: validate responses against the spec in supertest tests (fail on undocumented fields such as `password`, `phone` where it must be masked).
- Flutter: golden JSON fixtures generated from the spec feed both MockApi and model parsing tests, so a backend shape change breaks Flutter tests too. Add Socket.IO event payload schemas (AsyncAPI or JSON Schema).

### 3.8 Visual regression

Alchemist goldens for: the 14 harness screens + login + provider/customer home, each in {light, dark} × {ar (RTL), en (LTR)} × {phone 360×800, small phone 320×568, tablet 800×1280} and text scale {1.0, 1.5, 2.0}. Status chips, dialogs, ad carousel, empty/error/loading states. CI goldens on Linux; regenerate only via a labelled PR. This is the safety net for the ongoing UX redesign.

### 3.9 Performance

- k6 scenarios against staging: (a) login burst, (b) 200 providers connected via WebSocket while 50 customers create orders/min — measure fan-out latency p95 < 1 s; (c) offer storm: 20 providers offering on one order within the 60 s window — no duplicate offers, accept p95 < 500 ms; (d) admin dashboard stats endpoints with 100k orders seeded.
- Flutter: `integration_test` `traceAction` on provider home and order offers list scrolling (frame build p90 < 16 ms on mid-tier Android); app cold-start time.
- Mongo: `explain()` assertions in integration tests for hot queries (pending orders by area, offers by order, notifications by user) to ensure index use.

### 3.10 Accessibility

- Flutter: run `meetsGuideline` (tap target, labeled tap target, text contrast) on every harness screen in both themes and locales; semantics labels for icon-only buttons; text scale 2.0 no overflow (`tester.takeException()` null); screen-reader order in RTL.
- Admin web: Playwright + axe on login, dashboard, drivers, users, orders, commissions, chat, ads; keyboard-only navigation of modals.

### 3.11 Security

- API: authz matrix test (every route × {anon, customer, provider, other customer, other provider, admin session}) generated from a route table; IDOR on `/orders/:id`, `/offers/:id`, rating, chat threads; mass-assignment (role, status, commission fields in profile update); NoSQL injection (`{"$gt": ""}` in login/email); rate-limit exhaustion; JWT generation revocation; upload magic-byte + size; error responses carry no stack.
- Admin: CSRF on every unsafe method, CSP header report, session fixation, TOTP brute force, XSS via driver/user names in dashboard (Playwright).
- Tooling in CI: `npm audit` (exists), OSV-Scanner for `pubspec.lock`, Semgrep, gitleaks; pre-release ZAP baseline + MobSF.
- Mobile: token only in secure storage, cleared on logout/revocation; release build rejects HTTP origins (exists as unit test); certificate pinning decision documented.

### 3.12 Offline / poor network

Dio adapter fault injection (timeout, connection refused, 503 from [database-resilience](../../swifora_backend/test/database-resilience.test.js) path, slow 5 s responses) on: login (session preserved on transient failure — exists), submit offer (no double submit on retry), accept offer (idempotent), create order (no duplicate on retry), socket reconnect re-syncs pending lists. On-device: Patrol with airplane mode toggled mid-flow.

### 3.13 Lifecycle (background / foreground)

Widget tests using `tester.binding.handleAppLifecycleStateChanged`: pending orders refresh on resume (currently S-only in [offer_concurrency_ui_test.dart](../../test/offer_concurrency_ui_test.dart)), countdowns recompute from server time after resume, socket reconnect after background, session re-validation on resume. Patrol: background app during offer window, receive push, tap → correct order screen.

### 3.14 Device / resolution matrix

| Dimension | Values |
|---|---|
| Android | API 26 (min), 30, 34, 35; Samsung + Pixel; low-RAM device |
| iOS | 16, 17, 18; iPhone SE (small), iPhone 15/16 Pro Max |
| Size | 320×568, 360×800, 412×915, tablet 800×1280 |
| Text scale | 1.0, 1.3, 2.0 |
| Locale | ar (RTL, default), en (LTR) |
| Theme | light, dark |
| Insets | notch, gesture nav, 3-button nav, keyboard open |

Goldens cover size/text/locale/theme in CI; Test Lab covers OS/device nightly.

### 3.15 Localization / RTL

- Unit: every key in [localization_service.dart](../../lib/services/localization_service.dart) has non-empty `ar` and `en`; no placeholder mismatch (`%d`, `%s`) between languages; no hardcoded user-facing strings in `lib/screens` (lint or test).
- Widget: all screens pumped with `Locale('ar')` assert `Directionality == rtl`, directional icons mirrored, numbers/currency (₪) formatting, mixed Arabic/Latin names, long Arabic village names don't overflow.
- Backend: Arabic search/normalisation of city names ([palestineCities.js](../../swifora_backend/src/services/palestineCities.js)); notifications text in user locale.

### 3.16 Regression after redesign

- Freeze current behaviour before further UX work: land P0 behavioural widget tests + alchemist goldens for affected screens first.
- Every redesign PR must: pass goldens (or update with reviewer approval), keep semantics labels, keep keys used by e2e (`Key('submit_offer_button')` etc. — introduce stable `ValueKey`s now).
- Convert UX-01/UX-03 screenshot suites into golden tests to make them automatic.

## 4. Priority roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0 — next 2–3 weeks** | `createApp()` refactor; supertest+MongoMemoryReplSet suites for orders, offers, provider, users (authz + state machine); Socket.IO fan-out tests; `bloc_test` for Order/Offer BLoCs; behavioural widget tests for order offers, submit offer, my orders, create order, provider active orders; coverage reporting in CI | All P0 cases below automated and green in CI; coverage published |
| **P1 — following month** | Alchemist goldens (ar/en × light/dark × 3 sizes); integration_test + Patrol P0 journeys nightly; OpenAPI + response validation; localization completeness; admin Playwright + axe; OSV/Semgrep/gitleaks in CI | Goldens gate PRs; nightly e2e green |
| **P2 — pre-release / ongoing** | k6 load + WebSocket fan-out; ZAP + MobSF; Test Lab device matrix; offline/airplane-mode e2e; retire remaining source-text tests | Load SLOs documented; device matrix report per release |

## 5. Test cases to automate

Layers: **U** unit, **B** BLoC, **W** widget, **API** supertest+in-memory Mongo, **RT** Socket.IO, **E2E** integration_test/Patrol, **G** golden, **C** contract, **P** performance, **A11Y**, **SEC**, **WEB** admin Playwright.

| ID | Journey | Preconditions | Steps | Expected | Layer | Tool | Priority |
|---|---|---|---|---|---|---|---|
| AUTH-01 | Login (customer) | Seeded active customer | POST `/api/auth/login` with normalised email variants | 200, token, `publicMobileUser` shape, no password hash | API, C | supertest, schema | P0 |
| AUTH-02 | Login wrong role / blocked / deleted | Seeded blocked, deleted, pending provider | Login each | 401/403 generic error, no enumeration, rate-limit counter incremented on failure only | API, SEC | supertest | P0 |
| AUTH-03 | Session restore on app start | Valid token in secure vault; MockApi `/me` 200 | Pump app | Lands on role home without login screen | W | flutter_test + MockApi | P0 |
| AUTH-04 | Revoked session mid-use | Logged-in provider; server returns 401 `TOKEN_REVOKED` on next call | Trigger refresh of stats | Token cleared, navigated to login, message shown once | W, B | bloc_test, MockApi | P0 |
| AUTH-05 | Stale generation over REST + socket | Admin blocks user (generation rotates) | Call `/api/orders` with old JWT; keep socket open | 401 on REST; socket disconnected | API, RT | supertest, socket.io-client | P0 |
| AUTH-06 | Forced password change | User with `mustChangePassword` | Login; attempt protected API; change password | Protected API 403 until changed; app shows non-poppable screen; afterwards home | API, W | supertest, flutter_test | P1 |
| AUTH-07 | Password recovery | Existing email; mailer mocked | Request → OTP → reset | Generic 202; 6th wrong OTP rejected; success rotates sessions | API | supertest | P1 |
| AUTH-08 | Logout clears data | Logged-in customer | Logout → confirm | Secure + legacy tokens cleared; socket disconnected; back nav cannot return | W, E2E | flutter_test, Patrol | P1 |
| ORD-01 | Create order happy path | Customer in Bethlehem governorate | Fill create-order form, submit | POST body correct; order `pending`; navigates to my orders; appears in list | W, API | MockApi, supertest | P0 |
| ORD-02 | Create order validation | — | Submit empty/invalid fields; double-tap submit | Inline errors; single request only | W | flutter_test | P0 |
| ORD-03 | New order fan-out | 3 providers: same area available, other area, paused | Customer creates order | Only eligible provider receives `new_order` event + push; payload excludes customer phone | RT, SEC | socket.io-client | P0 |
| ORD-04 | Governorate-level consent | Customer and provider governorate mode on/off combinations | Create order | Visible to outside-city provider only when both opted in | API | supertest | P1 |
| ORD-05 | Order detail IDOR | Order of customer A | GET `/api/orders/:id` as customer B, as unrelated provider | 403/404; owner and matching provider 200 | API, SEC | supertest | P0 |
| OFR-01 | Submit offer happy path | Pending order; eligible available provider | POST offer with price/time | 201; order → `offered`; customer receives `offer` event; provider cooldown set | API, RT | supertest, socket.io-client | P0 |
| OFR-02 | Duplicate / concurrent offer | Same provider | Fire two offers concurrently | Exactly one offer stored; second gets "already submitted" | API | supertest + Promise.all | P0 |
| OFR-03 | Offer expires after 60 s | Offer created; fake clock | Advance 61 s; customer accepts | 410/409 expired; offer removed; order suspended if no responders | API, U | supertest, t.mock.timers | P0 |
| OFR-04 | Accept offer | Order with 2 offers | Customer accepts offer A | Order `accepted`; provider A reserved 15 min; provider B gets "not selected"; commission snapshot stored | API, RT | supertest, socket.io-client | P0 |
| OFR-05 | Driver taken | Provider A accepted elsewhere | Customer accepts A's offer | Error "driver taken"; A's offer cancelled; UI shows message and refreshes | API, W | supertest, MockApi | P0 |
| OFR-06 | Submit offer UI | Pending order in MockApi | Open order → submit offer without time; with time | Validation error; then success snackbar, order removed from pending list | W | flutter_test | P0 |
| OFR-07 | Cooldown UI | Provider cooldown 40 s remaining | Open another order's offer action | Blocked with countdown; enabled after fake_async 40 s | W | flutter_test + fake_async | P1 |
| OFR-08 | Customer offers screen | 2 offers with ratings, outside-area flag | Pump order offers screen | Shows price, ETA, rating avg/positive count, category, outside-area warning, per-offer countdown | W, G | flutter_test, alchemist | P0 |
| OFR-09 | Provider rejects order | Pending order | Reject → confirm | Order hidden for that provider only; appears in rejected list; cannot offer later | API, W | supertest, flutter_test | P1 |
| DLV-01 | Status transitions | Accepted order | Provider: start (fulfilling) → complete | Only allowed transitions; others 409; customer gets status events | API, RT | supertest | P0 |
| DLV-02 | Wrong provider transition | Order accepted by A | Provider B attempts start | 403; no state change | API, SEC | supertest | P0 |
| DLV-03 | Customer delivery confirmation | Order awaiting confirmation | Customer approves / rejects | Approve → completed + provider busy released; reject → back to fulfilling | API, W | supertest, flutter_test | P0 |
| DLV-04 | Provider active orders UI | Accepted order in MockApi | Tap start, then complete | Correct requests, button states, elapsed timer | W | flutter_test | P0 |
| DLV-05 | Tracking map | Fulfilling order with location updates | Open tracking; push location event | Marker moves; no crash without tiles | W | flutter_test + FakeSocket | P2 |
| CAN-01 | Customer cancel pending | Pending/offered order | Cancel | 200; offers cancelled; providers notified | API, RT | supertest | P0 |
| CAN-02 | Cancel after accept rejected | Accepted order | Cancel | 409; UI hides cancel button | API, W | supertest, flutter_test | P0 |
| CAN-03 | Resend order | Window expired, no offers | Resend | Broadcast again; counter reset | API | supertest | P1 |
| COM-01 | Commission accrual | Fixed and percentage settings | Accept offers, complete orders | Due = sum of snapshots after last payment cutoff; rounding to 2 dp | U, API | node:test, supertest | P0 |
| COM-02 | Admin records payment | Provider with dues | Admin pays dues | Provider stats due = 0; history entry; audit log row | API, WEB | supertest, Playwright | P1 |
| COM-03 | Provider pay-now UI | Due > 0 / = 0 | Pump provider home; tap pay now | Button only when due; opens commission payment screen with amount | W | flutter_test | P1 |
| RAT-01 | Rate completed order | Completed order | POST rating 5 | 201; provider average/count updated; notification to provider | API | supertest | P0 |
| RAT-02 | Rating guards | Pending order; already rated order; other customer's order | POST rating | 409/403; value outside 1–5 → 400 | API, SEC | supertest | P0 |
| RAT-03 | Rating prompt UI | Delivery just confirmed | Confirm delivery in my orders | Rating dialog shown; submit sends value | W | flutter_test | P1 |
| NOT-01 | Notification feed | Mixed notification types | GET feed; mark read | Correct ordering/paging; unread count decreases | API | supertest | P1 |
| NOT-02 | Notification tap routing | Order/offer/rating/broadcast notifications | Tap each | Navigates to order / offers / provider stats / dialog | W | flutter_test | P1 |
| NOT-03 | Push token registration | Firebase mocked | Login; token refresh | POST token once; replaced on refresh; deleted on logout | W, API | mocktail, supertest | P1 |
| NOT-04 | Push open from background | App backgrounded | Receive FCM, tap | Opens related order | E2E | Patrol | P2 |
| CHAT-01 | Support chat | Customer and admin | Send message both ways | Persisted; unread counts; admin message appears in app | API, RT, W | supertest, flutter_test | P1 |
| ADM-01 | Admin login + TOTP + CSRF | Seeded admin | Login, POST without CSRF | Login works; unsafe request without token 403 | WEB, SEC | Playwright | P1 |
| ADM-02 | Admin XSS | Driver name `<img onerror>` | View drivers list/details | Rendered as text; no CSP violation | WEB, SEC | Playwright | P1 |
| ADM-03 | Admin a11y | — | Visit main pages | No serious/critical axe violations | WEB, A11Y | axe-core | P2 |
| SEC-01 | Authz matrix | Route table | Each route × each role | Matches expected 2xx/401/403 table | API, SEC | supertest (generated) | P0 |
| SEC-02 | Mass assignment | Customer | PATCH profile with `role`, `status`, `commission` | Fields ignored/rejected | API, SEC | supertest | P0 |
| SEC-03 | NoSQL injection | — | Login with `{"email":{"$gt":""}}` | 400; no login | API, SEC | supertest | P0 |
| SEC-04 | Dependency & secret scan | — | CI | No high vulns; no secrets | SEC | npm audit, OSV-Scanner, gitleaks | P1 |
| SEC-05 | DAST | Staging | ZAP baseline on API/admin | No high alerts | SEC | OWASP ZAP | P2 |
| SEC-06 | Mobile binary | Release APK/IPA | Scan | No cleartext, no debuggable, no embedded secrets | SEC | MobSF | P2 |
| NET-01 | Offer submit retry | MockApi timeout then success | Submit, retry | Single offer created (idempotency); clear error then success | W, API | flutter_test, supertest | P1 |
| NET-02 | Socket reconnect | Connected provider | Drop socket 10 s, new order created meanwhile | On reconnect, pending list re-synced | W, RT | FakeSocket, socket.io-client | P1 |
| NET-03 | Backend DB down | Mongo stopped | Call APIs | 503 safe payload; app shows retry state | API, W | supertest, flutter_test | P1 |
| NET-04 | Airplane mode | Device | Toggle during create order | No crash; draft kept; retry works | E2E | Patrol | P2 |
| LIFE-01 | Resume refresh | Pending orders screen open | Background → resume | Refetch triggered; countdowns recomputed | W | flutter_test lifecycle | P1 |
| LIFE-02 | Session check on resume | Token revoked while backgrounded | Resume | Logged out to login | W | flutter_test | P1 |
| L10N-01 | Key completeness | — | Iterate localization map | Every key has ar+en; placeholders match | U | flutter_test | P0 |
| L10N-02 | RTL layout | Locale ar | Pump each screen | `Directionality.rtl`; no overflow; mirrored icons | W, G | flutter_test, alchemist | P1 |
| VIS-01 | Golden baseline | Harness screens | Render light/dark × ar/en × 3 sizes | Matches approved goldens | G | alchemist | P1 |
| VIS-02 | Text scale | 2.0 scale | Pump each screen | No overflow exceptions; goldens | W, G | flutter_test, alchemist | P1 |
| A11Y-01 | Tap targets & labels | Each screen | `meetsGuideline` tap/label/contrast | Pass in both themes/locales | A11Y | flutter_test | P1 |
| PERF-01 | Order fan-out latency | 200 providers connected | 50 orders/min for 10 min | p95 event latency < 1 s; error rate < 0.5% | P | k6 (WebSocket) | P2 |
| PERF-02 | Offer storm | 20 providers, 1 order | All offer within 5 s; customer accepts | No duplicates; accept p95 < 500 ms; one winner | P | k6 | P2 |
| PERF-03 | Provider home jank | Mid-tier Android | Scroll/refresh dashboard | Frame build p90 < 16 ms | P | integration_test traceAction | P2 |
| E2E-01 | Full happy path | docker-compose backend seeded | Customer creates order → (API) provider offers → customer accepts → (API) provider completes → customer confirms + rates | Every screen state correct; final order completed with rating | E2E | integration_test + Patrol | P0 |
| E2E-02 | Provider happy path | Seeded pending order | Provider logs in, offers, gets accepted (API), starts, completes | Correct screens/notifications | E2E | Patrol | P1 |
| E2E-03 | Cancel journey | — | Customer creates, receives offer, cancels | Order cancelled; provider notified | E2E | Patrol | P1 |
| CON-01 | Response contracts | OpenAPI spec | Validate all supertest responses | No undocumented/missing fields | C | express-openapi-validator | P1 |
| CON-02 | Client fixtures from spec | Spec examples | Parse every example into Dart models | No parse errors; MockApi uses same fixtures | C | flutter_test | P1 |
| REG-01 | Replace source-text tests | Behavioural replacement exists | Delete `*_ui_test.dart` source checks one by one | Coverage does not drop; checklist tracked | process | — | P1 |

## 6. CI changes

1. Backend: add `npm run test:integration` glob for all `integration/*.integration.js`; use `MongoMemoryReplSet`; add `--experimental-test-coverage` (or c8) and upload lcov.
2. Flutter: `flutter test --coverage`; upload `coverage/lcov.info`; add golden job (alchemist CI goldens) failing on diff with artifact of diffs.
3. Convert the analyzer baseline from exact-equals-12 to "≤ 12 and no errors" (ratchet) so fixing lints doesn't break CI.
4. Nightly workflow: Patrol/integration_test on emulator (Android) + simulator (macOS runner), k6 smoke against staging, OSV-Scanner, gitleaks.
5. Pre-release workflow: ZAP baseline, MobSF, Test Lab device matrix.
6. Publish JUnit results (`--reporter junit` for node:test, `flutter test --machine` → junit) for PR annotations.
