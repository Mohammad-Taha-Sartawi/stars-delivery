# Stars Delivery — UI/UX Audit (code-based)

**Branch:** `docs/stars-delivery-audit` (baseline `9b50ca3`)
**Scope:** Flutter app (`lib/`) and EJS admin dashboard (`stars_delivery_backend/src/views/admin`, `src/public/js/main.js`, `src/public/css/style.css`). Screen IDs refer to [SCREEN_INVENTORY.md](SCREEN_INVENTORY.md).
**Method:** read-only static review. Findings UX-01 onward came from reading the code. The *Visually confirmed* column was then filled in from the 180 captures in [SCREENSHOT_MANIFEST.md](SCREENSHOT_MANIFEST.md), which come from Flutter widget-test renders and real admin browser screenshots. Before those captures, *Visually confirmed* was `pending` for every row until the lead captures screenshots. Contrast ratios are computed with the WCAG 2.x relative-luminance formula from the exact hex tokens in source (alpha colors blended over their stated background).
**Benchmarks:** WCAG 2.2 AA (1.4.3, 1.4.4, 1.4.11, 2.2.2, 2.5.8, 4.1.2), Material 3 / Android 48 dp targets, Apple HIG 44 pt, Flutter i18n/RTL guidance.

Severity: **High** = blocks or misleads a core journey, or a clear accessibility failure on a primary surface; **Medium** = recurring friction or inconsistency; **Low** = polish.

---

## 1. Executive summary

The app has a solid Material 3 token layer (indigo/orange palette, semantic success/warning/info/neutral roles, spacing/radius/size scales) and the two dashboards use shared components well. Compared with the prior UX-02 audit, the hard-coded `Colors.white` app bars and white-on-light button spinners are **gone** from screens (only the ad carousel still hard-codes colors). The biggest remaining problems are behavioural rather than visual:

1. **State handling is unreliable.** The provider dashboard can never show its loading or error view (the bloc never emits those states), several lists turn errors into "no orders", and two screens replace their whole content with a spinner on every background poll.
2. **Localization is incomplete.** Profile, Report, Support chat and two dialogs are Arabic-only; validators return bilingual "Arabic / English" strings; currency is shown three different ways (`ILS`, `SHE`, `شيكل`).
3. **Interruptive and hidden navigation.** Screens auto-open on socket events, push notifications do not deep-link, the profile is only reachable by tapping the app-bar title, and some tiles do nothing visible when tapped.
4. **Accessibility gaps in non-text contrast and motion.** Text-field borders are 1.6–1.8:1, the dark-mode ad banner puts white text on light pastel (≈1.6:1), and the ad carousel auto-advances with no pause control.
5. **The admin dashboard** relies on `alert/confirm/prompt` (89/15/7 calls), is desktop-only with a fixed sidebar, and is not keyboard-operable.

---

## 2. Prioritized findings

| # | Sev | Area | Finding | Evidence | Basis | Visually confirmed | Recommendation |
|---|---|---|---|---|---|---|---|
| UX-01 | High | Loading/error | Provider dashboard (SCREEN-017) renders `SizedBox.shrink()` for `ProviderInitial`; its `AppLoadingState`/`AppErrorState` branches are dead because `ProviderBloc` never emits `ProviderLoading` or `ProviderError`. First launch shows an empty body (only the app bar) until stats arrive, and stays empty if the first call fails. | [provider_home_screen.dart:546](../../lib/screens/provider_home_screen.dart#L546), [provider_home_screen.dart:560](../../lib/screens/provider_home_screen.dart#L560), [provider_bloc.dart:24](../../lib/bloc/provider/provider_bloc.dart#L24) | Inferred from code | **Partly contradicted.** The dashboard is not blank. It renders an all-zero dashboard because `ProviderBloc` starts in a zero-stats `ProviderStatsLoaded`, and `ProviderError` is never emitted (see RISK-044). [loading](screenshots/SCREEN-017-loading-ar-light.png), [error](screenshots/SCREEN-017-error-ar-light.png) | Emit loading/error from the bloc (or render loading for `ProviderInitial`) and keep pull-to-refresh available in the error view. |
| UX-02 | High | Feedback | Notifications (SCREEN-014) poll every 15 s; each `LoadNotifications` emits `NotificationLoading`, replacing the list with a full-screen spinner and resetting scroll. The app-bar unread badge reads only `NotificationsLoaded`, so it disappears during every poll on both homes. | [notifications_screen.dart:35](../../lib/screens/notifications_screen.dart#L35), [notification_bloc.dart:14](../../lib/bloc/notification/notification_bloc.dart#L14), [home_screen.dart:741](../../lib/screens/home_screen.dart#L741), [app_notification_bell.dart:20](../../lib/widgets/ui/app_notification_bell.dart#L20) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Keep previous data during refresh (silent reload state), and only show the spinner on first load. |
| UX-03 | High | Feedback | Order offers (SCREEN-009) emits `OfferLoading` on every reload triggered by sockets, offer expiry and pull-to-refresh, so the offer list flashes to a spinner exactly when a new offer arrives. The error state is plain text with no retry. | [offer_bloc.dart:44](../../lib/bloc/offer/offer_bloc.dart#L44), [order_offers_screen.dart:58](../../lib/screens/order_offers_screen.dart#L58), [order_offers_screen.dart:223](../../lib/screens/order_offers_screen.dart#L223), [order_offers_screen.dart:719](../../lib/screens/order_offers_screen.dart#L719) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Same as UX-02; add `AppErrorState` with retry. |
| UX-04 | High | Localization | Whole screens and dialogs are hard-coded Arabic and stay Arabic in English: Profile (32 literals), Report (17), Support chat (3), offer-conflict dialog (3), email-change dialog. Validators return combined "عربي / English" strings in both locales. | [profile_screen.dart:389](../../lib/screens/profile_screen.dart#L389), [report_screen.dart:143](../../lib/screens/report_screen.dart#L143), [support_chat_screen.dart:148](../../lib/screens/support_chat_screen.dart#L148), [order_offers_screen.dart:933](../../lib/screens/order_offers_screen.dart#L933), [profile_screen.dart:234](../../lib/screens/profile_screen.dart#L234), [validators.dart:17](../../lib/services/validators.dart#L17) | Inferred from code | **Confirmed.** [Profile in English](screenshots/SCREEN-015-populated-en-light.png) is all Arabic; [conflict dialog in English](screenshots/DIALOG-011-default-en-light.png) | Move all strings into `AppLocalization`; make validators take a `BuildContext` or return keys. |
| UX-05 | High | Feedback / journey | A provider who registers successfully but is "pending review" gets the message through `AuthError`, i.e. a red error snackbar, and stays on the form with no explanation of next steps. | [auth_bloc.dart:120](../../lib/bloc/auth/auth_bloc.dart#L120), [login_screen.dart:462](../../lib/screens/login_screen.dart#L462) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Add a dedicated `AuthPendingReview` state and a confirmation screen or dialog ("we will notify you"). |
| UX-06 | High | Error states | Errors are hidden. My orders shows the empty "No orders" text when loading fails; home counters, pending/offered lists, report history, registration location catalog and profile phone actions all swallow exceptions with `catch (_) {}`. | [my_orders_screen.dart:102](../../lib/screens/my_orders_screen.dart#L102), [home_screen.dart:277](../../lib/screens/home_screen.dart#L277), [pending_orders_screen.dart:135](../../lib/screens/pending_orders_screen.dart#L135), [report_screen.dart:50](../../lib/screens/report_screen.dart#L50), [login_screen.dart:76](../../lib/screens/login_screen.dart#L76), [profile_screen.dart:196](../../lib/screens/profile_screen.dart#L196) | Inferred from code | **Confirmed.** [My orders HTTP 500 → "No orders"](screenshots/SCREEN-008-error-ar-light.png); [driver dashboard HTTP 500 → zeros](screenshots/SCREEN-017-error-ar-light.png) | Distinguish empty from failed; show `AppErrorState` + retry, or at least an error snackbar for actions. |
| UX-07 | High | Accessibility / dark mode | Ad banner without images uses a `primary → secondary` gradient with white text. In dark mode those are `#C3C8FF`/`#FFB86B`, so white text is **1.61:1 / 1.70:1**. In light mode the white-70% countdown on `#A84300` is 3.79:1. | [ad_banner_carousel.dart:315](../../lib/widgets/ui/ad_banner_carousel.dart#L315), [ad_banner_carousel.dart:349](../../lib/widgets/ui/ad_banner_carousel.dart#L349), [ad_banner_carousel.dart:374](../../lib/widgets/ui/ad_banner_carousel.dart#L374) | Inferred from code (computed) | **Confirmed.** White text on the pale gradient: [dark ad banner](screenshots/SCREEN-006-populated-ar-dark.png) | Use `onPrimaryContainer`/`primaryContainer` or a dark scrim in both themes; drop `white70`. |
| UX-08 | High | Navigation | Push notifications do not deep-link: there is no `onMessageOpenedApp`/`getInitialMessage` handler and no intent filters, so tapping a push about a new offer only opens the app. | [push_notification_service.dart:53](../../lib/services/push_notification_service.dart#L53), [AndroidManifest.xml:29](../../android/app/src/main/AndroidManifest.xml#L29) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Route push payloads with the existing `_openNotification` type map. |
| UX-09 | Medium | Navigation | Socket events push screens automatically: customer home auto-opens Offers and Delivery confirmation; provider home auto-pushes New orders whenever the list goes from empty to non-empty, and auto-opens Order detail on acceptance. This is helpful for speed but disorienting, and the back stack fills with screens the user did not open. | [home_screen.dart:131](../../lib/screens/home_screen.dart#L131), [home_screen.dart:141](../../lib/screens/home_screen.dart#L141), [provider_home_screen.dart:500](../../lib/screens/provider_home_screen.dart#L500), [provider_home_screen.dart:266](../../lib/screens/provider_home_screen.dart#L266) | Inferred from code | **Confirmed** (provider side): [New Orders auto-pushed over the dashboard](screenshots/SCREEN-018-autopushed-from-017-ar-light.png) | Replace auto-push with an in-place banner or heads-up card that has an "Open" action (keep auto-open as a setting). |
| UX-10 | Medium | Navigation / feedback | New/Offered tiles on the provider dashboard only re-dispatch a load when the cached list is null/empty, with no visible response. The stats handler re-emits without `offeredOrders`, so depending on response order the Offered tile can appear dead. | [provider_home_screen.dart:816](../../lib/screens/provider_home_screen.dart#L816), [provider_home_screen.dart:859](../../lib/screens/provider_home_screen.dart#L859), [provider_bloc.dart:30](../../lib/bloc/provider/provider_bloc.dart#L30) | Inferred from code (needs runtime check) | Not visible in the captured states (needs runtime or device check) | Always navigate; let the destination load its own data and show its own empty state. |
| UX-11 | Medium | Destructive actions | "Approve delivery" is irreversible and has no confirmation, while "Reject delivery" does. The Arabic-only conflict dialog's left button "No, delete the order" cancels the order immediately. Start/confirm delivery buttons on Active deliveries have no busy/disabled state, so double taps are possible. | [my_orders_screen.dart:795](../../lib/screens/my_orders_screen.dart#L795), [order_offers_screen.dart:942](../../lib/screens/order_offers_screen.dart#L942), [provider_active_orders_screen.dart:385](../../lib/screens/provider_active_orders_screen.dart#L385) | Inferred from code | **Confirmed** (conflict-dialog wording): [DIALOG-011](screenshots/DIALOG-011-default-ar-light.png) | Add confirmations for irreversible steps and per-button loading states. |
| UX-12 | Medium | Forms | Validation is inconsistent. Login and registration use required-only checks for email and phone even though `Validators.email/phone` exist; Create order validators use `v!.isEmpty` (whitespace passes, no trim); the contact dialog takes any text as an email. Profile password change validates through snackbars instead of inline errors. | [login_screen.dart:249](../../lib/screens/login_screen.dart#L249), [login_screen.dart:360](../../lib/screens/login_screen.dart#L360), [create_order_screen.dart:141](../../lib/screens/create_order_screen.dart#L141), [login_screen.dart:606](../../lib/screens/login_screen.dart#L606), [profile_screen.dart:322](../../lib/screens/profile_screen.dart#L322) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Use the shared validators everywhere, trim inputs, and convert Profile to a `Form`. |
| UX-13 | Medium | Journey friction | Sign-in asks the user to pick Customer or Provider and sends that role with the credentials, even though the account already has a role. | [login_screen.dart:112](../../lib/screens/login_screen.dart#L112), [login_screen.dart:731](../../lib/screens/login_screen.dart#L731) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Show role cards only in registration and derive the role at login. |
| UX-14 | Medium | Journey friction / i18n | Registration ends with two blocking, non-dismissible legal dialogs in sequence. Their bodies are long Arabic-only texts with forced RTL (also in English), and the legal text is never reachable again from Settings. | [login_screen.dart:756](../../lib/screens/login_screen.dart#L756), [login_screen.dart:797](../../lib/screens/login_screen.dart#L797), [login_screen.dart:771](../../lib/screens/login_screen.dart#L771) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Use one consent step with an "I agree to Terms and Privacy" checkbox, link to full-page documents, and add both to Settings. |
| UX-15 | Medium | Permissions | Location permission is requested in `main()` before the first frame, with no explanation, and the app waits for GPS before showing UI. Push permission is requested as soon as either home opens. | [main.dart:18](../../lib/main.dart#L18), [location_service.dart:11](../../lib/services/location_service.dart#L11), [push_notification_service.dart:38](../../lib/services/push_notification_service.dart#L38) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Add a short pre-permission explainer at the moment of need (provider availability, order creation) and do not block startup. |
| UX-16 | Medium | Info hierarchy | Both home app bars carry five actions (bell, theme, language, settings, logout), and theme and language are repeated in Settings. The profile is reachable only by tapping the avatar/name title, with a tooltip as its only cue. | [home_screen.dart:738](../../lib/screens/home_screen.dart#L738), [provider_home_screen.dart:643](../../lib/screens/provider_home_screen.dart#L643), [home_screen.dart:682](../../lib/screens/home_screen.dart#L682) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Keep the bell and an account/overflow menu (Profile, Settings, Logout); move theme/language to Settings. |
| UX-17 | Medium | Consistency | Currency appears as `ILS` (hard-coded), `SHE` (English value of the `shekel` key) and `شيكل`. The key `unknown` is used but undefined, so the raw word "unknown" shows in both locales. | [provider_home_screen.dart:1244](../../lib/screens/provider_home_screen.dart#L1244), [submit_offer_screen.dart:169](../../lib/screens/submit_offer_screen.dart#L169), [localization_service.dart:487](../../lib/services/localization_service.dart#L487), [offered_orders_screen.dart:341](../../lib/screens/offered_orders_screen.dart#L341) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Use one currency formatter (₪ / ILS) and add the missing key. |
| UX-18 | Medium | Accessibility | Non-text contrast: text-field borders use `outlineVariant`, 1.63:1 on white (light) and 1.80:1 on the dark fill, below the 3:1 needed to find an input (WCAG 1.4.11). Card borders are similar (1.63 / 1.60). | [theme_service.dart:417](../../lib/services/theme_service.dart#L417) | Inferred from code (computed) | Not visible in the captured states (needs runtime or device check) | Use `outline` (light 4.04:1) for enabled input borders; dark `outline` (2.13:1) also needs lightening. |
| UX-19 | Medium | Accessibility / motion | The ad carousel auto-advances every 6 s, images rotate every 4 s, and a 1 s ticker rebuilds the countdown. There is no pause/stop control (WCAG 2.2.2) and no reduced-motion check. Height is fixed at 154 px, so two 2-line text blocks, a label and a countdown can clip at large text scales. | [ad_banner_carousel.dart:113](../../lib/widgets/ui/ad_banner_carousel.dart#L113), [ad_banner_carousel.dart:237](../../lib/widgets/ui/ad_banner_carousel.dart#L237), [ad_banner_carousel.dart:37](../../lib/widgets/ui/ad_banner_carousel.dart#L37), [ad_banner_carousel.dart:138](../../lib/widgets/ui/ad_banner_carousel.dart#L138) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Pause on touch/focus, respect `MediaQuery.disableAnimations`, and use a min-height instead of a fixed height. |
| UX-20 | Medium | Typography / scaling | 125 literal `fontSize:` values bypass the text theme, including 10, 11 and 11.5 px text (OSM attribution, ID pills, hints). No text-scale handling or tests were found (`textScaler` used 0 times). | [order_tracking_screen.dart:175](../../lib/screens/order_tracking_screen.dart#L175), [provider_home_screen.dart:1181](../../lib/screens/provider_home_screen.dart#L1181), [rejected_orders_screen.dart:222](../../lib/screens/rejected_orders_screen.dart#L222) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Map literals to `textTheme` roles (minimum `labelSmall` 11/`bodySmall` 12) and add 200 % text-scale golden tests. |
| UX-21 | Medium | Responsiveness | The `Responsive` widget and `isTablet/isDesktop` are unused. Breakpoints conflict (600/1024 in `responsive.dart` vs 840 in `AppSizes`), and content widths vary between 480, 500, 520, 560, 600 (11 screens) and 1040. Tablets and landscape get one narrow column. | [responsive.dart:16](../../lib/services/responsive.dart#L16), [theme_service.dart:111](../../lib/services/theme_service.dart#L111), [my_orders_screen.dart:342](../../lib/screens/my_orders_screen.dart#L342), [profile_screen.dart:398](../../lib/screens/profile_screen.dart#L398) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Use one breakpoint set and `AppSizes.contentMaxWidth`, with list-detail layouts at ≥ 840 dp for orders/offers. |
| UX-22 | Medium | Empty states | `AppEmptyState` is never used; empty states are bare centered text without guidance or CTA (My orders, Notifications, Active deliveries, Rejected). Active deliveries can render as a blank list when every order is completed, because inactive items become zero-size widgets. | [app_state_views.dart:35](../../lib/widgets/ui/app_state_views.dart#L35), [my_orders_screen.dart:346](../../lib/screens/my_orders_screen.dart#L346), [provider_active_orders_screen.dart:275](../../lib/screens/provider_active_orders_screen.dart#L275) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Adopt `AppEmptyState` with a next-step action (for example "Create order", "Go available"); filter before building the list. |
| UX-23 | Medium | Admin | The admin uses `alert()` 89 times, `confirm()` 15 times and `prompt()` 7 times. Driver/user password changes are typed into unmasked prompts, and 2FA setup shows the secret and otpauth URI in an `alert()` with no QR code. | [main.js:1824](../../stars_delivery_backend/src/public/js/main.js#L1824), [main.js:2893](../../stars_delivery_backend/src/public/js/main.js#L2893) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Add an in-page toast and modal component; masked password modal; QR for 2FA. |
| UX-24 | Medium | Admin / a11y | Sidebar items are `<li>` elements with click handlers and no `role`/`tabindex`, and stat cards are clickable `div`s, so they cannot be reached by keyboard. The three admin templates contain only 3 ARIA attributes, and form fields rely on placeholders instead of labels (login, password reset). | [sidebar.ejs:4](../../stars_delivery_backend/src/views/admin/partials/sidebar.ejs#L4), [index.ejs:24](../../stars_delivery_backend/src/views/admin/index.ejs#L24), [login.ejs:18](../../stars_delivery_backend/src/views/admin/login.ejs#L18) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Use `<button>`/`<a>` elements and visible `<label>`s. |
| UX-25 | Medium | Admin / responsive | Layout is desktop-only: fixed 260 px sidebar, `body { height:100vh; overflow:hidden }`, and the sidebar has no scroll, so with 16 items the lower entries can be cut off on short viewports. The only media queries cover modal grids. | [style.css:2](../../stars_delivery_backend/src/public/css/style.css#L2), [style.css:3](../../stars_delivery_backend/src/public/css/style.css#L3), [style.css:72](../../stars_delivery_backend/src/public/css/style.css#L72) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Collapsible sidebar under 900 px, `overflow-y:auto` on the sidebar. |
| UX-26 | Medium | Admin / safety | Broadcasting to all drivers or users sends with no confirmation. Freeze driver/user has no confirmation. "Resolve" on support chat permanently deletes the conversation. The users "Delete permanently" button is shown but only alerts "feature not enabled". | [main.js:1720](../../stars_delivery_backend/src/public/js/main.js#L1720), [main.js:1794](../../stars_delivery_backend/src/public/js/main.js#L1794), [main.js:3579](../../stars_delivery_backend/src/public/js/main.js#L3579), [main.js:1865](../../stars_delivery_backend/src/public/js/main.js#L1865) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Add a preview/confirm step for broadcasts, hide unavailable actions, and separate "resolve" from "delete". |
| UX-27 | Low | Feedback | Raw server/`Exception` text is surfaced in snackbars (`error.toString()`), sometimes without stripping "Exception:" (Profile name/email/password). | [profile_screen.dart:223](../../lib/screens/profile_screen.dart#L223), [profile_screen.dart:318](../../lib/screens/profile_screen.dart#L318) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Map error codes to localized copy, as SCREEN-004 already does. |
| UX-28 | Low | Profile | Deleting a phone has no confirmation; each field has its own save icon; the avatar uses `fullName[0]`, which throws on an empty name. The customer home app bar shows the initial of the original `widget.user`, which goes stale after a rename. | [profile_screen.dart:517](../../lib/screens/profile_screen.dart#L517), [profile_screen.dart:407](../../lib/screens/profile_screen.dart#L407), [home_screen.dart:716](../../lib/screens/home_screen.dart#L716) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Confirm deletes, use a single Save, and guard the initial. |
| UX-29 | Low | Support chat | Failed messages show an error icon but cannot be retried; no timestamps; bubble width fixed at 280 dp. | [support_chat_screen.dart:119](../../lib/screens/support_chat_screen.dart#L119), [support_chat_screen.dart:189](../../lib/screens/support_chat_screen.dart#L189) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Tap-to-retry, timestamps, and a percentage-based max width. |
| UX-30 | Low | Commission | The payment screen only copies a WhatsApp number; there is no "Open WhatsApp" or payment status. | [commission_payment_screen.dart:136](../../lib/screens/commission_payment_screen.dart#L136) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Add a `wa.me` deep link and a "payment pending review" state. |
| UX-31 | Low | Tracking | The map shows only the driver: no destination, ETA, or call action; attribution text is 10 px. | [order_tracking_screen.dart:142](../../lib/screens/order_tracking_screen.dart#L142) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Add a destination marker, ETA and a call button. |
| UX-32 | Low | Settings | Theme offers only Light/Dark (no "System"); Settings has no notification, legal or about entries. | [settings_screen.dart:45](../../lib/screens/settings_screen.dart#L45) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Add System theme and legal links. |
| UX-33 | Low | Consistency | Two notification-bell implementations, six copies of the type/status label maps, and duplicated `_buildInfoRow`/`_maskPhone` helpers. | [home_screen.dart:739](../../lib/screens/home_screen.dart#L739), [app_notification_bell.dart:9](../../lib/widgets/ui/app_notification_bell.dart#L9), [pending_orders_screen.dart:210](../../lib/screens/pending_orders_screen.dart#L210), [offered_orders_screen.dart:406](../../lib/screens/offered_orders_screen.dart#L406) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Extract `OrderTypeLabel`, `OrderStatusChip`, `InfoRow`, `MaskedPhone`. |
| UX-34 | Low | Branding | The admin uses a different identity (cyan `#00D4FF` on near-black, rocket emoji, "تحكم+" logo) from the app's indigo `#1A237E` / orange. The brand orange `AppColors.accent #FF6F00` is defined but unused; light mode uses `#A84300` as the secondary color. No custom font is bundled, so Arabic relies on platform fallback fonts. | [style.css:4](../../stars_delivery_backend/src/public/css/style.css#L4), [theme_service.dart:12](../../lib/services/theme_service.dart#L12), [pubspec.yaml:91](../../pubspec.yaml#L91) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Decide on one brand system; consider bundling an Arabic-capable family (the admin already uses Cairo). |
| UX-35 | Low | Admin | Section state is not reflected in the URL, so reload or back always returns to the dashboard. There are 13 separate live-clock elements. The driver edit modal appears to be unreachable (registered action, no trigger). | [main.js:130](../../stars_delivery_backend/src/public/js/main.js#L130), [main.js:639](../../stars_delivery_backend/src/public/js/main.js#L639) | Inferred from code | Not visible in the captured states (needs runtime or device check) | Use hash routing, one clock in the shell, and remove dead UI. |

---

## 3. Branding and design tokens

Source: [theme_service.dart](../../lib/services/theme_service.dart).

| Token group | Values | Evidence |
|---|---|---|
| Brand | primary `#1A237E` (indigo), primaryLight `#534BAE`, primaryDark `#000051`, accent `#FF6F00` (unused), accentStrong `#A84300` (light `secondary`) | [theme_service.dart:8](../../lib/services/theme_service.dart#L8) |
| Light surfaces | background `#F6F7FB`, surface/card `#FFFFFF`, muted `#EEF0F7`, outline `#74798C`, outlineVariant `#C7CAD8`, text `#171A2B` / `#4E5568` | [theme_service.dart:15](../../lib/services/theme_service.dart#L15), [theme_service.dart:611](../../lib/services/theme_service.dart#L611) |
| Dark surfaces | background `#121322`, card `#1A1B2E`, muted `#24263D`, text `#F2EFFA` / `#C5C1D2`, primary `#C3C8FF`, secondary `#FFB86B` | [theme_service.dart:22](../../lib/services/theme_service.dart#L22), [theme_service.dart:570](../../lib/services/theme_service.dart#L570) |
| Semantic | success / warning / error / info / neutral, each with a container and an on-container color, in light and dark (`AppSemanticColors` theme extension) | [theme_service.dart:32](../../lib/services/theme_service.dart#L32) |
| Spacing | 2, 4, 8, 12, 16, 24, 32, 40, 48 | [theme_service.dart:75](../../lib/services/theme_service.dart#L75) |
| Radius | 8, 10, 12, 16, 20, 24, pill | [theme_service.dart:94](../../lib/services/theme_service.dart#L94) |
| Sizes | minTouchTarget 48, buttonHeight 52, inputHeight 56, icons 18/22/28, authMaxWidth 560, contentMaxWidth 1040, wideBreakpoint 840 | [theme_service.dart:111](../../lib/services/theme_service.dart#L111) |
| Typography | Material 2021 base; display 32, headlineL 28, headlineM 24, headlineS 21, titleL 19, titleM 16, titleS 14, bodyL 16/1.6, bodyM 14/1.5, bodyS 12, labelL 14, labelM 12, labelS 11; no custom `fontFamily` | [theme_service.dart:650](../../lib/services/theme_service.dart#L650) |
| Tones | `AppTone` maps primary/accent/success/warning/info/danger/neutral to fg/bg/border/solid/onSolid | [app_tone.dart:23](../../lib/widgets/ui/app_tone.dart#L23) |

Adoption: screens consistently use `ColorScheme`/`appToneStyle`. The only hard-coded colors left in `lib/screens` and `lib/widgets` are the ad carousel (`Colors.white/white70/black`, 8 uses) and the rating star `#FFB300` ([order_offers_screen.dart:758](../../lib/screens/order_offers_screen.dart#L758)). Spacing literals and 125 `fontSize` literals remain (UX-20). Many buttons override radius ad hoc (`BorderRadius.circular(8/12)`), even though the theme already sets shapes.

## 4. Contrast (computed)

AA thresholds: 4.5:1 normal text, 3:1 large text and UI components.

| Pair (theme) | Foreground | Background | Ratio | Result |
|---|---|---|---:|---|
| onPrimary / primary (L) | `#FFFFFF` | `#1A237E` | 13.24 | Pass |
| onSurface / background (L) | `#171A2B` | `#F6F7FB` | 16.09 | Pass |
| onSurfaceVariant / background (L) | `#4E5568` | `#F6F7FB` | 6.95 | Pass |
| onSurfaceVariant / surfaceContainerHigh (L) | `#4E5568` | `#E7E9F2` | 6.14 | Pass |
| onSecondary / secondary (L) | `#FFFFFF` | `#A84300` | 6.06 | Pass |
| white / unused brand accent (L) | `#FFFFFF` | `#FF6F00` | 2.79 | Fail (do not use as a fill) |
| onSuccess / success (L) | `#FFFFFF` | `#1B6E3A` | 6.29 | Pass |
| onWarning / warning (L) | `#FFFFFF` | `#8A4F00` | 6.56 | Pass |
| onError / error (L) | `#FFFFFF` | `#B3261E` | 6.54 | Pass |
| onInfo / info (L) | `#FFFFFF` | `#1257A6` | 7.14 | Pass |
| on*Container / *Container (L, 6 pairs) | — | — | 11.8–15.2 | Pass |
| Role-card subtitle (onSecondaryContainer 82 %) (L) | `#603E27` | `#FFE8D6` | 8.02 | Pass |
| Snackbar onInverse / inverse (L) | `#F2F3FA` | `#2D3042` | 11.76 | Pass |
| outline / background (L, UI) | `#74798C` | `#F6F7FB` | 4.04 | Pass (3:1) |
| **Input/card border outlineVariant / white (L, UI)** | `#C7CAD8` | `#FFFFFF` | **1.63** | **Fail 1.4.11** |
| Disabled tile text 38 % / white (L) | `#A7A8AE` | `#FFFFFF` | 2.37 | Exempt (disabled), but provider tiles are "disabled" by opacity while still explaining state |
| Rating star `#FFB300` / white (L, non-text) | `#FFB300` | `#FFFFFF` | 1.79 | Fail as graphic; mitigated by numeric text and filled/half/empty shapes |
| **Ad countdown white 70 % / `#A84300` (L)** | `#E5C7B2` | `#A84300` | **3.79** | **Fail** (small text) |
| onSurface / background (D) | `#F2EFFA` | `#121322` | 16.20 | Pass |
| onSurfaceVariant / card (D) | `#C5C1D2` | `#1A1B2E` | 9.62 | Pass |
| onPrimary / primary (D) | `#17215F` | `#C3C8FF` | 9.18 | Pass |
| onSecondary / secondary (D) | `#4A2600` | `#FFB86B` | 7.86 | Pass |
| onError / error (D) | `#690005` | `#FFB4AB` | 7.72 | Pass |
| onSuccess / success (D) | `#00391B` | `#7FDB9C` | 7.82 | Pass |
| on*Container / *Container (D, 5 pairs) | — | — | 8.7–11.2 | Pass |
| Snackbar onInverse / inverse (D) | `#2E3045` | `#E9E7F2` | 10.57 | Pass |
| **outline / background (D, UI)** | `#464A67` | `#121322` | **2.13** | **Fail 1.4.11** |
| **Input border / input fill (D, UI)** | `#3A3D58` | `#0E0F1C` | **1.80** | **Fail 1.4.11** |
| **Ad text white / gradient `#C3C8FF`→`#FFB86B` (D)** | `#FFFFFF` | `#C3C8FF` / `#FFB86B` | **1.61 / 1.70** | **Fail** |
| Admin body text | `#E5E9F0` | `#0F141C` | 15.17 | Pass |
| Admin sidebar item | `#8892A8` | `#141A24` | 5.59 | Pass |
| Admin active item | `#00D4FF` | `#113341` | 7.54 | Pass |
| Admin badge counter | `#FFFFFF` | `#E74C3C` | 3.82 | Fail (12 px bold) |
| Admin status badge | `#0B0E14` | `#00D4FF` | 10.91 | Pass |

The theme's own text pairs pass comfortably. The failures are borders (UI components) and the ad banner.

## 5. Spacing and layout

- Screens mostly use `AppSpacing` constants, with page padding coming either from `Responsive.pageInsets` (4 screens) or literal `EdgeInsets.all(16)`-style padding. Inferred from code.
- Card internals use hand-tuned `EdgeInsets.fromLTRB(16, 0, 16, 10/8/12)` in My orders ([my_orders_screen.dart:506](../../lib/screens/my_orders_screen.dart#L506)). These literals are not direction-aware (`fromLTRB`) but are symmetric, so RTL is unaffected.
- Bottom safe-area handling: 20 of 22 screen files wrap their body in `SafeArea` (Support chat protects the composer only). **Exceptions:** Settings ([settings_screen.dart:21](../../lib/screens/settings_screen.dart#L21)) and Tracking map ([order_tracking_screen.dart:127](../../lib/screens/order_tracking_screen.dart#L127)) have none, so the map attribution and overlay may sit under system insets. This is a large improvement on UX-02.

## 6. Touch targets

- Theme minimums: Elevated/Outlined 52 dp, TextButton 48 dp ([theme_service.dart:361](../../lib/services/theme_service.dart#L361), [theme_service.dart:394](../../lib/services/theme_service.dart#L394)); `AppActionTile` min height 64 ([app_action_tile.dart:73](../../lib/widgets/ui/app_action_tile.dart#L73)); support send button explicitly 48×48 ([support_chat_screen.dart:280](../../lib/screens/support_chat_screen.dart#L280)); rating stars use `iconSize: 36` inside `IconButton` (≥ 48) ([my_orders_screen.dart:136](../../lib/screens/my_orders_screen.dart#L136)).
- Risks (inferred from code): the profile phone list uses `ListTile(dense: true)` with a `TextButton` and `IconButton` in `trailing` ([profile_screen.dart:489](../../lib/screens/profile_screen.dart#L489)); the app-bar title InkWell (profile entry) height depends on the app bar. The ad carousel page dots are not interactive (they are indicators only). No `shrinkWrap` tap-target overrides were found.
- Admin: sidebar items are 14 px padding plus text (about 48 px tall, OK). Inline action buttons in tables need visual confirmation.

## 7. Information hierarchy and navigation discoverability

- Homes use clear sections (Ad → Welcome → Pending banner → Primary CTA → sections with headers). Customer "New order" is a prominent primary card ([home_screen.dart:601](../../lib/screens/home_screen.dart#L601)). Good.
- Several labels describe the data differently from the destination: "Driver Price Offers" opens *My orders* filtered to pending/offered; provider "Orders and Offers Report" is `RejectedOrdersScreen`; "Orders Report – Last 30 Days" reuses the same list class in read-only mode. The client does not apply the 30-day filter (it requests all `/orders`), so the label may over-promise ([my_orders_screen.dart:89](../../lib/screens/my_orders_screen.dart#L89)). Inferred from code.
- Hidden entries: Profile (title tap only); SCREEN-023 Order detail is reachable only via socket or notification, never from a list.
- No persistent navigation (no bottom bar or drawer). Every destination is one level below home via tiles, which works for the small surface but forces round trips (for example offers → home → in progress).

## 8. Forms

| Form | Inline validation | Issues |
|---|---|---|
| Login (SCREEN-002) | required only | no email format check; role selector adds a step |
| Registration (SCREEN-003) | required; password policy; confirm match; service types via snackbar | email/phone format not checked; governorate list fails silently; long single page |
| Password recovery (SCREEN-004) | email format, 8-digit code, policy, match | good; bilingual validator strings |
| Forced change (SCREEN-005) | required, policy, match | good; no escape |
| Create order (SCREEN-007) | non-empty (untrimmed) | phone format not checked; no prefill; location free text |
| Submit offer (SCREEN-019) | price > 0, integer time > 0 | good; quick chips |
| Report (SCREEN-012) | required (Arabic text) | public-ID knowledge required |
| Profile (SCREEN-015) | snackbar validation; `TextField`s, not `FormField`s | inconsistent with the rest |
| Admin add driver (ADMIN-007) | HTML `required`, `minlength=12`, `pattern=[0-9]*` | messages are browser-native |

Password policy (12–128 characters, no placeholder words) is shared by mobile ([validators.dart:2](../../lib/services/validators.dart#L2)) and admin (`minlength=12`), which is consistent. Autofill hints are set on auth forms, which is good.

## 9. Loading, feedback, empty and error states

| Screen | Loading | Empty | Error | Retry |
|---|---|---|---|---|
| SCREEN-006 Customer home | none | n/a | silent | pull-to-refresh |
| SCREEN-008 My orders | spinner | text | **shown as empty** | pull-to-refresh |
| SCREEN-009 Offers | spinner (every refresh) | rich waiting state | text | no |
| SCREEN-010 Tracking | overlay spinner | "unavailable" | text + Retry | yes |
| SCREEN-011 Order report | spinner | "no offers" | text | no |
| SCREEN-012 Report | button + history spinner | text | snackbar; history silent | no |
| SCREEN-013 Support chat | spinner | text (AR) | failed bubble | no |
| SCREEN-014 Notifications | spinner (every 15 s) | text | text | pull-to-refresh only when loaded |
| SCREEN-017 Provider home | **blank** | n/a | **blank** (dead `AppErrorState`) | no |
| SCREEN-018 New orders | inherits cache | icon + text | silent | pull-to-refresh |
| SCREEN-020 Offered | inherits cache | icon + text | silent | pull-to-refresh |
| SCREEN-021 Active | spinner | text (or blank) | text | pull-to-refresh only when list shown |
| SCREEN-022 Report | spinner | text | text (scrollable) | pull-to-refresh |
| SCREEN-023 Order detail | spinner (every socket event) | n/a | text | no |

Buttons: async submit buttons use `AppButtonLoadingIndicator` (onSurface color on the disabled fill, about 13:1), which resolves UX-02's spinner contrast defect. Status-change buttons on SCREEN-021/023 and the provider availability card have no busy state apart from the availability `_updatingAvailability` guard ([provider_home_screen.dart:1186](../../lib/screens/provider_home_screen.dart#L1186)).

## 10. Accessibility

- **Semantics:** 19 `Semantics(` wrappers in 13 files, concentrated in shared widgets (action tile, role card, option card, availability toggle, notification bell, status chip/badge, ad slide). Custom selection controls expose `selected`/`button` ([login_screen.dart:914](../../lib/screens/login_screen.dart#L914), [create_order_screen.dart:349](../../lib/screens/create_order_screen.dart#L349)). Good.
- **Tooltips:** 15 `tooltip:` uses in 6 files (app-bar icons, add/delete phone, rating stars, send). Icon-only buttons are labelled.
- **Live regions:** none. Socket-driven banners (driver taken, cooldown countdown, delivery progress) are not announced; snackbars are announced by the platform.
- **Color-only meaning:** status chips include text; outside-area offers have a text badge; offer expiry uses an icon plus text. Acceptable.
- **Text scaling:** no clamping (good), but fixed heights (ad carousel 154 px), `FittedBox(scaleDown)` on provider action buttons ([pending_orders_screen.dart:705](../../lib/screens/pending_orders_screen.dart#L705)), which shrinks text instead of wrapping, and 10–11.5 px literals (UX-20).
- **Motion:** auto-advancing carousel without pause (UX-19).
- **Focus/keyboard:** dialogs use standard `AlertDialog` (focus trapped). Admin is not keyboard-operable (UX-24).
- Existing a11y tests: `ux01_action_tile_semantics_test.dart`, `ux01_loading_indicator_test.dart` (in `test/`).

## 11. Localization and RTL

- **Languages:** Arabic (default) and English; `supportedLocales [ar, en]`, Global Material/Widgets/Cupertino delegates ([main.dart:62](../../lib/main.dart#L62)). Strings live in a single in-code map with **353 keys, all with both `ar` and `en`, no duplicates** ([localization_service.dart:22](../../lib/services/localization_service.dart#L22)). 275 distinct keys are referenced literally. One referenced key is missing: `unknown` (3 call sites).
- **RTL:** handled by Flutter's localization delegates. 15 screens additionally wrap themselves in `Directionality(isAr ? rtl : ltr)` (redundant but harmless). Directional widgets (`EdgeInsetsDirectional`, `AlignmentDirectional`, `PositionedDirectional`) are used in shared components, and chevrons flip by direction ([app_action_tile.dart:33](../../lib/widgets/ui/app_action_tile.dart#L33)). Email, phone and numeric fields force LTR (10 places), which is correct. Forced RTL remains on the Arabic legal bodies and the Arabic-only conflict dialog ([order_offers_screen.dart:939](../../lib/screens/order_offers_screen.dart#L939)).
- **Hard-coded strings outside the localization map:** **105 Arabic string literals** in `lib/` (script count excluding comments):

| File | Count | Nature | Examples |
|---|---:|---|---|
| `profile_screen.dart` | 32 | UI | "الملف الشخصي", "تغيير كلمة المرور", "تم تحديث الاسم" |
| `login_screen.dart` | 21 | legal text fragments + `ع` toggle | Terms/Privacy bodies |
| `report_screen.dart` | 17 | UI | "وصف المشكلة", "إرسال البلاغ", "قيد المراجعة" |
| `location_catalog.dart` | 13 | data (governorate names) | acceptable as data |
| `validators.dart` | 8 | bilingual messages | "مطلوب / Required" |
| `order_offers_screen.dart` | 6 | 3 UI + 3 data sentinels | "عذراً", "نعم، إعادة الإرسال"; compares against "غير محدد" |
| `support_chat_screen.dart` | 3 | UI | "التواصل مع الدعم", "اكتب رسالتك..." |
| `auth_bloc.dart` | 1 | fallback message | provider pending review |
| `order_detail_screen.dart` | 1 | data sentinel | "من المحافظة نفسها" |
| `home_screen.dart`, `provider_home_screen.dart`, `settings_screen.dart` | 3 | language toggles/names | "ع", "العربية" (acceptable) |

  Effective untranslated UI strings: about **61** (Profile 32, Report 17, Support 3, conflict dialog 3, validators 5 unique, auth fallback 1). English or neutral literals are also hard-coded: `ILS` ×4, `ID ` prefixes, "From … itself" in the registration city list ([login_screen.dart:300](../../lib/screens/login_screen.dart#L300)), OSM attribution, and the `d` day unit in the ad countdown ([ad_banner_carousel.dart:268](../../lib/widgets/ui/ad_banner_carousel.dart#L268)).
- **Logic depends on Arabic sentinels:** UI compares server values to "من المحافظة نفسها" / "غير محدد" ([order_offers_screen.dart:973](../../lib/screens/order_offers_screen.dart#L973)). This is fragile if the backend changes copy. Inferred from code.
- **Number/date formatting:** dates use a manual `yyyy-MM-dd HH:mm` ([order_report_screen.dart:192](../../lib/screens/order_report_screen.dart#L192)); no `intl` locale formatting or Arabic-Indic digit option.
- **Admin:** Arabic only, `dir="rtl"`; no English.

## 12. Dark mode

- A full dark `ColorScheme` and semantic extension exist, and the choice persists via `ThemePreferences`, togglable from the app bar or Settings. There is no "System" mode, and the default is light ([main.dart:35](../../lib/main.dart#L35)).
- The UX-02 finding that dark mode was broken on 12 screens by hard-coded whites is **no longer reproducible in code**: no `Colors.white`/`Colors.black87` remain in `lib/screens`.
- Remaining dark-mode defects: the ad banner text contrast (UX-07); weak dark outlines and borders (UX-18).
- Admin is dark-only.

## 13. Responsiveness

- `responsive.dart` defines mobile < 600, tablet 600–1023, desktop ≥ 1024, plus `pageInsets` (16/32/48) ([responsive.dart:16](../../lib/services/responsive.dart#L16)). Only `pageInsets` (4 screens) and `isMobile` (login, one spacing tweak at [login_screen.dart:109](../../lib/screens/login_screen.dart#L109)) are used. The `Responsive` builder widget and `withMaxWidth` extension are unused.
- `AppActionWrap` switches to two columns at 840 dp ([app_action_tile.dart:41](../../lib/widgets/ui/app_action_tile.dart#L41)), which is the only adaptive layout. Provider earnings cards stack under 330 dp ([provider_home_screen.dart:1269](../../lib/screens/provider_home_screen.dart#L1269)).
- Max widths: 480 (recovery), 500 (profile), 520 (forced change), 560 (login, commission), 600 (11 screens), 1040 (homes). The variance shows up as different column widths when navigating on tablets.
- Landscape phones: long forms scroll; the tracking map's overlay card is positioned at the top and could cover most of a short viewport (inferred).
- Admin: see UX-25.

## 14. Journey friction

**Customer:** launch (GPS permission prompt) → login (choose role) → home → New order → choose type → describe → (governorate 5 s wait) → submit → wait → auto-pushed Offers screen (list flashes on each new offer) → Accept → back to home → In progress → Track → approve delivery (no confirm) → rating dialog. Friction points: role choice at login, no saved addresses or phone prefill, auto-push, spinner flashes, no push deep links.

**Provider:** register (two legal dialogs; success shown as error) → wait for admin approval (no in-app status) → login → blank dashboard until stats load → toggle availability → auto-pushed New orders → Submit offer (separate screen without an order summary) → wait (Offered list) → auto-opened Order detail → Start delivery → Confirm delivery → await customer. Commission: dashboard → Pay now → copy number → leave the app. Friction points: pending-review feedback, tiles that do nothing, no order context on the offer screen, out-of-app payment.

**Admin:** login (+2FA code) → dashboard → sidebar sections. Approving a provider requires checking documents, then a `confirm()`. Password changes go through two `prompt()`s. Broadcasts send immediately. Any reload loses the current section.

## 15. Simplification opportunities

1. Merge Order offers (SCREEN-009) and My orders (SCREEN-008) into a list-detail flow; drop the separate "Report – 30 days" mode in favour of a status filter.
2. Merge provider New/Offered/Active/Report tiles into one "My work" screen with segmented filters (the only `TabBar`-like pattern the app would need).
3. Replace auto-pushes with a single in-app "live event" banner component.
4. Fold Settings into an account menu; remove the duplicate theme/language app-bar actions.
5. Put Submit offer in a bottom sheet over the order card, keeping order context visible.
6. Single consent step instead of DIALOG-002 + DIALOG-003 + DIALOG-004.
7. Extract shared `OrderCard`, `OrderStatusChip`, `InfoRow`, `MaskedPhone`, `CurrencyText` widgets (currently duplicated across 6 screens).
8. Admin: one modal/toast system replacing `alert/confirm/prompt`; consolidate legacy chat modal (ADMIN-026) into Support conversations (ADMIN-011); remove the unreachable driver edit modal (ADMIN-024).

## 16. Changes verified against prior UX docs

| UX-02 claim | Status on this branch | Evidence |
|---|---|---|
| Dark theme broken on 12 screens by hard-coded whites | Resolved in screens; remains only in the ad carousel | grep: 0 `Colors.*` in `lib/screens`; [ad_banner_carousel.dart:312](../../lib/widgets/ui/ad_banner_carousel.dart#L312) |
| White spinner on light disabled button (1.27:1) | Resolved (`AppButtonLoadingIndicator` uses `onSurface`) | [app_button_loading_indicator.dart:34](../../lib/widgets/ui/app_button_loading_indicator.dart#L34) |
| Profile, Report, Support chat untranslated | **Still open** | §11 |
| Forced RTL on ordinary dialogs | Partly resolved; the conflict dialog still forces RTL | [order_offers_screen.dart:939](../../lib/screens/order_offers_screen.dart#L939) |
| Bottom insets on only 4 screens | Mostly resolved; 20/22 files use `SafeArea` (not Settings, Tracking) | §5 |
| Responsive system not adopted (600 dp caps) | **Still open** | §13 |
| Create-order cards lacked semantics | Resolved (`Semantics(selected, button)`) | [create_order_screen.dart:349](../../lib/screens/create_order_screen.dart#L349) |

All rows above are **Inferred from code**; visual confirmation pending.


## Findings confirmed only by screenshots

These were found by looking at the captured frames. Each one is **visually confirmed**, and the cause was then traced in code.

| # | Sev | Finding | Screenshot | Code | Recommendation |
|---|---|---|---|---|---|
| UXV-01 | Medium | A cancelled or expired order shows the raw English enum ("cancelled") in a status chip, even in the Arabic UI. `_statusLabel` has no `cancelled`/`expired` case, although `status_cancelled` is defined. | [SCREEN-008 dialog backdrop](screenshots/DIALOG-007-default-ar-light.png) | [my_orders_screen.dart:293-307](../../lib/screens/my_orders_screen.dart#L293-L307) | Map every server status, and add a test that every `Order.status` enum value has a localized label. |
| UXV-02 | Medium | The cancel-order confirmation pairs the dismiss button "إلغاء" (cancel) with the title "إلغاء الطلب" (cancel order). Users can easily mix up "cancel the dialog" and "cancel the order". | [DIALOG-009](screenshots/DIALOG-009-default-ar-light.png) | [app_confirm_dialog.dart](../../lib/widgets/ui/app_confirm_dialog.dart) | Use explicit labels such as "تراجع" (go back) / "نعم، ألغِ الطلب" (yes, cancel the order). |
| UXV-03 | Medium | At 1.6× text scale the ad banner overflows (Flutter overflow stripe) and the countdown is clipped. | [SCREEN-006 textscale160](screenshots/SCREEN-006-textscale160-ar-light.png) | [ad_banner_carousel.dart](../../lib/widgets/ui/ad_banner_carousel.dart) | Let the card height adapt to text scale. See RISK-048. |
| UXV-04 | Medium | The admin dashboard at 390 px keeps the sidebar expanded and clips the main content. | [ADMIN-002 mobile](screenshots/ADMIN-002-populated-mobile.png), [ADMIN-003 mobile](screenshots/ADMIN-003-populated-mobile.png) | [style.css](../../stars_delivery_backend/src/public/css/style.css) | Collapsible sidebar below ~900 px. See RISK-049. |
| UXV-05 | Low | The user's name in the home app bar is cut to 4–5 characters ("...Custo", "...Provi") because five icon actions take the row. | [SCREEN-006](screenshots/SCREEN-006-populated-ar-light.png), [SCREEN-017](screenshots/SCREEN-017-populated-ar-light.png) | [home_screen.dart](../../lib/screens/home_screen.dart) | Move theme and language into Settings only (see UX-16). |
| UXV-06 | Low | Latin text inside the RTL layout gets its final period on the wrong side (".Free delivery …"), a bidi issue in the ad body. | [SCREEN-006 dark](screenshots/SCREEN-006-populated-ar-dark.png) | [ad_banner_carousel.dart](../../lib/widgets/ui/ad_banner_carousel.dart) | Set `textDirection` from the content, or wrap with Unicode direction marks. |
| UXV-07 | Low | The driver dashboard banner says "You have 3 pending order/offers" while the "New orders" tile shows 0. The banner sums pending, offered and active, so the wording does not match the number. | [SCREEN-017 populated](screenshots/SCREEN-017-populated-ar-light.png) | [provider_home_screen.dart:714-715](../../lib/screens/provider_home_screen.dart#L714-L715) | Label it as "items needing attention", or break the count down. |
| UXV-08 | Low | Offer prices are shown with a decimal and the currency word ("15.0 شيكل"), while the dashboard uses "ILS 0". The currency format is inconsistent (related to UX-17). | [SCREEN-009](screenshots/SCREEN-009-populated-ar-light.png), [SCREEN-017](screenshots/SCREEN-017-populated-ar-light.png) | [order_offers_screen.dart](../../lib/screens/order_offers_screen.dart) | One shared currency formatter. |
| UXV-09 | Info | When `/orders/:id` has no usable `providerLocation`, the tracking map shows a grey canvas and a "driver hasn't shared a location yet" card. In the test renderer, map tiles never load. | [SCREEN-010](screenshots/SCREEN-010-location-unavailable-en-light.png) | [order_tracking_screen.dart:63-75](../../lib/screens/order_tracking_screen.dart#L63-L75) | Check on a device that tiles and the marker render. |
