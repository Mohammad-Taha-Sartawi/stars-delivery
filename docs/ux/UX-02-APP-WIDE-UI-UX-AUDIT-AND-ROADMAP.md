# UX-02 — App-Wide UI/UX Audit and Roadmap

**Project:** Swifora (formerly Stars Delivery)
**Audit date:** 2026-11-09
**Canonical branch:** `ux/01-remediation-20261109`
**Baseline commit at audit start:** `828bc5eebc4b15b4b5bee1fd066b88ef8ceb5d17`
**Parent:** `e873038d6674dfd8f894a492d0332689bf666b80` (original UX-01)
**Flutter SDK:** 3.47.4 stable (framework `9584c6713b`, 2026-09-10)
**Scope:** Read-only app-wide UI/UX assessment and planning. No runtime UI code was changed in UX-02.

---

## Document control and method

### Sources inspected

- All 20 screen files in `lib/screens/`.
- All shared presentation widgets in `lib/widgets/` and `lib/widgets/ui/`.
- `lib/services/theme_service.dart`, `lib/services/responsive.dart`,
  `lib/services/localization_service.dart`, and `lib/main.dart`.
- The complete test suite inventory (`test/`), including the UX-01 suites.
- Existing UX-01 visual evidence (5 genuine widget-rasterized PNGs, outside the repo).

### Visual evidence used in this audit

Only the following screens have been **visually inspected** in this audit (captures produced by the UX-01 gated screenshot suite, `test/ux01_screenshots_test.dart`, stored at
`C:\Users\sare\Desktop\UX-01-remediation-screenshots\`):

| Capture | Coverage |
|---|---|
| `provider_home_light_en.png` | ProviderHome, light, English/LTR |
| `provider_home_dark_en.png` | ProviderHome, dark, English/LTR |
| `provider_home_light_ar_rtl.png` | ProviderHome, light, Arabic/RTL (layout metrics genuine; Arabic glyphs rasterize as placeholder boxes in the test engine) |
| `login_loading_light_en.png` | Login loading state, light, English |
| `login_loading_dark_en.png` | Login loading state, dark, English |

No other screen was visually inspected during UX-02. All other screen assessments below are
**source-inspected** and explicitly marked. They must not be read as runtime visual verification.

### Standards baseline

- W3C **WCAG 2.2** AA (SC 1.4.1, 1.4.3, 1.4.4, 1.4.10, 1.4.11, 2.4.3, 2.5.8, 4.1.2).
- **Flutter accessibility** guidance and `flutter_test` accessibility guidelines
  (`androidTapTargetGuideline`, `iOSTapTargetGuideline`, `labeledTapTargetGuideline`,
  `textContrastGuideline`).
- **Android adaptive apps / window size classes** (compact < 600 dp, medium 600–840, expanded ≥ 840).
- **Apple HIG — Layout** (44×44 pt minimum targets, safe areas, readable widths) and **HIG — Right to Left**.
- **Flutter internationalization** and `dart:ui` `TextDirection` guidance.

WCAG 2.2 AA is used as an accessibility *benchmark*, not a certification claim. Platform guidance
(Android 48 dp, iOS 44 pt) is distinguished from WCAG 2.2 target-size requirements (SC 2.5.8,
24×24 minimum with documented exceptions).

### Confidence scale

- **Confirmed** — directly evidenced in source or computed from exact theme colors.
- **Probable** — strong structural evidence; requires runtime reproduction to confirm.
- **Needs runtime verification** — cannot be concluded from source alone.

### UI-only boundary

This audit changed no application code. Every recommended task is presentation-only unless annotated
as a **Logic Dependency — Out of Scope** (Appendix D). No BLoC, service, model, API, navigation
destination, dependency, or business rule was modified.

---

## A. Executive summary

The application has a **credible Material 3 foundation and a strong remediation baseline for the
two primary dashboards**, but it is **not yet a consistently applied design system**. The UX-01 work
produced sound tokens, a theme with good internal contrast, and reusable components
(`AppActionTile`, `AppActionWrap`, `AppStatusBadge`, `AppFeedback`, `AppButtonLoadingIndicator`,
`AppSectionHeader`, state views). However, most secondary screens predate that foundation and
bypass it with hard-coded colors, ad-hoc widths, custom status chips and duplicated scaffolding.

The largest application-wide UX risks are:

1. **Dark theme is visibly broken on 12 of 20 screens** because their app bars and cards hard-code
   `Colors.white` / `Colors.black87`. This is a confirmed, high-impact regression of the product's
   advertised light/dark support.
2. **Contrast failures from hard-coded palettes.** White text on `Colors.orange` is **2.16:1**
   (needs 4.5:1), on `Colors.green` **2.78:1**, on `Colors.red` **3.68:1**; orange/green text on
   white fails 4.5:1. This affects primary CTAs (Create Order, Submit Offer, Report, Accept Offer,
   Mark Delivering/Complete) and status text.
3. **Loading feedback regressed outside the login screen.** Create Order, Submit Offer and Report
   still paint a **white spinner on a light disabled background (1.27:1)** — the exact UX01-001
   defect, still present at other call sites.
4. **Untranslated screens**: Profile and Report are almost entirely hard-coded Arabic under an
   English locale; Support Chat, Notifications fragments and the offer-conflict dialog are also
   untranslated. Ordinary English UI still receives forced `TextDirection.rtl` in three dialogs.
5. **Accessibility gaps in custom controls**: create-order selection cards and quick price/time
   buttons expose no button/selected semantics and rely on color alone; image thumbnails and several
   icon-only buttons are unlabeled; the notification unread state is a color-only 10 px dot.
6. **Bottom system insets are handled for primary content on only 4 of 19 screen files**
   (login, password recovery, customer home, provider home); Support Chat protects its composer
   only. The other 15 screens have no bottom-inset protection, and the UX-01 provider fix has not
   been generalized.
7. **Responsive system is not adopted.** Eleven screens use a hard-coded 600 dp cap, plus 500, 480
   and 280 dp variations; the design-system tokens (560/1040) are used by only two screens. Large
   screens simply show a narrow single column; there is no adaptive list-detail presentation.
8. **Shared state components are effectively unused.** `AppEmptyState` is unused; `AppLoadingState`
   and `AppErrorState` appear only in unreachable provider branches. Screens instead show bare
   spinners, grey empty text and unlabeled red error text with no retry.

ProviderHome and Login are the strongest surfaces (theme-aware, localized, accessible role
selection, provider inset fix). The remediation program should therefore **generalize the existing
foundation** rather than invent a new visual language.

---

## B. Screen inventory

Legend for presentation columns:
`✅ localized/theme-aware` · `⚠️ partial` · `❌ hard-coded` · `n/a` not applicable.
"Visual" states whether the screen was visually inspected in UX-02 (only 2 screens).

### B.1 Unauthenticated journey

#### S01 — Login / Registration
- **Source:** `lib/screens/login_screen.dart` (1,099 lines)
- **Role/task:** unauthenticated; sign in, create account, choose Customer/Provider, provider service
  types and document, choose area, open legal documents, contact support.
- **Entry/nav:** `home:` of `MaterialApp` (`lib/main.dart:53`); replaces itself on success.
- **Key components:** language bar, brand header, role cards, form card, inputs, dropdown,
  filter chips, document picker, submit button, legal/reject/contact dialogs.
- **Shared components:** `AppButtonLoadingIndicator`, `AppFeedback`, localization, tokens.
- **English:** ✅ complete; legal bodies are the approved Arabic-only documents (documented policy).
- **Arabic/RTL:** ✅ complete; area values/labels map correctly.
- **Light:** ✅ theme-aware. **Dark:** ✅ theme-aware. **Visual:** ✅ loading light/dark.
- **Small:** scrollable, responsive padding, max 560 auth width.
- **Large:** centered 560; intentional auth width.
- **Text scaling:** scrollable, but 200% not yet tested; two role cards side-by-side are the main risk.
- **Semantics:** role cards expose button + selected + label; loading live region; language tooltip.
- **Interaction states:** default, loading (disabled), validation error, auth error snackbar, success.
- **Inconsistencies:** email/password fields lack bidi isolation in RTL; no password visibility toggle.
- **UI defects:** none critical. Silent area-asset failure leaves an empty dropdown (F31).
- **Logic dependency:** area-load error swallowing (Appendix D-1).

#### S02 — Password Recovery
- **Source:** `lib/screens/forgot_password_screen.dart` (323 lines)
- **Role/task:** request recovery code, then reset password.
- **Entry/nav:** login "Forgot password?" (`login_screen.dart:406-412`).
- **Key components:** two-step form, icon headers, email/code/password fields, buttons.
- **Shared components:** theme only; loading uses raw `CircularProgressIndicator`.
- **English:** ✅. **Arabic/RTL:** ✅. **Light:** ✅. **Dark:** ⚠️ icon header hard-coded `#1A237E`
  (1.39:1 on dark background).
- **Visual:** source-only.
- **Small:** `SafeArea` + centered scroll; good. **Large:** max 480 (ad-hoc; F12).
- **Text scaling:** scrollable; low risk. **Semantics:** standard field labels; spinner has no
  live-region label.
- **States:** loading, validation error, recovery error snackbar, success snackbar.
- **Inconsistencies:** 480 width vs `AppSizes.authMaxWidth` 560; raw spinner vs shared indicator.
- **Logic dependency:** none.

### B.2 Customer journey

#### S03 — Customer Home
- **Source:** `lib/screens/home_screen.dart` (689 lines)
- **Role/task:** customer hub: new order, offers/pending, in-progress, reports, report driver,
  support chat, notifications, profile, theme/language, logout.
- **Entry/nav:** auth success (`login_screen.dart:448-451`).
- **Key components:** custom AppBar with tappable profile title + 4 icon actions, welcome header,
  pending banner, `AppActionWrap`/`AppActionTile` groups, available-drivers banner, refresh.
- **Shared components:** `AppActionTile`, `AppActionWrap`, `AppSectionHeader`, `AppFeedback`.
- **English:** ✅. **Arabic/RTL:** ✅ (manual `Directionality`, F13).
- **Light:** ✅. **Dark:** ✅ (theme-aware). **Visual:** source-only; ProviderHome sibling inspected.
- **Small:** scrollable; 1040 max width. AppBar with 4 actions + title is the narrow-width risk (F14).
- **Large:** 1040 max width; 2-column action tiles ≥ 840. Meaningful but still single column.
- **Text scaling:** 1.5 not covered for customer; AppBar crowding probable at 200% (F04/F14).
- **Semantics:** action tiles announce counts; pending banner `Semantics(button)`; available-drivers
  banner duplicates its message (label + child text, F18).
- **States:** default; counts silently stay 0 on fetch failure (no loading/error UI, F11 + logic D-1).
- **Inconsistencies:** customer pending banner is tappable, provider equivalent is not (F25);
  logout immediately without confirmation (F15).
- **Logic dependencies:** silent count failures; settings destination absent (D-1, D-5).

#### S04 — Create Order
- **Source:** `lib/screens/create_order_screen.dart` (396 lines)
- **Role/task:** customer creates product/people/goods order with description, location, photos, phone.
- **Entry/nav:** customer home "New order".
- **Key components:** three selectable `_OptionCard`s, form container, description/location/phone
  fields, photo picker + thumbnails, submit button.
- **Shared components:** none beyond localization.
- **English:** ✅ text localized. **Arabic/RTL:** ✅ text; manual direction absent (relies on app).
- **Light:** ⚠️ mixed hard-coded white/grey surfaces; **Dark:** ❌ white AppBar + `Colors.grey[50]`
  form container on dark background.
- **Visual:** source-only.
- **Small:** scrollable; max 600; no bottom `SafeArea` (F03).
- **Large:** narrow 600 column.
- **Text scaling:** scrollable form; option cards grow; CTA text fits; moderate risk.
- **Semantics:** `_OptionCard` is `GestureDetector` with no button/selected semantics (F07/F10/F20);
  photo remove control is a 20×20 unlabeled `GestureDetector` (F06); thumbnails unlabeled.
- **States:** default, selected (color-only), validation, loading (white spinner on disabled →
  1.27:1, F05), success snackbar, error snackbar.
- **Inconsistencies:** orange overrides theme primary; radii 10/12/16 mix; no ink/focus states.
- **Logic dependency:** none for the listed UI fixes.

#### S05 — My Orders (list; also used for report mode)
- **Source:** `lib/screens/my_orders_screen.dart` (573 lines)
- **Role/task:** customer order list filtered by status; cancellation/resend; report entry; delivery clock.
- **Entry/nav:** customer home tiles (pending/offers, in-progress, 30-day report).
- **Key components:** status chips, order cards, delivery progress, suspend/expired notices, cancel/resend.
- **Shared components:** none.
- **English:** ✅ labels localized; **Arabic/RTL:** ✅ labels; forced RTL on cancel dialog body (F09).
- **Light:** ⚠️; **Dark:** ❌ hard-coded white AppBar and status colors.
- **Visual:** source-only.
- **Small:** max 600, no bottom inset; **Large:** narrow column.
- **Text scaling:** trailing status chip + progress row are collision risks at 200% (F04).
- **Semantics:** status text present (not color-only); progress bar lacks a semantic summary.
- **States:** loading spinner, empty text, error indistinguishable from empty (F11, D-2), success action
  snackbars, raw exception snackbars (F16).
- **Inconsistencies:** card radius 12 vs tokens; hard-coded `fromLTRB` paddings.
- **Logic dependencies:** error/empty collapse; delivery-clock calculations (business).

#### S06 — Order Offers (customer view of received offers)
- **Source:** `lib/screens/order_offers_screen.dart` (629 lines)
- **Role/task:** customer views offers per order, accepts, cancels, resends expired orders.
- **Entry/nav:** My Orders tile; notification deep link.
- **Key components:** offer cards with provider name/ID, price, masked phone, countdown, accept/reject
  status, conflict dialog, empty state with resend/cancel.
- **Shared components:** none.
- **English:** ⚠️ body localized, **conflict dialog hard-coded Arabic** (F08); **Arabic/RTL:** ✅ body,
  forced RTL dialog content (F09).
- **Light:** ⚠️; **Dark:** ❌ white AppBar/hard-coded colors.
- **Visual:** source-only.
- **Small:** max 600, no bottom inset; **Large:** narrow column.
- **Text scaling:** price text in a row with an expanded name — overflow risk at 200% (F04).
- **Semantics:** accept/buttons labeled; countdown text not a live region (acceptable).
- **States:** loading, empty with resend/cancel, error plain red text without retry, success/conflict.
- **Inconsistencies:** orange/red/green overrides; radii.
- **Logic dependencies:** conflict resolution and cancel/resend behavior (business, unchanged).

#### S07 — Order Detail (provider-facing)
- **Source:** `lib/screens/order_detail_screen.dart` (533 lines)
- **Role/task:** provider inspects an order, submits an offer, starts delivery, confirms delivery.
- **Entry/nav:** provider notification deep links; pending order flow.
- **Key components:** order card, status chip, customer info, images gallery, price/offer highlights,
  action buttons by status.
- **Shared components:** none.
- **English:** ✅; **Arabic/RTL:** ✅; forced RTL on cancel dialog is in My Orders (F09).
- **Light:** ⚠️; **Dark:** ❌ white AppBar/hard-coded coverage.
- **Visual:** source-only.
- **Small:** max 600, no bottom inset. **Large:** narrow column.
- **Text scaling:** customer name/ID row and status chip risks.
- **Semantics:** tappable 70×70 images via `GestureDetector` with no label/button (F07).
- **States:** loading, error plain text without retry, pending/accepted/fulfilling actions, rejected.
- **Contrast:** green price 2.78:1; green/purple/orange buttons with white text fail 4.5:1 (F02).
- **Logic dependencies:** none for UI fixes.

#### S08 — Submit Offer
- **Source:** `lib/screens/submit_offer_screen.dart` (333 lines)
- **Role/task:** provider enters price and estimated time; quick-pick chips; send.
- **Entry/nav:** pending orders → submit offer; order detail → submit offer.
- **Key components:** cooldown banner, quick price/time buttons, two numeric fields, send button.
- **Shared components:** none.
- **English:** ⚠️ localized except hard-coded Arabic minute suffix `'د'` (F08); **Arabic/RTL:** ✅.
- **Light:** ⚠️; **Dark:** ❌ white AppBar and hard-coded surfaces.
- **Visual:** source-only.
- **Small:** **non-scrollable Column** inside body; with keyboard/landscape it will overflow (F04).
- **Large:** narrow 600 column.
- **Text scaling:** row of four quick buttons + 200% text is an overflow risk; no FittedBox.
- **Semantics:** quick buttons are color-only selected, no selected semantics (F07/F10); spinner has no
  label.
- **States:** cooldown, loading (white spinner on disabled → 1.27:1, F05), validation, errors.
- **Contrast:** orange 2.16:1, green 2.78:1, white-on-orange 2.16:1 (F02).
- **Logic dependencies:** cooldown rules (business).

#### S09 — Complaint / Report
- **Source:** `lib/screens/report_screen.dart` (295 lines)
- **Role/task:** customer reports a driver; provider reports a customer; history/replies.
- **Entry/nav:** customer home "Report driver"; provider home "Report customer".
- **Key components:** ID and description fields, send button, history cards with statuses and replies.
- **Shared components:** none.
- **English:** ❌ nearly entirely hard-coded Arabic (F08); **Arabic/RTL:** ✅.
- **Light:** ⚠️; **Dark:** ❌ white AppBar, hard-coded red/blue/grey surfaces.
- **Visual:** source-only.
- **Small:** scrollable; max 600; no bottom inset. **Large:** narrow column.
- **Text scaling:** good (scrollable); reply rows have fixed 10–12 px text.
- **Semantics:** fields labelled (Arabic only); status text + color; icon-only none.
- **States:** sending (white spinner on disabled, F05), success/error snackbars (hard-coded Arabic),
  loading history, empty history.
- **Logic dependencies:** none for UI fixes (localization is presentation-only).

#### S10 — Support Chat
- **Source:** `lib/screens/support_chat_screen.dart` (221 lines)
- **Role/task:** chat with support; history; unread marking.
- **Entry/nav:** customer and provider home "Contact support"; contact dialog; notification action.
- **Key components:** message list, bubbles, composer, send button.
- **Shared components:** none.
- **English:** ❌ title, empty state and hint hard-coded Arabic (F08); **Arabic/RTL:** ⚠️ chrome Arabic;
  bubbles not mirrored (F32).
- **Light:** ⚠️; **Dark:** ❌ white AppBar/composer, hard-coded blue/grey bubbles.
- **Visual:** source-only.
- **Small:** composer has bottom `SafeArea` (good); bubble max 280; no max content width.
- **Text scaling:** bubbles wrap; composer grows to 4 lines.
- **Semantics:** send is an unlabeled icon inside a ~40 px circle (F06/F07); failed messages show an
  unlabeled red icon and cannot be retried (F32).
- **States:** loading, empty, pending send, delivered, failed (no retry).
- **Logic dependencies:** resend/retry requires send logic (D-3).

#### S11 — Notifications
- **Source:** `lib/screens/notifications_screen.dart` (295 lines)
- **Role/task:** read notifications, mark all read, deep-link to orders/offers/support.
- **Entry/nav:** both home AppBars.
- **Key components:** pinned/unread cards, image thumbs, type icons, mark-all action, detail dialog.
- **Shared components:** none; `ImagePreview`.
- **English:** ⚠️ title/localized body, hard-coded Arabic pin label and dialog actions (F08).
- **Arabic/RTL:** ✅ mostly.
- **Light:** ⚠️; **Dark:** ❌ white AppBar/cards, `Colors.orange[50]`, `blue[50]`, `grey`.
- **Visual:** source-only.
- **Small:** max 600; no bottom inset. **Large:** narrow column.
- **Text scaling:** title row + pin badge; subtitle 2-line ellipsis; moderate risk.
- **Semantics:** unread is a color-only dot (F10); image thumb 44 px via `GestureDetector` unlabeled
  (F06/F07); pin badge 9 px white on orange 2.16:1 (F02/F21).
- **States:** loading, empty, error (no retry), read/unread/pinned, dialog.
- **Logic dependencies:** none for UI fixes.

#### S12 — Profile
- **Source:** `lib/screens/profile_screen.dart` (388 lines)
- **Role/task:** view identity; edit name/email; manage phones; change password.
- **Entry/nav:** both home AppBar profile title.
- **Key components:** avatar header, editable fields with save icons, phone list, password section.
- **Shared components:** none.
- **English:** ❌ fully hard-coded Arabic (F08); **Arabic/RTL:** ✅ Arabic only.
- **Light:** ⚠️; **Dark:** ❌ white AppBar, `Colors.grey[600]`, fixed avatar colors.
- **Visual:** source-only.
- **Small:** scrollable; max 500 (F12); no bottom inset.
- **Text scaling:** scrollable; field/save row robust; avatar fixed 90.
- **Semantics:** save/add/delete are icon-only `IconButton`s without tooltip/label (F19).
- **States:** phones loading (20 px box clips spinner, F19), add/remove errors swallowed, snackbars.
- **Contrast:** grey[500] 2.68:1; grey[600] ~3.4:1 (F02).
- **Logic dependencies:** email-change server/session behavior (unchanged).

#### S13 — Image Preview (overlay)
- **Source:** `lib/widgets/image_preview.dart` (47 lines)
- **Role/task:** full-screen zoomable image viewer from thumbnails.
- **Entry/nav:** push route from image thumbnails.
- **Key components:** black scaffold, `InteractiveViewer`, spinner, error state.
- **English:** ⚠️ "Failed to load image" hard-coded English (not localized) (F08).
- **Arabic/RTL:** n/a.
- **Light/Dark:** intentionally black media surface (acceptable).
- **Visual:** source-only.
- **Text scaling:** fixed error text; fine.
- **Semantics:** image has no semantic label; no zoom hint (F07).
- **States:** loading, error, zoom.
- **Logic dependencies:** none.

### B.3 Provider journey

#### S14 — Provider Home / Dashboard
- **Source:** `lib/screens/provider_home_screen.dart` (959 lines)
- **Role/task:** availability toggle, earnings, commissions, pending/offered/active/rejected order
  entry points, reports, support, notifications, profile.
- **Entry/nav:** auth success provider branch.
- **Key components:** same AppBar pattern as customer; availability card, pending-work banner,
  earnings/commission cards, action tiles, refresh.
- **Shared components:** `AppActionTile`, `AppActionWrap`, `AppSectionHeader`, `AppStatusBadge`,
  `AppLoadingState`, `AppErrorState`, `AppFeedback`.
- **English:** ✅. **Arabic/RTL:** ✅.
- **Light:** ✅. **Dark:** ✅. **Visual:** ✅ three captures.
- **Small:** scrollable, 1040 max, bottom `SafeArea` (UX01-007 fix).
- **Large:** 1040 max, 2-column tiles ≥ 840.
- **Text scaling:** 1.5 tested; 200% not.
- **Semantics:** availability switch native; tiles announce counts (UX01-002); pending-work banner
  badge duplicates the banner count (F18).
- **States:** available/unavailable, pending work, loading/error branches **unreachable** with the
  current bloc (logic, D-4).
- **Inconsistencies:** banner is not tappable while the customer banner is (F25); hard-coded "ILS"
  (F17); component breakpoint 560 inside earnings (F12).
- **Logic dependencies:** provider state branch reachability; availability rules.

#### S15 — Pending Orders (provider)
- **Source:** `lib/screens/pending_orders_screen.dart` (702 lines)
- **Role/task:** review new orders, submit an offer, reject.
- **Entry/nav:** provider home pending tile; auto-push when new pending orders arrive.
- **Key components:** cooldown banner, order cards (description, customer, phone, area, images),
  submit/reject actions.
- **Shared components:** none (theme-aware inline).
- **English:** ✅. **Arabic/RTL:** ✅; reject dialog body forced RTL (F09).
- **Light:** ✅ theme-aware. **Dark:** ✅ theme-aware AppBar/cards (best secondary screen).
- **Visual:** source-only.
- **Small:** max 600; no bottom inset. **Large:** narrow column.
- **Text scaling:** action labels use `FittedBox` (shrink) at large text (F27).
- **Semantics:** images tappable without labels (F07).
- **Contrast:** `Colors.orange[800]` + white = 3.08:1 (fails 4.5) (F02).
- **States:** cooldown, empty, send offer, reject confirm, success/error snackbars.
- **Logic dependencies:** cooldown rules.

#### S16 — Offered Orders (provider)
- **Source:** `lib/screens/offered_orders_screen.dart` (455 lines)
- **Role/task:** orders where the provider already submitted an offer (read-only).
- **Entry/nav:** provider home offered tile.
- **Key components:** order cards with offer highlight (price/time), customer info, images.
- **Shared components:** none (theme-aware).
- **English:** ✅. **Arabic/RTL:** ✅.
- **Light:** ✅. **Dark:** ✅ (AppBar uses scheme).
- **Visual:** source-only.
- **Small:** max 600; no bottom inset. **Large:** narrow column.
- **Text scaling:** header row + awaiting badge; fine.
- **Semantics:** images unlabeled tappables (F07).
- **States:** empty, populated.
- **Logic dependencies:** none.

#### S17 — Active Orders (provider)
- **Source:** `lib/screens/provider_active_orders_screen.dart` (413 lines)
- **Role/task:** accepted/fulfilling orders; start delivery; confirm delivery.
- **Entry/nav:** provider home active tile.
- **Key components:** cards with status, customer, description, phone/area/images, actions by status.
- **Shared components:** none.
- **English:** ✅. **Arabic/RTL:** ✅.
- **Light:** ⚠️; **Dark:** ❌ white AppBar and hard-coded status colors.
- **Visual:** source-only.
- **Small:** max 600; no bottom inset. **Large:** narrow column.
- **Text scaling:** rows with icons/values risk at 200%.
- **Semantics:** active-order images are **not tappable** (unlike other lists) (F26).
- **Contrast:** green price 2.78:1; green/purple buttons fail (F02).
- **States:** loading, error (no retry), empty, accepted/fulfilling actions.
- **Logic dependencies:** order lifecycle (unchanged).

#### S18 — Rejected / Delivered Orders Report (provider)
- **Source:** `lib/screens/rejected_orders_screen.dart` (302 lines)
- **Role/task:** history of rejected and delivered orders.
- **Entry/nav:** provider home rejected-orders tile.
- **Key components:** cards with status chip, customer, description, reason, area.
- **Shared components:** none.
- **English:** ✅. **Arabic/RTL:** ✅.
- **Light:** ⚠️; **Dark:** ❌ white AppBar.
- **Visual:** source-only.
- **Small/large:** **no page max-width** (only the chat/settings screens also lack one) — inconsistent
  line lengths on tablets (F12). No bottom inset.
- **Text scaling:** 11–13 px fixed text; low risk but small.
- **Semantics:** status text present.
- **States:** loading, empty, error plain text without retry.
- **Logic dependencies:** none.

#### S19 — Order Report (customer order history per order)
- **Source:** `lib/screens/order_report_screen.dart` (511 lines)
- **Role/task:** outcome summary, order info, offer history for an order.
- **Entry/nav:** My Orders in report mode.
- **Key components:** outcome card, info rows, offer history cards.
- **Shared components:** none.
- **English:** ✅. **Arabic/RTL:** ✅.
- **Light:** ⚠️; **Dark:** ❌ white AppBar, hard-coded colors.
- **Visual:** source-only.
- **Small:** max 600; no bottom inset. **Large:** narrow column.
- **Text scaling:** info rows and offer rows; moderate risk.
- **Semantics:** text-based outcome with icon + color (not color alone).
- **Formatting:** dates rendered `yyyy-MM-dd HH:mm` with no locale formatting (F17).
- **States:** loading, error (no retry), empty offers.
- **Logic dependencies:** outcome mapping (business display logic).

### B.4 Settings / navigation context

#### S20 — Settings (unreachable)
- **Source:** `lib/screens/settings_screen.dart` (62 lines)
- **Role/task:** language and theme selection.
- **Entry/nav:** **no entry point exists**; not referenced anywhere outside its file (F23).
- **Key components:** two `ListTile` + `DropdownButton` rows.
- **Shared components:** theme only.
- **English/Arabic:** labels localized; language options show native names (correct).
- **Light/Dark:** theme-aware.
- **Visual:** source-only.
- **Small/large:** simple list, no max width, no bottom `SafeArea`.
- **Text scaling:** list grows; fine.
- **Semantics:** standard dropdowns/tiles.
- **States:** current theme/language only; no "follow system" option (F23).
- **Logic dependency:** adding a navigation entry and `ThemeMode.system` are navigation/state changes —
  owner authorization required (D-5).

### B.5 Shared presentation components

| Component | Assessment |
|---|---|
| `AppActionTile` / `AppActionWrap` | Sound API, semantics fixed in UX-01, min height 64, RTL chevrons; adopted by only 2 screens. |
| `AppButtonLoadingIndicator` | Correct loading contrast + live-region label; adopted by Login only. |
| `AppStatusBadge` | Good tone pairs, semantics label, min height 28; adopted by Provider Home only. |
| `AppSectionHeader` | Correct header semantics; adopted by 2 screens. |
| `AppFeedback` | Correct semantic tone snackbars; adopted by 3 screens. Other screens bypass it with palette colors. |
| `AppLoadingState` | Good; only in unreachable provider branches. |
| `AppErrorState` | Good, with retry; only in unreachable provider branches. |
| `AppEmptyState` | Unused. |
| `ImagePreview` | Functional; hard-coded English error, no semantic labels. |

---

## C. Standards assessment

Severity meaning: **Critical** = blocks use/acceptance; **High** = major accessibility/visual failure;
**Medium** = noticeable inconsistency/usability cost; **Low** = polish/debt.

### C.1 Confirmed high-impact findings

| ID | Screen/component | Source | Standard | Problem | User impact | Severity | Confidence | Recommended UI-only fix | Verification |
|---|---|---|---|---|---|---|---|---|---|
| UX02-F01 | 12 screens with AppBar | `create_order_screen.dart:63`, `my_orders_screen.dart:203`, `notifications_screen.dart:54`, `order_detail_screen.dart:204`, `order_offers_screen.dart:144`, `order_report_screen.dart:251`, `profile_screen.dart:315`, `provider_active_orders_screen.dart:177`, `rejected_orders_screen.dart:71`, `report_screen.dart:115`, `submit_offer_screen.dart:84`, `support_chat_screen.dart:134` | WCAG 1.4.3; Flutter theming; product light/dark promise | Hard-coded `Colors.white` app bar/black text ignores dark theme | Glaring white bars and unreadable headers in dark mode | High | Confirmed (source) | Remove color overrides; rely on `AppBarTheme`; add a shared scaffold | Dark-theme goldens/screenshots for each screen |
| UX02-F02 | Primary CTAs, price/status text across 14 screens | `create_order_screen.dart:215-227,310-315`; `order_detail_screen.dart:427-431,477-503,514-524`; `order_offers_screen.dart:362-366,574-620`; `submit_offer_screen.dart:169-174,208-213,298-306`; `report_screen.dart:168-175`; others (Appendix B) | WCAG 1.4.3 | Hard-coded Material 500 palette: white on orange **2.16:1**, green **2.78:1**, red **3.68:1**, blue **3.68:1**, teal **3.67:1**; orange/green text on white 2.16/2.78 | CTA labels and prices are hard to read, especially low vision/outdoors | High | Confirmed (computed) | Replace with `ColorScheme`/`AppSemanticColors` tones; use `FilledButton`/theme styles; verify ≥4.5:1 | `textContrastGuideline` + token contrast unit tests |
| UX02-F03 | 15 screens without bottom `SafeArea` | Screens not listed in Appendix B.3 (`SafeArea` only in login/forgot/home/provider/support) | Platform safe-area guidance; WCAG 1.4.10-adjacent | Last controls can sit under gesture/navigation insets | Buttons hard/impossible to tap on gesture-nav devices | High | Confirmed (source; same class as verified UX01-007) | Adopt a shared scaffold with bottom-safe page padding; verify per screen | `MediaQuery.viewPadding` widget tests per screen |
| UX02-F04 | Submit Offer; My Orders; Order Offers; role cards; AppBar rows | `submit_offer_screen.dart:96-107,313`; `my_orders_screen.dart:319-336`; `order_offers_screen.dart:361-369`; `login_screen.dart:225-249` | WCAG 1.4.4; Flutter text scaling | Submit Offer body is a non-scrollable `Column` (keyboard/landscape overflow); trailing rows and quick-button rows risk overflow at 200%; 200% untested app-wide | Clipped or unreachable controls for large-text users | High | Probable (structure) | Make forms scrollable; wrap/stack trailing metadata; avoid fixed rows at high scale | 200% matrix tests + overflow assertions |
| UX02-F05 | Create Order, Submit Offer, Report | `create_order_screen.dart:221-229`; `submit_offer_screen.dart:304-306`; `report_screen.dart:173-175` | WCAG 1.4.11; UX01-001 precedent | White spinner on light disabled background = **1.27:1**; still the pre-remediation pattern | Loading state appears frozen; no progress feedback | High | Confirmed (computed) | Use `AppButtonLoadingIndicator` at all loading call sites | Rendered contrast tests per call site (light/dark) |
| UX02-F06 | Create-order photo remove; chat send; notification thumb | `create_order_screen.dart:281-299`; `support_chat_screen.dart:209-212`; `notifications_screen.dart:116-132` | WCAG 2.5.8; Android 48 dp; iOS 44 pt | 20×20 remove control; ~40 px chat send; 44×44 thumbnails | Mis-taps; hard to hit for motor impairments | High | Confirmed (source) | ≥48 dp targets with spacing; use IconButton/FilledButton with labels | `androidTapTargetGuideline`/`iOSTapTargetGuideline` |
| UX02-F07 | Create-order cards; image thumbnails; profile icons; chat send; unread dot | `create_order_screen.dart:361-394`; `notifications_screen.dart:116-170`; `profile_screen.dart:341,383`; `support_chat_screen.dart:209-212` | WCAG 4.1.2; Flutter semantics | Custom tappables expose no name/role; images have no labels; unread state not announced | Screen-reader users cannot discover actions or status | High | Confirmed (source) | Add `Semantics(button/label/selected)` and `semanticLabel` on images; tooltips/labels on icon buttons | `labeledTapTargetGuideline` + semantics-tree tests |
| UX02-F08 | Profile, Report, Support Chat, Notifications fragments, conflict dialog, Submit Offer `'د'`, ImagePreview | `profile_screen.dart:317-369`; `report_screen.dart:66,86-89,143-190,257`; `support_chat_screen.dart:136,146,198`; `notifications_screen.dart:150,285,289`; `order_offers_screen.dart:521-537`; `submit_offer_screen.dart:213`; `image_preview.dart:31` | Flutter i18n; WCAG 3.1.2 (where applicable) | Entire English screens still render Arabic; mixed-language UI | English users cannot understand critical flows (profile, complaint, support) | High | Confirmed (source) | Move all UI strings to `AppLocalization` with AR/EN; keep legal bodies Arabic-only | EN/AR per-screen widget tests |
| UX02-F09 | Cancel/reject dialogs | `my_orders_screen.dart:76-79`; `order_offers_screen.dart:482-485`; `pending_orders_screen.dart:232-235` | Flutter `TextDirection`; i18n | `TextDirection.rtl` forced on localized body text even in English | Misaligned English text; bidi confusion | Medium | Confirmed (source) | Remove forced RTL from ordinary dialogs; derive from locale/content | EN/AR dialog direction tests |
| UX02-F10 | Unread notification dot; create-order cards; quick price/time buttons | `notifications_screen.dart:159-170`; `create_order_screen.dart:368-372`; `submit_offer_screen.dart:169-171,208-210` | WCAG 1.4.1 | State communicated only by color/background | Color-blind and screen-reader users miss status/selection | High | Confirmed (source) | Add icon/badge/check + semantics selected; never color alone | Semantics-tree + forced-colors reasoning |
| UX02-F11 | All list/detail screens | e.g. `my_orders_screen.dart:221-229`; `order_offers_screen.dart:199-201,456-463`; `notifications_screen.dart:82-91,183-189`; `provider_active_orders_screen.dart:195-210` | WCAG 3.3.1/3.3.3-adjacent; consistency | Bare spinners; grey empty text; red error text without retry; shared state views unused | Users cannot tell empty vs failed; no recovery path | Medium | Confirmed (source) | Adopt `AppLoadingState`/`AppEmptyState`/`AppErrorState` consistently | Widget tests for each state per screen |
| UX02-F12 | Width/breakpoints | 600×11, 500 (`profile:324`), 480 (`forgot:128`), 280 (`chat:160`), 560 (`provider_home:826`), 1024 picker (`create_order:52`) | Android window size classes; HIG layout | Ad-hoc widths; tokens (560/1040) barely adopted; no expanded layouts | Inconsistent line lengths and space use on tablets/desktops | Medium | Confirmed (source) | Introduce `AppSizes.formMaxWidth`/`contentMaxWidth`; use shared page container; define adaptive rules | Golden/layout tests at 360/600/840/1280 |
| UX02-F13 | Direction wrappers and hard-coded alignments | 12 screens wrap `Directionality` manually; `support_chat_screen.dart:156,163-168`; `support_chat_screen.dart:11` import absent for l10n | Flutter i18n | Duplicated locale-to-direction mapping; chat bubbles use fixed right/left and fixed corners | Divergence risk; RTL chat mirroring inconsistent | Low | Confirmed (source) | Remove redundant wrappers (MaterialApp supplies direction); use directional alignment/radii | RTL matrix tests |
| UX02-F14 | Both home AppBars | `home_screen.dart:453-593`; `provider_home_screen.dart:358-...` | HIG/Android layout; WCAG 1.4.10-adjacent | Four actions + profile title compete at ≤360 dp and 200% text | Truncated title / clipped actions | Medium | Needs runtime verification | Responsive AppBar: collapse overflow actions into a menu; test at 320/200% | Screenshot/overflow tests |
| UX02-F15 | Both home AppBars | `home_screen.dart:578-590`; `provider_home_screen.dart` logout action | Usability; destructive action guidance | Logout executes immediately, no confirmation | Accidental logout/session loss | Medium | Confirmed (source) | Add a localized confirmation dialog (presentation-only) | Widget test for confirm/cancel |
| UX02-F16 | Most screens' snackbars | `my_orders_screen.dart:122-126,152-157`; `profile_screen.dart:101,219,293`; `order_detail_screen.dart:124-127`; etc. | WCAG 3.3.1; content design | Raw `e.toString()` / server errors shown to users | Confusing technical text; possible information leakage | Medium | Confirmed (source) | Map to localized generic messages; keep details in logs | Error-path widget tests |
| UX02-F17 | Prices/dates | `provider_home_screen.dart:840,869` ("ILS"); `order_report_screen.dart:196-210`; `order_detail_screen.dart:427` | i18n; consistency | Hard-coded currency label; non-locale date/number formatting; no digit grouping | Mixed-language amounts; unfamiliar date formats | Low | Confirmed (source) | Central formatting helpers + localization keys; document locale policy | Formatting unit tests |
| UX02-F18 | Customer drivers banner; provider pending badge | `home_screen.dart:656-658`; `provider_home_screen.dart:812-816` | WCAG 1.3.1/4.1.2 | Container label duplicates child text; count announced twice | Noisy screen-reader output | Low | Confirmed (source) | Add `excludeSemantics` or merge into one label | Semantics-tree tests |
| UX02-F19 | Profile specifics | `profile_screen.dart:344` (20 px spinner box), `341/383` icon buttons, `371` password, `315` theme | WCAG 1.4.11/4.1.2; text scaling | Clipped spinner; unlabeled icon buttons; no visibility toggle; fixed colors | Poor feedback; inaccessible actions | Medium | Confirmed (source) | Use full-size state views, labeled IconButtons, password toggle | Widget/semantics tests |
| UX02-F20 | Create-order selection cards | `create_order_screen.dart:346-395` | WCAG 4.1.2/1.4.1; Flutter semantics | `GestureDetector` card: no button/selected semantics, no ink/focus, selected only by orange background | Selection unavailable to assistive tech; unclear pressed state | High | Confirmed (source) | Rebuild on `InkWell` + `Semantics(button, selected)` + check indicator | Semantics + tap tests |
| UX02-F21 | Notification unread/pin | `notifications_screen.dart:110,145-170` | WCAG 1.4.1/1.4.3 | Unread indicated only by background/dot; pin label 9 px white on orange 2.16:1 | Status invisible; unreadable pin label | Medium | Confirmed (computed) | Unread chip/icon + semantics; use tone tokens for pin | Semantics/contrast tests |
| UX02-F22 | Forgot-password header icons | `forgot_password_screen.dart:177,224-228` | WCAG 1.4.11 | `#1A237E` icon on dark `#121322` = 1.39:1 | Invisible illustrative icon in dark mode | Medium | Confirmed (computed) | Use `colorScheme.primary` or tone token | Light/dark screenshot |
| UX02-F23 | Settings | `settings_screen.dart`; no references outside file | Consistency; platform settings conventions | Screen unreachable; theme/language only in AppBars; no "follow system" | Users cannot find consolidated settings; system theme ignored | Medium | Confirmed (source) | Decide entry point and add `ThemeMode.system` — **navigation/state change needs owner authorization** | Navigation test + settings screen tests |
| UX02-F24 | Large screens | Most screens cap at 600; no list-detail | Android adaptive; HIG layout | Tablets/desktop show a narrow single column; unused space | Wasted space; lower information density | Medium | Confirmed (source) | Adaptive two-pane (list/detail) roadmap; raise content width consistently | Golden tests at 840/1280 |
| UX02-F25 | Provider pending banner | `provider_home_screen.dart:781-821` | Consistency | Banner visually mirrors customer tappable banner but is inert | Users tap it expecting navigation | Low | Confirmed (source) | Make it dismiss/read-only styling, or make it tappable if business allows | Interaction test |
| UX02-F26 | Active orders images | `provider_active_orders_screen.dart:313-331` | Consistency | Images are not previewable while every other list previews them | Inconsistent, lower utility | Low | Confirmed (source) | Use the shared image thumbnail/preview component | Widget test |
| UX02-F27 | Pending actions | `pending_orders_screen.dart:622-635,658-671` | WCAG 1.4.4 | `FittedBox(scaleDown)` shrinks labels when text is enlarged | Labels get smaller for users who need larger text | Medium | Confirmed (source) | Allow wrapping/vertical layout instead of scaling down | 200% test |
| UX02-F28 | All forms | Login, profile, report, create order, submit offer | i18n/bidi; Flutter `TextDirection` | Email/phone/ID fields inherit RTL and render mixed-direction values awkwardly | Misleading value order; hard to edit | Medium | Confirmed (source, pattern) | `textDirection: TextDirection.ltr` (+ textAlign) for technical identifiers | EN/AR form widget tests |
| UX02-F29 | Disabled labels | Theme `disabledForegroundColor` 38% | WCAG exempts disabled controls, but readability guidance | Disabled text is very low contrast (≈1.9–2.4:1) | Hard to read disabled/locked actions | Low | Confirmed (computed) | Consider 50–60% for better readability while staying visibly disabled | Token review |
| UX02-F31 | Login area dropdown | `login_screen.dart:93-115` (silent catch) | WCAG 3.3.1-adjacent | Asset load failure leaves an empty required dropdown with no message | Cannot complete registration; no explanation | Medium | Confirmed (source) | Show a load/error message with retry — requires surfacing the failure | Widget test with failing stub (logic D-1) |
| UX02-F32 | Support chat | `support_chat_screen.dart:155-184,209-212` | WCAG 1.4.1/4.1.2; usability | Failed messages show an unlabeled red icon, no retry; alignment/corners hard-coded for LTR | Failed sends are lost/confusing; RTL chat looks wrong | Medium | Confirmed/Probable | Add failed-label + retry affordance (logic), directional bubbles | Chat RTL/LTR tests |

### C.2 Cross-cutting principles behind the findings

- **WCAG 2.2 AA benchmark:** text 4.5:1 / large 3:1 (1.4.3); non-text 3:1 (1.4.11); no color-only
  meaning (1.4.1); resize text to 200% without loss (1.4.4); target size 24×24 minimum (2.5.8);
  name/role/value (4.1.2).
- **Platform guidance:** Android 48 dp and iOS 44 pt targets, safe-area respect, readable widths,
  and direction-aware layout are *platform expectations*, not WCAG clauses; they are evaluated
  separately above.
- **Flutter-specific:** `textContrastGuideline`, `androidTapTargetGuideline`,
  `iOSTapTargetGuideline`, `labeledTapTargetGuideline` are the automated verification tools planned
  for UX-03+; manual semantics-tree assertions are required for selected/loading/unread states.

### C.3 What is NOT a finding

- **Legal documents remaining Arabic-only** is the verified product-content policy; dialog titles
  and ordinary actions are localized (UX-01). It is not an i18n defect.
- **Manual brand palette (indigo/orange) identity** is retained; the problem is *hard-coded palette
  usage that bypasses accessible semantic roles*, not the brand itself.
- **Provider bottom inset** was already fixed in UX-01 and is verified; the finding is the
  **remaining 12 screens** without the same treatment.
- **Unreachable `ProviderLoading`/`ProviderError`** branches are documented, not fabricated.

---

## D. Reusable design-system assessment

### D.1 Tokens — retain

- **Color roles:** the light/dark `ColorScheme` and `AppSemanticColors` tone pairs pass AA/AAA for
  their intended text pairs (measured in Appendix A), e.g. light success 5.47:1, warning 5.84:1,
  info 6.07:1; dark success 7.51:1, warning 8.0:1, info 8.21:1. The base text pairs measure 6.95:1
  (light secondary) and 9.62:1 (dark secondary).
- **Spacing/radius/elevation/type scales:** coherent and usable; retain.
- **Component themes:** buttons/inputs/dialog/sheet/snackbar/chip/switch/list/theme defaults are
  sound; most screens simply bypass them.

### D.2 Components — retain and adopt

`AppActionTile`, `AppActionWrap`, `AppSectionHeader`, `AppStatusBadge`, `AppFeedback`,
`AppButtonLoadingIndicator`, `AppLoadingState`, `AppErrorState` are good APIs. **Adoption is the
problem**, not the components. `AppEmptyState` is currently unused (UX01-008 debt).

### D.3 Components/patterns to add (foundation for UX-03)

1. `AppScreenScaffold` — consistent AppBar, back handling, safe areas, page max width, optional
   actions overflow.
2. `AppPageWidth` — tokenized 560 (auth) / 600 (form) / 1040 (content) constraints.
3. `AppStatusChip` — replaces 8+ ad-hoc status containers; tone + icon + label, semantics built-in.
4. `AppImageThumbnail` — sized ≥48, semantics label, optional preview, error/loading states.
5. `AppConfirmDialog` — localized, direction-aware destructive confirmation.
6. `AppFormSection` / `AppTextField` variants — bidi-safe identifier fields, consistent labels/hints.
7. `AppCountBadge` — accessible count announcement without duplicate nodes.
8. `AppSectionCard` — consistent card radius/side/padding.

### D.4 Patterns duplicated today (evidence for UX-03)

- White AppBar + black back arrow: 12 screens (Appendix B.1).
- Page centering wrapper with a width: 11 screens (600×10 plus 500/480).
- Status chip containers: `my_orders`, `order_detail`, `provider_active`, `order_report`, `report`,
  `rejected_orders`.
- Bare loading/empty/error blocks: at least 8 screens.
- Confirm dialogs with forced RTL: 3 screens.
- Image thumbnail + preview: `notifications`, `create_order`, `order_detail`, `pending`, `offered`,
  `active` (six implementations).
- Manual `Directionality` wrapper: 12 screens.

### D.5 Theme support gaps

- No system-mode option (`ThemeMode.system`); state stores only light/dark.
- Hard-coded palette makes dark mode inconsistent despite a sound dark theme.
- No Arabic-specific typography policy/fallback documentation; the app relies on platform fallback.

---

## E. Prioritized implementation roadmap

Ordering is by user impact and severity (contrast, dark theme, blocked/unreadable flows first),
not by implementation ease. All phases run on `ux/01-remediation-20261109`.

### UX-03 — Shared UI foundation, visual consistency, accessibility baseline

**Scope:** eliminate cross-cutting defects before touching individual flows.
**Priority:** Critical path; every later phase depends on it.

**Screens/files expected:** `lib/widgets/ui/*` (new `app_screen_scaffold.dart`,
`app_page_width.dart`, `app_status_chip.dart`, `app_image_thumbnail.dart`,
`app_confirm_dialog.dart`), `lib/services/theme_service.dart` (only additive tokens/tones),
`lib/services/localization_service.dart` (new shared strings), all screen AppBars migrated
mechanically.

**UI-only tasks**
1. Remove every hard-coded AppBar/surface color (F01) by introducing and adopting a shared scaffold.
2. Replace hard-coded palette CTAs/status text with semantic tones; guarantee ≥4.5:1 (F02).
3. Adopt `AppButtonLoadingIndicator` at all loading call sites (F05).
4. Add bottom-safe page container and apply to all scrollable screens (F03).
5. Add `AppStatusChip`, `AppImageThumbnail`, `AppConfirmDialog`, `AppPageWidth`; migrate duplicates
   (F06/F07/F12/F13).
6. Add semantics to custom tappables and identifier fields; bidi `textDirection` for email/phone/ID
   (F07/F28).
7. Replace color-only states with icon/check + semantics (F10).
8. Make logout confirmable (F15).
9. Localize raw error presentation into generic localized messages (F16).
10. Introduce formatting helpers for currency/dates with documented locale policy (F17).

**Test strategy**
- Unit tests for tone-pair contrast (light/dark) with explicit ratios.
- Renderedwidget contrast tests for every shared CTA/loading state.
- `androidTapTargetGuideline`, `iOSTapTargetGuideline`, `labeledTapTargetGuideline`,
  `textContrastGuideline` on shared component galleries.
- Semantics-tree tests for status/selection/count components.
- Dark-theme golden tests for the shared scaffold.

**Acceptance criteria**
- Zero `Colors.white`/`Colors.black87`/Material-500 palette references in `lib/screens` (grep-based
  guard test).
- 100% of shared components meet 4.5:1 text / 3:1 non-text and ≥48 dp targets.
- All shared components expose name/role/state semantics in both locales.
- 100% of live loading buttons use the shared indicator.

**Dependencies:** none (must precede UX-04–07).
**Out of scope:** any BLoC/service/navigation change; system theme option; settings entry.

### UX-04 — Authentication and registration experience

**Scope:** login, registration, password recovery, legal dialogs.
**Priority:** High (first-run experience).

**Screens/files:** `login_screen.dart`, `forgot_password_screen.dart`, legal/contact dialogs,
localization keys.

**UI-only tasks**
1. Apply the UX-03 scaffold/loading/confirm components to auth screens.
2. Fix forgot-password icon contrast (F22).
3. 200% text-scale layout hardening for role cards and legal links (F04).
4. Bidi isolation for email/password fields; optional password visibility toggle (F28/F30).
5. Add error/empty/loading presentation for the area dropdown failure (F31 — depends on D-1).
6. Keep Arabic-only legal bodies; confirm EN titles/actions and RTL/LTR direction (policy).

**Test strategy**
- Full auth matrix: EN/AR × light/dark × 320/360/600/840 widths × 1.0/1.5/2.0 text.
- Semantics tests for role selection and loading; dialog direction tests.
- Golden screenshots (widget-based) + planned device smoke.

**Acceptance criteria**
- No overflow/clipping at 200% in either locale; no forced RTL in ordinary dialogs.
- All auth targets ≥48 dp; loading states announced; contrast ≥4.5:1.
- Area failure presents a clear localized message and retry path (after D-1 authorization).

**Dependencies:** UX-03; D-1 for the area error state.
**Out of scope:** auth logic, registration rules, document validation.

### UX-05 — Customer experience

**Scope:** customer home, create order, my orders, order detail/offers, complaint report, support chat.
**Priority:** High (core revenue journey).

**Screens/files:** `home_screen.dart`, `create_order_screen.dart`, `my_orders_screen.dart`,
`order_detail_screen.dart`, `order_offers_screen.dart`, `report_screen.dart`,
`support_chat_screen.dart`.

**UI-only tasks (ordered by impact)**
1. Localize Profile-adjacent customer surfaces and the **entire complaint screen** (F08).
2. Rebuild create-order option cards with semantics/selected/ink/focus and safe targets (F20/F06).
3. Replace palette CTAs/price colors with tones (F02) and fix disabled spinners (F05).
4. Add loading/empty/error states with shared views; do not conflate errors with empty (F11 + D-2).
5. Direction fixes: remove forced RTL dialogs; localize conflict dialog (F09/F08).
6. Safe areas + 200% layouts (F03/F04), including Submit Offer (provider-side but shared flow).
7. Destructive confirmations (cancel order already confirms; add logout confirmation — foundation).
8. Chat reliability presentation: failed label/retry (after D-3), bubble direction (F32).
9. AppBar action overflow strategy at narrow widths (F14).

**Test strategy**
- Per-screen matrix EN/AR × light/dark × compact/medium/expanded × 1.0/2.0.
- Interaction tests: option selection semantics, photo add/remove targets, cancel/confirm, offers accept.
- Semantics-tree assertions for counts/statuses; overflow assertions.
- Widget goldens + device smoke plan.

**Acceptance criteria**
- English flows contain no Arabic UI text (except documented legal bodies).
- No color-only status/selection; all custom actions labeled.
- No overflow/clipping at 200%; all bottom actions clear the system inset.
- All CTAs ≥4.5:1 (or large-text 3:1) and ≥48 dp.

**Dependencies:** UX-03; D-1/D-2 for true error states; D-3 for chat retry.
**Out of scope:** order lifecycle, pricing, offer acceptance logic, socket behavior.

### UX-06 — Provider experience

**Scope:** provider home, pending/offered/active/rejected orders, submit offer, order detail.
**Priority:** High (supply-side revenue journey).

**Screens/files:** `provider_home_screen.dart`, `pending_orders_screen.dart`,
`offered_orders_screen.dart`, `provider_active_orders_screen.dart`,
`rejected_orders_screen.dart`, `submit_offer_screen.dart`, `order_detail_screen.dart`.

**UI-only tasks**
1. Fix Submit Offer keyboard/landscape overflow (scrollable form) and quick-button selected states
   (F04/F10).
2. Replace white AppBars/palette colors in active/rejected/order detail (F01/F02).
3. Fix loading spinner contrast in Submit Offer (F05) and loading labels.
4. Safe areas + page widths for all provider lists; rejected list max width (F03/F12).
5. Localized minute suffix and all hard-coded Arabic (F08).
6. Image preview consistency (active orders) and accessible thumbnails (F26/F07).
7. AppBar action overflow at narrow widths/200% (F14).
8. Provider banner consistency (tappable or restyled read-only) (F25).

**Test strategy**
- Provider matrix (EN/AR × light/dark × sizes × scales) with availability interaction retained.
- Inset tests per list; 200% overflow tests; semantics tests for tiles/status/images.
- Golden screenshots (light/dark/AR/EN) + device smoke.

**Acceptance criteria**
- Provider screens fully readable in dark mode; zero hard-coded surface colors.
- No overflow at 200% in either locale, including keyboard-open Submit Offer.
- All counts/statuses announced once; all images labeled and previewable/disabled deliberately.

**Dependencies:** UX-03; D-4 for unreachable provider states; D-5 only if settings entry is approved.
**Out of scope:** availability rules, order lifecycle, commission/earnings calculations.

### UX-07 — Secondary screens and shared interaction surfaces

**Scope:** notifications, profile, settings decision, image preview, dialogs, snackbars.
**Priority:** Medium (frequency lower, but profile/support are trust-critical).

**Screens/files:** `notifications_screen.dart`, `profile_screen.dart`, `settings_screen.dart`
(subject to D-5), `image_preview.dart`, shared dialog/feedback components.

**UI-only tasks**
1. Notifications: dark theme, unread semantics/chip, pin label localization/contrast, empty/error
   states, image target/labels (F01/F02/F07/F08/F10/F21).
2. Profile: full localization, dark theme, labeled icon buttons, password visibility, unclipped
   loading, bidi fields (F08/F19/F28).
3. Settings decision: surface the existing screen or remove it from inventory; add system theme only
   with owner authorization (F23/D-5).
4. Image preview localization/semantics (F08/F07).
5. Standardize dialogs/snackbars (`AppConfirmDialog`, `AppFeedback`) and remove forced direction
   (F09/F16).

**Test strategy**
- Localization matrix for profile/report/support/notifications.
- Dark-theme goldens; semantics-tree tests for unread/pin/actions; 200% tests.
- Dialog direction tests EN/AR.

**Acceptance criteria**
- No untranslated UI in EN; zero hard-coded surface palette in these screens.
- Unread state clearly announced and not color-only.
- All icon-only actions labeled; profile flows usable with screen readers.

**Dependencies:** UX-03; D-5 for settings navigation/system theme; D-3 for chat retry.
**Out of scope:** profile API/session behavior, notification routing logic.

### UX-08 — Full responsive, accessibility, localization and visual-regression verification

**Scope:** program-level verification and regression prevention.
**Priority:** Required before acceptance.

**Tasks**
1. Build a screen matrix harness (screen × EN/AR × light/dark × 320/360/600/840/1280 ×
   1.0/1.5/2.0 × portrait/landscape where relevant).
2. Apply Flutter accessibility guidelines to every screen where applicable:
   `androidTapTargetGuideline`, `iOSTapTargetGuideline`, `labeledTapTargetGuideline`,
   `textContrastGuideline`; supplement with explicit semantics-tree assertions where guidelines are
   blind (selected/loading/unread).
3. Add golden baselines per screen/locale/theme/size; store outside runtime code; document update
   procedure.
4. Run **real emulator/device smoke tests** for Android and iOS, including Arabic font rendering
   (the widget-test renderer cannot rasterize Arabic glyphs without an Arabic-capable font).
5. Verify keyboard insets, safe areas, system theme behavior, notification badges.
6. Produce an acceptance scorecard (§F) with measured pass/fail counts and any documented exceptions.

**Acceptance criteria**
- Every screen passes the full automated matrix with zero overflow/clipping exceptions.
- 100% of interactive nodes meet target-size/label guidelines or have a documented, owner-approved
  exception.
- Goldens reviewed in light/dark and AR/EN; device smoke evidence attached.
- No P1/P2 finding remains without either a fix or a signed-off deferral.

**Dependencies:** UX-03–07.
**Out of scope:** performance benchmarking beyond obvious frame drops during animations.

---

## F. Acceptance scorecard

Measured per screen and aggregate; percentages are only computed as `passed / applicable` after the
matrix exists. No subjective “UX score” is used.

| # | Criterion | Measurement method | Threshold | Phase |
|---|---|---|---|---|
| 1 | Text contrast | `textContrastGuideline` + token contrast unit tests | 100% normal text ≥4.5:1; large ≥3:1 | UX-03+ |
| 2 | Non-text contrast | Computed token pairs + rendered icon/border checks | 100% essential icons/borders/states ≥3:1 | UX-03+ |
| 3 | Color-only meaning | Semantics-tree + code review for `Colors.*` state | 0 color-only status/selection states | UX-03+ |
| 4 | Android targets | `androidTapTargetGuideline` | 100% ≥48×48 dp or documented exception | UX-03+ |
| 5 | iOS targets | `iOSTapTargetGuideline` | 100% ≥44×44 pt or documented exception | UX-04+ |
| 6 | Accessible names | `labeledTapTargetGuideline` + manual semantics tests | 100% interactive nodes labeled with role | UX-03+ |
| 7 | State semantics | Semantics-tree assertions (selected, loading, unread, disabled) | 100% applicable states exposed | UX-03+ |
| 8 | Duplicate announcements | Semantics-tree node inspection | 0 duplicated labels for the same datum | UX-03+ |
| 9 | Text scaling | Matrix at 1.0/1.5/2.0, EN/AR | 0 overflow/clipping; no `FittedBox` shrink for essential labels | UX-04+ |
| 10 | Dark theme | Dark goldens + grep guard | 0 hard-coded surface/text colors | UX-03+ |
| 11 | RTL/LTR | EN/AR directional tests + screenshots | 0 forced RTL on ordinary UI; correct mirrored icons/alignment | UX-04+ |
| 12 | Localization completeness | Key coverage scan + widget tests | 0 untranslated UI strings (legal bodies excepted) | UX-04+ |
| 13 | Safe areas | Inset widget tests per scrollable screen | 100% bottom actions clear system insets | UX-03+ |
| 14 | Responsive layout | 320/360/600/840/1280 goldens + no-overflow assertions | 0 horizontal overflow; intentional use of expanded space | UX-08 |
| 15 | Interaction states | Per-component state checklist | Default/pressed/focus/selected/disabled/loading/success/error covered where representable | UX-03+ |
| 16 | Visual regression | Golden suite with reviewed baselines | 0 unreviewed diffs in CI | UX-08 |
| 17 | Runtime verification | Android + iOS device smoke evidence | Arabic renders correctly; insets/gestures verified | UX-08 |

**Current baseline (audit start):** criteria 1–2 partially met only in theme tokens; 3–17 not met
across the app. The UX-01 remediation scope is verified; the app-wide program has not started.

---

## Appendix A — Measured contrast (exact theme/palette values)

| Pair | Ratio | WCAG normal text |
|---|---|---|
| Light onSurface `#171A2B` on surface `#F6F7FB` | 13.24:1 | Pass |
| Light secondary `#4E5568` on `#F6F7FB` | 6.95:1 | Pass |
| Dark onSurface `#F2EFFA` on `#1A1B2E` | 14.92:1 | Pass |
| Dark secondary `#C5C1D2` on `#1A1B2E` | 9.62:1 | Pass |
| Light success pair `#1B6E3A` on `#DDF5E5` | 5.47:1 | Pass |
| Light warning pair `#8A4F00` on `#FFF0D5` | 5.84:1 | Pass |
| Light info pair `#1257A6` on `#E0EEFF` | 6.07:1 | Pass |
| Light error pair `#B3261E` on white | 6.54:1 | Pass |
| Dark success pair `#7FDB9C` on `#0C3B24` | 7.51:1 | Pass |
| Dark warning pair `#FFC56E` on `#4A2E00` | 8.0:1 | Pass |
| Dark info pair `#9CCBFF` on `#0A2D52` | 8.21:1 | Pass |
| **White on `Colors.orange` (#FF9800)** | **2.16:1** | **Fail** |
| **White on `Colors.orange[800]` (#EF6C00)** | **3.08:1** | **Fail** |
| **Orange #FF9800 text on white** | **2.16:1** | **Fail** |
| **Green #4CAF50 text on white / white on green** | **2.78:1** | **Fail** |
| **White on `Colors.red` (#F44336)** | **3.68:1** | **Fail** |
| **White on `Colors.blue[600]` (#1E88E5)** | **3.68:1** | **Fail** |
| **White on `Colors.teal` (#009688)** | **3.67:1** | **Fail** |
| **White on `Colors.green[600]` (#43A047)** | **3.30:1** | **Fail** |
| White on `Colors.purple` (#9C27B0) | 6.30:1 | Pass |
| Grey[700] `#616161` on white | 6.19:1 | Pass |
| **Grey[500] `#9E9E9E` on white** | **2.68:1** | **Fail** |
| **White spinner on light disabled `#E3E4E6`** | **1.27:1** | **Fail (non-text 3:1)** |
| **Forgot-password icon `#1A237E` on dark `#121322`** | **1.39:1** | **Fail (non-text 3:1)** |

## Appendix B — Cross-cutting hard-coded inventory

### B.1 Hard-coded white AppBars (12)
`create_order_screen.dart:63`, `my_orders_screen.dart:203`, `notifications_screen.dart:54`,
`order_detail_screen.dart:204`, `order_offers_screen.dart:144`, `order_report_screen.dart:251`,
`profile_screen.dart:315`, `provider_active_orders_screen.dart:177`,
`rejected_orders_screen.dart:71`, `report_screen.dart:115`, `submit_offer_screen.dart:84`,
`support_chat_screen.dart:134`.

### B.2 Hard-coded palette references (per file, count)
`my_orders` 28 · `order_detail` 28 · `order_offers` 27 · `provider_active` 22 · `order_report` 21 ·
`report` 20 · `profile` 18 · `submit_offer` 17 · `create_order` 15 · `rejected_orders` 15 ·
`notifications` 13 · `support_chat` 6 · `pending_orders` 5 · `forgot_password` 1.

### B.3 Screens with `SafeArea`
`login`, `forgot_password`, `home`, `provider_home`, `support_chat` (composer only). The remaining
15 screen files have no bottom-inset protection for their primary content.

### B.4 Untranslated UI strings (non-legal)
`profile_screen.dart` (21 lines), `report_screen.dart` (15), `notifications_screen.dart` (4),
`order_offers_screen.dart` (3), `support_chat_screen.dart` (3), `submit_offer_screen.dart` (1),
`image_preview.dart` (1). Login's 23 Arabic lines are the approved legal bodies, area-name data and
the bilingual language toggle.

## Appendix C — Verification commands used for this audit

```text
git rev-parse --show-toplevel                     → C:/Users/sare/Desktop/Delivery/stars_delivery_app
git status --short --branch                       → ## ux/01-remediation-20261109...origin/ux/01-remediation-20261109
git rev-parse HEAD                                → 828bc5eebc4b15b4b5bee1fd066b88ef8ceb5d17
git rev-parse HEAD^                               → e873038d6674dfd8f894a492d0332689bf666b80
git rev-parse main                                → a8b5f5f9de31a6471ef83f63be6237201f570fd8
git rev-parse ux/01-design-system-foundation-20261108 → e873038…
git merge-base --is-ancestor e873038 HEAD         → ANCESTRY_OK
flutter --version                                 → Flutter 3.47.4 stable
flutter test                                      → 00:16 +143: All tests passed! (exit 0)
flutter analyze --no-pub                          → exit 1, 16 info / 0 warnings / 0 errors (pre-existing)
```

## Appendix D — Logic dependencies (out of scope for this UX program)

| ID | Dependency | Affected files | Why UI cannot fix it alone | Proposed minimum change for owner authorization |
|---|---|---|---|---|
| D-1 | Silent error swallowing prevents true error/retry states | `home_screen.dart` (`_loadOrderCounts`, `_loadSupportUnreadCount`, `_loadAvailableDriversCount`), `login_screen.dart` (`_loadAreas`), `profile_screen.dart` (`_loadPhones`), `notifications`/lists | UI receives no failure signal to render an error state | Surface a failure flag/exception to the screen (or a small “load failed” state) — affects state logic only |
| D-2 | Error vs empty collapse | `my_orders_screen.dart:53-68` sets `_orders = null` on failure → “no orders” | User is told there are no orders when loading failed | Track an explicit error field and render `AppErrorState` |
| D-3 | Chat resend/retry | `support_chat_screen.dart:112-118` marks `failed` but offers no retry | UI cannot re-send without calling the service | Add a retry event/callback using the existing service |
| D-4 | Unreachable provider loading/error branches | `provider_bloc.dart` (inherited UX-01 change), `provider_home_screen.dart:336-346` | States cannot be emitted by the current bloc | Decide whether to emit loading/error states; do not fabricate them |
| D-5 | Settings entry point and system theme | `settings_screen.dart` (unreferenced), `app_state.dart` (ThemeMode light/dark only), navigation | Adding a destination and a new theme mode touches navigation/state models | Owner authorization for a settings route and `ThemeMode.system` |
| D-6 | Locale-aware currency/date formatting | Screens formatting amounts/dates; `localization_service` | `intl` usage/dependency policy and data formatting rules need a product decision | Approve formatting policy/dependency or manual helpers |
| D-7 | Area dropdown asset failure | `login_screen.dart:93-115` | UI cannot distinguish “not loaded yet” from “failed” | Same as D-1 (surface the failure) |

---

*End of UX-02 audit and roadmap.*
