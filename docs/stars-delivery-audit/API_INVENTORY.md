# Stars Delivery - API Inventory

Branch `docs/stars-delivery-audit`, base commit `9b50ca3`. Everything below was confirmed by reading source. Nothing was executed and no network service was called. Links are relative to this folder.

Shorthand used in tables:

- **B** = `swifora_backend/src`, **L** = `lib` (Flutter), **BT** = backend `test/`, **FT** = Flutter `test/`.
- "Tests": backend tests are mostly *source-inspection* tests (they read route files as text and assert patterns) plus mocked unit tests of `orderLifecycle`. There is no supertest/HTTP-level suite. A test is listed when it references the handler file and the specific path or behaviour. Flutter tests use `test/mock_api_server.dart` or a stub `HttpClientAdapter`.

---

## 1. Cross-cutting behaviour

### 1.1 Server middleware chain ([index.js](../../swifora_backend/src/index.js))

| Layer | Where | Effect |
|---|---|---|
| `helmet`, origin guard, CORS | [index.js:65-102](../../swifora_backend/src/index.js#L65) | Browser-origin policy. Mobile requests carry no `Origin`. |
| JSON / urlencoded / cookies | [index.js:103-105](../../swifora_backend/src/index.js#L103) | No body-size override (express default 100 kb). |
| `/uploads` static | [index.js:109-127](../../swifora_backend/src/index.js#L109) | Extension allow-list, sandbox CSP, `Cache-Control: private, max-age=86400`. This is the only caching header in the app. |
| DB guard for `/api/*` | [index.js:132-142](../../swifora_backend/src/index.js#L132) | Returns `503 {error:'Database temporarily unavailable', code:'DATABASE_UNAVAILABLE'}` when Mongo is not connected, except `/api/health` and `/api/config`. |
| Admin session (Mongo store) | [index.js:162-166](../../swifora_backend/src/index.js#L162) | Applied globally. Used by `/admin*`, `/api/chat/admin/*`, and admin sockets. |
| `/admin` browser headers + audit log | [index.js:171-179](../../swifora_backend/src/index.js#L171) | Every `/admin*` request is audit-logged ([adminAuditLog.js](../../swifora_backend/src/middleware/adminAuditLog.js)). |
| Final error handler | [index.js:526-540](../../swifora_backend/src/index.js#L526) | Mongo-unavailable errors become 503 `DATABASE_UNAVAILABLE`. Anything else becomes `500 {error:'Server error'}`. |
| Background job | [index.js:231-246](../../swifora_backend/src/index.js#L231) | Every 30 s: `expireStaleOffers()` + `finalizeExpiredOrders()`. |

### 1.2 Mobile auth (`auth`) - [middleware/auth.js](../../swifora_backend/src/middleware/auth.js#L28)

- `Authorization: Bearer <JWT>`. The JWT is HS256, `expiresIn: '7d'`, with claims `{id, role, sessionVersion}` ([routes/auth.js:147-157](../../swifora_backend/src/routes/auth.js#L147)). There is no refresh token.
- `401 {error:'Authentication required', code:'AUTH_REQUIRED'}`: the header is missing.
- `401 {error:'Invalid session', code:'TOKEN_EXPIRED' | 'SESSION_INVALID'}`: bad signature or expiry, an unknown user, a role mismatch, or `sessionVersion` mismatch ([auth.js:18-100](../../swifora_backend/src/middleware/auth.js#L18)).
- `403 {error:'Account is not active', code:'ACCOUNT_INACTIVE'}`: the account is blocked or deleted ([auth.js:104-112](../../swifora_backend/src/middleware/auth.js#L104)).
- `403 {error:'Password change required', code:'PASSWORD_CHANGE_REQUIRED'}`: returned for every route except `PUT /api/users/password` and `GET /api/auth/me` ([auth.js:115-132](../../swifora_backend/src/middleware/auth.js#L115)).
- `requireRole(...)`: `403 {error:'Forbidden'}`, with **no `code`** ([requireRole.js](../../swifora_backend/src/middleware/requireRole.js)).
- Sessions are revoked by incrementing `User.sessionVersion` on logout, password change, email change, password reset, and admin block/delete/password/profile edits.

### 1.3 Admin auth

- `requireAdminSession` ([requireAdminSession.js:34-62](../../swifora_backend/src/middleware/requireAdminSession.js#L34)): an invalid session gets `401 {error:'Unauthorized', code:'ADMIN_SESSION_INVALID'}` for `/api/*` and `/admin/api/*`. **Every other admin path gets `302 /admin/login`**, including the XHR JSON routes under `/admin/drivers` and similar.
- `adminCsrfProtection` ([adminCsrf.js:84-133](../../swifora_backend/src/security/adminCsrf.js#L84)): non-GET/HEAD/OPTIONS requests need `x-csrf-token` or a body `_csrf`. Otherwise the response is `403 {error:'Invalid CSRF token', code:'CSRF_INVALID'}`, or the rendered login page with 403 on `/admin/login`.
- Admin JSON error shape is `{success:false, message}`. **Several "not found" cases return HTTP 200** (see §2.12).

### 1.4 Rate limits (express-rate-limit)

| Limiter | Window / limit | 429 body | File |
|---|---|---|---|
| mobile login (IP) / login (account) | 15 min / 10 / 10 | `AUTH_RATE_LIMITED` | [mobileAuthRateLimit.js:7-8](../../swifora_backend/src/security/mobileAuthRateLimit.js#L7) |
| mobile registration | 15 min / 5 | `REGISTRATION_RATE_LIMITED` | [mobileAuthRateLimit.js:9](../../swifora_backend/src/security/mobileAuthRateLimit.js#L9) |
| recovery request IP / account, reset IP | 15 min / 10 / 3, 20 | `PASSWORD_RECOVERY_RATE_LIMITED` | [mobileAuthRateLimit.js:14-16](../../swifora_backend/src/security/mobileAuthRateLimit.js#L14) |
| order create (user / IP), also used for **resend** | 10 min / 5 / 20 | `RATE_LIMITED` | [actionRateLimit.js:11-13](../../swifora_backend/src/security/actionRateLimit.js#L11) |
| offer create (user / IP) | 10 min / 30 / 90 | `RATE_LIMITED` | [actionRateLimit.js:15-17](../../swifora_backend/src/security/actionRateLimit.js#L15) |
| chat send | 1 min / 30 / 120 | `RATE_LIMITED` | [actionRateLimit.js:19-21](../../swifora_backend/src/security/actionRateLimit.js#L19) |
| report create | 60 min / 5 / 20 | `RATE_LIMITED` | [actionRateLimit.js:23-25](../../swifora_backend/src/security/actionRateLimit.js#L23) |
| location update | 1 min / 120 / 300 | `RATE_LIMITED` | [actionRateLimit.js:27-29](../../swifora_backend/src/security/actionRateLimit.js#L27) |
| push token | 60 min / 20 / 60 | `RATE_LIMITED` | [actionRateLimit.js:31-33](../../swifora_backend/src/security/actionRateLimit.js#L31) |
| public contact | 15 min / 5 | `CONTACT_RATE_LIMITED` | [chat.js:26-35](../../swifora_backend/src/routes/chat.js#L26) |
| admin login IP / account | 15 min / 10 / 5 | rendered login | [adminAuth.js:23-50](../../swifora_backend/src/routes/adminAuth.js#L23) |

### 1.5 Flutter HTTP client behaviour

- `MobileApiClient.create` ([mobile_api_client.dart:26-52](../../lib/services/mobile_api_client.dart#L26)) builds a fresh `Dio` per service (default 30 s connect/receive timeout) and adds a single interceptor, `MobileSessionInterceptor`. The interceptor only reports errors to `MobileSessionFailure`. There is **no retry, no backoff, no refresh-token logic, and no request de-duplication**.
- `MobileSessionFailure.shouldReject` ([mobile_session_failure.dart:33-47](../../lib/services/mobile_session_failure.dart#L33)) fires only when the request carried a Bearer token **and** the response is `401` with code `AUTH_REQUIRED|SESSION_INVALID|TOKEN_EXPIRED`, or `403 ACCOUNT_INACTIVE`. Events carry the token, and `HomeScreen` ([home_screen.dart:87-95](../../lib/screens/home_screen.dart#L87)) and `ProviderHomeScreen` ([provider_home_screen.dart:189-197](../../lib/screens/provider_home_screen.dart#L189)) end the session when `event.belongsTo(widget.token)`. `403 PASSWORD_CHANGE_REQUIRED` and `403 {error:'Forbidden'}` are **not** treated as session failures.
- `AuthService` and `PasswordRecoveryService` use a plain `Dio` without the interceptor (30 s timeouts) ([auth_service.dart:43-54](../../lib/services/auth_service.dart#L43), [password_recovery_service.dart](../../lib/services/password_recovery_service.dart#L31)).
- Per-service timeouts:

| Service | Connect / receive |
|---|---|
| OrderService, OfferService, NotificationService | 30 s |
| ProviderService, ReportService, ChatService, UserService | 8 s |
| AdService | 20 s |
| Push | 15 s |
| `AuthService.revokeSession` | 3 s |
| Profile `_client()` | 8 s connect, **no receive timeout** ([profile_screen.dart:374-382](../../lib/screens/profile_screen.dart#L374)) |
| `LocationService.syncToBackend` | **null / unbounded** ([location_service.dart:133-137](../../lib/services/location_service.dart#L133)) |
| Contact dialog | 8 s connect |
| `ApiConfig` LAN discovery | 800 ms |

- Pagination is **not implemented** anywhere. The server applies hard caps instead:

| Endpoint | Cap |
|---|---|
| notifications | 50 |
| chat history | 200 |
| `reports/my` | 10 |
| ads | 5 |
| admin orders | 200 |
| admin contacts | 200 |

- Customer orders, provider lists and offers are unbounded. The client does not cache responses. Freshness comes from polling timers (15 s or 30 s) plus socket events.

---

## 2. HTTP endpoints

### 2.1 System

| Endpoint | Handler | Request / response | Mobile caller | Tests |
|---|---|---|---|---|
| `GET /api/health` | [index.js:484-495](../../swifora_backend/src/index.js#L484) | Returns `200 {status:'ok'}` or `503 {status:'unavailable'}`. | none | BT [deployment-readiness](../../swifora_backend/test/deployment-readiness.test.js), [network-boundary](../../swifora_backend/test/network-boundary.test.js) |
| `GET /api/config` (**non-production only**) | [index.js:461-481](../../swifora_backend/src/index.js#L461) | Returns `{lanIp, port}`. | [api_config.dart:114-133](../../lib/services/api_config.dart#L114) (Android debug LAN discovery, 800 ms) and a subnet scan at [api_config.dart:196-293](../../lib/services/api_config.dart#L196) | FT [transport_config_test](../../test/transport_config_test.dart) |
| Static `/uploads/*`, `/data/*`, `/` (public) | [index.js:109-130](../../swifora_backend/src/index.js#L109) | Ad images and the city data JSON for the admin UI. | Ad images via `ApiConfig.resolveMediaUrl` ([ad_banner_carousel.dart:281](../../lib/widgets/ui/ad_banner_carousel.dart#L281)) | BT [security-hardening](../../swifora_backend/test/security-hardening.test.js) |

### 2.2 `/api/auth` ([routes/auth.js](../../swifora_backend/src/routes/auth.js))

| Endpoint | Handler / middleware | Request and validation | Response | Errors | Flutter caller → screens | Tests |
|---|---|---|---|---|---|---|
| `POST /api/auth/register` | [auth.js:52](../../swifora_backend/src/routes/auth.js#L52) registration limiter | `fullName, email, phone, password, role(customer\|provider), area, governorate, privacyPolicy, serviceTypes[]`. Email normalized and validated. Password policy. **`fullName`/`phone` not validated server-side** (customer `User.create` would throw, giving 500). | Customer: `201 {token, user:{id,fullName,email,phone,role,area,governorate,governorateLevel,publicId,mustChangePassword}}`. Provider: `201 {pending:true, message}` (creates a `PendingProvider`). **No document upload.** | `400` invalid role, invalid email, `PASSWORD_POLICY`, email already registered or pending, `429`, `500` | [auth_service.dart:99](../../lib/services/auth_service.dart#L99) ← `AuthBloc._onRegister` ← [login_screen.dart:866-880](../../lib/screens/login_screen.dart#L866) | BT [mobile-password-security](../../swifora_backend/test/mobile-password-security.test.js), [email-identity-security](../../swifora_backend/test/email-identity-security.test.js), [registration-location-dashboard](../../swifora_backend/test/registration-location-dashboard.test.js), [provider-document-security](../../swifora_backend/test/provider-document-security.test.js), [mobile-auth-abuse-security](../../swifora_backend/test/mobile-auth-abuse-security.test.js) |
| `POST /api/auth/login` | [auth.js:168](../../swifora_backend/src/routes/auth.js#L168) login IP + account limiters | `email, password, role`. Uses a constant-time dummy bcrypt for unknown users. | `200 {token, user{…, mustChangePassword}}` | `400 {error:'Invalid credentials'}` (also returned for a role mismatch), `400 Invalid login role`, `403 ACCOUNT_INACTIVE` (Arabic message), `429 AUTH_RATE_LIMITED` | [auth_service.dart:63](../../lib/services/auth_service.dart#L63) ← `AuthBloc._onLogin`; [force_change_password_screen.dart:91](../../lib/screens/force_change_password_screen.dart#L91) (re-login) | BT [mobile-auth-abuse-security](../../swifora_backend/test/mobile-auth-abuse-security.test.js), [credential-nondisclosure](../../swifora_backend/test/credential-nondisclosure.test.js); FT [ux01_login_dialogs_roles_test](../../test/ux01_login_dialogs_roles_test.dart) |
| `POST /api/auth/logout` | [auth.js:252](../../swifora_backend/src/routes/auth.js#L252) `auth`, `role(customer,provider)` | none | `{success:true, message:'Logged out'}`. Increments `sessionVersion` and disconnects `user:` sockets. | `401/403` (auth), `500` if the concurrent rotation fails | [auth_service.dart:135-148](../../lib/services/auth_service.dart#L135) (`revokeSession`, 3 s, errors swallowed) ← logout buttons [home_screen.dart:833](../../lib/screens/home_screen.dart#L833), [provider_home_screen.dart:686](../../lib/screens/provider_home_screen.dart#L686) | BT [session-revocation-security](../../swifora_backend/test/session-revocation-security.test.js); FT [ux03_logout_confirmation_test](../../test/ux03_logout_confirmation_test.dart) |
| `GET /api/auth/me` | [auth.js:307](../../swifora_backend/src/routes/auth.js#L307) `auth` (allowed while `mustChangePassword`) | none | `{user: publicMobileUser + mustChangePassword}` ([mobileSession.js:25-52](../../swifora_backend/src/services/mobileSession.js#L25)) | `401/403` | [auth_service.dart:113-133](../../lib/services/auth_service.dart#L113) (`validateSession`, 401/403 becomes `SessionRejectedException`) ← `AuthBloc._onCheckAuth`; [provider_home_screen.dart:102](../../lib/screens/provider_home_screen.dart#L102) | BT [session-security](../../swifora_backend/test/session-security.test.js), [forced-password-change](../../swifora_backend/test/forced-password-change.test.js); FT [session_lifecycle_test](../../test/session_lifecycle_test.dart) |
| `POST /api/auth/password-recovery/request` | [passwordRecovery.js:196](../../swifora_backend/src/routes/passwordRecovery.js#L196) IP + account limiters | `email` | **Always** `202 {message:'If an eligible account exists…'}` (non-enumerating, minimum 300 ms response). Stores a challenge (8-digit code, HMAC digest, 10 min TTL, 5 attempts). Email is sent after the response. | `503 PASSWORD_RECOVERY_UNAVAILABLE` (missing config), `429` | [password_recovery_service.dart:52](../../lib/services/password_recovery_service.dart#L52) ← `PasswordRecoveryBloc` ← [forgot_password_screen.dart](../../lib/screens/forgot_password_screen.dart) | BT [password-recovery-security](../../swifora_backend/test/password-recovery-security.test.js), [password-recovery-runtime-security](../../swifora_backend/test/password-recovery-runtime-security.test.js); FT [password_recovery_flutter_test](../../test/password_recovery_flutter_test.dart) |
| `POST /api/auth/password-recovery/reset` | [passwordRecovery.js:346](../../swifora_backend/src/routes/passwordRecovery.js#L346) reset IP limiter | `email, code (^\d{8}$), newPassword, confirmPassword` | `200 {message, code:'PASSWORD_RESET_COMPLETE'}`. Runs a transaction: deletes the challenge, sets the password, sets `verified=true`, bumps `sessionVersion`. **Does not clear `mustChangePassword`.** | `400 PASSWORD_RECOVERY_INVALID`, `400 PASSWORD_CONFIRMATION_MISMATCH`, `400 PASSWORD_POLICY`, `503`, `429`, `500` | [password_recovery_service.dart:69](../../lib/services/password_recovery_service.dart#L69) | same as above |

### 2.3 `/api/orders` ([routes/orders.js](../../swifora_backend/src/routes/orders.js))

| Endpoint | Handler / middleware | Request and validation | Response | Errors | Flutter caller → screens | Tests |
|---|---|---|---|---|---|---|
| `POST /api/orders` | [orders.js:45](../../swifora_backend/src/routes/orders.js#L45) `auth`, `role(customer)`, order limiters | `type∈{product,people,goods}`, `description≤2000`, `phone≤30`, optional `area≤100`, `location≤500` (free text). The registered `user.area` overrides `area`. | `201` with the full order document. Side effects: socket `new_order` to `area:`/`governorate:` rooms, and FCM `new_order` to eligible drivers. | `400 INVALID_ORDER_INPUT`, `403` (Arabic, blocked), `404 User not found`, `429`, `500` | [order_service.dart:16-41](../../lib/services/order_service.dart#L16) ← `OrderBloc` ← [create_order_screen.dart:288-326](../../lib/screens/create_order_screen.dart#L288) | BT [city-level-area-matching](../../swifora_backend/test/city-level-area-matching.test.js), [governorate-level-visibility](../../swifora_backend/test/governorate-level-visibility.test.js), [security-hardening](../../swifora_backend/test/security-hardening.test.js) |
| `GET /api/orders` | [orders.js:182](../../swifora_backend/src/routes/orders.js#L182) `auth`, `role(customer)` | none. **Unpaginated.** | Array of the customer's orders except `cancelled`, newest first. Adds `myRating`. **Side effects:** runs `expireStaleOffers()` and `finalizeExpiredOrders()` globally and may suspend pending orders. | `401/403`, `500` | [order_service.dart:43-53](../../lib/services/order_service.dart#L43) ← home counters [home_screen.dart:252](../../lib/screens/home_screen.dart#L252), [my_orders_screen.dart:87](../../lib/screens/my_orders_screen.dart#L87) | BT [offer-window](../../swifora_backend/test/offer-window.test.js), [rating-flow](../../swifora_backend/test/rating-flow.test.js) |
| `GET /api/orders/:id` | [orders.js:233](../../swifora_backend/src/routes/orders.js#L233) `auth` (any mobile role) | ObjectId check | Order with `customerId` populated (`fullName, publicId`). **Customer** also gets `rejectedByDriversCount`, `myRating`, and (when accepted or fulfilling) `providerName` and `providerLocation{latitude,longitude,updatedAt}`. **Provider** gets the phone masked unless assigned, plus `outsideArea, providerArea/City/Governorate, myOffer, rejected, offerCooldownUntil`. | `404 Order not found`, `403 Order not available`, `500` | [order_service.dart:55-65](../../lib/services/order_service.dart#L55) ← [order_offers_screen.dart:117](../../lib/screens/order_offers_screen.dart#L117), [order_tracking_screen.dart:60](../../lib/screens/order_tracking_screen.dart#L60), [order_detail_screen.dart:106](../../lib/screens/order_detail_screen.dart#L106), [order_report_screen.dart:47](../../lib/screens/order_report_screen.dart#L47) | BT [order-detail-access](../../swifora_backend/test/order-detail-access.test.js), [offer-location-notice](../../swifora_backend/test/offer-location-notice.test.js) |
| `POST /api/orders/:id/rating` | [orders.js:357](../../swifora_backend/src/routes/orders.js#L357) `auth`, `role(customer)` | `rating` (integer 1-5), `comment` (≤500, trimmed) | `201 {rating, comment, createdAt}`. Socket `rating_received` and notification `new_rating` (with push) go to the provider. | `400 INVALID_RATING`, `409 ORDER_NOT_RATEABLE` (not completed, or no provider), `409 RATING_EXISTS` (unique `orderId` index [Rating.js:8](../../swifora_backend/src/models/Rating.js#L8)), `404` | [order_service.dart:103-119](../../lib/services/order_service.dart#L103) ← [my_orders_screen.dart:157](../../lib/screens/my_orders_screen.dart#L157) | BT [rating-flow](../../swifora_backend/test/rating-flow.test.js); FT [rating_ui_test](../../test/rating_ui_test.dart) |
| `PUT /api/orders/:id/fulfilling` | [orders.js:445](../../swifora_backend/src/routes/orders.js#L445) `auth`, `role(provider)` | none (no ObjectId check, so an invalid id gives 500) | Updated order. Socket `order_status_changed{status:'fulfilling'}` and notification `order_pending` go to the customer. | `409 {conflict, code:'INVALID_TRANSITION', message, orderId}`, `503` (transactions unavailable), `500` | [provider_service.dart:105-113](../../lib/services/provider_service.dart#L105) ← [order_detail_screen.dart:168](../../lib/screens/order_detail_screen.dart#L168), [provider_active_orders_screen.dart:175](../../lib/screens/provider_active_orders_screen.dart#L175) | BT [delivery-confirmation-flow](../../swifora_backend/test/delivery-confirmation-flow.test.js), [order-lifecycle](../../swifora_backend/test/order-lifecycle.test.js) |
| `PUT /api/orders/:id/complete` | [orders.js:470](../../swifora_backend/src/routes/orders.js#L470) `auth`, `role(provider)` | none | Order (still `fulfilling`, with `completionRequestedAt` set). Socket `delivery_confirmation_requested` and notification `delivery_confirmation` go to the customer. | `409 INVALID_TRANSITION` (already requested, or wrong state), `503`, `500` | [provider_service.dart:115-123](../../lib/services/provider_service.dart#L115) ← [order_detail_screen.dart:186](../../lib/screens/order_detail_screen.dart#L186), [provider_active_orders_screen.dart:197](../../lib/screens/provider_active_orders_screen.dart#L197) | BT [delivery-confirmation-flow](../../swifora_backend/test/delivery-confirmation-flow.test.js) |
| `PUT /api/orders/:id/confirm-delivery` | [orders.js:499](../../swifora_backend/src/routes/orders.js#L499) `auth`, `role(customer)` | none | Order `completed`, and the provider's `blockedUntil` is cleared. Socket `delivery_confirmation_result{approved:true}` goes to the provider and `order_status_changed{completed}` to the customer. Notification `delivery_confirmed` goes to the provider. | `409 INVALID_TRANSITION`, `503`, `500` | [order_service.dart:67-82](../../lib/services/order_service.dart#L67) ← [my_orders_screen.dart:181](../../lib/screens/my_orders_screen.dart#L181) | BT [delivery-confirmation-flow](../../swifora_backend/test/delivery-confirmation-flow.test.js); FT [notification_order_navigation_test](../../test/notification_order_navigation_test.dart) |
| `PUT /api/orders/:id/reject-delivery` | [orders.js:536](../../swifora_backend/src/routes/orders.js#L536) `auth`, `role(customer)` | `reason` (≤500, optional) | Order stays `fulfilling`, `completionRequestedAt=null`, `deliveryRejectedAt` set. Socket `delivery_confirmation_result{approved:false,reason}` and notification `delivery_rejected` go to the provider. | `409`, `503`, `500` | [order_service.dart:84-101](../../lib/services/order_service.dart#L84) ← [my_orders_screen.dart:202](../../lib/screens/my_orders_screen.dart#L202) (always sends `reason: ''`) | same |

### 2.4 `/api/offers` ([routes/offers.js](../../swifora_backend/src/routes/offers.js))

| Endpoint | Handler / middleware | Request and validation | Response | Errors | Flutter caller → screens | Tests |
|---|---|---|---|---|---|---|
| `POST /api/offers` | [offers.js:75](../../swifora_backend/src/routes/offers.js#L75) `auth`, `role(provider)`, offer limiters | `orderId` (ObjectId), `price` 0.01-100000, `estimatedTime` 0-1440 (rounded) | `201` offer doc (`expiresAt = now+60s`). Socket `new_offer` and notification `new_offer` go to the customer. Provider `offerCooldownUntil = now+60s`. | `400 INVALID_OFFER_INPUT`, `409 {conflict:true, code:'PROVIDER_BUSY'\|'PROVIDER_UNAVAILABLE'\|'OFFER_COOLDOWN'(+retryAfterSeconds)\|'OFFER_NOT_AVAILABLE'\|'ORDER_NOT_AVAILABLE', message, orderId}`, `503`, `429` | [offer_service.dart:31-51](../../lib/services/offer_service.dart#L31) (maps conflict to `OfferSubmitException`) ← `OfferBloc._onSubmit` ← [submit_offer_screen.dart:364](../../lib/screens/submit_offer_screen.dart#L364), [order_detail_screen.dart:204](../../lib/screens/order_detail_screen.dart#L204) | BT [order-lifecycle](../../swifora_backend/test/order-lifecycle.test.js), [offer-window](../../swifora_backend/test/offer-window.test.js), [provider-availability-window](../../swifora_backend/test/provider-availability-window.test.js); FT [offer_flow_ui_test](../../test/offer_flow_ui_test.dart), [offer_timer_ui_test](../../test/offer_timer_ui_test.dart), [offer_concurrency_ui_test](../../test/offer_concurrency_ui_test.dart) |
| `POST /api/offers/:orderId/resend` | [offers.js:140](../../swifora_backend/src/routes/offers.js#L140) `auth`, `role(customer)`, **order-create limiters** | none | `{success:true, message}`. `resetOrder`: status set to `pending`, pending offers become `rejected/order_reset`. Socket `new_order` is re-broadcast. | `409 ORDER_NOT_AVAILABLE` (not pending/offered), `503`, `429` | [offer_service.dart:71-82](../../lib/services/offer_service.dart#L71) ← [order_offers_screen.dart:137](../../lib/screens/order_offers_screen.dart#L137), [my_orders_screen.dart:268](../../lib/screens/my_orders_screen.dart#L268) | BT [notification-broadcast-only](../../swifora_backend/test/notification-broadcast-only.test.js); FT [customer_cancel_order_ui_test](../../test/customer_cancel_order_ui_test.dart) |
| `POST /api/offers/:orderId/cancel` | [offers.js:178](../../swifora_backend/src/routes/offers.js#L178) `auth`, `role(customer)` | none | `{success:true, message}`. Order set to `cancelled`, pending offers become `rejected/order_cancelled`. **No socket or notification to drivers.** | `409 ORDER_NOT_AVAILABLE`, `503` | [offer_service.dart:84-95](../../lib/services/offer_service.dart#L84) ← [order_offers_screen.dart:879](../../lib/screens/order_offers_screen.dart#L879), [my_orders_screen.dart:230](../../lib/screens/my_orders_screen.dart#L230) | FT [customer_cancel_order_ui_test](../../test/customer_cancel_order_ui_test.dart) |
| `GET /api/offers/order/:orderId` | [offers.js:190](../../swifora_backend/src/routes/offers.js#L190) `auth`, `role(customer)` | Order must belong to the caller | Array of offers with `providerId` populated (`fullName phone area governorate publicId serviceTypes licenseType`) and `orderId` populated (`description area type`), plus `outsideArea, providerArea/City/Governorate, providerCategory, providerRating{average,count,positiveCount,stars}`. Expired pending offers are **deleted** first. | `404`, `500` (invalid id gives CastError, then 500) | [offer_service.dart:53-57](../../lib/services/offer_service.dart#L53) (**no try/catch**) ← `OfferBloc` ← [order_offers_screen.dart](../../lib/screens/order_offers_screen.dart), [order_report_screen.dart:52](../../lib/screens/order_report_screen.dart#L52) | BT [offer-location-notice](../../swifora_backend/test/offer-location-notice.test.js), [provider-service-types-and-admin-links](../../swifora_backend/test/provider-service-types-and-admin-links.test.js) |
| `POST /api/offers/:id/accept` | [offers.js:281](../../swifora_backend/src/routes/offers.js#L281) `auth`, `role(customer)` | none | `{message:'Offer accepted'}`. Transaction: order becomes `accepted` (sets `price`, `platformCommission`, `providerEarning`), offer becomes `accepted`, competing offers become `rejected/another_driver_selected`, the provider's other offers become `rejected/provider_unavailable`, and the provider gets `blockedUntil=now+15min`. Sockets/notifications: `offer_accepted` to the provider, `offer_not_selected` to competitors, `offer_cancelled` + `driver_taken` to other customers. | `409 OFFER_NOT_AVAILABLE`, `ORDER_NOT_AVAILABLE`, `PROVIDER_BUSY`, `PROVIDER_TAKEN`; `503`; `500` | [offer_service.dart:59-69](../../lib/services/offer_service.dart#L59) (returns the conflict map instead of throwing) ← `OfferBloc._onAccept` ← [order_offers_screen.dart:1022-1052](../../lib/screens/order_offers_screen.dart#L1022) | BT [order-lifecycle](../../swifora_backend/test/order-lifecycle.test.js), [commission-settings](../../swifora_backend/test/commission-settings.test.js), [driver-order-stats](../../swifora_backend/test/driver-order-stats.test.js); FT [offer_concurrency_ui_test](../../test/offer_concurrency_ui_test.dart) |

### 2.5 `/api/provider` ([routes/provider.js](../../swifora_backend/src/routes/provider.js)) - all routes use `auth` + `role(provider)` ([provider.js:20](../../swifora_backend/src/routes/provider.js#L20))

| Endpoint | Handler | Request | Response | Errors | Flutter caller → screens | Tests |
|---|---|---|---|---|---|---|
| `PUT /api/provider/availability` | [provider.js:22](../../swifora_backend/src/routes/provider.js#L22) | `available` must be boolean | `{success, isAvailable}` | `400`, `404`, `500` | [provider_service.dart:92-103](../../lib/services/provider_service.dart#L92) ← [provider_home_screen.dart:147](../../lib/screens/provider_home_screen.dart#L147) | BT [provider-availability-window](../../swifora_backend/test/provider-availability-window.test.js); FT [provider_availability_ui_test](../../test/provider_availability_ui_test.dart) |
| `GET /api/provider/stats` | [provider.js:80](../../swifora_backend/src/routes/provider.js#L80) | optional `?area` (fallback only) | `{dailyEarnings, monthlyEarnings, totalSuccessful, dailyOrderCount, dailyCommission, monthlyCommission, totalCommissionDue, pendingOrdersCount, offeredOrdersCount, ordersReportCount, activeOrdersCount, averageRating, ratingCount, ratingStars, blockedUntil, offerCooldownUntil, isAvailable}` | `500` | [provider_service.dart:18-32](../../lib/services/provider_service.dart#L18) (8 s) ← `ProviderBloc` ← provider home, [pending_orders_screen.dart:144](../../lib/screens/pending_orders_screen.dart#L144) | BT [provider-stats-consistency](../../swifora_backend/test/provider-stats-consistency.test.js), [admin-commission-card](../../swifora_backend/test/admin-commission-card.test.js) |
| `GET /api/provider/pending-orders` | [provider.js:239](../../swifora_backend/src/routes/provider.js#L239) | optional `?area` | Masked orders visible to the provider (area/governorate, service types, not offered or rejected, not suspended). Returns `[]` if blocked or unavailable. | `500` | [provider_service.dart:34-48](../../lib/services/provider_service.dart#L34) ← `ProviderBloc`, [pending_orders_screen.dart:127](../../lib/screens/pending_orders_screen.dart#L127) | BT [city-level-area-matching](../../swifora_backend/test/city-level-area-matching.test.js), [governorate-level-visibility](../../swifora_backend/test/governorate-level-visibility.test.js); FT [provider_home_widget_test](../../test/provider_home_widget_test.dart) |
| `GET /api/provider/offered-orders` | [provider.js:284](../../swifora_backend/src/routes/provider.js#L284) | none | Masked orders with a live pending offer, plus `offeredPrice` and `offeredTime` | `500` | [provider_service.dart:60-70](../../lib/services/provider_service.dart#L60) ← `ProviderBloc`, [offered_orders_screen.dart:119](../../lib/screens/offered_orders_screen.dart#L119) | FT [offered_orders_readability_ui_test](../../test/offered_orders_readability_ui_test.dart) |
| `POST /api/provider/orders/:orderId/reject` | [provider.js:313](../../swifora_backend/src/routes/provider.js#L313) | ObjectId | `{success, message}`. Upserts `RejectedOrder{driver_rejected}` (unique index), then may suspend the order. | `404`, `409 Order is no longer available`, `409 already submitted an offer`, `403 outside your area` (all `{error}`, no code) | [provider_service.dart:71-79](../../lib/services/provider_service.dart#L71) ← [pending_orders_screen.dart:401](../../lib/screens/pending_orders_screen.dart#L401) | BT [provider-rejected-orders](../../swifora_backend/test/provider-rejected-orders.test.js); FT [rejected_orders_ui_test](../../test/rejected_orders_ui_test.dart) |
| `GET /api/provider/rejected-orders` | [provider.js:368](../../swifora_backend/src/routes/provider.js#L368) | none | Combined report sorted by `reportAt`. Each row is an order with `recordType∈{rejected, delivered, offer_not_selected}`, `reason`, `offeredPrice`, `acceptedPrice` | `500` | [provider_service.dart:81-90](../../lib/services/provider_service.dart#L81) ← [rejected_orders_screen.dart:55](../../lib/screens/rejected_orders_screen.dart#L55) | BT [provider-rejected-orders](../../swifora_backend/test/provider-rejected-orders.test.js) |
| `GET /api/provider/orders` | [provider.js:448](../../swifora_backend/src/routes/provider.js#L448) | none | All orders assigned to the provider (unmasked) | `500` | [provider_service.dart:49-58](../../lib/services/provider_service.dart#L49) ← [provider_active_orders_screen.dart:89](../../lib/screens/provider_active_orders_screen.dart#L89) | FT [in_progress_orders_ui_test](../../test/in_progress_orders_ui_test.dart) |

### 2.6 `/api/notifications` ([routes/notifications.js](../../swifora_backend/src/routes/notifications.js)) - `auth` + `role(customer,provider)`

| Endpoint | Handler | Response | Errors | Flutter caller | Tests |
|---|---|---|---|---|---|
| `GET /api/notifications` | [notifications.js:10](../../swifora_backend/src/routes/notifications.js#L10) | Up to 50 entries, sorted pinned first then newest. Docs contain `{_id,userId,orderId?,type,title,body,read,pinned,expireAt?,createdAt}` | `500` | [notification_service.dart:16-20](../../lib/services/notification_service.dart#L16) (no try/catch) ← `NotificationBloc` | BT [notification-broadcast-only](../../swifora_backend/test/notification-broadcast-only.test.js); FT [notification_broadcast_only_ui_test](../../test/notification_broadcast_only_ui_test.dart) |
| `PUT /api/notifications/:id/read` | [notifications.js:24](../../swifora_backend/src/routes/notifications.js#L24) | `{message}`. A pinned notification is **deleted** when read. | `404`, `500` (invalid id) | [notification_service.dart:28-31](../../lib/services/notification_service.dart#L28) ← [notifications_screen.dart:181](../../lib/screens/notifications_screen.dart#L181) | - |
| `PUT /api/notifications/read-all` | [notifications.js:44](../../swifora_backend/src/routes/notifications.js#L44) | Deletes pinned notifications and marks the rest read | `500` | [notification_service.dart:33-36](../../lib/services/notification_service.dart#L33) ← [notifications_screen.dart:64](../../lib/screens/notifications_screen.dart#L64) | - |
| `GET /api/notifications/unread-count` | [notifications.js:55](../../swifora_backend/src/routes/notifications.js#L55) | `{count}` | `500` | [notification_service.dart:22-26](../../lib/services/notification_service.dart#L22) | FT `mock_api_server.dart` |

### 2.7 `/api/reports` ([routes/reports.js](../../swifora_backend/src/routes/reports.js)) - `auth` + `role(customer,provider)`

| Endpoint | Handler | Request | Response | Errors | Flutter caller | Tests |
|---|---|---|---|---|---|---|
| `POST /api/reports` | [reports.js:15](../../swifora_backend/src/routes/reports.js#L15) + report limiters | `reportedPublicId≤50`, `content≤2000`, `reportType` (`'user'`, anything else is treated as `'driver'`) | `201 {success, report}` | `400` (Arabic, no code), `400 REPORT_TOO_LONG`, `400` no matching account, `429` | [report_service.dart:16-32](../../lib/services/report_service.dart#L16) (**no DioException mapping**) ← [report_screen.dart:57](../../lib/screens/report_screen.dart#L57) | BT [security-hardening](../../swifora_backend/test/security-hardening.test.js) |
| `GET /api/reports/my` | [reports.js:73](../../swifora_backend/src/routes/reports.js#L73) | none | The caller's last 10 reports (including `replies[]` and `status`) | `500` | [report_service.dart:34-40](../../lib/services/report_service.dart#L34) ← [report_screen.dart:44](../../lib/screens/report_screen.dart#L44) | - |

### 2.8 `/api/chat` mobile and public ([routes/chat.js](../../swifora_backend/src/routes/chat.js))

| Endpoint | Handler / middleware | Request | Response | Errors | Flutter caller | Tests |
|---|---|---|---|---|---|---|
| `GET /api/chat/history` | [chat.js:37](../../swifora_backend/src/routes/chat.js#L37) `auth`, `role(customer,provider)` | none | The caller's last 200 `ChatMessage{_id,userId,sender:'user'\|'admin',text,read,createdAt}`, oldest first | `500` | [support_chat_service.dart:20-23](../../lib/services/support_chat_service.dart#L20) ← [support_chat_screen.dart:53](../../lib/screens/support_chat_screen.dart#L53) | BT [admin-broadcast-support-chat](../../swifora_backend/test/admin-broadcast-support-chat.test.js) |
| `POST /api/chat/send` | [chat.js:50](../../swifora_backend/src/routes/chat.js#L50) + chat limiters | `text` (1-2000) | `201` message. Marks admin messages read. Socket `support_message` goes to room `support`. | `400`, `400 MESSAGE_TOO_LONG`, `429` | [support_chat_service.dart:25-28](../../lib/services/support_chat_service.dart#L25) ← [support_chat_screen.dart](../../lib/screens/support_chat_screen.dart) (optimistic `pending`/`failed` bubble) | same |
| `GET /api/chat/unread-count` | [chat.js:107](../../swifora_backend/src/routes/chat.js#L107) | none | `{count}` of unread admin messages | `500` | [support_chat_service.dart:30-33](../../lib/services/support_chat_service.dart#L30) ← both homes (15 s poll) | FT [support_chat_admin_messages_test](../../test/support_chat_admin_messages_test.dart) |
| `PUT /api/chat/read` | [chat.js:121](../../swifora_backend/src/routes/chat.js#L121) | none | `{success}` | `500` | [support_chat_service.dart:35-37](../../lib/services/support_chat_service.dart#L35) | same |
| `POST /api/chat/contact` (**public, no auth**) | [chat.js:399](../../swifora_backend/src/routes/chat.js#L399) + contact limiter | `name, email, phone, text`, validated in [contactRequest.js](../../swifora_backend/src/services/contactRequest.js) | `201 {success, message}`. Creates a `ContactRequest`. Socket `support_message` (`userRole:'guest'`). | `4xx {error, code}` (ContactValidationError), `429 CONTACT_RATE_LIMITED` | [login_screen.dart:654-668](../../lib/screens/login_screen.dart#L654) (contact dialog, errors shown generically) | BT [contact-security](../../swifora_backend/test/contact-security.test.js) |

### 2.9 `/api/users` ([routes/users.js](../../swifora_backend/src/routes/users.js)) - `auth` + `role(customer,provider)` ([users.js:42](../../swifora_backend/src/routes/users.js#L42))

| Endpoint | Handler | Request and validation | Response | Errors | Flutter caller | Tests |
|---|---|---|---|---|---|---|
| `POST /api/users/push-token` | [users.js:44](../../swifora_backend/src/routes/users.js#L44) + push limiters | `token≤4096`, `platform` | `{success}`. Upsert by unique `token` (re-binds the token to the current user). | `400 PUSH_TOKEN_REQUIRED`, `429` | [push_notification_service.dart:61-74](../../lib/services/push_notification_service.dart#L61) | FT [push_map_admin_test](../../test/push_map_admin_test.dart) |
| `DELETE /api/users/push-token` | [users.js:83](../../swifora_backend/src/routes/users.js#L83) | `token` (body or query). If absent, **all** of the user's tokens are deleted. | `{success}` | `401` once the session is revoked | [push_notification_service.dart:76-96](../../lib/services/push_notification_service.dart#L76) ← `AuthBloc._onLogout` | - |
| `GET /api/users/available-providers` | [users.js:104](../../swifora_backend/src/routes/users.js#L104) `role(customer)` | optional `?area` | `{count, area}` | `500` | [order_service.dart:121-135](../../lib/services/order_service.dart#L121) ← [home_screen.dart:294](../../lib/screens/home_screen.dart#L294) | BT [available-providers](../../swifora_backend/test/available-providers.test.js); FT [available_drivers_ui_test](../../test/available_drivers_ui_test.dart) |
| `PUT /api/users/location` | [users.js:147](../../swifora_backend/src/routes/users.js#L147) + location limiters | `latitude, longitude, isMocked, accuracy, area`, validated by [locationValidation.js](../../swifora_backend/src/security/locationValidation.js) (mock locations rejected in production) | `{message, area}` | `400 {error:'Location update rejected', code}`, `404` | [location_service.dart:122-151](../../lib/services/location_service.dart#L122) (unbounded timeout, errors swallowed) | BT [security-hardening](../../swifora_backend/test/security-hardening.test.js), [profile-location-update](../../swifora_backend/test/profile-location-update.test.js) |
| `GET /api/users/location` | [users.js:198](../../swifora_backend/src/routes/users.js#L198) | none | `{_id, area, lastLatitude, lastLongitude, lastLocationUpdate}` | `404` | **no mobile caller** | - |
| `PUT /api/users/governorate-level` | [users.js:208](../../swifora_backend/src/routes/users.js#L208) | `enabled` (`=== true`) | `{success, enabled}` | `404` | [user_service.dart:16-29](../../lib/services/user_service.dart#L16) ← [governorate_scope_card.dart:54](../../lib/widgets/governorate_scope_card.dart#L54) | BT [governorate-level-visibility](../../swifora_backend/test/governorate-level-visibility.test.js); FT [governorate_scope_test](../../test/governorate_scope_test.dart) |
| `PUT /api/users/area` | [users.js:230](../../swifora_backend/src/routes/users.js#L230) | `governorate, area` validated against the city catalogue | `{success, user}` | `400 INVALID_AREA`, `404` | [profile_screen.dart:133](../../lib/screens/profile_screen.dart#L133) | BT [profile-location-update](../../swifora_backend/test/profile-location-update.test.js) |
| `PUT /api/users/password` | [users.js:270](../../swifora_backend/src/routes/users.js#L270) (allowed while `mustChangePassword`) | `currentPassword, newPassword, confirmPassword` | `{message:'Password updated'}`. Sets `mustChangePassword=false`, `sessionVersion+1`, disconnects sockets. **No new token is returned.** | `400 PASSWORD_FIELDS_REQUIRED`, `CURRENT_PASSWORD_INVALID`, `PASSWORD_POLICY`, `PASSWORD_CONFIRMATION_MISMATCH`; `500` | [force_change_password_screen.dart:68](../../lib/screens/force_change_password_screen.dart#L68), [profile_screen.dart:347](../../lib/screens/profile_screen.dart#L347) | BT [forced-password-change](../../swifora_backend/test/forced-password-change.test.js), [mobile-password-security](../../swifora_backend/test/mobile-password-security.test.js); FT [forced_password_change_test](../../test/forced_password_change_test.dart) |
| `PUT /api/users/email` | [users.js:401](../../swifora_backend/src/routes/users.js#L401) | `currentPassword, newEmail, confirmEmail` | `{message, email, verified:false}`, or `{message:'Email unchanged'}`. Bumps `sessionVersion`. | `400 EMAIL_FIELDS_REQUIRED`, `EMAIL_INVALID`, `EMAIL_CONFIRMATION_MISMATCH`, `CURRENT_PASSWORD_INVALID`; `409 EMAIL_IN_USE` | [profile_screen.dart:296](../../lib/screens/profile_screen.dart#L296) | BT [email-identity-security](../../swifora_backend/test/email-identity-security.test.js); FT [email_identity_security_test](../../test/email_identity_security_test.dart) |
| `PUT /api/users/profile` | [users.js:574](../../swifora_backend/src/routes/users.js#L574) | `fullName` only (rejects `password` and `email` keys) | `{message}` | `400 PASSWORD_ENDPOINT_REQUIRED`, `EMAIL_ENDPOINT_REQUIRED`, `400 No fields` | [profile_screen.dart:218](../../lib/screens/profile_screen.dart#L218) | FT [email_identity_security_test](../../test/email_identity_security_test.dart) |
| `GET/POST/DELETE /api/users/frequent-items` | [users.js:642](../../swifora_backend/src/routes/users.js#L642), [651](../../swifora_backend/src/routes/users.js#L651), [666](../../swifora_backend/src/routes/users.js#L666) | `item` | `{items}` | `400` | **no mobile caller** (UI removed; FT [frequent_items_removed_test](../../test/frequent_items_removed_test.dart)) | BT [mobile-password-security](../../swifora_backend/test/mobile-password-security.test.js) |
| `GET/POST/DELETE /api/users/phones`, `PUT /api/users/phones/primary` | [users.js:679](../../swifora_backend/src/routes/users.js#L679), [688](../../swifora_backend/src/routes/users.js#L688), [703](../../swifora_backend/src/routes/users.js#L703), [717](../../swifora_backend/src/routes/users.js#L717) | `number` (**no format validation**) | `{phones:[{number,primary}]}` | `400` (primary removal, missing number) | [profile_screen.dart:172-210](../../lib/screens/profile_screen.dart#L172) (errors swallowed silently) | - |

### 2.10 `/api/ads`

| Endpoint | Handler | Response | Flutter caller | Tests |
|---|---|---|---|---|
| `GET /api/ads` | [ads.js:10](../../swifora_backend/src/routes/ads.js#L10) `auth`, `role(customer,provider)` | Up to 5 active ads for the caller's audience and current time window: `[{_id,title,body,images[],startsAt,endsAt}]` ([adPayload.js:110-119](../../swifora_backend/src/services/adPayload.js#L110)) | [ad_service.dart:17-34](../../lib/services/ad_service.dart#L17) ← [ad_banner_carousel.dart](../../lib/widgets/ui/ad_banner_carousel.dart) (both homes) | BT [ads.test.js](../../swifora_backend/test/ads.test.js); FT [ads_ui_test](../../test/ads_ui_test.dart) |

### 2.11 `/api/chat/admin/*` - admin support chat ([chat.js:139-143](../../swifora_backend/src/routes/chat.js#L139): `requireAdminSession` + CSRF)

None of these has a mobile caller. The callers are the admin SPA in [public/js/main.js](../../swifora_backend/src/public/js/main.js).

| Endpoint | Handler | Notes |
|---|---|---|
| `GET /api/chat/admin/conversations` | [chat.js:145](../../swifora_backend/src/routes/chat.js#L145) | Registered user conversations merged with up to 200 unresolved guest contacts (`contact:<id>`) |
| `GET /api/chat/admin/messages/:userId` | [chat.js:225](../../swifora_backend/src/routes/chat.js#L225) | `400 Invalid conversation id`, `404` contact |
| `POST /api/chat/admin/messages/:userId/read` | [chat.js:269](../../swifora_backend/src/routes/chat.js#L269) | Marks user messages read |
| `POST /api/chat/admin/reply/:userId` | [chat.js:340](../../swifora_backend/src/routes/chat.js#L340) | `text≤2000`. Socket `support_reply` to `user:<id>`. **No push and no Notification.** `409 CONTACT_REPLY_EXTERNAL_ONLY` for guests. |
| `DELETE /api/chat/admin/resolve/:userId` | [chat.js:437](../../swifora_backend/src/routes/chat.js#L437) | Resolves a guest contact, or **hard-deletes** all chat messages for a user |

Tests: BT [admin-security](../../swifora_backend/test/admin-security.test.js), [admin-broadcast-support-chat](../../swifora_backend/test/admin-broadcast-support-chat.test.js), [admin-browser-security](../../swifora_backend/test/admin-browser-security.test.js).

### 2.12 Admin web: pages and JSON API (session + CSRF, mounts at [index.js:507-522](../../swifora_backend/src/index.js#L507))

None of these has a mobile caller. The callers are the EJS views ([views/admin](../../swifora_backend/src/views/admin)) and [public/js/main.js](../../swifora_backend/src/public/js/main.js). Error shape is `{success:false,message}`. Unless noted, failures return 500 via `sendInternalServerFailure`.

| Endpoint | Handler | Notes and notable errors |
|---|---|---|
| `GET /admin/login` (page) | [adminAuth.js:76](../../swifora_backend/src/routes/adminAuth.js#L76) | Renders `login.ejs`; redirects if already logged in |
| `POST /admin/login` | [adminAuth.js:81](../../swifora_backend/src/routes/adminAuth.js#L81) CSRF, IP + account limiters | `identifier, password, twoFactorCode` (TOTP or recovery code). Regenerates the session and redirects to `/admin`. Failure renders `401`. |
| `POST /admin/reset-password` | [adminAuth.js:146](../../swifora_backend/src/routes/adminAuth.js#L146) | Bumps `sessionVersion` and disconnects other admin sockets. **Validation failures return 200 `{success:false}`.** |
| `GET /admin/2fa/status`, `POST /admin/2fa/setup`, `/enable`, `/disable` | [adminAuth.js:185](../../swifora_backend/src/routes/adminAuth.js#L185), [216](../../swifora_backend/src/routes/adminAuth.js#L216), [259](../../swifora_backend/src/routes/adminAuth.js#L259), [320](../../swifora_backend/src/routes/adminAuth.js#L320) | TOTP management ([totp.js](../../swifora_backend/src/security/totp.js)) |
| `POST /admin/logout` | [adminAuth.js:390](../../swifora_backend/src/routes/adminAuth.js#L390) | Destroys the session, disconnects the admin socket, redirects |
| `GET /admin` (dashboard page) | [index.js:520](../../swifora_backend/src/index.js#L520) | Renders `index.ejs` |
| `PUT /admin/drivers/:id/availability` | [adminDrivers.js:49](../../swifora_backend/src/routes/adminDrivers.js#L49) | `available` boolean |
| `GET /admin/drivers/:id/reports` | [adminDrivers.js:84](../../swifora_backend/src/routes/adminDrivers.js#L84) | Driver order report |
| `GET /admin/drivers`, `GET /admin/drivers/search?id=` | [adminDrivers.js:155](../../swifora_backend/src/routes/adminDrivers.js#L155), [196](../../swifora_backend/src/routes/adminDrivers.js#L196) | List and search |
| `POST /admin/drivers` | [adminDrivers.js:331](../../swifora_backend/src/routes/adminDrivers.js#L331) | Create a driver directly with `mustChangePassword:true` ([465](../../swifora_backend/src/routes/adminDrivers.js#L465)). Validation errors return **200** `{success:false}`. |
| `PUT /admin/drivers/:id/profile` | [adminDrivers.js:494](../../swifora_backend/src/routes/adminDrivers.js#L494) | Edits area, service types, license. May bump `sessionVersion`. Socket `provider_profile_updated` and room re-join ([668-702](../../swifora_backend/src/routes/adminDrivers.js#L668)). |
| `PUT /admin/drivers/:id/status` | [adminDrivers.js:734](../../swifora_backend/src/routes/adminDrivers.js#L734) | `active\|blocked`. Creates a pinned `broadcast` Notification, emits `notification_count{unreadCount:1}` (hard-coded) and `broadcast`, then disconnects. |
| `PUT /admin/drivers/:id/password` | [adminDrivers.js:841](../../swifora_backend/src/routes/adminDrivers.js#L841) | Sets `mustChangePassword:true` and `sessionVersion+1`, disconnects |
| `DELETE /admin/drivers/:id` | [adminDrivers.js:940](../../swifora_backend/src/routes/adminDrivers.js#L940) | Soft delete, socket `account_deleted`, disconnect |
| `GET /admin/drivers/pending/:id/documents`, `/:kind`; `GET /admin/drivers/documents/:id`, `/:kind` | [adminDrivers.js:1071](../../swifora_backend/src/routes/adminDrivers.js#L1071), [1110](../../swifora_backend/src/routes/adminDrivers.js#L1110), [1140](../../swifora_backend/src/routes/adminDrivers.js#L1140), [1182](../../swifora_backend/src/routes/adminDrivers.js#L1182) | Serve legacy stored documents. **No current route stores new documents** (`persistProviderDocumentFiles` is unused). |
| `GET /admin/drivers/pending` | [adminDrivers.js:1216](../../swifora_backend/src/routes/adminDrivers.js#L1216) | Pending provider sign-ups |
| `POST /admin/drivers/pending/:id` | [adminDrivers.js:1226](../../swifora_backend/src/routes/adminDrivers.js#L1226) | **410** `LEGACY_PROVIDER_DOCUMENT_FLOW_DISABLED` |
| `POST /admin/drivers/pending/:id/approve` | [adminDrivers.js:1239](../../swifora_backend/src/routes/adminDrivers.js#L1239) | Transaction: `PendingProvider` becomes `User(provider, active)`. **No notification or email to the applicant.** |
| `DELETE /admin/drivers/pending/:id/reject` | [adminDrivers.js:1366](../../swifora_backend/src/routes/adminDrivers.js#L1366) | Deletes the application and its documents |
| `GET /admin/users`, `/search` | [adminUsers.js:21](../../swifora_backend/src/routes/adminUsers.js#L21), [55](../../swifora_backend/src/routes/adminUsers.js#L55) | `search` returns **200** `{error}` when not found |
| `PUT /admin/users/:id/status`, `/:id/password`, `DELETE /admin/users/:id` | [adminUsers.js:113](../../swifora_backend/src/routes/adminUsers.js#L113), [220](../../swifora_backend/src/routes/adminUsers.js#L220), [319](../../swifora_backend/src/routes/adminUsers.js#L319) | Same pattern as drivers. Not found returns **200** `{success:false}`. |
| `GET /admin/reports/:type`, `/detail/:id` | [adminReports.js:9](../../swifora_backend/src/routes/adminReports.js#L9), [20](../../swifora_backend/src/routes/adminReports.js#L20) | Not found returns **200** `{error}` |
| `POST /admin/reports/reply/:id` | [adminReports.js:30](../../swifora_backend/src/routes/adminReports.js#L30) | Appends a reply and creates a `report_reply` notification (with push) |
| `PUT /admin/reports/:id/status` | [adminReports.js:68](../../swifora_backend/src/routes/adminReports.js#L68) | `in-review\|in-progress\|resolved\|rejected`, then a `report_reply` notification |
| `DELETE /admin/reports/:id` | [adminReports.js:112](../../swifora_backend/src/routes/adminReports.js#L112) | Hard delete |
| `GET /admin/commissions` | [adminCommissions.js:20](../../swifora_backend/src/routes/adminCommissions.js#L20) | Per-driver ledger (N+1 queries) |
| `PUT /admin/commissions/reset-all`, `/reset/:id` | [adminCommissions.js:140](../../swifora_backend/src/routes/adminCommissions.js#L140), [162](../../swifora_backend/src/routes/adminCommissions.js#L162) | Resets the commission counters |
| `PUT /admin/commissions/pay/:id` | [adminCommissions.js:174](../../swifora_backend/src/routes/adminCommissions.js#L174) | Records a `CommissionPayment{manual_admin}` and sets `commissionPaidAt=now`. Not found returns **200** `{success:false}`. **No idempotency**: a double click creates a second record only if unpaid > 0 after the first completes. |
| `GET /admin/areas` | [adminAreas.js:9](../../swifora_backend/src/routes/adminAreas.js#L9) | Governorate statistics |
| `POST /admin/broadcast/:target` | [adminBroadcast.js:8](../../swifora_backend/src/routes/adminBroadcast.js#L8) | `title≤150, body≤2000`. Any target other than `drivers` goes to customers. Targets `User.find({role})`, **including blocked and deleted users**. In-app plus socket only, **no push**. |
| `GET /admin/broadcast/archive/:target` | [adminBroadcast.js:85](../../swifora_backend/src/routes/adminBroadcast.js#L85) | `400` invalid target |
| `GET /admin/chat/messages/:type/:id`, `POST /admin/chat/send/:type/:id` | [adminChat.js:49](../../swifora_backend/src/routes/adminChat.js#L49), [75](../../swifora_backend/src/routes/adminChat.js#L75) | Legacy per-user chat. `send` emits `support_reply`. |
| `GET /admin/orders` | [adminOrders.js:27](../../swifora_backend/src/routes/adminOrders.js#L27) | Filters `status,type,area,q` (regex search), limit 200 |
| `GET /admin/orders/:id` | [adminOrders.js:67](../../swifora_backend/src/routes/adminOrders.js#L67) | `{order, offers, rejections}` |
| `POST /admin/orders/:id/cancel` | [adminOrders.js:99](../../swifora_backend/src/routes/adminOrders.js#L99) | Any status except completed or cancelled (including accepted, fulfilling and expired). Clears the provider block. **No socket or notification to either party.** Not inside a transaction. |
| `POST /admin/orders/:id/resend` | [adminOrders.js:149](../../swifora_backend/src/routes/adminOrders.js#L149) | `resetOrder`. **Does not emit `new_order`.** |
| `POST /admin/orders/:id/end-suspension` | [adminOrders.js:181](../../swifora_backend/src/routes/adminOrders.js#L181) | A suspended pending order becomes `expired` |
| `POST /admin/orders/:id/offers/:offerId/reject` | [adminOrders.js:212](../../swifora_backend/src/routes/adminOrders.js#L212) | Offer becomes `rejected` (no `rejectionReason`). Order may revert from `offered` to `pending`. No notifications. |
| `GET/POST /admin/ads`, `PUT /admin/ads/:id`, `PUT /admin/ads/:id/status`, `DELETE /admin/ads/:id` | [adminAds.js:66](../../swifora_backend/src/routes/adminAds.js#L66), [78](../../swifora_backend/src/routes/adminAds.js#L78), [111](../../swifora_backend/src/routes/adminAds.js#L111), [190](../../swifora_backend/src/routes/adminAds.js#L190), [230](../../swifora_backend/src/routes/adminAds.js#L230) | multer `images[]` upload ([adImageStorage.js](../../swifora_backend/src/services/adImageStorage.js)) |
| `GET /admin/api/stats`, `GET /admin/api/top-driver` | [adminApi.js:17](../../swifora_backend/src/routes/adminApi.js#L17), [190](../../swifora_backend/src/routes/adminApi.js#L190) | Dashboard KPIs |
| `GET/PUT /admin/api/commission-settings` | [adminApi.js:210](../../swifora_backend/src/routes/adminApi.js#L210), [218](../../swifora_backend/src/routes/adminApi.js#L218) | `type∈{fixed,percent}`, `value≥0` (percent ≤100, fixed ≤100000) |

Tests for the admin surface: BT [admin-browser-security](../../swifora_backend/test/admin-browser-security.test.js), [admin-security](../../swifora_backend/test/admin-security.test.js), [admin-driver-profile-edit](../../swifora_backend/test/admin-driver-profile-edit.test.js), [admin-target-password-security](../../swifora_backend/test/admin-target-password-security.test.js), [admin-commission-card](../../swifora_backend/test/admin-commission-card.test.js), [admin-broadcast-archive](../../swifora_backend/test/admin-broadcast-archive.test.js), [commission-settings](../../swifora_backend/test/commission-settings.test.js), [ads.test.js](../../swifora_backend/test/ads.test.js), [provider-service-types-and-admin-links](../../swifora_backend/test/provider-service-types-and-admin-links.test.js) (admin orders), [error-disclosure-security](../../swifora_backend/test/error-disclosure-security.test.js) (all routes).

### 2.13 Endpoint counts

| Surface | Count |
|---|---|
| Mobile and public `/api/*` (auth 6, orders 8, offers 5, provider 7, notifications 4, reports 2, chat 5 including public contact, users 17, ads 1, system 2) | **57** |
| Admin `/api/chat/admin/*` | 5 |
| Admin `/admin*` (auth/2FA/pages 9, drivers 17, users 5, reports 5, commissions 4, areas 1, broadcast 2, chat 2, orders 6, ads 5, api 4) | 60 |
| **Admin total** | **65** (pages: `GET /admin/login`, `GET /admin`) |
| Mobile endpoints with no Flutter caller | `GET /users/location`, 3× `/users/frequent-items`, `/api/health` (5) |

---

## 3. Socket.io events

The connection is authenticated in [index.js:323-409](../../swifora_backend/src/index.js#L323). Mobile clients send `handshake.auth.token`, which is verified against JWT, `sessionVersion`, active status and `mustChangePassword`. A server timer disconnects the socket at JWT `exp`. Admins authenticate with the session cookie. **Any exception inside this middleware (including DB errors) becomes `Error('Invalid authentication')`** ([index.js:406-408](../../swifora_backend/src/index.js#L406)).

Rooms are joined once, on connect ([index.js:411-452](../../swifora_backend/src/index.js#L411)):

- every user joins `user:<id>`;
- providers also join `area:<registered area or handshake.query.area>`, plus `governorate:<g>` when governorate-level mode is on;
- admins join `support` and `admin:<id>`.

Rooms are not refreshed when a user changes area or governorate through `/api/users/*`. Only the admin profile edit re-joins rooms ([adminDrivers.js:688-698](../../swifora_backend/src/routes/adminDrivers.js#L688)).

**Client to server:** the Flutter app emits **no custom events** (only the built-in connect, with `auth.token` and `query.area`) ([socket_service.dart:87-104](../../lib/services/socket_service.dart#L87)). The admin SPA emits none either.

**Server to client:**

| Event | Emitted at | Room | Payload | Flutter listener → consumers |
|---|---|---|---|---|
| `new_order` | [orders.js:126-129](../../swifora_backend/src/routes/orders.js#L126), [offers.js:162-165](../../swifora_backend/src/routes/offers.js#L162) (resend) | `area:`/`governorate:` | `{_id,type,description,area,governorate,governorateLevel,location,status,createdAt,phoneMasked}` | [socket_service.dart:123](../../lib/services/socket_service.dart#L123) → provider home and pending orders (triggers a reload) |
| `new_offer` | [offers.js:110](../../swifora_backend/src/routes/offers.js#L110) | `user:<customer>` | `{orderId, offerId, price, estimatedTime, providerName, providerPhone}`. **`providerPhone` is always undefined** (User has no `phone`). | [socket_service.dart:129](../../lib/services/socket_service.dart#L129) → home auto-opens offers ([home_screen.dart:131-139](../../lib/screens/home_screen.dart#L131)), order offers, my orders |
| `offer_accepted` | [offers.js:292](../../swifora_backend/src/routes/offers.js#L292) | `user:<provider>` | `{orderId, price}` | [socket_service.dart:135](../../lib/services/socket_service.dart#L135) → provider home opens OrderDetail ([provider_home_screen.dart:266-276](../../lib/screens/provider_home_screen.dart#L266)). The customer home also listens, but the event is never sent to customers. |
| `offer_not_selected` | [offers.js:37](../../swifora_backend/src/routes/offers.js#L37) | `user:<provider>` | `{orderId, price}` | [socket_service.dart:141](../../lib/services/socket_service.dart#L141) → provider snackbar |
| `offer_cancelled` | [offers.js:56](../../swifora_backend/src/routes/offers.js#L56) | `user:<customer>` | `{orderId, offerId, providerId}` | [socket_service.dart:147](../../lib/services/socket_service.dart#L147) → home warning, offers screen dialog |
| `order_status_changed` | [orders.js:450](../../swifora_backend/src/routes/orders.js#L450), [512](../../swifora_backend/src/routes/orders.js#L512) | `user:<customer>` | `{orderId, status:'fulfilling'\|'completed'}` | [socket_service.dart:159](../../lib/services/socket_service.dart#L159) → home counters, my orders |
| `delivery_confirmation_requested` | [orders.js:476](../../swifora_backend/src/routes/orders.js#L476) | `user:<customer>` | `{orderId}` | [socket_service.dart:165](../../lib/services/socket_service.dart#L165) → home opens the in-progress list ([home_screen.dart:141-151](../../lib/screens/home_screen.dart#L141)) |
| `delivery_confirmation_result` | [orders.js:508](../../swifora_backend/src/routes/orders.js#L508), [546](../../swifora_backend/src/routes/orders.js#L546) | `user:<provider>` | `{orderId, approved, reason?}` | [socket_service.dart:173](../../lib/services/socket_service.dart#L173) → provider screens |
| `rating_received` | [orders.js:419](../../swifora_backend/src/routes/orders.js#L419) | `user:<provider>` | `{orderId, rating}` | **No listener** (dead event; the provider relies on `notification_count` and polling) |
| `notification_count` | [mobileNotifications.js:11](../../swifora_backend/src/services/mobileNotifications.js#L11), [adminBroadcast.js:67](../../swifora_backend/src/routes/adminBroadcast.js#L67), [adminDrivers.js:797](../../swifora_backend/src/routes/adminDrivers.js#L797)/[815](../../swifora_backend/src/routes/adminDrivers.js#L815), [adminUsers.js:176](../../swifora_backend/src/routes/adminUsers.js#L176)/[194](../../swifora_backend/src/routes/adminUsers.js#L194) | `user:` | `{unreadCount:int}` (admin status changes send a hard-coded `1`) | [socket_service.dart:181](../../lib/services/socket_service.dart#L181) → provider home reloads notifications. **The customer home does not subscribe** (it polls every 15 s). |
| `support_message` | [chat.js:90](../../swifora_backend/src/routes/chat.js#L90), [chat.js:410](../../swifora_backend/src/routes/chat.js#L410) | `support` (admins) | `{_id,userId,userName,userPublicId,userRole,text,createdAt}` | Admin SPA [main.js:3272](../../swifora_backend/src/public/js/main.js#L3272) |
| `support_reply` | [chat.js:383](../../swifora_backend/src/routes/chat.js#L383), [adminChat.js:113](../../swifora_backend/src/routes/adminChat.js#L113) | `user:` | `{_id,userId,sender:'admin',text,createdAt}` | [socket_service.dart:187](../../lib/services/socket_service.dart#L187) → chat screen and unread badge |
| `broadcast` | [adminBroadcast.js:68](../../swifora_backend/src/routes/adminBroadcast.js#L68), [adminDrivers.js:802](../../swifora_backend/src/routes/adminDrivers.js#L802)/[820](../../swifora_backend/src/routes/adminDrivers.js#L820), [adminUsers.js:181](../../swifora_backend/src/routes/adminUsers.js#L181)/[199](../../swifora_backend/src/routes/adminUsers.js#L199) | `user:` | `{title, body, action?}` | [socket_service.dart:193](../../lib/services/socket_service.dart#L193) → reload notifications |
| `account_deleted` | [adminDrivers.js:992](../../swifora_backend/src/routes/adminDrivers.js#L992), [adminUsers.js:371](../../swifora_backend/src/routes/adminUsers.js#L371) | `user:` | `{}` | [socket_service.dart:199](../../lib/services/socket_service.dart#L199) → `_endSession` |
| `provider_profile_updated` | [adminDrivers.js:698](../../swifora_backend/src/routes/adminDrivers.js#L698) | the socket itself | `{user, serviceTypes, licenseType, licenseNotAvailable, isAvailable, status}` | [socket_service.dart:153](../../lib/services/socket_service.dart#L153) → profile screen |
| *(built-in)* `disconnect` reason `io server disconnect` | `disconnectSockets(true)` on logout, password, email or reset, admin actions, and JWT expiry | - | - | [socket_service.dart:106-112](../../lib/services/socket_service.dart#L106) → `onSessionRevoked` → `_endSession` |
| *(built-in)* `connect_error` "Invalid authentication" | [index.js:407](../../swifora_backend/src/index.js#L407) | - | - | [socket_service.dart:114-121](../../lib/services/socket_service.dart#L114) → `onSessionRevoked` → **logout** |

Totals: **15 custom server-emitted events**. The mobile client listens to 14 of them. The admin web listens to 1 (`support_message`). There are **0 custom client-emitted events**.

---

## 4. FCM push payloads

Sender: [pushNotifications.js:114-164](../../swifora_backend/src/services/pushNotifications.js#L114). The message is `{notification:{title,body}, data:{type, orderId?}}` (all values stringified), with Android channel `swifora_default`, priority high, and APNs sound plus `content-available`. Invalid tokens are pruned. Push is silently skipped when Firebase credentials are missing.

| `data.type` | Trigger | Recipient |
|---|---|---|
| `new_order` | [orders.js:163-173](../../swifora_backend/src/routes/orders.js#L163) (direct `sendPushToUsers`, **not** stored as a Notification) | Eligible drivers (area/governorate, service type, available, not blocked) |
| `new_offer` | [offers.js:120](../../swifora_backend/src/routes/offers.js#L120) | Customer |
| `offer_accepted` | [offers.js:298](../../swifora_backend/src/routes/offers.js#L298) | Provider |
| `offer_not_selected` | [offers.js:43](../../swifora_backend/src/routes/offers.js#L43) | Competing providers |
| `driver_taken` | [offers.js:63](../../swifora_backend/src/routes/offers.js#L63) | Customers whose offer was auto-cancelled |
| `order_pending` (meaning "work started") | [orders.js:452](../../swifora_backend/src/routes/orders.js#L452) | Customer |
| `delivery_confirmation` | [orders.js:481](../../swifora_backend/src/routes/orders.js#L481) | Customer |
| `delivery_confirmed` | [orders.js:518](../../swifora_backend/src/routes/orders.js#L518) | Provider |
| `delivery_rejected` | [orders.js:553](../../swifora_backend/src/routes/orders.js#L553) | Provider |
| `new_rating` | [orders.js:425](../../swifora_backend/src/routes/orders.js#L425) | Provider |
| `report_reply` | [adminReports.js:53](../../swifora_backend/src/routes/adminReports.js#L53), [97](../../swifora_backend/src/routes/adminReports.js#L97) | Reporter |

Total: **11 push types**.

- **No push** is sent for: admin broadcasts, admin block/unblock (`broadcast` Notifications are created directly), support replies, or admin order cancellation.
- Notification enum values that are never produced: `offer_submitted`, `order_completed`; `new_order` is never stored as a notification ([Notification.js:6](../../swifora_backend/src/models/Notification.js#L6)).

Client handling ([push_notification_service.dart](../../lib/services/push_notification_service.dart)):

- `start()` requests permission, registers the token, listens to `onTokenRefresh`, and only `debugPrint`s foreground messages ([push_notification_service.dart:53-55](../../lib/services/push_notification_service.dart#L53)).
- **There is no `onMessageOpenedApp` or `getInitialMessage` handling**, so tapping a push only opens the app. `data.type` and `orderId` are never consumed.
- The background handler only initializes Firebase.
- Firebase is enabled only when the `FIREBASE_*` dart-defines are present ([firebase_bootstrap.dart](../../lib/services/firebase_bootstrap.dart)).

---

## 5. Resilience and contract analysis

Evidence levels:

- **Confirmed**: proven by reading code.
- **Strongly suspected**: code strongly implies it; runtime not observed.
- **Potential**: depends on conditions.
- **Needs runtime**.

### 5.1 API errors

- **Inconsistent error shapes.**
  - Mobile routes use `{error, code?}`.
  - Lifecycle conflicts use `{conflict:true, code, message, orderId?, retryAfterSeconds?}` with **no `error` key** ([orderLifecycle.js:41-49](../../swifora_backend/src/services/orderLifecycle.js#L41)).
  - Admin routes use `{success:false, message}`, often with HTTP 200.
  - `requireRole` returns `{error:'Forbidden'}` without a code.
  - **Confirmed.**
- **Client extracts only `error` for lifecycle conflicts.** `ProviderService.markFulfilling` and `markComplete` ([provider_service.dart:111](../../lib/services/provider_service.dart#L111), [121](../../lib/services/provider_service.dart#L121)) and `OrderService.confirmDelivery` and `rejectDelivery` ([order_service.dart:79](../../lib/services/order_service.dart#L79), [98](../../lib/services/order_service.dart#L98)) read `data['error']`. The server's 409 conflict text is therefore lost, and users see "Failed to update", "Failed to complete" or "Failed to confirm delivery". **Confirmed.**
- **Unmapped DioExceptions.** These methods have no try/catch, so the raw `DioException.toString()` reaches the UI:
  - `OfferService.getOffers` ([offer_service.dart:53](../../lib/services/offer_service.dart#L53));
  - every `NotificationService` method;
  - `ReportService` (shown in the snackbar at [report_screen.dart:73](../../lib/screens/report_screen.dart#L73));
  - `ChatService`;
  - the profile `_saveName` and `_saveEmail` handlers ([profile_screen.dart:223](../../lib/screens/profile_screen.dart#L223), [318](../../lib/screens/profile_screen.dart#L318), [370](../../lib/screens/profile_screen.dart#L370)).

  **Confirmed.**
- **Non-Map error bodies.** `e.response?.data?['error']` is evaluated on dynamic data. When the body is a String (HTML from a proxy 502 or a 404 page), indexing a String with `'error'` throws a `TypeError` inside the catch block. The bloc then shows a type-error message. This affects [order_service.dart:38](../../lib/services/order_service.dart#L38) and similar handlers. **Strongly suspected** (Dart semantics; needs runtime with a non-JSON error).
- **Server 500 on invalid ObjectIds.** Mongoose `CastError` maps to a generic 500 on these routes, which do not validate the id:
  - `PUT /orders/:id/fulfilling`, `/complete`, `/confirm-delivery`, `/reject-delivery`;
  - `POST /offers/:id/accept`;
  - `GET /offers/order/:orderId`;
  - `PUT /notifications/:id/read`.

  **Confirmed** (no `isValidObjectId` in those handlers).

### 5.2 Expired and revoked sessions

- There is no refresh token: the JWT lasts 7 days ([auth.js:155](../../swifora_backend/src/routes/auth.js#L155)).
- On startup, `JwtToken.isRestorable` checks expiry locally with 30 s skew, then calls `/auth/me`. A 401 or 403 clears the token, while a network failure keeps it ([auth_bloc.dart:34-76](../../lib/bloc/auth/auth_bloc.dart#L34)). **Confirmed.**
- While running, revocation is detected three ways:
  - an HTTP 401 with one of the codes, or 403 `ACCOUNT_INACTIVE`, through the interceptor;
  - a socket `io server disconnect`;
  - a socket `connect_error` containing "invalid authentication".

  Each path leads to `_endSession`, then `LogoutEvent`, then the login screen ([home_screen.dart:338-351](../../lib/screens/home_screen.dart#L338)). **Confirmed.**
- **Defect: false logouts from socket errors.** The server maps *every* socket-auth exception, including Mongo timeouts from `User.findById`, to "Invalid authentication" ([index.js:406-408](../../swifora_backend/src/index.js#L406)). The client treats that as revocation and wipes the stored token ([socket_service.dart:114-121](../../lib/services/socket_service.dart#L114)). A DB blip can therefore force-logout connected users. **Strongly suspected.**
- `403 PASSWORD_CHANGE_REQUIRED` mid-session is not handled specially. In practice an admin password reset also bumps `sessionVersion`, so a 401 arrives first. **Confirmed.**
- **Defect: push token survives logout.** The logout buttons fire `revokeSession` unawaited, then `LogoutEvent`, which calls `PushNotificationService.stop()` and `DELETE /users/push-token` with the same token ([home_screen.dart:833-835](../../lib/screens/home_screen.dart#L833), [auth_bloc.dart:151-156](../../lib/bloc/auth/auth_bloc.dart#L151)). If the revoke lands first, the DELETE gets a 401 and the FCM token stays bound to the account, so the device keeps receiving that user's pushes. After forced logouts (expiry or revocation) the DELETE always fails. **Strongly suspected.**

### 5.3 Connectivity loss and reconnection

- socket.io's default auto-reconnect is enabled ([socket_service.dart:91-98](../../lib/services/socket_service.dart#L91)). On app resume, home screens reconnect if disconnected and reload counts ([home_screen.dart:356-371](../../lib/screens/home_screen.dart#L356)). `onConnected` triggers reloads. Polling covers missed events:

| Poll | Interval |
|---|---|
| home notifications, counters | 15 s |
| my orders | 30 s |
| offered and pending lists | 15 s |
| tracking | 15 s |
| chat | 10 s |
| provider dashboard | 30 s |

- **There is no connectivity listener, no offline queue and no retry.** Failed writes surface as errors and are dropped. The chat marks the message bubble `failed` with no resend ([support_chat_screen.dart:119-127](../../lib/screens/support_chat_screen.dart#L119)). **Confirmed.**
- On the server, the `/api` DB guard returns 503 while Mongo is reconnecting. The client shows a generic "Failed to …" message. **Confirmed.**
- `LocationService.syncToBackend` has no timeout, so a hung request lingers. It is fire-and-forget. **Confirmed.**

### 5.4 Duplicate submissions and idempotency

There is no idempotency key anywhere in the client or server. **Confirmed.**

| Action | Client guard | Server guard | Risk |
|---|---|---|---|
| Create order | Button disabled while `OrderLoading` ([create_order_screen.dart:207-209](../../lib/screens/create_order_screen.dart#L207)) | Rate limit only | A timeout after the server committed leads to a retry and a **duplicate order** (**Potential**) |
| Submit offer | Disabled while loading or in cooldown | Transaction serialized on the provider document, plus duplicate check; non-unique index ([Offer.js:18-21](../../swifora_backend/src/models/Offer.js#L18)) | Safe (409 `OFFER_NOT_AVAILABLE`) |
| Accept offer | Spinner replaces the list (`OfferLoading`) | Conditional updates in a transaction | Safe |
| Fulfilling / complete / confirm / reject delivery | **No busy flag** ([order_detail_screen.dart:168-200](../../lib/screens/order_detail_screen.dart#L168), [my_orders_screen.dart:181-228](../../lib/screens/my_orders_screen.dart#L181)) | State-conditional `findOneAndUpdate` | A double tap produces a 409 with the generic error toast after success (**Confirmed** UX defect) |
| Rating | None | Unique `orderId` index, `409 RATING_EXISTS` | Safe |
| Provider reject | None | Unique `(providerId, orderId)` index | Safe |
| Admin commission pay | None | None | A re-click records a second payment only if unpaid > 0 (**Potential**) |
| Chat send / report | Report has `_sending`; chat has no guard | Rate limit | Duplicates possible |

### 5.5 Delayed responses

- Timeouts are 8-30 s, and several requests have none (location sync, profile receive). Most screens show a spinner. None show retry affordances except explicit refresh. **Confirmed.**
- Offer validity is **60 s** ([orderLifecycle.js:17](../../swifora_backend/src/services/orderLifecycle.js#L17)). The client countdown uses device time against server `expiresAt` ([order_offers_screen.dart:76-105](../../lib/screens/order_offers_screen.dart#L76)), so clock skew can mis-display it. A slow accept near expiry yields 409 `OFFER_NOT_AVAILABLE`. **Potential.**
- `GET /api/orders` performs global `expireStaleOffers()` and `finalizeExpiredOrders()` on every call ([orders.js:184-185](../../swifora_backend/src/routes/orders.js#L184)), plus N sequential `suspendIfUnanswered` queries. Latency grows with data size. **Potential.**

### 5.6 Unexpected payloads (fromJson null-safety)

- `OfferModel`, `ProviderStats`, `AdModel`, `UserModel` and `NotificationModel` mostly default nulls. Some cast-sensitive spots remain:
  - `OfferModel.price: (json['price'] ?? 0).toDouble()` throws if the server sends a String;
  - `UserModel.id: json['id'] ?? ''` throws if `id` were non-String;
  - `NotificationModel.read: json['read'] ?? false` is typed `bool` and throws if non-bool.

  **Potential** (the server never sends those today).
- Several services use `List<Map<String,dynamic>>.from(response.data)` without type checks (OrderService, ProviderService, ChatService, ReportService). A non-list body throws a TypeError. **Confirmed** pattern.
- `AuthBloc._onLogin` does `Map.from(data['user'])` and `data['token'].toString()`. A missing `user` throws a TypeError and shows an error. **Confirmed**, handled by the generic catch.

### 5.7 Contract mismatches (client model ↔ server response)

| # | Mismatch | Evidence | Level |
|---|---|---|---|
| C1 | Offer provider phone: the server populates `providerId` with field `phone`, but the User schema only has `phoneNumbers[]`. `OfferModel.providerPhone` is therefore always `''`, the phone row in offers and the order report never renders, and customers never get the driver phone. **Owner decision (2026-11-13): hiding the driver phone from customers is intended.** The `new_offer` socket `providerPhone` is undefined too. | [offers.js:202](../../swifora_backend/src/routes/offers.js#L202), [User.js:52](../../swifora_backend/src/models/User.js#L52), [offer_model.dart:63](../../lib/models/offer_model.dart#L63), [order_offers_screen.dart:571](../../lib/screens/order_offers_screen.dart#L571), [offers.js:116](../../swifora_backend/src/routes/offers.js#L116) | Confirmed |
| C2 | Lifecycle 409 bodies have `message`, but the client reads `error` (see §5.1). | [orderLifecycle.js:41](../../swifora_backend/src/services/orderLifecycle.js#L41), [provider_service.dart:111](../../lib/services/provider_service.dart#L111) | Confirmed |
| C3 | `OfferModel.orderId = json['orderId']?.toString()`, but the server populates `orderId` as an object, so the value becomes a Map `toString()`. Latent, because screens use `widget.orderId`. | [offers.js:203](../../swifora_backend/src/routes/offers.js#L203), [offer_model.dart:60](../../lib/models/offer_model.dart#L60) | Confirmed (latent) |
| C4 | `ProviderBloc` handlers re-emit `ProviderStatsLoaded` without `offeredOrders`, so the offered list is dropped whenever stats or pending reload after it. The provider home's offered tile then falls back to an empty list. | [provider_bloc.dart:30-33](../../lib/bloc/provider/provider_bloc.dart#L30), [provider_bloc.dart:67](../../lib/bloc/provider/provider_bloc.dart#L67), [provider_home_screen.dart:836](../../lib/screens/provider_home_screen.dart#L836) | Confirmed |
| C5 | Provider registration success (`201 {pending:true}`) is emitted as `AuthError` and shown with `AppFeedback.error`. | [auth_bloc.dart:120-128](../../lib/bloc/auth/auth_bloc.dart#L120), [login_screen.dart:462-464](../../lib/screens/login_screen.dart#L462) | Confirmed |
| C6 | Register returns `governorate: user.governorate`, while login and `/me` return the derived `governorateKey(user)`. Values may differ for legacy accounts. | [auth.js:161](../../swifora_backend/src/routes/auth.js#L161), [auth.js:240](../../swifora_backend/src/routes/auth.js#L240) | Potential |
| C7 | Notification type `order_pending` actually means "work started". The client routes `order_completed`, which is never produced. | [orders.js:456](../../swifora_backend/src/routes/orders.js#L456), [notifications_screen.dart:258-263](../../lib/screens/notifications_screen.dart#L258) | Confirmed (cosmetic/dead) |
| C8 | `rating_received` is emitted but has no listener. The customer home subscribes to `offer_accepted`, which only providers receive. | [orders.js:419](../../swifora_backend/src/routes/orders.js#L419), [home_screen.dart:172](../../lib/screens/home_screen.dart#L172) | Confirmed (dead code) |
| C9 | `/provider/stats.pendingOrdersCount` ignores `isAvailable`, while `/provider/pending-orders` returns `[]` when unavailable, so the counter and the list disagree. | [provider.js:168-171](../../swifora_backend/src/routes/provider.js#L168), [provider.js:247-249](../../swifora_backend/src/routes/provider.js#L247) | Confirmed |
| C10 | Status enums are aligned: client switches cover `pending/offered/accepted/fulfilling/completed/cancelled/expired` (my orders, order report). `order_detail_screen._statusLabel` lacks `cancelled` and `expired` and falls back to the raw string. | [order_detail_screen.dart:134-148](../../lib/screens/order_detail_screen.dart#L134) | Confirmed (minor) |
