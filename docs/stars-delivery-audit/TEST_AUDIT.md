# Stars Delivery — Test Audit

Branch audited: `docs/stars-delivery-audit` (read-only static review). No tests were executed while preparing this document; all counts are **static counts from source** (grep of `test(` / `testWidgets(` in Dart and `test(` / `it(` in JavaScript at line start). Runtime counts are higher where tests are generated in loops (see [Parametrised tests](#parametrised-tests)).

## 1. Summary

| Area | Test files | Static test cases | Behavioural | Source-text assertion | Mixed | Env-gated (skipped by default) |
|---|---:|---:|---:|---:|---:|---:|
| Flutter (`test/*_test.dart`) | 49 (+2 support files) | 209 | 99 | 97 | — | 13 |
| Backend unit (`swifora_backend/test/*.test.js`) | 56 | 382 | ~163 | ~153 | ~66 | 0 |
| Backend integration (`swifora_backend/integration/`) | 1 | 4 | 4 | 0 | 0 | 0 |
| Native (`ios/RunnerTests`, `macos/RunnerTests`) | 2 | 2 (empty placeholders) | 0 | 0 | 0 | 0 |
| **Total** | **108** | **597** | **~266** | **~250** | **~66** | **13** |

Classification method:

- **Behavioural** — imports/requires production code and executes it (widget pumping, BLoC event dispatch, calling a pure function or service with stubs/fakes, HTTP requests via supertest).
- **Source-text assertion (static/source)** — reads a `.dart`, `.js`, `.ejs`, `.css`, `.yml`, `.plist`, `.gradle.kts` file as a string (`File(...).readAsStringSync()` / `fs.readFileSync`) and asserts with `contains(...)`, `matches(RegExp(...))`, `assert.match` / `assert.doesNotMatch`. These prove that a string exists in a file, not that the feature works. They break on harmless refactors and pass on broken logic.
- **Mixed** — a single test block does both (common in backend security tests: call a helper, then regex-check a route file).
- Note: the audit ran two temporary capture harnesses (`test/zz_audit_capture_test.dart`, `test/zz_audit_capture2_test.dart`) and deleted each immediately after it ran; neither is in the repository or counted here. Their source is preserved under [tooling/](tooling/) for reproducibility.
- Backend split is a **heuristic** produced by scanning each test block for file-reading/regex-assert calls vs. execution calls, then spot-checked by hand; treat ±5% as noise. The Flutter split was checked per file by hand.

Key observations:

1. **~42% of all test cases are source-text assertions.** For the order/offer/rating/cancellation business flows, the Flutter side is tested *almost exclusively* by source-text tests (e.g. [offer_flow_ui_test.dart](../../test/offer_flow_ui_test.dart), [offer_timer_ui_test.dart](../../test/offer_timer_ui_test.dart), [customer_cancel_order_ui_test.dart](../../test/customer_cancel_order_ui_test.dart), [rating_ui_test.dart](../../test/rating_ui_test.dart)) despite the `_ui_test` suffix.
2. **Only one backend route file is exercised over HTTP**: [routes/auth.js](../../swifora_backend/src/routes/auth.js) via [mobile-auth.integration.js](../../swifora_backend/integration/mobile-auth.integration.js) (4 tests, supertest + `mongodb-memory-server-core`). The 56 unit test files do not use supertest at all. The other 20 route files are covered only by regex over source plus (for some) unit tests of the service layer.
3. **Business logic that *is* behaviourally tested on the backend** lives in services: [orderLifecycle.js](../../swifora_backend/src/services/orderLifecycle.js) / [orderState.js](../../swifora_backend/src/services/orderState.js) ([order-lifecycle.test.js](../../swifora_backend/test/order-lifecycle.test.js), 25 tests; [offer-window.test.js](../../swifora_backend/test/offer-window.test.js)), commission ledger/settings, password recovery, session/JWT generation, origin policy, rate limiters, upload storage. Mongoose models are monkey-patched by hand (no real DB) in these tests.
4. **No golden tests** (`matchesGoldenFile` appears nowhere), **no `integration_test/` directory**, **no e2e/device tests**, **no coverage configuration** (no `--coverage`, lcov, c8, nyc in CI or package.json), no `bloc_test` / `mocktail` / `mockito` dependency ([pubspec.yaml](../../pubspec.yaml) dev deps are only `flutter_test` and `flutter_lints`).
5. Two "screenshot" suites ([ux01_screenshots_test.dart](../../test/ux01_screenshots_test.dart), [ux03_screenshots_test.dart](../../test/ux03_screenshots_test.dart)) write PNGs to the developer's Desktop only when `STARS_UX01_SCREENSHOTS=1` / `STARS_UX03_SCREENSHOTS=1`; by default each registers a single guard test. They are manual review aids, not visual regression tests (no baseline comparison).
6. Cross-stack coupling: several Flutter tests read backend sources (e.g. [push_map_admin_test.dart](../../test/push_map_admin_test.dart), [forced_password_change_test.dart](../../test/forced_password_change_test.dart), [offer_concurrency_ui_test.dart](../../test/offer_concurrency_ui_test.dart)) and several backend tests read Flutter sources (e.g. [delivery-confirmation-flow.test.js](../../swifora_backend/test/delivery-confirmation-flow.test.js), [governorate-level-visibility.test.js](../../swifora_backend/test/governorate-level-visibility.test.js), [transport-security.test.js](../../swifora_backend/test/transport-security.test.js)). Either suite therefore depends on the monorepo layout and on the working directory being the repo / backend root.

## 2. Test infrastructure

### 2.1 Flutter

- Runner: `flutter test` (all files under `test/`), Flutter 3.47.4 stable in CI. Package name `stars_delivery`.
- Test types present: plain `test()` unit tests, `testWidgets()` widget tests. No `integration_test`, no `flutter_driver`, no patrol, no golden.
- **MockApi in-memory Dio adapter** — [mock_api_server.dart](../../test/mock_api_server.dart) (153 lines). Implements Dio `HttpClientAdapter`; installed with `MobileApiClient.testAdapter = mockApi.adapter`. Serves mutable per-test fixtures (`statsJson`, `pendingOrders`, `offeredOrders`, `notifications`, `supportUnreadCount`), records calls (`availabilityCalls`, `contactCalls`, `statsRequests`) and supports artificial latency (`responseDelay`, `contactDelay`) driven by fake async time. Rationale documented in the file: the widget-test binding's `HttpOverrides` blocks real loopback HTTP. Covers only a handful of endpoints (provider stats, pending/offered orders, notifications, availability, support contact); unknown paths fall through to a default response.
- **UX-03 screen harness** — [ux03_screen_harness.dart](../../test/ux03_screen_harness.dart) (280 lines). Wires 14 real screens (`Ux03Screen` enum: createOrder, myOrders, notifications, orderDetail, orderOffers, orderReport, profile, providerActive, rejectedOrders, report, submitOffer, supportChat, pendingOrders, offeredOrders) to real BLoCs (App, Auth, Notification, Offer, Order, Provider), the MockApi adapter, an in-memory `TokenVault` and a no-op socket double. Used for layout/theme assertions only.
- Hand-written fakes (no mocking library): `FakeTokenVault` / `FakeAuthGateway` ([session_lifecycle_test.dart](../../test/session_lifecycle_test.dart)), `_WidgetTestTokenVault` ([widget_test.dart](../../test/widget_test.dart)), `_TestVault` / `_TestAuthGateway` ([design_system_test.dart](../../test/design_system_test.dart)), `_FakeUserService extends UserService` ([governorate_scope_test.dart](../../test/governorate_scope_test.dart)), `_FakeRecoveryGateway` ([password_recovery_flutter_test.dart](../../test/password_recovery_flutter_test.dart)).
- Asset fixture: [ux01_login_dialogs_roles_test.dart](../../test/ux01_login_dialogs_roles_test.dart) loads `assets/countries+states+cities.json`.

### 2.2 Backend

- Runner: `node --test` (Node 24.13.1 in CI) with default file discovery → picks up `test/*.test.js`. `node:assert/strict` throughout. No `describe`/`it` usage; all flat `test()`.
- Dev deps: `supertest@7.2.2`, `mongodb-memory-server-core@11.2.0` ([package.json](../../swifora_backend/package.json)) — both used **only** by [mobile-auth.integration.js](../../swifora_backend/integration/mobile-auth.integration.js), which mounts the real `routes/auth` router on a bare Express app (deliberately not `src/index.js`, which owns process startup, Mongo connect and Socket.IO) against an in-memory MongoDB, with synthetic secrets set in `process.env`. Run with `npm run test:integration`.
- Mocking: manual monkey-patching of Mongoose statics (`User.findOneAndUpdate = …`, `mongoose.startSession = async () => fakeSession`) restored in `finally` ([order-lifecycle.test.js](../../swifora_backend/test/order-lifecycle.test.js), [offer-window.test.js](../../swifora_backend/test/offer-window.test.js), password-recovery runtime tests). `node:vm` is used once to evaluate browser code ([credential-bootstrap-security.test.js](../../swifora_backend/test/credential-bootstrap-security.test.js)).
- Source-reading helpers (`source(file)`, `read(file)`) are defined in most files; they read `src/**`, `src/public/js/main.js`, `src/views/**/*.ejs`, `../lib/**/*.dart`, `.github/workflows/ci.yml`, `deployment/**`, `.env.example`, `.gitignore`.
- No shared fixtures directory, no factories, no test DB seeding, no `test/helpers`.

### 2.3 Native

- [ios/RunnerTests/RunnerTests.swift](../../ios/RunnerTests/RunnerTests.swift) and [macos/RunnerTests/RunnerTests.swift](../../macos/RunnerTests/RunnerTests.swift) are the Flutter template placeholders (`testExample` with no body). Not run in CI. No `android/app/src/test` or `androidTest`.

### 2.4 CI ([.github/workflows/ci.yml](../../.github/workflows/ci.yml))

Triggers: push, pull_request, workflow_dispatch; `contents: read`; concurrency cancel-in-progress; pinned action SHAs.

| Job | Steps |
|---|---|
| `backend` (ubuntu-24.04, 15 min) | `npm ci` → lockfile unchanged check → `npm run check` (`node --check src/index.js`) → `npm test` → `npm run test:integration` → `npm audit --omit=dev --audit-level=high` |
| `flutter` (ubuntu-24.04, 20 min) | `flutter pub get` → `pubspec.lock` unchanged → `flutter test` → `flutter analyze` with **approved baseline of exactly 12 non-error issues** (job fails if RC≠1, count≠12, or any `error -` line) |

Gaps: no coverage collection/upload, no test result artifacts (JUnit), no Android/iOS build, no web/admin browser tests, no Flutter golden/visual step, no security scanning beyond `npm audit` (no `dart pub outdated`/OSV, no SAST/DAST). The analyzer gate is an *exact* match, so fixing a lint (12 → 11) also fails CI until the baseline number is edited — it is a freeze, not a ratchet. CI configuration itself is asserted by [ci-workflow-security.test.js](../../swifora_backend/test/ci-workflow-security.test.js) (source-text).

### 2.5 Explicitly absent

| Capability | Status |
|---|---|
| Golden / visual regression tests | **Absent** (no `matchesGoldenFile`, no golden_toolkit/alchemist) |
| `integration_test/` (on-device Flutter) | **Absent** |
| End-to-end (app ↔ real backend) | **Absent** |
| Coverage config / thresholds | **Absent** |
| BLoC unit tests via `bloc_test` | **Absent** (BLoCs tested by hand for Auth/App/PasswordRecovery only) |
| Mocking library (mocktail/mockito/sinon) | **Absent** |
| HTTP route tests (supertest) for orders/offers/provider/users/chat/admin | **Absent** |
| Socket.IO event tests (emit/receive) | **Absent** (only `authenticateSocket` is unit-tested) |
| Admin web UI tests (browser/DOM/axe) | **Absent** (regex over `main.js`/EJS only, plus `escapeHtml` executed) |
| Contract tests (OpenAPI / schema / pact) | **Absent** |
| Performance / load tests | **Absent** |
| Native XCTest / Android instrumented tests | Placeholder only |

## 3. Flutter test inventory

Legend — Type: **U** unit, **W** widget, **S** source-text assertion, **C** config-file assertion, **SEC** security-focused, **SHOT** env-gated screenshot capture. Split column: S = source-text cases, B = behavioural cases.

| File | Type | Static count | Split | What it tests | Fixtures / doubles | Covers |
|---|---|---:|---|---|---|---|
| [admin_driver_edit_ui_test.dart](../../test/admin_driver_edit_ui_test.dart) | S | 1 | S1 | Provider app refreshes profile when admin edits the driver (socket event wiring) | — | provider_home_screen, socket_service |
| [ads_ui_test.dart](../../test/ads_ui_test.dart) | U+S | 3 | S2 B1 | `Ad` model parsing / `isActiveAt`; homes render `AdBannerCarousel`; ad service + l10n keys | — | models/ad_model, home_screen, provider_home_screen, ad_service, widgets/ui/ad_banner_carousel |
| [android_release_signing_test.dart](../../test/android_release_signing_test.dart) | C, SEC | 5 | S5 | Release signing config, no hardcoded passwords, `key.properties.example` empty, `.gitignore` | — | android/app/build.gradle.kts, android/.gitignore |
| [available_drivers_ui_test.dart](../../test/available_drivers_ui_test.dart) | S | 2 | S2 | Available-drivers count on customer home; commission hint on provider home | — | home_screen, provider_home_screen, order_service |
| [customer_cancel_order_ui_test.dart](../../test/customer_cancel_order_ui_test.dart) | S | 6 | S6 | Cancel only for pending orders; cancel endpoint; resend after window; l10n | — | my_orders_screen, order_offers_screen, offer_service |
| [delivery_time_elapsed_ui_test.dart](../../test/delivery_time_elapsed_ui_test.dart) | S | 4 | S4 | Elapsed delivery minutes; customer confirm/reject delivery; backend lifecycle strings | — | my_orders_screen, backend orderLifecycle.js |
| [design_system_test.dart](../../test/design_system_test.dart) | U+W+S | 13 | S3 B10 | Spacing/radius tokens, M3 light/dark roles, touch targets, contrast, `AppActionTile` (RTL, dark, text scale), responsive wrap, login renders LTR/RTL, login dispatches auth event; no hardcoded palette (S) | `_TestVault`, `_TestAuthGateway` | theme_service, responsive, widgets/ui/*, login_screen, AuthBloc, AppBloc |
| [email_identity_security_test.dart](../../test/email_identity_security_test.dart) | S, SEC | 4 | S4 | Profile recovery-email validation, dedicated endpoint, re-auth, session rotation | — | profile_screen |
| [forced_password_change_test.dart](../../test/forced_password_change_test.dart) | U+S | 5 | S4 B1 | `UserModel.mustChangePassword`; login routing; non-poppable force-change screen; bloc persistence; backend enforcement | — | user_model, login_screen, force_change_password_screen, auth bloc, backend auth.js/User.js |
| [frequent_items_removed_test.dart](../../test/frequent_items_removed_test.dart) | S | 1 | S1 | "Frequent items" removed from customer screens | — | create_order_screen, profile_screen |
| [governorate_scope_test.dart](../../test/governorate_scope_test.dart) | U+W | 6 | B6 | Governorate-mode default; location catalog resolution; outside-area offer metadata; scope card toggles persist; 5-second warning; create-order banner | `_FakeUserService` | user_model, offer_model, location_catalog, user_service, widgets/governorate_scope_card, create_order_screen |
| [home_layout_test.dart](../../test/home_layout_test.dart) | S | 2 | S2 | Ordering of home sections | — | home_screen, provider_home_screen |
| [in_progress_orders_ui_test.dart](../../test/in_progress_orders_ui_test.dart) | S | 2 | S2 | Status-filtered report view; l10n | — | my_orders_screen |
| [mobile_http_session_test.dart](../../test/mobile_http_session_test.dart) | U, SEC | 7 | B7 | Session-failure classification (401/403 codes), bearer scoping, single interceptor, timeouts | Dio `RequestOptions`/`Response` | mobile_api_client, mobile_session_failure |
| [new_orders_readability_ui_test.dart](../../test/new_orders_readability_ui_test.dart) | S | 1 | S1 | New-order card hierarchy | — | pending_orders_screen |
| [notification_broadcast_only_ui_test.dart](../../test/notification_broadcast_only_ui_test.dart) | S | 2 | S2 | Offer activity no home alert; broadcasts not in support chat | — | home_screen, provider_home_screen, notifications_screen, backend adminBroadcast.js |
| [notification_order_navigation_test.dart](../../test/notification_order_navigation_test.dart) | S | 3 | S3 | Order notifications navigate to order; detail actions; single-order fetch | — | notifications_screen, order_detail_screen, order_service |
| [offer_concurrency_ui_test.dart](../../test/offer_concurrency_ui_test.dart) | S | 6 | S6 | Driver-taken handling, socket selection/cancel events, not-selected alerts, list refresh on resume; backend stale-offer cancel | — | order_offers_screen, socket_service, notifications_screen, provider_home_screen, pending_orders_screen, backend offers.js/provider.js/orderLifecycle.js/Offer.js |
| [offer_flow_ui_test.dart](../../test/offer_flow_ui_test.dart) | S | 8 | S8 | Estimated time, rating summary, duplicate submit, required time, live refresh, home→offers, outside-area warning | — | order_offers_screen, submit_offer_screen, pending_orders_screen, order_detail_screen, home_screen, offer_bloc, offer_service, offer_model, backend orders.js |
| [offer_specialization_ui_test.dart](../../test/offer_specialization_ui_test.dart) | S | 2 | S2 | Offers per order with type; rejection/waiting explanation | — | order_offers_screen, my_orders_screen, offer_model, backend offers.js |
| [offer_timer_ui_test.dart](../../test/offer_timer_ui_test.dart) | S | 6 | S6 | Per-offer countdown, provider cooldown, expired window | — | order_offers_screen, submit_offer_screen, pending_orders_screen, order_detail_screen, my_orders_screen, offer_service |
| [offered_orders_readability_ui_test.dart](../../test/offered_orders_readability_ui_test.dart) | S | 1 | S1 | Offered-order card design | — | offered_orders_screen |
| [order_report_ui_test.dart](../../test/order_report_ui_test.dart) | S | 4 | S4 | Read-only report, completion/rejection explanation, masked phone, l10n | — | my_orders_screen, order_report_screen, rejected_orders_screen, home_screen |
| [password_policy_test.dart](../../test/password_policy_test.dart) | U, SEC | 6 | B6 | 12–128 length, whitespace, placeholder rejection | — | services/validators |
| [password_recovery_flutter_test.dart](../../test/password_recovery_flutter_test.dart) | U+S, SEC | 10 | S5 B5 | Equatable excludes OTP/password; BLoC stages, failures, no session creation; service/UI wiring (S) | `_FakeRecoveryGateway` | password_recovery bloc, password_recovery_service, forgot_password_screen, login_screen |
| [pending_indicator_ui_test.dart](../../test/pending_indicator_ui_test.dart) | S | 4 | S4 | Pending indicators/badges; l10n | — | home_screen, provider_home_screen |
| [provider_availability_ui_test.dart](../../test/provider_availability_ui_test.dart) | S | 3 | S3 | Availability block expiry, refresh, tappable card | — | provider_stats, provider_home_screen, provider_service |
| [provider_home_widget_test.dart](../../test/provider_home_widget_test.dart) | W | 9 | B9 | Provider dashboard: greeting, tile counts, paused availability, commission "pay now", availability toggle dispatch + snackbar, nav inset, theme×locale matrix (loop), 1.5× text scale | **MockApi** | provider_home_screen, ProviderBloc, NotificationBloc, AuthBloc, AppBloc, mobile_api_client |
| [provider_service_types_ui_test.dart](../../test/provider_service_types_ui_test.dart) | S | 1 | S1 | Registration service-type choice | — | login_screen, auth_event, auth_service |
| [push_map_admin_test.dart](../../test/push_map_admin_test.dart) | S+C | 5 | S5 | Firebase push wiring, backend FCM/push tokens, tracking map, Android/iOS manifests, admin commission UI | — | home/provider_home/order_tracking/my_orders/provider_active_orders screens, firebase_bootstrap, push_notification_service, backend pushNotifications/mobileNotifications/PushToken, AndroidManifest, Info.plist |
| [rating_ui_test.dart](../../test/rating_ui_test.dart) | U+S | 5 | S4 B1 | `ProviderStats` rating parse; rating prompt after confirmation; dashboard stars; rating notifications; backend endpoint | — | provider_stats, my_orders_screen, provider_home_screen, notifications_screen, backend orders.js/Rating.js |
| [rejected_orders_ui_test.dart](../../test/rejected_orders_ui_test.dart) | S | 4 | S4 | Reject action w/ confirm; endpoints; dashboard link; lost offer | — | pending_orders_screen, provider_service, provider_home_screen, offered_orders_screen, rejected_orders_screen |
| [session_lifecycle_test.dart](../../test/session_lifecycle_test.dart) | U, SEC | 8 | B8 | JWT restore guard, legacy prefs → secure vault migration, server validation on startup, expiry, network-failure preservation, logout clearing | `FakeTokenVault`, `FakeAuthGateway`, SharedPreferences mock | AuthBloc, auth_service, jwt_token, session_storage |
| [support_chat_admin_messages_test.dart](../../test/support_chat_admin_messages_test.dart) | S | 1 | S1 | Admin messages in support box with unread badges | — | support_chat_service, support_chat_screen, homes |
| [theme_persistence_test.dart](../../test/theme_persistence_test.dart) | U | 4 | B4 | Theme/locale preference round-trip, AppBloc persistence | SharedPreferences mock | theme_preferences, locale_preferences, AppBloc |
| [transport_config_test.dart](../../test/transport_config_test.dart) | U+S, SEC | 8 | S1 B7 | API origin resolution per build mode/platform; HTTPS required in release | — | services/api_config |
| [ux01_action_tile_semantics_test.dart](../../test/ux01_action_tile_semantics_test.dart) | W (a11y) | 5 | B5 | Semantics labels for counts/badges, Arabic RTL, dark | — | widgets/ui/app_action_tile |
| [ux01_loading_indicator_test.dart](../../test/ux01_loading_indicator_test.dart) | W | 2 | B2 | Legible spinner on disabled button (theme×locale loop); dialog send flow | **MockApi** | login_screen, app_button_loading_indicator |
| [ux01_login_dialogs_roles_test.dart](../../test/ux01_login_dialogs_roles_test.dart) | W | 8 | B8 | Login dialogs EN/AR, role selection semantics, governorate→city filtering, submit payload, no license upload | Fake vault/gateway; assets JSON | login_screen, location_catalog, AuthBloc |
| [ux01_responsive_tokens_test.dart](../../test/ux01_responsive_tokens_test.dart) | U | 2 | B2 | Responsive token ordering/aliases | — | responsive, theme_service |
| [ux01_screenshots_test.dart](../../test/ux01_screenshots_test.dart) | SHOT | 5 | env-gated | PNG capture of provider home / login (EN/AR, light/dark) when `STARS_UX01_SCREENSHOTS=1` | **MockApi** | provider_home_screen, login_screen |
| [ux03_appbar_migration_test.dart](../../test/ux03_appbar_migration_test.dart) | W | 1 (×12 screens at runtime) | B | AppBar follows theme in light/dark | **UX-03 harness** | 12 harness screens |
| [ux03_loading_sites_test.dart](../../test/ux03_loading_sites_test.dart) | W | 3 | B3 | Contrast-safe loading indicator on create order / submit offer / complaint | **UX-03 harness** | create_order, submit_offer, report screens |
| [ux03_logout_confirmation_test.dart](../../test/ux03_logout_confirmation_test.dart) | W | 2 | B2 | Logout confirm/cancel for customer and provider | **UX-03 harness** | home_screen, provider_home_screen, login_screen |
| [ux03_safe_area_test.dart](../../test/ux03_safe_area_test.dart) | W | 4 (16 at runtime) | B4 | Bottom inset / 300 px keyboard inset / chat composer | **UX-03 harness** | 13 harness screens + support chat |
| [ux03_screenshots_test.dart](../../test/ux03_screenshots_test.dart) | SHOT | 8 | env-gated | PNG capture of 12 screens × light/dark, chips, dialogs, loading | **UX-03 harness** | 12 harness screens |
| [ux03_shared_components_test.dart](../../test/ux03_shared_components_test.dart) | W (a11y) | 5 | B5 | AA contrast for tone pairs, status chip semantics, confirm dialog EN/AR | — | widgets/ui/app_status_chip, app_confirm_dialog, app_button_loading_indicator, app_tone |
| [ux03_touch_targets_test.dart](../../test/ux03_touch_targets_test.dart) | W (a11y) | 1 | B1 | Support chat send button ≥48 dp + label | **UX-03 harness** | support_chat_screen |
| [widget_test.dart](../../test/widget_test.dart) | W | 1 | B1 | App boots to login screen | `_WidgetTestTokenVault`, fake gateway | main.dart, AuthBloc |
| [mock_api_server.dart](../../test/mock_api_server.dart) | fixture | 0 | — | MockApi Dio adapter | — | — |
| [ux03_screen_harness.dart](../../test/ux03_screen_harness.dart) | fixture | 0 | — | Screen harness | — | — |

### Parametrised tests

Static counts understate runtime counts: [ux03_appbar_migration_test.dart](../../test/ux03_appbar_migration_test.dart) loops over 12 screens, [ux03_safe_area_test.dart](../../test/ux03_safe_area_test.dart) over 13, [provider_home_widget_test.dart](../../test/provider_home_widget_test.dart) and [ux01_loading_indicator_test.dart](../../test/ux01_loading_indicator_test.dart) over theme×locale tuples, and the screenshot suites over screens×themes (only when enabled). Expect the Flutter runtime count to be roughly 230–240 with screenshots disabled; see Execution results for the real number.

## 4. Backend test inventory

Legend as above; additional types **API** (HTTP via supertest), **INT** (real DB), **OPS** (deployment/backup/CI config). Split: S source-text / B behavioural / M mixed (heuristic).

| File | Type | Count | Split S/B/M | What it tests | Covers |
|---|---|---:|---|---|---|
| [account-state-session-security.test.js](../../swifora_backend/test/account-state-session-security.test.js) | SEC, S | 6 | 1/0/5 | Block/reactivate/soft-delete rotate session generation and disconnect sockets | adminUsers.js, adminDrivers.js, auth.js |
| [admin-broadcast-archive.test.js](../../swifora_backend/test/admin-broadcast-archive.test.js) | S | 2 | 2/0/0 | Broadcast 1-month archive, dashboard display | adminBroadcast.js, BroadcastMessage, admin main.js/EJS |
| [admin-broadcast-support-chat.test.js](../../swifora_backend/test/admin-broadcast-support-chat.test.js) | S | 4 | 4/0/0 | Broadcasts notification-only; chat unread/read endpoints; dashboard socket | adminBroadcast.js, adminChat.js, chat.js, main.js |
| [admin-browser-security.test.js](../../swifora_backend/test/admin-browser-security.test.js) | SEC, U | 13 | 2/5/6 | Admin CSRF token lifecycle, security headers | security/adminCsrf, adminBrowserHeaders, adminAuth.js |
| [admin-commission-card.test.js](../../swifora_backend/test/admin-commission-card.test.js) | S | 9 | 9/0/0 | Admin commission cards, payouts wording, pay dues | adminApi.js, adminCommissions.js, adminDrivers.js, CommissionPayment, CSS/EJS |
| [admin-csp-compatibility.test.js](../../swifora_backend/test/admin-csp-compatibility.test.js) | SEC, S | 7 | 2/0/5 | No inline handlers/styles in admin views (CSP) | views/admin/**, public/js |
| [admin-dashboard-inactive-drivers.test.js](../../swifora_backend/test/admin-dashboard-inactive-drivers.test.js) | S | 2 | 2/0/0 | Inactive driver card | adminApi.js, adminDrivers.js |
| [admin-dom-injection-safety.test.js](../../swifora_backend/test/admin-dom-injection-safety.test.js) | SEC, U | 8 | 2/5/1 | `escapeHtml` executed; result cards encode fields | public/js/main.js |
| [admin-driver-location-docs.test.js](../../swifora_backend/test/admin-driver-location-docs.test.js) | S | 2 | 1/0/1 | Driver creation without images; orphan cleanup script | adminDrivers.js, scripts/cleanupOrphanRecords.js |
| [admin-driver-profile-edit.test.js](../../swifora_backend/test/admin-driver-profile-edit.test.js) | S | 3 | 3/0/0 | Admin edits driver, socket sync, modal | adminDrivers.js, modals.ejs |
| [admin-order-type-stats.test.js](../../swifora_backend/test/admin-order-type-stats.test.js) | U+S | 4 | 2/2/0 | Order counters per type/period | services/orderStats, adminApi.js |
| [admin-security.test.js](../../swifora_backend/test/admin-security.test.js) | SEC, U | 21 | 0/20/1 | Secret validation, admin session middleware (DB revalidation), Mongo store, socket auth, admin password policy | config, middleware/adminSession, requireAdminSession, socket/authenticateSocket, security/passwordPolicy |
| [admin-target-password-security.test.js](../../swifora_backend/test/admin-target-password-security.test.js) | SEC | 5 | 3/1/1 | Admin reset of user/driver passwords | passwordPolicy, adminUsers.js, adminDrivers.js |
| [ads.test.js](../../swifora_backend/test/ads.test.js) | U+S | 4 | 1/2/1 | Ad payload validation, public payload, active-only | services/adPayload, models/Ad, ads.js, adminAds.js |
| [authorization.test.js](../../swifora_backend/test/authorization.test.js) | SEC, U | 6 | 0/6/0 | Role middleware customer/provider | middleware/requireRole, mobileRole |
| [available-providers.test.js](../../swifora_backend/test/available-providers.test.js) | S | 1 | 1/0/0 | Available provider count by area | users.js |
| [backup-restore-operations.test.js](../../swifora_backend/test/backup-restore-operations.test.js) | OPS, U | 8 | 0/4/4 | Backup/restore script guards, manifest, cleanup | scripts/backupRestore.js |
| [ci-workflow-security.test.js](../../swifora_backend/test/ci-workflow-security.test.js) | OPS, C | 12 | 9/1/2 | CI triggers, permissions, pinning, timeouts | .github/workflows/ci.yml |
| [city-level-area-matching.test.js](../../swifora_backend/test/city-level-area-matching.test.js) | S | 2 | 1/0/1 | Village/city-level area matching | auth.js, orders.js, provider.js, users.js |
| [commission-ledger.test.js](../../swifora_backend/test/commission-ledger.test.js) | U | 4 | 0/4/0 | Due commission after payment cutoff | services/commissionLedger |
| [commission-settings.test.js](../../swifora_backend/test/commission-settings.test.js) | U+S | 4 | 1/3/0 | Fixed/percentage commission, adjustments, snapshot on accept | services/commissionSettings, commissionLedger, offers.js, adminApi.js |
| [contact-security.test.js](../../swifora_backend/test/contact-security.test.js) | SEC | 19 | 7/9/3 | Public contact normalisation and validation | services/contactRequest, models/ContactRequest |
| [credential-bootstrap-security.test.js](../../swifora_backend/test/credential-bootstrap-security.test.js) | SEC | 6 | 2/2/2 | Provider bootstrap password, admin direct-add credential (vm) | passwordPolicy, adminDrivers.js, main.js |
| [credential-nondisclosure.test.js](../../swifora_backend/test/credential-nondisclosure.test.js) | SEC | 4 | 1/1/2 | Password hash excluded from schemas/responses | models/User, PendingProvider, admin routes |
| [database-resilience.test.js](../../swifora_backend/test/database-resilience.test.js) | U+S | 5 | 3/2/0 | DB-unavailable 503 classification, connect retry | security/errorResponse, index.js |
| [delivery-confirmation-flow.test.js](../../swifora_backend/test/delivery-confirmation-flow.test.js) | S | 2 | 2/0/0 | Delivery confirmation (backend + Flutter sources) | Order.js, Flutter order screens |
| [deployment-readiness.test.js](../../swifora_backend/test/deployment-readiness.test.js) | OPS, C | 10 | 8/1/1 | Nginx TLS/proxy/WebSocket config, operator artifacts | deployment/** |
| [driver-order-stats.test.js](../../swifora_backend/test/driver-order-stats.test.js) | U+S | 2 | 1/1/0 | Not-accepted order totals | services/driverOrderStats, adminDrivers.js |
| [email-identity-security.test.js](../../swifora_backend/test/email-identity-security.test.js) | SEC | 8 | 7/1/0 | Email normalisation; schema/route usage (pre-read sources) | security/mobileEmail, User, PendingProvider, auth.js, users.js |
| [error-disclosure-security.test.js](../../swifora_backend/test/error-disclosure-security.test.js) | SEC | 8 | 3/2/3 | Safe 500 payload; all 500 sites use helper | security/errorResponse, all route files |
| [forced-password-change.test.js](../../swifora_backend/test/forced-password-change.test.js) | SEC | 5 | 3/2/0 | Forced-change gating in auth middleware | middleware/auth, auth.js, adminUsers.js, adminDrivers.js |
| [governorate-level-visibility.test.js](../../swifora_backend/test/governorate-level-visibility.test.js) | U+S | 6 | 1/2/3 | Governorate-level order visibility consent | services/orderVisibility, orders.js, Flutter screens |
| [mobile-auth-abuse-security.test.js](../../swifora_backend/test/mobile-auth-abuse-security.test.js) | SEC | 4 | 0/3/1 | Login/registration rate-limit budgets | security/mobileAuthRateLimit, auth.js |
| [mobile-password-security.test.js](../../swifora_backend/test/mobile-password-security.test.js) | SEC | 5 | 1/1/3 | Mobile password policy, change reauth | passwordPolicy, auth.js, users.js |
| [network-boundary.test.js](../../swifora_backend/test/network-boundary.test.js) | SEC, U | 16 | 2/13/1 | CORS origin canonicalisation/allow-list | security/originPolicy, config |
| [notification-broadcast-only.test.js](../../swifora_backend/test/notification-broadcast-only.test.js) | S | 4 | 4/0/0 | Notification feeds, resend broadcast, persisted notifications | notifications.js, orders.js, offers.js, adminBroadcast.js, adminReports.js |
| [offer-location-notice.test.js](../../swifora_backend/test/offer-location-notice.test.js) | S | 2 | 2/0/0 | Outside-area offer flag (backend + Flutter) | offers.js, order_offers_screen |
| [offer-window.test.js](../../swifora_backend/test/offer-window.test.js) | U+S | 11 | 5/6/0 | 60 s offer validity, provider cooldown, expiry before accept, order suspension | services/orderLifecycle (stubbed models), offers.js, orders.js |
| [order-detail-access.test.js](../../swifora_backend/test/order-detail-access.test.js) | SEC, S | 1 | 1/0/0 | Single-order lookup scoped to owner/matching provider (regex only) | orders.js |
| [order-lifecycle.test.js](../../swifora_backend/test/order-lifecycle.test.js) | U | 25 | 0/24/1 | State machine, submit/accept/cancel/reset/transition with transactions, ownership, stale offers, busy release | services/orderLifecycle, orderState, transaction (stubbed Mongoose) |
| [password-recovery-runtime-security.test.js](../../swifora_backend/test/password-recovery-runtime-security.test.js) | SEC, U | 6 | 0/4/2 | Generic 202, digest storage, 5-attempt atomic claim, session disconnect | security/passwordRecovery, mailer, models |
| [password-recovery-security.test.js](../../swifora_backend/test/password-recovery-security.test.js) | SEC | 15 | 6/6/3 | OTP format, HMAC digest, policy, secret validation | security/passwordRecovery, config |
| [profile-location-update.test.js](../../swifora_backend/test/profile-location-update.test.js) | U+S | 3 | 2/1/0 | Profile area validation vs city catalog | services/registrationLocation, palestineCities, users.js |
| [provider-availability-window.test.js](../../swifora_backend/test/provider-availability-window.test.js) | U | 2 | 0/1/1 | 15-min provider reservation | services/orderLifecycle |
| [provider-document-security.test.js](../../swifora_backend/test/provider-document-security.test.js) | SEC | 17 | 7/7/3 | Private upload storage, magic-byte checks | services/providerDocumentStorage, auth.js |
| [provider-license-waiver.test.js](../../swifora_backend/test/provider-license-waiver.test.js) | S | 3 | 2/0/1 | Registration without license image | auth.js, adminDrivers.js, Flutter login |
| [provider-rejected-orders.test.js](../../swifora_backend/test/provider-rejected-orders.test.js) | S | 4 | 4/0/0 | Per-provider rejection, report contact masking, indexes | provider.js, RejectedOrder |
| [provider-service-types-and-admin-links.test.js](../../swifora_backend/test/provider-service-types-and-admin-links.test.js) | U+S | 6 | 4/1/1 | Service type normalisation, driver category | services/providerServiceTypes, admin routes |
| [provider-stats-consistency.test.js](../../swifora_backend/test/provider-stats-consistency.test.js) | S | 2 | 2/0/0 | Due commission after payment; report counter | provider.js, provider_home_screen |
| [public-id-generation.test.js](../../swifora_backend/test/public-id-generation.test.js) | U+S | 4 | 2/2/0 | Public numeric IDs | utils/publicId, Flutter screens |
| [rating-flow.test.js](../../swifora_backend/test/rating-flow.test.js) | S | 5 | 5/0/0 | Rating uniqueness, only completed orders, provider average | Rating.js, orders.js, provider.js, offers.js |
| [registration-location-dashboard.test.js](../../swifora_backend/test/registration-location-dashboard.test.js) | U+S | 6 | 3/2/1 | Governorate/city storage, area stats | services/registrationLocation, adminAreas.js |
| [security-hardening.test.js](../../swifora_backend/test/security-hardening.test.js) | SEC | 10 | 6/1/3 | Ad upload magic bytes, phone not broadcast, TOTP, action rate limit, location validation | security/totp, actionRateLimit, locationValidation, services/adImageStorage |
| [session-revocation-security.test.js](../../swifora_backend/test/session-revocation-security.test.js) | SEC, U | 9 | 2/5/2 | Generation rotation, stale JWT rejection REST + socket | middleware/auth, services/mobileSession, socket/authenticateSocket |
| [session-security.test.js](../../swifora_backend/test/session-security.test.js) | SEC, U | 14 | 3/10/1 | Session eligibility, blocked/deleted accounts, public user shape | middleware/auth, mobileSession, authenticateSocket |
| [transport-security.test.js](../../swifora_backend/test/transport-security.test.js) | SEC, C | 6 | 6/0/0 | Flutter API origin policy, Android cleartext, iOS ATS | lib/services/api_config.dart, socket_service.dart, Info.plist, manifests |
| [integration/mobile-auth.integration.js](../../swifora_backend/integration/mobile-auth.integration.js) | **API + INT** | 4 | 0/4/0 | Register → login → `/me` over HTTP with real Mongo (memory); duplicate normalised email; short password rejected; legacy short password login | routes/auth.js, User, PendingProvider |

## 5. Coverage map

Legend: **B** behavioural test executes this code; **H** rendered only via UX-03 harness for layout/theme checks (no business assertion); **S** source-text assertion only; **NONE** no test references it.

### 5.1 Flutter screens (`lib/screens/`)

| Screen | Coverage | Tests |
|---|---|---|
| [commission_payment_screen.dart](../../lib/screens/commission_payment_screen.dart) | **NONE** | — (provider "pay now" button tested in provider_home_widget_test, but not this screen) |
| [create_order_screen.dart](../../lib/screens/create_order_screen.dart) | H + B (banner only) + S | ux03_safe_area, ux03_loading_sites, ux03_appbar_migration, governorate_scope_test (banner), frequent_items_removed (S), governorate-level-visibility.test.js (S). **Order creation submit/validation not asserted.** |
| [force_change_password_screen.dart](../../lib/screens/force_change_password_screen.dart) | S | forced_password_change_test |
| [forgot_password_screen.dart](../../lib/screens/forgot_password_screen.dart) | S (bloc B) | password_recovery_flutter_test |
| [home_screen.dart](../../lib/screens/home_screen.dart) | B (logout only) + S | ux03_logout_confirmation; S: ads_ui, available_drivers, home_layout, pending_indicator, offer_flow, order_report, push_map_admin, notification_broadcast_only, support_chat_admin_messages, design_system |
| [login_screen.dart](../../lib/screens/login_screen.dart) | **B** | widget_test, design_system_test, ux01_login_dialogs_roles, ux01_loading_indicator, ux03_logout_confirmation; S: forced_password_change, password_recovery, provider_service_types |
| [my_orders_screen.dart](../../lib/screens/my_orders_screen.dart) | H + S | ux03 harness; S: customer_cancel_order, delivery_time_elapsed, in_progress_orders, offer_timer, offer_specialization, order_report, rating_ui, push_map_admin |
| [notifications_screen.dart](../../lib/screens/notifications_screen.dart) | H + S | ux03 harness; S: notification_order_navigation, notification_broadcast_only, offer_concurrency, rating_ui |
| [offered_orders_screen.dart](../../lib/screens/offered_orders_screen.dart) | H + S | ux03_safe_area; S: offered_orders_readability, rejected_orders_ui |
| [order_detail_screen.dart](../../lib/screens/order_detail_screen.dart) | H + S | ux03 harness; S: notification_order_navigation, offer_flow, offer_timer |
| [order_offers_screen.dart](../../lib/screens/order_offers_screen.dart) | H + S | ux03 harness; S: offer_flow, offer_timer, offer_concurrency, offer_specialization, customer_cancel_order, offer-location-notice.test.js. **Accept-offer interaction not exercised.** |
| [order_report_screen.dart](../../lib/screens/order_report_screen.dart) | H + S | ux03 harness; order_report_ui (S) |
| [order_tracking_screen.dart](../../lib/screens/order_tracking_screen.dart) | S | push_map_admin_test only |
| [pending_orders_screen.dart](../../lib/screens/pending_orders_screen.dart) | H + S | ux03_safe_area; S: new_orders_readability, offer_flow, offer_timer, offer_concurrency, rejected_orders_ui |
| [profile_screen.dart](../../lib/screens/profile_screen.dart) | H + S | ux03 harness; S: email_identity_security, frequent_items_removed |
| [provider_active_orders_screen.dart](../../lib/screens/provider_active_orders_screen.dart) | H + S | ux03 harness; S: push_map_admin, delivery-confirmation-flow.test.js. **Status transitions (start/complete) not exercised.** |
| [provider_home_screen.dart](../../lib/screens/provider_home_screen.dart) | **B** | provider_home_widget_test (9), ux03_logout_confirmation, ux01_screenshots; many S |
| [rejected_orders_screen.dart](../../lib/screens/rejected_orders_screen.dart) | H + S | ux03 harness; rejected_orders_ui, order_report_ui (S) |
| [report_screen.dart](../../lib/screens/report_screen.dart) | H | ux03_loading_sites, ux03 harness |
| [settings_screen.dart](../../lib/screens/settings_screen.dart) | **NONE** | — |
| [submit_offer_screen.dart](../../lib/screens/submit_offer_screen.dart) | H + S | ux03_loading_sites; S: offer_flow, offer_timer. **Offer submit validation/cooldown not executed.** |
| [support_chat_screen.dart](../../lib/screens/support_chat_screen.dart) | H + S | ux03_safe_area, ux03_touch_targets; support_chat_admin_messages (S) |

### 5.2 BLoCs (`lib/bloc/`)

| BLoC | Coverage | Tests |
|---|---|---|
| app | B | theme_persistence_test, design_system_test, harness |
| auth | B | session_lifecycle_test (8), widget_test, design_system_test, ux01_login_dialogs_roles; S forced_password_change |
| notification | H | provided in harness / provider_home_widget only; **no direct event→state tests** |
| offer | S + H | offer_flow_ui (S); harness. **No direct tests** |
| order | H | harness only. **No direct tests** |
| password_recovery | B | password_recovery_flutter_test |
| provider | B (indirect) | provider_home_widget_test via MockApi; no direct tests |

### 5.3 Services (`lib/services/`)

| Service | Coverage | Tests |
|---|---|---|
| ad_service | S | ads_ui_test |
| api_config | B | transport_config_test; S transport-security.test.js |
| auth_service | B (interfaces faked) | session_lifecycle_test, widget_test, design_system_test |
| firebase_bootstrap | S | push_map_admin_test |
| jwt_token | B | session_lifecycle_test |
| locale_preferences | B | theme_persistence_test |
| localization_service | S (key presence only) | many `_ui_test` files. **No completeness check that every key has `ar` and `en`.** |
| location_catalog | B | governorate_scope_test, ux01_login_dialogs_roles |
| location_service | **NONE** | — |
| mobile_api_client | B | mobile_http_session_test, MockApi-based widget tests |
| mobile_session_failure | B | mobile_http_session_test |
| notification_service | **NONE** | — |
| offer_service | S | offer_flow, offer_timer, customer_cancel_order |
| order_service | S | available_drivers_ui, notification_order_navigation |
| password_recovery_service | B + S | password_recovery_flutter_test |
| provider_service | S (+ indirect B via MockApi) | provider_availability_ui, rejected_orders_ui, provider_home_widget_test |
| push_notification_service | S | push_map_admin_test |
| report_service | **NONE** | — |
| responsive | B | design_system_test, ux01_responsive_tokens |
| session_storage | B | session_lifecycle_test |
| socket_service | S + no-op double | offer_concurrency_ui, admin_driver_edit_ui, transport-security.test.js |
| support_chat_service | S | support_chat_admin_messages_test |
| theme_preferences | B | theme_persistence_test |
| theme_service | B | design_system_test, ux03_shared_components, ux01_* |
| user_service | B (subclassed fake) | governorate_scope_test |
| validators | B | password_policy_test |

### 5.4 Backend routes (`swifora_backend/src/routes/`)

Endpoint counts are static counts of `router.get|post|put|patch|delete(` per file (~118 in total).

| Route file | Endpoints | HTTP-level test | Other coverage |
|---|---:|---|---|
| [auth.js](../../swifora_backend/src/routes/auth.js) | 4 | **Yes** — mobile-auth.integration.js (register, duplicate, short password, legacy login, `/me`) | S in ~17 files; B: mobileAuthRateLimit, mobileEmail, passwordPolicy |
| [orders.js](../../swifora_backend/src/routes/orders.js) | 8 | **NONE** | S: rating-flow, order-detail-access, offer-window, governorate-level-visibility, notification-broadcast-only, error-disclosure, security-hardening; B (service): orderLifecycle cancel/reset, orderVisibility |
| [offers.js](../../swifora_backend/src/routes/offers.js) | 5 | **NONE** | S: offer-window, rating-flow, commission-settings, offer-location-notice; B (service): orderLifecycle submit/accept |
| [provider.js](../../swifora_backend/src/routes/provider.js) | 7 | **NONE** | S: provider-rejected-orders, provider-stats-consistency, provider-availability-window, city-level-area-matching; B (service): orderLifecycle transitions |
| [users.js](../../swifora_backend/src/routes/users.js) | 17 | **NONE** | S: available-providers, profile-location-update, email-identity-security, mobile-password-security; B (service): registrationLocation |
| [notifications.js](../../swifora_backend/src/routes/notifications.js) | 4 | **NONE** | S only (notification-broadcast-only, error-disclosure) |
| [chat.js](../../swifora_backend/src/routes/chat.js) | 10 | **NONE** | S only (admin-broadcast-support-chat, error-disclosure, security-hardening) |
| [reports.js](../../swifora_backend/src/routes/reports.js) | 2 | **NONE** | S only |
| [passwordRecovery.js](../../swifora_backend/src/routes/passwordRecovery.js) | 2 | **NONE** | B: security/passwordRecovery runtime (stubbed models); S |
| [ads.js](../../swifora_backend/src/routes/ads.js) | 1 | **NONE** | B: adPayload; S |
| [adminAuth.js](../../swifora_backend/src/routes/adminAuth.js) | 8 | **NONE** | B: adminCsrf, adminSession, passwordPolicy, totp; S |
| [adminApi.js](../../swifora_backend/src/routes/adminApi.js) | 4 | **NONE** | B: orderStats, commissionSettings; S |
| [adminDrivers.js](../../swifora_backend/src/routes/adminDrivers.js) | 17 | **NONE** | B: driverOrderStats; S in ~18 files |
| [adminUsers.js](../../swifora_backend/src/routes/adminUsers.js) | 5 | **NONE** | B: mobileSession generation; S |
| [adminOrders.js](../../swifora_backend/src/routes/adminOrders.js) | 6 | **NONE** | S only (error-disclosure, provider-service-types) |
| [adminReports.js](../../swifora_backend/src/routes/adminReports.js) | 5 | **NONE** | S only |
| [adminCommissions.js](../../swifora_backend/src/routes/adminCommissions.js) | 4 | **NONE** | B: commissionLedger; S |
| [adminBroadcast.js](../../swifora_backend/src/routes/adminBroadcast.js) | 2 | **NONE** | S only |
| [adminChat.js](../../swifora_backend/src/routes/adminChat.js) | 2 | **NONE** | S only |
| [adminAds.js](../../swifora_backend/src/routes/adminAds.js) | 5 | **NONE** | B: adImageStorage, adPayload; S |
| [adminAreas.js](../../swifora_backend/src/routes/adminAreas.js) | 1 | **NONE** | B: registrationLocation; S |

### 5.5 Other backend modules

| Module | Coverage |
|---|---|
| services: orderLifecycle, orderState, transaction, commissionLedger, commissionSettings, orderVisibility, orderStats, driverOrderStats, registrationLocation, palestineCities, providerServiceTypes, providerDocumentStorage, adImageStorage, adPayload, contactRequest, mobileSession, passwordRecoveryMailer | B |
| services: [pushNotifications.js](../../swifora_backend/src/services/pushNotifications.js), [mobileNotifications.js](../../swifora_backend/src/services/mobileNotifications.js) | S only (from Flutter push_map_admin_test) |
| services: [adminAccounts.js](../../swifora_backend/src/services/adminAccounts.js) | **NONE** |
| security: all modules except [requestInput.js](../../swifora_backend/src/security/requestInput.js) | B; requestInput **NONE** |
| middleware: auth, adminSession, requireAdminSession, mobileRole, requireRole | B; [adminAuditLog.js](../../swifora_backend/src/middleware/adminAuditLog.js) S only |
| socket: [authenticateSocket.js](../../swifora_backend/src/socket/authenticateSocket.js) | B. Socket event handlers/emits in [index.js](../../swifora_backend/src/index.js) — S only |
| models: CommissionSetting | **NONE**; most others S or used as stub targets |
| scripts: backupRestore | B; cleanupOrphanRecords S; adminBootstrap, auditLegacyContactUsers, auditOfferDuplicates, regeneratePublicIds **NONE** |
| Admin web UI ([public/js/main.js](../../swifora_backend/src/public/js/main.js), `views/admin/**`) | S (many) + `escapeHtml` B. No browser execution |

## 6. Biggest gaps (risk-ranked)

1. **Order/offer journeys have no end-to-end or HTTP-level behavioural test.** Create order → offer → accept → fulfilling → completed → rating is verified on the backend only at service level with hand-stubbed Mongoose, and on Flutter only via source-text regex. Route wiring (auth middleware order, role guards, validation, response shape) for [orders.js](../../swifora_backend/src/routes/orders.js), [offers.js](../../swifora_backend/src/routes/offers.js), [provider.js](../../swifora_backend/src/routes/provider.js) is untested at runtime.
2. **Authorization of order detail / IDOR** ([order-detail-access.test.js](../../swifora_backend/test/order-detail-access.test.js)) is a single regex test.
3. **Customer-side screens** ([order_offers_screen.dart](../../lib/screens/order_offers_screen.dart), [my_orders_screen.dart](../../lib/screens/my_orders_screen.dart), [create_order_screen.dart](../../lib/screens/create_order_screen.dart)) — the largest customer screens (1,144 / 1,008 lines) — have no behavioural widget test of their primary actions; MockApi does not serve order/offer endpoints.
4. **Socket.IO real-time paths** (new order broadcast, offer received, offer selected/taken, status updates) — not executed anywhere.
5. **Order, Offer, Notification BLoCs** — no direct tests.
6. **No visual regression** despite an active redesign (UX-01/UX-03); screenshots are manual.
7. **Untested modules**: [commission_payment_screen.dart](../../lib/screens/commission_payment_screen.dart), [settings_screen.dart](../../lib/screens/settings_screen.dart), [notification_service.dart](../../lib/services/notification_service.dart), [report_service.dart](../../lib/services/report_service.dart), [location_service.dart](../../lib/services/location_service.dart), [adminAccounts.js](../../swifora_backend/src/services/adminAccounts.js), [requestInput.js](../../swifora_backend/src/security/requestInput.js).
8. **Localization completeness / Arabic RTL** only spot-checked (some widget tests run `Locale('ar')`); default app locale is Arabic ([main.dart](../../lib/main.dart)).
9. **No coverage measurement** so none of the above is tracked over time.
10. **Brittleness**: ~250 source-text cases will fail on cosmetic refactors (renames, `dart format` line wrapping — one test already has a "formatting-tolerant" regex) and give false confidence for logic regressions.

## Execution results

All results below come from runs during this audit on 2026-11-13. They were not inferred from the source.

**Environment:** Windows 11 Home (10.0.26300), Flutter 3.47.4 stable (Dart 3.13.3, the same Flutter version CI pins), Node v24.13.1 (the same version CI pins). MongoDB for the integration test was the `mongodb-memory-server-core` 8.2.6 binary, cached outside the repo. No real database or network service was contacted: all backend unit tests use fake `example.invalid` URIs or stubbed runners.

| Suite | Exact command (run from) | Result | Duration |
|---|---|---|---|
| Backend unit/security | `npm test` (`swifora_backend/`), i.e. `node --test` | **382 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo** | ~5.7 s |
| Backend integration | `npm run test:integration` (`swifora_backend/`) | **4 passed, 0 failed** (real HTTP + in-memory MongoDB) | ~5.0 s |
| Flutter widget/unit | `flutter test --reporter expanded` (repo root) | **227 passed, 0 failed** ("All tests passed!") | ~51 s |
| Flutter analyzer | `flutter analyze` (repo root) | **15 issues (3 warnings, 12 infos, 0 errors), exit code 1** | ~25 s |
| Backend syntax check | not run separately (`npm run check` = `node --check src/index.js`) | not executed | — |
| `npm audit` | **Not run locally**, because it contacts the npm registry. **CI result** (GitHub Actions run 43443180717, PR #1): `npm audit --omit=dev --audit-level=high` reports **7 vulnerabilities (6 moderate, 1 critical: `mongoose` 8.24.1)**, so the step fails. See RISK-051. | CI | — |

### Analyzer baseline drift: CI gate would fail (confirmed)

`.github/workflows/ci.yml` passes only when `flutter analyze` reports **exactly 12** issues with 0 errors. Running the same Flutter version (3.47.4) locally reports **15**. The extra issues are 3 `unused_import` warnings:

- `lib/screens/login_screen.dart:12` imports `../services/auth_service.dart` and never uses it
- `lib/screens/offered_orders_screen.dart:12` imports `../services/theme_service.dart` and never uses it
- `lib/screens/pending_orders_screen.dart:9` imports `../services/theme_service.dart` and never uses it

The other 12 are infos: `curly_braces_in_flow_control_structures` ×8, `use_null_aware_elements` ×2 (`order_service.dart:31-32`), and `avoid_print` ×2 (`socket_service.dart:102,107`). **Confirmed in CI:** the GitHub Actions run on PR #1 printed `Analyzer issues: 15`, `Analyzer errors: 0`, then failed the step. The same run passed the backend suite (382/382) and the integration test (4/4).

### Coverage

Coverage was not generated. No coverage configuration exists for either suite: there is no `--coverage` flag in CI and no `c8` or `nyc` setup. Line coverage numbers are therefore **unknown**. `flutter test --coverage` or `node --test --experimental-test-coverage` could produce them in a follow-up run.

### Gated screenshot tests

`test/ux01_screenshots_test.dart` and `test/ux03_screenshots_test.dart` are gated behind environment flags. In a normal `flutter test` run they each execute one trivial "disabled" test, and those count among the 227 passes. The audit did not run them in capture mode. It used its own temporary harness instead (see [SCREENSHOT_MANIFEST.md](SCREENSHOT_MANIFEST.md)).

### Runtime defect observed while capturing (not a project test)

While capturing screenshots with the temporary harness, `MyOrdersScreen` threw `setState() called after dispose()` at `lib/screens/my_orders_screen.dart:103`. It happened when the screen was disposed while `getMyOrders` was still in flight. See RISK entry in [QUALITY_RISK_REGISTER.md](QUALITY_RISK_REGISTER.md).
