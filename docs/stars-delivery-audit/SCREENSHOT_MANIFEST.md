# Screenshot Manifest

Index of every screenshot in [screenshots/](screenshots/). Screen IDs follow [SCREEN_INVENTORY.md](SCREEN_INVENTORY.md). Back to the [master report](STARS_DELIVERY_MASTER_REPORT.md).

## How the images were produced (read this first)

No Android emulator, iOS simulator or physical device was available on the audit machine (`flutter devices` listed only Windows desktop and Edge web). The app also cannot run as-is on those two targets:

- **Web:** `ApiConfig.init()` calls `dart:io` `Platform`, which throws on web.
- **Windows desktop:** outside Android debug builds the app requires an HTTPS `STARS_SERVER_URL`, and no trusted local certificate was available. Installing one would mean changing system security settings, which the audit did not do.

Two capture methods were used instead. **Neither produced synthetic or mock-up images.** Every pixel comes from the project's real UI code.

| Method | What it is | Used for | Limits |
|---|---|---|---|
| **A. Flutter widget-test rasterization** | The real screen widgets from `lib/` are pumped inside `flutter test` using the project's `Ux03Harness` and its `MobileApiClient.testAdapter` hook. A Dio adapter serves synthetic fixtures, and the frame is rasterized with `RepaintBoundary.toImage(pixelRatio: 2)`. The default test font was swapped for Windows Segoe UI, loaded as "Roboto", so Arabic glyphs render. | All mobile screens and dialogs (SCREEN-/DIALOG-) | **Not device screenshots.** There is no status bar or system chrome. Fonts differ from a device (Segoe UI instead of Roboto/Noto). Map tiles do not load. Platform plugins (GPS, Firebase, path_provider) are absent. Only the viewport is captured, not the full scroll height. |
| **B. Real browser screenshots** | The real backend (`src/index.js`) booted against a throwaway in-memory MongoDB 8.2.6 seeded with synthetic users and orders. Every environment variable was overridden so no real database, SMTP or Firebase was used. Logged in with a generated test admin, then captured with headless Microsoft Edge 157 over the DevTools protocol. | Admin dashboard (ADMIN-) | Synthetic data. Native `confirm()`/`prompt()` dialogs cannot be captured this way. |

The capture scripts are in [tooling/](tooling/), as `.txt` files so the analyzer and test runner ignore them. The two temporary Flutter harnesses were copied into `test/`, run, and deleted immediately. The demo server was stopped and its generated credentials file was deleted.

**Fixture data is synthetic.** Names like "Driver Alpha" and "Test Customer", the `example.test` emails and the `05900000xx` phone numbers are invented. No real customer data appears in any image.

> **Device screenshots added later:** 29 real Android emulator screenshots are in [screenshots/device/](screenshots/device/), described in [DEVICE_TEST_REPORT.md](DEVICE_TEST_REPORT.md).

## Coverage summary

- Inventory items: **67** (24 screens, 15 dialogs, 28 admin views/modals)
- Items with at least one capture: **49**. Not captured: **18** (listed below with reasons and procedures)
- Image files: **180** (160 Flutter rasterizations + 20 admin browser screenshots)
- Variants: `ar-light` (default app locale, RTL), `en-light` (LTR), `ar-dark` (dark theme). Mobile states captured: default/populated, loading (responses delayed 3 s, captured at 300 ms), empty, error (every request returns HTTP 500), validation, dialogs, a 1.6× text scale and a 320 px-wide phone.

| ID | Name | Status | States captured | Files |
|---|---|---|---|---|
| SCREEN-001 | App shell & session-restore gate | **NOT CAPTURED** | — | 0 |
| SCREEN-002 | Login | CAPTURED | default, driver-role, validation | 6 |
| SCREEN-003 | Registration (customer / provider) | CAPTURED | customer-default, customer-scrolled, customer-validation, driver-default, driver-scrolled, driver-validation | 12 |
| SCREEN-004 | Password recovery (2 steps) | CAPTURED | populated, validation | 5 |
| SCREEN-005 | Forced password change | CAPTURED | populated | 3 |
| SCREEN-006 | Customer home | CAPTURED | empty, error, loading, populated, scrolled, textscale160 | 9 |
| SCREEN-007 | Create order | CAPTURED | populated, type-selected, validation | 7 |
| SCREEN-008 | My orders (4 configurations) | CAPTURED | empty, error, loading, populated | 6 |
| SCREEN-009 | Order offers | CAPTURED | empty, error, loading, opened-from-008-card-tap, outside-area, populated | 9 |
| SCREEN-010 | Driver tracking map | CAPTURED | empty, error, loading, location-unavailable | 6 |
| SCREEN-011 | Order report (read-only) | CAPTURED | empty, error, loading, populated | 6 |
| SCREEN-012 | Report a driver / customer | CAPTURED | populated | 3 |
| SCREEN-013 | Support chat | CAPTURED | empty, error, loading, populated | 6 |
| SCREEN-014 | Notifications | CAPTURED | empty, error, loading, populated | 6 |
| SCREEN-015 | Profile | CAPTURED | populated, scrolled | 5 |
| SCREEN-016 | Settings | CAPTURED | populated | 3 |
| SCREEN-017 | Provider home (dashboard) | CAPTURED | empty, error, loading, populated, populated-320w, unavailable | 8 |
| SCREEN-018 | New (pending) orders | CAPTURED | autopushed-from-017, empty, populated | 9 |
| SCREEN-019 | Submit offer | CAPTURED | populated, validation | 5 |
| SCREEN-020 | Orders with submitted offers | CAPTURED | empty, populated | 6 |
| SCREEN-021 | Active deliveries | CAPTURED | empty, error, loading, populated | 6 |
| SCREEN-022 | Orders & offers report (rejected/not selected/delivered) | CAPTURED | empty, error, loading, populated | 6 |
| SCREEN-023 | Order detail (provider) | CAPTURED | empty, error, loading, populated | 6 |
| SCREEN-024 | Commission payment instructions | CAPTURED | populated | 3 |
| DIALOG-001 | Contact support (pre-login) | CAPTURED | default | 2 |
| DIALOG-002 | Terms of Service | **NOT CAPTURED** | — | 0 |
| DIALOG-003 | Privacy Policy | **NOT CAPTURED** | — | 0 |
| DIALOG-004 | Agreement required (declined) | **NOT CAPTURED** | — | 0 |
| DIALOG-005 | Logout confirmation | CAPTURED | default | 3 |
| DIALOG-006 | Governorate-scope warning (5 s wait) | **NOT CAPTURED** | — | 0 |
| DIALOG-007 | Rate driver | CAPTURED | default | 2 |
| DIALOG-008 | Reject delivery confirmation | CAPTURED | default | 2 |
| DIALOG-009 | Cancel order confirmation | CAPTURED | default | 2 |
| DIALOG-010 | Driver no longer available | **NOT CAPTURED** | — | 0 |
| DIALOG-011 | Offer conflict (Arabic-only) | CAPTURED | default | 2 |
| DIALOG-012 | Accept out-of-area driver | CAPTURED | default | 2 |
| DIALOG-013 | Notification detail | CAPTURED | default | 2 |
| DIALOG-014 | Confirm email change (password prompt) | **NOT CAPTURED** | — | 0 |
| DIALOG-015 | Reject order confirmation | CAPTURED | default | 2 |
| ADMIN-001 | Admin login | CAPTURED | default | 2 |
| ADMIN-002 | Dashboard | CAPTURED | populated | 2 |
| ADMIN-003 | Orders | CAPTURED | populated | 2 |
| ADMIN-004 | Drivers management | CAPTURED | populated | 1 |
| ADMIN-005 | Users management | CAPTURED | populated | 1 |
| ADMIN-006 | Commissions | CAPTURED | populated | 1 |
| ADMIN-007 | Add driver | CAPTURED | populated | 1 |
| ADMIN-008 | Pending provider registrations | CAPTURED | populated | 1 |
| ADMIN-009 | Driver reports | CAPTURED | populated | 1 |
| ADMIN-010 | User reports | CAPTURED | populated | 1 |
| ADMIN-011 | Support conversations | CAPTURED | populated | 1 |
| ADMIN-012 | Broadcast to drivers | CAPTURED | populated | 1 |
| ADMIN-013 | Broadcast to users | CAPTURED | populated | 1 |
| ADMIN-014 | Ads | CAPTURED | populated | 1 |
| ADMIN-015 | Areas | CAPTURED | populated | 1 |
| ADMIN-016 | Settings (logout, password, 2FA, commission) | CAPTURED | populated | 1 |
| ADMIN-017 | Driver documents modal | **NOT CAPTURED** | — | 0 |
| ADMIN-018 | Driver orders report modal | **NOT CAPTURED** | — | 0 |
| ADMIN-019 | User orders modal | **NOT CAPTURED** | — | 0 |
| ADMIN-020 | Report detail & reply modal | **NOT CAPTURED** | — | 0 |
| ADMIN-021 | Order details modal | CAPTURED | default | 1 |
| ADMIN-022 | Driver reject/delivery report modal | **NOT CAPTURED** | — | 0 |
| ADMIN-023 | List modal (stat drill-down / payouts) | **NOT CAPTURED** | — | 0 |
| ADMIN-024 | Driver edit modal | **NOT CAPTURED** | — | 0 |
| ADMIN-025 | Admin password reset modal | **NOT CAPTURED** | — | 0 |
| ADMIN-026 | Direct chat modal (legacy) | **NOT CAPTURED** | — | 0 |
| ADMIN-027 | Native confirm() dialogs (15) | **NOT CAPTURED** | — | 0 |
| ADMIN-028 | Native prompt() flows (password change, 2FA) | **NOT CAPTURED** | — | 0 |

## Not captured: reasons and reproducible procedures

| ID | Reason | Procedure |
|---|---|---|
| SCREEN-001 App shell & session-restore gate | Transient: the session-restore gate shows only while `AuthBloc` validates a stored token, then replaces itself with login or home. | Pump `SwiforaApp` with `checkOnStart: true`, a `TokenVault` that returns a token, and an `AuthGateway.validateSession` that waits 3 s. Capture at 300 ms. |
| DIALOG-002 Terms of Service | Needs a valid registration form submit (SCREEN-003 not reached). | Reach SCREEN-003, fill valid synthetic data, submit, and capture the Terms dialog. |
| DIALOG-003 Privacy Policy | Opens only after Agree on DIALOG-002. | From DIALOG-002 tap Agree, then capture. |
| DIALOG-004 Agreement required (declined) | Opens only on Decline in DIALOG-002/003. | From DIALOG-002 tap Decline, then capture. |
| DIALOG-006 Governorate-scope warning (5 s wait) | Needs the governorate-level scope toggle flow. | On SCREEN-007, enable the governorate-scope switch (user `governorateLevel=false`) and capture during the 5 s countdown and after it. |
| DIALOG-010 Driver no longer available | Opened by a socket `offer_cancelled` event. | Inject a socket event through `SocketService.testInstance` while SCREEN-009 is open. |
| DIALOG-014 Confirm email change (password prompt) | Needs an email edit plus Save on the profile. | Edit the email field on SCREEN-015, tap Save, then capture the password prompt. |
| ADMIN-017 Driver documents modal | Needs a provider with uploaded documents. Uploads were removed in HEAD, so the seed had none. | Seed `providerDocuments` metadata plus files in `PROVIDER_DOCUMENTS_DIR`, then open from Drivers. |
| ADMIN-018 Driver orders report modal | Not opened in the automated pass. | On Drivers, search a driver and open their orders report. |
| ADMIN-019 User orders modal | Not opened in the automated pass. | On Users, search a user and open their orders. |
| ADMIN-020 Report detail & reply modal | There were no reports in the seed data. | Seed a `Report` document, then open it from Driver/User reports. |
| ADMIN-022 Driver reject/delivery report modal | Not opened in the automated pass. | Open from a driver search result. |
| ADMIN-023 List modal (stat drill-down / payouts) | Not opened in the automated pass. | Click a dashboard stat card. |
| ADMIN-024 Driver edit modal | No UI trigger found in the code (see SCREEN_INVENTORY). | Only reachable by calling the modal-opening function from the console. Possibly dead UI. |
| ADMIN-025 Admin password reset modal | Not opened in the automated pass. | Settings, then the change-password action. |
| ADMIN-026 Direct chat modal (legacy) | Legacy modal, not opened. | Driver/User search result, then the chat button. |
| ADMIN-027 Native confirm() dialogs (15) | Native browser `confirm()`. CDP page screenshots do not include native dialogs. | Capture the OS window manually, or stub `window.confirm` to log the message text. |
| ADMIN-028 Native prompt() flows (password change, 2FA) | Native browser `prompt()`. Same limitation as above. | As for ADMIN-027. |

To capture on a real device, the project owner needs to provide a reachable **HTTPS staging backend URL** (`--dart-define=STARS_SERVER_URL=...`) or a debug Android device on the same LAN, plus **synthetic test accounts** for the customer, driver and admin roles. Then run `flutter run --dart-define=STARS_SERVER_URL=https://<staging>` and save the device screenshots as `<ID>-device-<state>.png`.

## Notable states (worth looking at first)

| File | Why it matters |
|---|---|
| [SCREEN-008-error-ar-light.png](screenshots/SCREEN-008-error-ar-light.png) | HTTP 500 is shown as "No orders" (RISK-045) |
| [SCREEN-017-error-ar-light.png](screenshots/SCREEN-017-error-ar-light.png) | HTTP 500 is shown as an all-zero driver dashboard with no error message (RISK-044) |
| [SCREEN-018-autopushed-from-017-ar-light.png](screenshots/SCREEN-018-autopushed-from-017-ar-light.png) | Driver home opens New Orders by itself when pending orders appear |
| [SCREEN-006-textscale160-ar-light.png](screenshots/SCREEN-006-textscale160-ar-light.png) | Ad banner overflow at 1.6× text scale (RISK-048) |
| [DIALOG-009-default-ar-light.png](screenshots/DIALOG-009-default-ar-light.png) | "إلغاء" (dismiss) vs "إلغاء الطلب" (cancel order) wording is ambiguous |
| [ADMIN-002-populated-mobile.png](screenshots/ADMIN-002-populated-mobile.png) | Admin sidebar does not collapse at 390 px (RISK-049) |

## File-by-file manifest

Method A = Flutter widget-test rasterization, logical 390×844 phone at 2× (780×1688 px) unless noted. Method B = headless Edge 157 screenshot, 1440×900 desktop or 390×844 mobile emulation, at 1×.

| File | Screen | State | Locale/theme | Resolution | Method | Source | Note |
|---|---|---|---|---|---|---|---|
| [ADMIN-001-default-desktop.png](screenshots/ADMIN-001-default-desktop.png) | ADMIN-001 | default | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | login page |
| [ADMIN-001-default-mobile.png](screenshots/ADMIN-001-default-mobile.png) | ADMIN-001 | default | ar-dark (mobile) | 390×844 | B | `swifora_backend/src/views/admin/` | login page at 390px |
| [ADMIN-002-populated-desktop.png](screenshots/ADMIN-002-populated-desktop.png) | ADMIN-002 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=dashboard] |
| [ADMIN-002-populated-mobile.png](screenshots/ADMIN-002-populated-mobile.png) | ADMIN-002 | populated | ar-dark (mobile) | 390×844 | B | `swifora_backend/src/views/admin/` | [data-page=dashboard] at 390px |
| [ADMIN-003-populated-desktop.png](screenshots/ADMIN-003-populated-desktop.png) | ADMIN-003 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=orders] |
| [ADMIN-003-populated-mobile.png](screenshots/ADMIN-003-populated-mobile.png) | ADMIN-003 | populated | ar-dark (mobile) | 390×844 | B | `swifora_backend/src/views/admin/` | [data-page=orders] at 390px |
| [ADMIN-004-populated-desktop.png](screenshots/ADMIN-004-populated-desktop.png) | ADMIN-004 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=drivers] |
| [ADMIN-005-populated-desktop.png](screenshots/ADMIN-005-populated-desktop.png) | ADMIN-005 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=users] |
| [ADMIN-006-populated-desktop.png](screenshots/ADMIN-006-populated-desktop.png) | ADMIN-006 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=commissions] |
| [ADMIN-007-populated-desktop.png](screenshots/ADMIN-007-populated-desktop.png) | ADMIN-007 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=add-driver] |
| [ADMIN-008-populated-desktop.png](screenshots/ADMIN-008-populated-desktop.png) | ADMIN-008 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=pending-providers] |
| [ADMIN-009-populated-desktop.png](screenshots/ADMIN-009-populated-desktop.png) | ADMIN-009 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=driver-reports] |
| [ADMIN-010-populated-desktop.png](screenshots/ADMIN-010-populated-desktop.png) | ADMIN-010 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=user-reports] |
| [ADMIN-011-populated-desktop.png](screenshots/ADMIN-011-populated-desktop.png) | ADMIN-011 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=support-chat] |
| [ADMIN-012-populated-desktop.png](screenshots/ADMIN-012-populated-desktop.png) | ADMIN-012 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=broadcast-drivers] |
| [ADMIN-013-populated-desktop.png](screenshots/ADMIN-013-populated-desktop.png) | ADMIN-013 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=broadcast-users] |
| [ADMIN-014-populated-desktop.png](screenshots/ADMIN-014-populated-desktop.png) | ADMIN-014 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=ads] |
| [ADMIN-015-populated-desktop.png](screenshots/ADMIN-015-populated-desktop.png) | ADMIN-015 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=areas] |
| [ADMIN-016-populated-desktop.png](screenshots/ADMIN-016-populated-desktop.png) | ADMIN-016 | populated | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | sidebar [data-page=settings] |
| [ADMIN-021-default-desktop.png](screenshots/ADMIN-021-default-desktop.png) | ADMIN-021 | default | ar-dark (desktop) | 1440×900 | B | `swifora_backend/src/views/admin/` | clicked button "تفاصيل" on orders page |
| [DIALOG-001-default-ar-light.png](screenshots/DIALOG-001-default-ar-light.png) | DIALOG-001 | default | ar-light | 780×1688 | A | `lib/screens/login_screen.dart` | Login -> Contact support |
| [DIALOG-001-default-en-light.png](screenshots/DIALOG-001-default-en-light.png) | DIALOG-001 | default | en-light | 780×1688 | A | `lib/screens/login_screen.dart` | Login -> Contact support |
| [DIALOG-005-default-ar-dark.png](screenshots/DIALOG-005-default-ar-dark.png) | DIALOG-005 | default | ar-dark | 780×1688 | A | `lib/widgets/ui/app_confirm_dialog.dart` | tapped Icons.logout on HomeScreen |
| [DIALOG-005-default-ar-light.png](screenshots/DIALOG-005-default-ar-light.png) | DIALOG-005 | default | ar-light | 780×1688 | A | `lib/widgets/ui/app_confirm_dialog.dart` | tapped Icons.logout on HomeScreen |
| [DIALOG-005-default-en-light.png](screenshots/DIALOG-005-default-en-light.png) | DIALOG-005 | default | en-light | 780×1688 | A | `lib/widgets/ui/app_confirm_dialog.dart` | tapped Icons.logout on HomeScreen |
| [DIALOG-007-default-ar-light.png](screenshots/DIALOG-007-default-ar-light.png) | DIALOG-007 | default | ar-light | 780×1688 | A | `lib/screens/my_orders_screen.dart` | MyOrders -> Approve delivery -> rating prompt |
| [DIALOG-007-default-en-light.png](screenshots/DIALOG-007-default-en-light.png) | DIALOG-007 | default | en-light | 780×1688 | A | `lib/screens/my_orders_screen.dart` | MyOrders -> Approve delivery -> rating prompt |
| [DIALOG-008-default-ar-light.png](screenshots/DIALOG-008-default-ar-light.png) | DIALOG-008 | default | ar-light | 780×1688 | A | `lib/widgets/ui/app_confirm_dialog.dart (from my_orders_screen.dart)` | MyOrders -> Reject delivery |
| [DIALOG-008-default-en-light.png](screenshots/DIALOG-008-default-en-light.png) | DIALOG-008 | default | en-light | 780×1688 | A | `lib/widgets/ui/app_confirm_dialog.dart (from my_orders_screen.dart)` | MyOrders -> Reject delivery |
| [DIALOG-009-default-ar-light.png](screenshots/DIALOG-009-default-ar-light.png) | DIALOG-009 | default | ar-light | 780×1688 | A | `lib/widgets/ui/app_confirm_dialog.dart (from my_orders_screen.dart)` | MyOrders -> Cancel Order |
| [DIALOG-009-default-en-light.png](screenshots/DIALOG-009-default-en-light.png) | DIALOG-009 | default | en-light | 780×1688 | A | `lib/widgets/ui/app_confirm_dialog.dart (from my_orders_screen.dart)` | MyOrders -> Cancel Order |
| [DIALOG-011-default-ar-light.png](screenshots/DIALOG-011-default-ar-light.png) | DIALOG-011 | default | ar-light | 780×1688 | A | `lib/screens/order_offers_screen.dart` | Accept -> HTTP 409 {conflict:true} |
| [DIALOG-011-default-en-light.png](screenshots/DIALOG-011-default-en-light.png) | DIALOG-011 | default | en-light | 780×1688 | A | `lib/screens/order_offers_screen.dart` | Accept -> HTTP 409 {conflict:true} |
| [DIALOG-012-default-ar-light.png](screenshots/DIALOG-012-default-ar-light.png) | DIALOG-012 | default | ar-light | 780×1688 | A | `lib/widgets/ui/app_confirm_dialog.dart (from order_offers_screen.dart)` | Accept on outside-area offer |
| [DIALOG-012-default-en-light.png](screenshots/DIALOG-012-default-en-light.png) | DIALOG-012 | default | en-light | 780×1688 | A | `lib/widgets/ui/app_confirm_dialog.dart (from order_offers_screen.dart)` | Accept on outside-area offer |
| [DIALOG-013-default-ar-light.png](screenshots/DIALOG-013-default-ar-light.png) | DIALOG-013 | default | ar-light | 780×1688 | A | `lib/screens/notifications_screen.dart` | Notifications -> tap broadcast item |
| [DIALOG-013-default-en-light.png](screenshots/DIALOG-013-default-en-light.png) | DIALOG-013 | default | en-light | 780×1688 | A | `lib/screens/notifications_screen.dart` | Notifications -> tap broadcast item |
| [DIALOG-015-default-ar-light.png](screenshots/DIALOG-015-default-ar-light.png) | DIALOG-015 | default | ar-light | 780×1688 | A | `lib/widgets/ui/app_confirm_dialog.dart (from pending_orders_screen.dart)` | PendingOrders -> Reject Order |
| [DIALOG-015-default-en-light.png](screenshots/DIALOG-015-default-en-light.png) | DIALOG-015 | default | en-light | 780×1688 | A | `lib/widgets/ui/app_confirm_dialog.dart (from pending_orders_screen.dart)` | PendingOrders -> Reject Order |
| [SCREEN-002-default-ar-dark.png](screenshots/SCREEN-002-default-ar-dark.png) | SCREEN-002 | default | ar-dark | 780×1688 | A | `lib/screens/login_screen.dart` | SwiforaApp -> LoginScreen |
| [SCREEN-002-default-ar-light.png](screenshots/SCREEN-002-default-ar-light.png) | SCREEN-002 | default | ar-light | 780×1688 | A | `lib/screens/login_screen.dart` | SwiforaApp -> LoginScreen |
| [SCREEN-002-default-en-light.png](screenshots/SCREEN-002-default-en-light.png) | SCREEN-002 | default | en-light | 780×1688 | A | `lib/screens/login_screen.dart` | SwiforaApp -> LoginScreen |
| [SCREEN-002-driver-role-ar-light.png](screenshots/SCREEN-002-driver-role-ar-light.png) | SCREEN-002 | driver-role | ar-light | 780×1688 | A | `lib/screens/login_screen.dart` | Login with Driver role selected |
| [SCREEN-002-driver-role-en-light.png](screenshots/SCREEN-002-driver-role-en-light.png) | SCREEN-002 | driver-role | en-light | 780×1688 | A | `lib/screens/login_screen.dart` | Login with Driver role selected |
| [SCREEN-002-validation-ar-light.png](screenshots/SCREEN-002-validation-ar-light.png) | SCREEN-002 | validation | ar-light | 780×1688 | A | `lib/screens/login_screen.dart` | Tapped first ElevatedButton with empty fields |
| [SCREEN-003-customer-default-ar-light.png](screenshots/SCREEN-003-customer-default-ar-light.png) | SCREEN-003 | customer-default | ar-light | 780×1688 | A | `lib/screens/login_screen.dart` | Login -> sign-up toggle (customer) |
| [SCREEN-003-customer-default-en-light.png](screenshots/SCREEN-003-customer-default-en-light.png) | SCREEN-003 | customer-default | en-light | 780×1688 | A | `lib/screens/login_screen.dart` | Login -> sign-up toggle (customer) |
| [SCREEN-003-customer-scrolled-ar-light.png](screenshots/SCREEN-003-customer-scrolled-ar-light.png) | SCREEN-003 | customer-scrolled | ar-light | 780×1688 | A | `lib/screens/login_screen.dart` | registration form scrolled |
| [SCREEN-003-customer-scrolled-en-light.png](screenshots/SCREEN-003-customer-scrolled-en-light.png) | SCREEN-003 | customer-scrolled | en-light | 780×1688 | A | `lib/screens/login_screen.dart` | registration form scrolled |
| [SCREEN-003-customer-validation-ar-light.png](screenshots/SCREEN-003-customer-validation-ar-light.png) | SCREEN-003 | customer-validation | ar-light | 780×1688 | A | `lib/screens/login_screen.dart` | submit with empty fields |
| [SCREEN-003-customer-validation-en-light.png](screenshots/SCREEN-003-customer-validation-en-light.png) | SCREEN-003 | customer-validation | en-light | 780×1688 | A | `lib/screens/login_screen.dart` | submit with empty fields |
| [SCREEN-003-driver-default-ar-light.png](screenshots/SCREEN-003-driver-default-ar-light.png) | SCREEN-003 | driver-default | ar-light | 780×1688 | A | `lib/screens/login_screen.dart` | Login -> sign-up toggle (driver) |
| [SCREEN-003-driver-default-en-light.png](screenshots/SCREEN-003-driver-default-en-light.png) | SCREEN-003 | driver-default | en-light | 780×1688 | A | `lib/screens/login_screen.dart` | Login -> sign-up toggle (driver) |
| [SCREEN-003-driver-scrolled-ar-light.png](screenshots/SCREEN-003-driver-scrolled-ar-light.png) | SCREEN-003 | driver-scrolled | ar-light | 780×1688 | A | `lib/screens/login_screen.dart` | registration form scrolled |
| [SCREEN-003-driver-scrolled-en-light.png](screenshots/SCREEN-003-driver-scrolled-en-light.png) | SCREEN-003 | driver-scrolled | en-light | 780×1688 | A | `lib/screens/login_screen.dart` | registration form scrolled |
| [SCREEN-003-driver-validation-ar-light.png](screenshots/SCREEN-003-driver-validation-ar-light.png) | SCREEN-003 | driver-validation | ar-light | 780×1688 | A | `lib/screens/login_screen.dart` | submit with empty fields |
| [SCREEN-003-driver-validation-en-light.png](screenshots/SCREEN-003-driver-validation-en-light.png) | SCREEN-003 | driver-validation | en-light | 780×1688 | A | `lib/screens/login_screen.dart` | submit with empty fields |
| [SCREEN-004-populated-ar-dark.png](screenshots/SCREEN-004-populated-ar-dark.png) | SCREEN-004 | populated | ar-dark | 780×1688 | A | `lib/screens/forgot_password_screen.dart` | populated fixtures |
| [SCREEN-004-populated-ar-light.png](screenshots/SCREEN-004-populated-ar-light.png) | SCREEN-004 | populated | ar-light | 780×1688 | A | `lib/screens/forgot_password_screen.dart` | populated fixtures |
| [SCREEN-004-populated-en-light.png](screenshots/SCREEN-004-populated-en-light.png) | SCREEN-004 | populated | en-light | 780×1688 | A | `lib/screens/forgot_password_screen.dart` | populated fixtures |
| [SCREEN-004-validation-ar-light.png](screenshots/SCREEN-004-validation-ar-light.png) | SCREEN-004 | validation | ar-light | 780×1688 | A | `lib/screens/forgot_password_screen.dart` | Submit with empty email |
| [SCREEN-004-validation-en-light.png](screenshots/SCREEN-004-validation-en-light.png) | SCREEN-004 | validation | en-light | 780×1688 | A | `lib/screens/forgot_password_screen.dart` | Submit with empty email |
| [SCREEN-005-populated-ar-dark.png](screenshots/SCREEN-005-populated-ar-dark.png) | SCREEN-005 | populated | ar-dark | 780×1688 | A | `lib/screens/force_change_password_screen.dart` | populated fixtures |
| [SCREEN-005-populated-ar-light.png](screenshots/SCREEN-005-populated-ar-light.png) | SCREEN-005 | populated | ar-light | 780×1688 | A | `lib/screens/force_change_password_screen.dart` | populated fixtures |
| [SCREEN-005-populated-en-light.png](screenshots/SCREEN-005-populated-en-light.png) | SCREEN-005 | populated | en-light | 780×1688 | A | `lib/screens/force_change_password_screen.dart` | populated fixtures |
| [SCREEN-006-empty-ar-light.png](screenshots/SCREEN-006-empty-ar-light.png) | SCREEN-006 | empty | ar-light | 780×1688 | A | `lib/screens/home_screen.dart` | empty fixtures |
| [SCREEN-006-error-ar-light.png](screenshots/SCREEN-006-error-ar-light.png) | SCREEN-006 | error | ar-light | 780×1688 | A | `lib/screens/home_screen.dart` | HTTP 500 for every request |
| [SCREEN-006-loading-ar-light.png](screenshots/SCREEN-006-loading-ar-light.png) | SCREEN-006 | loading | ar-light | 780×1688 | A | `lib/screens/home_screen.dart` | responses delayed 3s; captured at 300ms |
| [SCREEN-006-populated-ar-dark.png](screenshots/SCREEN-006-populated-ar-dark.png) | SCREEN-006 | populated | ar-dark | 780×1688 | A | `lib/screens/home_screen.dart` | populated fixtures |
| [SCREEN-006-populated-ar-light.png](screenshots/SCREEN-006-populated-ar-light.png) | SCREEN-006 | populated | ar-light | 780×1688 | A | `lib/screens/home_screen.dart` | populated fixtures |
| [SCREEN-006-populated-en-light.png](screenshots/SCREEN-006-populated-en-light.png) | SCREEN-006 | populated | en-light | 780×1688 | A | `lib/screens/home_screen.dart` | populated fixtures |
| [SCREEN-006-scrolled-ar-light.png](screenshots/SCREEN-006-scrolled-ar-light.png) | SCREEN-006 | scrolled | ar-light | 780×1688 | A | `lib/screens/home_screen.dart` | Customer home scrolled |
| [SCREEN-006-scrolled-en-light.png](screenshots/SCREEN-006-scrolled-en-light.png) | SCREEN-006 | scrolled | en-light | 780×1688 | A | `lib/screens/home_screen.dart` | Customer home scrolled |
| [SCREEN-006-textscale160-ar-light.png](screenshots/SCREEN-006-textscale160-ar-light.png) | SCREEN-006 | textscale160 | ar-light | 780×1688 | A | `lib/screens/home_screen.dart` | textScaleFactor 1.6 |
| [SCREEN-007-populated-ar-dark.png](screenshots/SCREEN-007-populated-ar-dark.png) | SCREEN-007 | populated | ar-dark | 780×1688 | A | `lib/screens/create_order_screen.dart` | populated fixtures |
| [SCREEN-007-populated-ar-light.png](screenshots/SCREEN-007-populated-ar-light.png) | SCREEN-007 | populated | ar-light | 780×1688 | A | `lib/screens/create_order_screen.dart` | populated fixtures |
| [SCREEN-007-populated-en-light.png](screenshots/SCREEN-007-populated-en-light.png) | SCREEN-007 | populated | en-light | 780×1688 | A | `lib/screens/create_order_screen.dart` | populated fixtures |
| [SCREEN-007-type-selected-ar-light.png](screenshots/SCREEN-007-type-selected-ar-light.png) | SCREEN-007 | type-selected | ar-light | 780×1688 | A | `lib/screens/create_order_screen.dart` | Product type selected |
| [SCREEN-007-type-selected-en-light.png](screenshots/SCREEN-007-type-selected-en-light.png) | SCREEN-007 | type-selected | en-light | 780×1688 | A | `lib/screens/create_order_screen.dart` | Product type selected |
| [SCREEN-007-validation-ar-light.png](screenshots/SCREEN-007-validation-ar-light.png) | SCREEN-007 | validation | ar-light | 780×1688 | A | `lib/screens/create_order_screen.dart` | Submit with empty fields |
| [SCREEN-007-validation-en-light.png](screenshots/SCREEN-007-validation-en-light.png) | SCREEN-007 | validation | en-light | 780×1688 | A | `lib/screens/create_order_screen.dart` | Submit with empty fields |
| [SCREEN-008-empty-ar-light.png](screenshots/SCREEN-008-empty-ar-light.png) | SCREEN-008 | empty | ar-light | 780×1688 | A | `lib/screens/my_orders_screen.dart` | empty fixtures |
| [SCREEN-008-error-ar-light.png](screenshots/SCREEN-008-error-ar-light.png) | SCREEN-008 | error | ar-light | 780×1688 | A | `lib/screens/my_orders_screen.dart` | HTTP 500 for every request |
| [SCREEN-008-loading-ar-light.png](screenshots/SCREEN-008-loading-ar-light.png) | SCREEN-008 | loading | ar-light | 780×1688 | A | `lib/screens/my_orders_screen.dart` | responses delayed 3s; captured at 300ms |
| [SCREEN-008-populated-ar-dark.png](screenshots/SCREEN-008-populated-ar-dark.png) | SCREEN-008 | populated | ar-dark | 780×1688 | A | `lib/screens/my_orders_screen.dart` | populated fixtures |
| [SCREEN-008-populated-ar-light.png](screenshots/SCREEN-008-populated-ar-light.png) | SCREEN-008 | populated | ar-light | 780×1688 | A | `lib/screens/my_orders_screen.dart` | populated fixtures |
| [SCREEN-008-populated-en-light.png](screenshots/SCREEN-008-populated-en-light.png) | SCREEN-008 | populated | en-light | 780×1688 | A | `lib/screens/my_orders_screen.dart` | populated fixtures |
| [SCREEN-009-empty-ar-light.png](screenshots/SCREEN-009-empty-ar-light.png) | SCREEN-009 | empty | ar-light | 780×1688 | A | `lib/screens/order_offers_screen.dart` | empty fixtures |
| [SCREEN-009-error-ar-light.png](screenshots/SCREEN-009-error-ar-light.png) | SCREEN-009 | error | ar-light | 780×1688 | A | `lib/screens/order_offers_screen.dart` | HTTP 500 for every request |
| [SCREEN-009-loading-ar-light.png](screenshots/SCREEN-009-loading-ar-light.png) | SCREEN-009 | loading | ar-light | 780×1688 | A | `lib/screens/order_offers_screen.dart` | responses delayed 3s; captured at 300ms |
| [SCREEN-009-opened-from-008-card-tap-ar-light.png](screenshots/SCREEN-009-opened-from-008-card-tap-ar-light.png) | SCREEN-009 | opened-from-008-card-tap | ar-light | 780×1688 | A | `lib/screens/order_offers_screen.dart` | MyOrders -> Confirm Delivery (completionRequestedAt set) |
| [SCREEN-009-outside-area-ar-light.png](screenshots/SCREEN-009-outside-area-ar-light.png) | SCREEN-009 | outside-area | ar-light | 780×1688 | A | `lib/screens/order_offers_screen.dart` | offers flagged outsideArea |
| [SCREEN-009-outside-area-en-light.png](screenshots/SCREEN-009-outside-area-en-light.png) | SCREEN-009 | outside-area | en-light | 780×1688 | A | `lib/screens/order_offers_screen.dart` | offers flagged outsideArea |
| [SCREEN-009-populated-ar-dark.png](screenshots/SCREEN-009-populated-ar-dark.png) | SCREEN-009 | populated | ar-dark | 780×1688 | A | `lib/screens/order_offers_screen.dart` | populated fixtures |
| [SCREEN-009-populated-ar-light.png](screenshots/SCREEN-009-populated-ar-light.png) | SCREEN-009 | populated | ar-light | 780×1688 | A | `lib/screens/order_offers_screen.dart` | populated fixtures |
| [SCREEN-009-populated-en-light.png](screenshots/SCREEN-009-populated-en-light.png) | SCREEN-009 | populated | en-light | 780×1688 | A | `lib/screens/order_offers_screen.dart` | populated fixtures |
| [SCREEN-010-empty-ar-light.png](screenshots/SCREEN-010-empty-ar-light.png) | SCREEN-010 | empty | ar-light | 780×1688 | A | `lib/screens/order_tracking_screen.dart` | empty fixtures |
| [SCREEN-010-error-ar-light.png](screenshots/SCREEN-010-error-ar-light.png) | SCREEN-010 | error | ar-light | 780×1688 | A | `lib/screens/order_tracking_screen.dart` | HTTP 500 for every request |
| [SCREEN-010-loading-ar-light.png](screenshots/SCREEN-010-loading-ar-light.png) | SCREEN-010 | loading | ar-light | 780×1688 | A | `lib/screens/order_tracking_screen.dart` | responses delayed 3s; captured at 300ms |
| [SCREEN-010-location-unavailable-ar-dark.png](screenshots/SCREEN-010-location-unavailable-ar-dark.png) | SCREEN-010 | location-unavailable | ar-dark | 780×1688 | A | `lib/screens/order_tracking_screen.dart` | order loaded; fixture providerLocation used lat/lng keys (screen reads latitude/longitude) so the "not shared yet" state rendered; OSM tiles do not load in the test renderer |
| [SCREEN-010-location-unavailable-ar-light.png](screenshots/SCREEN-010-location-unavailable-ar-light.png) | SCREEN-010 | location-unavailable | ar-light | 780×1688 | A | `lib/screens/order_tracking_screen.dart` | order loaded; fixture providerLocation used lat/lng keys (screen reads latitude/longitude) so the "not shared yet" state rendered; OSM tiles do not load in the test renderer |
| [SCREEN-010-location-unavailable-en-light.png](screenshots/SCREEN-010-location-unavailable-en-light.png) | SCREEN-010 | location-unavailable | en-light | 780×1688 | A | `lib/screens/order_tracking_screen.dart` | order loaded; fixture providerLocation used lat/lng keys (screen reads latitude/longitude) so the "not shared yet" state rendered; OSM tiles do not load in the test renderer |
| [SCREEN-011-empty-ar-light.png](screenshots/SCREEN-011-empty-ar-light.png) | SCREEN-011 | empty | ar-light | 780×1688 | A | `lib/screens/order_report_screen.dart` | empty fixtures |
| [SCREEN-011-error-ar-light.png](screenshots/SCREEN-011-error-ar-light.png) | SCREEN-011 | error | ar-light | 780×1688 | A | `lib/screens/order_report_screen.dart` | HTTP 500 for every request |
| [SCREEN-011-loading-ar-light.png](screenshots/SCREEN-011-loading-ar-light.png) | SCREEN-011 | loading | ar-light | 780×1688 | A | `lib/screens/order_report_screen.dart` | responses delayed 3s; captured at 300ms |
| [SCREEN-011-populated-ar-dark.png](screenshots/SCREEN-011-populated-ar-dark.png) | SCREEN-011 | populated | ar-dark | 780×1688 | A | `lib/screens/order_report_screen.dart` | populated fixtures |
| [SCREEN-011-populated-ar-light.png](screenshots/SCREEN-011-populated-ar-light.png) | SCREEN-011 | populated | ar-light | 780×1688 | A | `lib/screens/order_report_screen.dart` | populated fixtures |
| [SCREEN-011-populated-en-light.png](screenshots/SCREEN-011-populated-en-light.png) | SCREEN-011 | populated | en-light | 780×1688 | A | `lib/screens/order_report_screen.dart` | populated fixtures |
| [SCREEN-012-populated-ar-dark.png](screenshots/SCREEN-012-populated-ar-dark.png) | SCREEN-012 | populated | ar-dark | 780×1688 | A | `lib/screens/report_screen.dart` | populated fixtures |
| [SCREEN-012-populated-ar-light.png](screenshots/SCREEN-012-populated-ar-light.png) | SCREEN-012 | populated | ar-light | 780×1688 | A | `lib/screens/report_screen.dart` | populated fixtures |
| [SCREEN-012-populated-en-light.png](screenshots/SCREEN-012-populated-en-light.png) | SCREEN-012 | populated | en-light | 780×1688 | A | `lib/screens/report_screen.dart` | populated fixtures |
| [SCREEN-013-empty-ar-light.png](screenshots/SCREEN-013-empty-ar-light.png) | SCREEN-013 | empty | ar-light | 780×1688 | A | `lib/screens/support_chat_screen.dart` | empty fixtures |
| [SCREEN-013-error-ar-light.png](screenshots/SCREEN-013-error-ar-light.png) | SCREEN-013 | error | ar-light | 780×1688 | A | `lib/screens/support_chat_screen.dart` | HTTP 500 for every request |
| [SCREEN-013-loading-ar-light.png](screenshots/SCREEN-013-loading-ar-light.png) | SCREEN-013 | loading | ar-light | 780×1688 | A | `lib/screens/support_chat_screen.dart` | responses delayed 3s; captured at 300ms |
| [SCREEN-013-populated-ar-dark.png](screenshots/SCREEN-013-populated-ar-dark.png) | SCREEN-013 | populated | ar-dark | 780×1688 | A | `lib/screens/support_chat_screen.dart` | populated fixtures |
| [SCREEN-013-populated-ar-light.png](screenshots/SCREEN-013-populated-ar-light.png) | SCREEN-013 | populated | ar-light | 780×1688 | A | `lib/screens/support_chat_screen.dart` | populated fixtures |
| [SCREEN-013-populated-en-light.png](screenshots/SCREEN-013-populated-en-light.png) | SCREEN-013 | populated | en-light | 780×1688 | A | `lib/screens/support_chat_screen.dart` | populated fixtures |
| [SCREEN-014-empty-ar-light.png](screenshots/SCREEN-014-empty-ar-light.png) | SCREEN-014 | empty | ar-light | 780×1688 | A | `lib/screens/notifications_screen.dart` | empty fixtures |
| [SCREEN-014-error-ar-light.png](screenshots/SCREEN-014-error-ar-light.png) | SCREEN-014 | error | ar-light | 780×1688 | A | `lib/screens/notifications_screen.dart` | HTTP 500 for every request |
| [SCREEN-014-loading-ar-light.png](screenshots/SCREEN-014-loading-ar-light.png) | SCREEN-014 | loading | ar-light | 780×1688 | A | `lib/screens/notifications_screen.dart` | responses delayed 3s; captured at 300ms |
| [SCREEN-014-populated-ar-dark.png](screenshots/SCREEN-014-populated-ar-dark.png) | SCREEN-014 | populated | ar-dark | 780×1688 | A | `lib/screens/notifications_screen.dart` | populated fixtures |
| [SCREEN-014-populated-ar-light.png](screenshots/SCREEN-014-populated-ar-light.png) | SCREEN-014 | populated | ar-light | 780×1688 | A | `lib/screens/notifications_screen.dart` | populated fixtures |
| [SCREEN-014-populated-en-light.png](screenshots/SCREEN-014-populated-en-light.png) | SCREEN-014 | populated | en-light | 780×1688 | A | `lib/screens/notifications_screen.dart` | populated fixtures |
| [SCREEN-015-populated-ar-dark.png](screenshots/SCREEN-015-populated-ar-dark.png) | SCREEN-015 | populated | ar-dark | 780×1688 | A | `lib/screens/profile_screen.dart` | populated fixtures |
| [SCREEN-015-populated-ar-light.png](screenshots/SCREEN-015-populated-ar-light.png) | SCREEN-015 | populated | ar-light | 780×1688 | A | `lib/screens/profile_screen.dart` | populated fixtures |
| [SCREEN-015-populated-en-light.png](screenshots/SCREEN-015-populated-en-light.png) | SCREEN-015 | populated | en-light | 780×1688 | A | `lib/screens/profile_screen.dart` | populated fixtures |
| [SCREEN-015-scrolled-ar-light.png](screenshots/SCREEN-015-scrolled-ar-light.png) | SCREEN-015 | scrolled | ar-light | 780×1688 | A | `lib/screens/profile_screen.dart` | Profile scrolled down |
| [SCREEN-015-scrolled-en-light.png](screenshots/SCREEN-015-scrolled-en-light.png) | SCREEN-015 | scrolled | en-light | 780×1688 | A | `lib/screens/profile_screen.dart` | Profile scrolled down |
| [SCREEN-016-populated-ar-dark.png](screenshots/SCREEN-016-populated-ar-dark.png) | SCREEN-016 | populated | ar-dark | 780×1688 | A | `lib/screens/settings_screen.dart` | populated fixtures |
| [SCREEN-016-populated-ar-light.png](screenshots/SCREEN-016-populated-ar-light.png) | SCREEN-016 | populated | ar-light | 780×1688 | A | `lib/screens/settings_screen.dart` | populated fixtures |
| [SCREEN-016-populated-en-light.png](screenshots/SCREEN-016-populated-en-light.png) | SCREEN-016 | populated | en-light | 780×1688 | A | `lib/screens/settings_screen.dart` | populated fixtures |
| [SCREEN-017-empty-ar-light.png](screenshots/SCREEN-017-empty-ar-light.png) | SCREEN-017 | empty | ar-light | 780×1688 | A | `lib/screens/provider_home_screen.dart` | empty fixtures |
| [SCREEN-017-error-ar-light.png](screenshots/SCREEN-017-error-ar-light.png) | SCREEN-017 | error | ar-light | 780×1688 | A | `lib/screens/provider_home_screen.dart` | HTTP 500 for every request |
| [SCREEN-017-loading-ar-light.png](screenshots/SCREEN-017-loading-ar-light.png) | SCREEN-017 | loading | ar-light | 780×1688 | A | `lib/screens/provider_home_screen.dart` | responses delayed 3s; captured at 300ms |
| [SCREEN-017-populated-ar-light.png](screenshots/SCREEN-017-populated-ar-light.png) | SCREEN-017 | populated | ar-light | 780×1688 | A | `lib/screens/provider_home_screen.dart` | stats populated, no pending orders (no auto-push) |
| [SCREEN-017-populated-en-light.png](screenshots/SCREEN-017-populated-en-light.png) | SCREEN-017 | populated | en-light | 780×1688 | A | `lib/screens/provider_home_screen.dart` | stats populated, no pending orders (no auto-push) |
| [SCREEN-017-populated-320w-ar-light.png](screenshots/SCREEN-017-populated-320w-ar-light.png) | SCREEN-017 | populated-320w | ar-light | 640×1136 | A | `lib/screens/provider_home_screen.dart` | 320x568 logical viewport |
| [SCREEN-017-unavailable-ar-light.png](screenshots/SCREEN-017-unavailable-ar-light.png) | SCREEN-017 | unavailable | ar-light | 780×1688 | A | `lib/screens/provider_home_screen.dart` | isAvailable=false |
| [SCREEN-017-unavailable-en-light.png](screenshots/SCREEN-017-unavailable-en-light.png) | SCREEN-017 | unavailable | en-light | 780×1688 | A | `lib/screens/provider_home_screen.dart` | isAvailable=false |
| [SCREEN-018-autopushed-from-017-ar-dark.png](screenshots/SCREEN-018-autopushed-from-017-ar-dark.png) | SCREEN-018 | autopushed-from-017 | ar-dark | 780×1688 | A | `lib/screens/pending_orders_screen.dart` | populated fixtures |
| [SCREEN-018-autopushed-from-017-ar-light.png](screenshots/SCREEN-018-autopushed-from-017-ar-light.png) | SCREEN-018 | autopushed-from-017 | ar-light | 780×1688 | A | `lib/screens/pending_orders_screen.dart` | populated fixtures |
| [SCREEN-018-autopushed-from-017-en-light.png](screenshots/SCREEN-018-autopushed-from-017-en-light.png) | SCREEN-018 | autopushed-from-017 | en-light | 780×1688 | A | `lib/screens/pending_orders_screen.dart` | populated fixtures |
| [SCREEN-018-empty-ar-dark.png](screenshots/SCREEN-018-empty-ar-dark.png) | SCREEN-018 | empty | ar-dark | 780×1688 | A | `lib/screens/pending_orders_screen.dart` | populated fixtures |
| [SCREEN-018-empty-ar-light.png](screenshots/SCREEN-018-empty-ar-light.png) | SCREEN-018 | empty | ar-light | 780×1688 | A | `lib/screens/pending_orders_screen.dart` | populated fixtures |
| [SCREEN-018-empty-en-light.png](screenshots/SCREEN-018-empty-en-light.png) | SCREEN-018 | empty | en-light | 780×1688 | A | `lib/screens/pending_orders_screen.dart` | populated fixtures |
| [SCREEN-018-populated-ar-dark.png](screenshots/SCREEN-018-populated-ar-dark.png) | SCREEN-018 | populated | ar-dark | 780×1688 | A | `lib/screens/pending_orders_screen.dart` | populated fixtures |
| [SCREEN-018-populated-ar-light.png](screenshots/SCREEN-018-populated-ar-light.png) | SCREEN-018 | populated | ar-light | 780×1688 | A | `lib/screens/pending_orders_screen.dart` | populated fixtures |
| [SCREEN-018-populated-en-light.png](screenshots/SCREEN-018-populated-en-light.png) | SCREEN-018 | populated | en-light | 780×1688 | A | `lib/screens/pending_orders_screen.dart` | populated fixtures |
| [SCREEN-019-populated-ar-dark.png](screenshots/SCREEN-019-populated-ar-dark.png) | SCREEN-019 | populated | ar-dark | 780×1688 | A | `lib/screens/submit_offer_screen.dart` | populated fixtures |
| [SCREEN-019-populated-ar-light.png](screenshots/SCREEN-019-populated-ar-light.png) | SCREEN-019 | populated | ar-light | 780×1688 | A | `lib/screens/submit_offer_screen.dart` | populated fixtures |
| [SCREEN-019-populated-en-light.png](screenshots/SCREEN-019-populated-en-light.png) | SCREEN-019 | populated | en-light | 780×1688 | A | `lib/screens/submit_offer_screen.dart` | populated fixtures |
| [SCREEN-019-validation-ar-light.png](screenshots/SCREEN-019-validation-ar-light.png) | SCREEN-019 | validation | ar-light | 780×1688 | A | `lib/screens/submit_offer_screen.dart` | Submit with empty fields |
| [SCREEN-019-validation-en-light.png](screenshots/SCREEN-019-validation-en-light.png) | SCREEN-019 | validation | en-light | 780×1688 | A | `lib/screens/submit_offer_screen.dart` | Submit with empty fields |
| [SCREEN-020-empty-ar-dark.png](screenshots/SCREEN-020-empty-ar-dark.png) | SCREEN-020 | empty | ar-dark | 780×1688 | A | `lib/screens/offered_orders_screen.dart` | populated fixtures |
| [SCREEN-020-empty-ar-light.png](screenshots/SCREEN-020-empty-ar-light.png) | SCREEN-020 | empty | ar-light | 780×1688 | A | `lib/screens/offered_orders_screen.dart` | populated fixtures |
| [SCREEN-020-empty-en-light.png](screenshots/SCREEN-020-empty-en-light.png) | SCREEN-020 | empty | en-light | 780×1688 | A | `lib/screens/offered_orders_screen.dart` | populated fixtures |
| [SCREEN-020-populated-ar-dark.png](screenshots/SCREEN-020-populated-ar-dark.png) | SCREEN-020 | populated | ar-dark | 780×1688 | A | `lib/screens/offered_orders_screen.dart` | populated fixtures |
| [SCREEN-020-populated-ar-light.png](screenshots/SCREEN-020-populated-ar-light.png) | SCREEN-020 | populated | ar-light | 780×1688 | A | `lib/screens/offered_orders_screen.dart` | populated fixtures |
| [SCREEN-020-populated-en-light.png](screenshots/SCREEN-020-populated-en-light.png) | SCREEN-020 | populated | en-light | 780×1688 | A | `lib/screens/offered_orders_screen.dart` | populated fixtures |
| [SCREEN-021-empty-ar-light.png](screenshots/SCREEN-021-empty-ar-light.png) | SCREEN-021 | empty | ar-light | 780×1688 | A | `lib/screens/provider_active_orders_screen.dart` | empty fixtures |
| [SCREEN-021-error-ar-light.png](screenshots/SCREEN-021-error-ar-light.png) | SCREEN-021 | error | ar-light | 780×1688 | A | `lib/screens/provider_active_orders_screen.dart` | HTTP 500 for every request |
| [SCREEN-021-loading-ar-light.png](screenshots/SCREEN-021-loading-ar-light.png) | SCREEN-021 | loading | ar-light | 780×1688 | A | `lib/screens/provider_active_orders_screen.dart` | responses delayed 3s; captured at 300ms |
| [SCREEN-021-populated-ar-dark.png](screenshots/SCREEN-021-populated-ar-dark.png) | SCREEN-021 | populated | ar-dark | 780×1688 | A | `lib/screens/provider_active_orders_screen.dart` | populated fixtures |
| [SCREEN-021-populated-ar-light.png](screenshots/SCREEN-021-populated-ar-light.png) | SCREEN-021 | populated | ar-light | 780×1688 | A | `lib/screens/provider_active_orders_screen.dart` | populated fixtures |
| [SCREEN-021-populated-en-light.png](screenshots/SCREEN-021-populated-en-light.png) | SCREEN-021 | populated | en-light | 780×1688 | A | `lib/screens/provider_active_orders_screen.dart` | populated fixtures |
| [SCREEN-022-empty-ar-light.png](screenshots/SCREEN-022-empty-ar-light.png) | SCREEN-022 | empty | ar-light | 780×1688 | A | `lib/screens/rejected_orders_screen.dart` | empty fixtures |
| [SCREEN-022-error-ar-light.png](screenshots/SCREEN-022-error-ar-light.png) | SCREEN-022 | error | ar-light | 780×1688 | A | `lib/screens/rejected_orders_screen.dart` | HTTP 500 for every request |
| [SCREEN-022-loading-ar-light.png](screenshots/SCREEN-022-loading-ar-light.png) | SCREEN-022 | loading | ar-light | 780×1688 | A | `lib/screens/rejected_orders_screen.dart` | responses delayed 3s; captured at 300ms |
| [SCREEN-022-populated-ar-dark.png](screenshots/SCREEN-022-populated-ar-dark.png) | SCREEN-022 | populated | ar-dark | 780×1688 | A | `lib/screens/rejected_orders_screen.dart` | populated fixtures |
| [SCREEN-022-populated-ar-light.png](screenshots/SCREEN-022-populated-ar-light.png) | SCREEN-022 | populated | ar-light | 780×1688 | A | `lib/screens/rejected_orders_screen.dart` | populated fixtures |
| [SCREEN-022-populated-en-light.png](screenshots/SCREEN-022-populated-en-light.png) | SCREEN-022 | populated | en-light | 780×1688 | A | `lib/screens/rejected_orders_screen.dart` | populated fixtures |
| [SCREEN-023-empty-ar-light.png](screenshots/SCREEN-023-empty-ar-light.png) | SCREEN-023 | empty | ar-light | 780×1688 | A | `lib/screens/order_detail_screen.dart` | empty fixtures |
| [SCREEN-023-error-ar-light.png](screenshots/SCREEN-023-error-ar-light.png) | SCREEN-023 | error | ar-light | 780×1688 | A | `lib/screens/order_detail_screen.dart` | HTTP 500 for every request |
| [SCREEN-023-loading-ar-light.png](screenshots/SCREEN-023-loading-ar-light.png) | SCREEN-023 | loading | ar-light | 780×1688 | A | `lib/screens/order_detail_screen.dart` | responses delayed 3s; captured at 300ms |
| [SCREEN-023-populated-ar-dark.png](screenshots/SCREEN-023-populated-ar-dark.png) | SCREEN-023 | populated | ar-dark | 780×1688 | A | `lib/screens/order_detail_screen.dart` | populated fixtures |
| [SCREEN-023-populated-ar-light.png](screenshots/SCREEN-023-populated-ar-light.png) | SCREEN-023 | populated | ar-light | 780×1688 | A | `lib/screens/order_detail_screen.dart` | populated fixtures |
| [SCREEN-023-populated-en-light.png](screenshots/SCREEN-023-populated-en-light.png) | SCREEN-023 | populated | en-light | 780×1688 | A | `lib/screens/order_detail_screen.dart` | populated fixtures |
| [SCREEN-024-populated-ar-dark.png](screenshots/SCREEN-024-populated-ar-dark.png) | SCREEN-024 | populated | ar-dark | 780×1688 | A | `lib/screens/commission_payment_screen.dart` | populated fixtures |
| [SCREEN-024-populated-ar-light.png](screenshots/SCREEN-024-populated-ar-light.png) | SCREEN-024 | populated | ar-light | 780×1688 | A | `lib/screens/commission_payment_screen.dart` | populated fixtures |
| [SCREEN-024-populated-en-light.png](screenshots/SCREEN-024-populated-en-light.png) | SCREEN-024 | populated | en-light | 780×1688 | A | `lib/screens/commission_payment_screen.dart` | populated fixtures |
