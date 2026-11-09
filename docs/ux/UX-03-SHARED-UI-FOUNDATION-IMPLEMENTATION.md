# UX-03 — Shared UI Foundation, Cross-Screen Consistency & Accessibility Baseline

**Project:** Stars Delivery (`stars-delivery`)
**Canonical branch:** `ux/01-remediation-20261109`
**Base commit:** `d2f5ff8fdd3448ece7f68a6abe597ffb7bb73248` (UX-02 audit)
**Flutter SDK:** 3.47.4 stable
**Scope:** UI/UX-only implementation. No business logic, BLoC orchestration, service, API, model, database, socket, navigation destination, or dependency change.

---

## 1. Scope completed

| Workstream | Status |
|---|---|
| UX03-A — Theme-aware AppBars and surfaces (12 screens) | Complete |
| UX03-B — Semantic colors, CTA/status contrast | Complete for UX-03 scope |
| UX03-C — Loading indicators (3 remaining sites) | Complete |
| UX03-D — Safe areas / system insets (13 screens + chat composer) | Complete |
| UX03-E — Touch targets (photo remove, chat send, thumbnails) | Complete |
| UX03-F — Semantics and color-independent states | Complete for shared/custom controls |
| UX03-G — Directional identifier fields | Complete for email/phone/ID fields |
| UX03-H — Logout confirmation | Complete (customer + provider) |

Deferred UX-02 findings are listed in §15.

---

## 2. Files changed

### New shared presentation widgets (3)

| File | Why it exists | Real usage sites |
|---|---|---|
| `lib/widgets/ui/app_status_chip.dart` | One tone-driven status chip with a single semantic label; replaces six ad-hoc colored containers and makes status never color-only | My Orders, Order Detail, Provider Active Orders, Order Report (2 chips), Rejected Orders, Report |
| `lib/widgets/ui/app_image_thumbnail.dart` | Guaranteed ≥48 dp hit area, accessible image name, consistent error state; replaces four duplicated `GestureDetector`/`ClipRRect`/`Image.network` implementations | Notifications, Create Order gallery, Order Detail, Pending Orders, Offered Orders, Provider Active Orders |
| `lib/widgets/ui/app_confirm_dialog.dart` | Localized, direction-aware confirmation helper returning a bool; also hosts the logout confirmation | Customer logout, Provider logout, Cancel Order (My Orders), Cancel Order (Order Offers), Reject Order (Pending Orders) |

**Not created, deliberately:**

- **No `AppScreenScaffold`.** `AppBarTheme` already supplies background, foreground, icon theme, elevation and title style. Removing per-screen overrides was sufficient and avoids a wrapper around 19 screens.
- **No `AppPageWidth`.** Width consolidation is UX-02 finding F12 and belongs to the screen phases; adding an unused wrapper now would be premature abstraction.

### Modified application files (19)

`lib/screens/`: `create_order_screen.dart`, `forgot_password_screen.dart`, `home_screen.dart`, `login_screen.dart`, `my_orders_screen.dart`, `notifications_screen.dart`, `offered_orders_screen.dart`, `order_detail_screen.dart`, `order_offers_screen.dart`, `order_report_screen.dart`, `pending_orders_screen.dart`, `profile_screen.dart`, `provider_active_orders_screen.dart`, `provider_home_screen.dart`, `rejected_orders_screen.dart`, `report_screen.dart`, `submit_offer_screen.dart`, `support_chat_screen.dart`,
`lib/services/localization_service.dart` (UI keys only).

### Modified tests (3)

- `test/mock_api_server.dart` — added `responseDelay` (observing genuine loading) and `notifications` fixtures.
- `test/offer_flow_ui_test.dart` and `test/offer_timer_ui_test.dart` — two pre-existing source-string assertions referenced the old implementation (`.replaceAll` layout, `'Colors.red'`). They were replaced with equivalent formatting-tolerant/semantic assertions; no coverage was removed (see §12).

### New UX-03 tests (8)

`test/ux03_screen_harness.dart`, `test/ux03_shared_components_test.dart`, `test/ux03_appbar_migration_test.dart`, `test/ux03_safe_area_test.dart`, `test/ux03_loading_sites_test.dart`, `test/ux03_touch_targets_test.dart`, `test/ux03_logout_confirmation_test.dart`, `test/ux03_screenshots_test.dart`.

### Explicitly untouched

- `lib/bloc/provider/provider_bloc.dart` (inherited UX-01 change) — untouched.
- All other BLoCs, services, repositories, models, APIs, backend, `pubspec.yaml`/`pubspec.lock`, routes/navigation destinations.

---

## 3. Existing design system reused

- `ColorScheme` + `AppSemanticColors` + `AppTone` (`appToneStyle`) for every semantic pairing.
- `AppSpacing`, `AppRadius`, `AppSizes` tokens.
- `AppButtonLoadingIndicator` (existing UX-01 widget) at the remaining call sites.
- `AppStatusBadge` (notifications pinned/unread badges).
- `AppFeedback` for success/info/warning/error snackbars.
- `AppActionTile`/`AppActionWrap`/`AppSectionHeader` unchanged.
- `Responsive` padding helpers retained.

No alternative design system, palette, or token was introduced.

---

## 4. AppBar migration results (12/12)

Every audited screen now uses the theme `AppBarTheme` (surface background, onSurface title, onSurfaceVariant icons, elevation 0) and relies on the automatic localized back button:

| Screen | Change |
|---|---|
| Create Order | removed white/black overrides and explicit leading |
| My Orders | removed white/black overrides and explicit leading |
| Notifications | removed white/black overrides and explicit leading |
| Order Detail | removed white/black overrides and explicit leading |
| Order Offers | removed white/black overrides and explicit leading |
| Order Report | removed white/black overrides and explicit leading |
| Profile | removed white/black overrides and explicit leading |
| Provider Active Orders | removed white/black overrides and explicit leading |
| Rejected Orders | removed white/black overrides and explicit leading |
| Report / Complaint | removed white/black overrides and explicit leading |
| Submit Offer | removed white/black overrides and explicit leading |
| Support Chat | removed white/black overrides and explicit leading |

Pending Orders and Offered Orders already used theme surfaces and were retained; their AppBars were not in the failing list.

**Verification:** `test/ux03_appbar_migration_test.dart` renders all 12 screens in light and dark and asserts, for each: exactly one `AppBar`, `backgroundColor == null`, `foregroundColor == null`, `elevation == null`, and that the inherited `AppBarTheme` equals the theme's `surface`/`onSurface`.

---

## 5. Color and contrast measurements

All semantic pairs now come from `AppTone`/`AppSemanticColors`; **no hard-coded Material palette remains in `lib/screens` or `lib/widgets/ui`** except intentional fixed media surfaces in `image_preview.dart` (black viewer, white spinner) and error/dialog colors derived from `ColorScheme`.

Measured ratio (WCAG formula) for every tone pair used in the app; `test/ux03_shared_components_test.dart` enforces **≥4.5:1** for all of them in both themes:

| Tone | Light foreground/background | Light onSolid/solid | Dark foreground/background | Dark onSolid/solid |
|---|---|---|---|---|
| primary | 15.22 | 13.24 | 8.74 | 9.18 |
| accent | 13.28 | 6.06 | 8.84 | 7.86 |
| success | 11.77 | 6.29 | 10.50 | 7.82 |
| warning | 13.09 | 6.56 | 9.89 | 8.61 |
| info | 13.92 | 7.14 | 11.23 | 7.76 |
| danger | 13.26 | 6.54 | 10.24 | 7.72 |
| neutral | 15.11 | 7.44 | 11.21 | 10.02 |

Previously failing palette combinations (white on orange **2.16:1**, white on green **2.78:1**, white on red **3.68:1**, orange/green text on white 2.16/2.78) were replaced by the tone pairs above. Semantic distinctions are preserved:

- Primary actions (submit/accept progress) → `AppTone.primary`/`accent`/`info` as contextually appropriate.
- Success/completion → `AppTone.success`.
- Destructive/rejected/expired → `AppTone.danger`/`ColorScheme.error`.
- Warning/pending/suspended → `AppTone.warning`.
- Information/awaiting → `AppTone.info`.
- Neutral/read-only → `AppTone.neutral`.

Status is never color-only: every status has a text label (`AppStatusChip` or plain text), and chips announce their label as one semantic node.

---

## 6. Loading indicator migrations

`AppButtonLoadingIndicator` replaced the remaining white-on-disabled spinners:

| Screen | Call site | Previous | Now |
|---|---|---|---|
| Create Order | submit action | white 20×20 spinner on disabled surface (1.27:1) | shared indicator (`onSurface`, live region) |
| Submit Offer | send offer action | same | shared indicator |
| Report / Complaint | send report action | same | shared indicator |
| Password Recovery | request code / reset password | raw theme spinner, no loading label | shared indicator (contrast + live region) |

The indicator keeps the button disabled (`onPressed: null`) and announces “Loading…” exactly once (`test/ux03_loading_sites_test.dart`, including `find.bySemanticsLabel('Loading...')`).

---

## 7. Safe-area changes and rationale

A page-level `SafeArea(top: false)` now protects the primary content of:

Create Order, My Orders, Notifications, Order Detail, Order Offers, Order Report, Profile, Provider Active Orders, Rejected Orders, Report, Submit Offer, Pending Orders, Offered Orders.

Why per screen:

- All are scrollable content or have bottom-most actions where the last item can sit under the gesture/navigation bar.
- `top: false` avoids duplicating the AppBar's top inset.
- Support Chat keeps its existing composer `SafeArea`; the message list is above the composer.
- Submit Offer additionally became a `SingleChildScrollView` so the added inset and the software keyboard cannot clip the action; this also removes a pre-existing keyboard-overflow risk without touching submission logic.
- No horizontal/top padding was added; no `SafeArea` wraps a whole Scaffold.

Verification (`test/ux03_safe_area_test.dart`, 16 tests):
- 13 structural checks that a `SafeArea(top: false, bottom: true)` exists around primary content with a simulated 40 dp inset.
- Create Order submit action measured above the 40 dp inset.
- Create Order usable with a 300 dp keyboard inset (no overflow; action reachable above the keyboard).
- Chat send button measured above the 40 dp inset.

**Note:** `FakeViewPadding` values are physical pixels; tests multiply the logical inset by `devicePixelRatio` to simulate 40/300 logical dp correctly.

---

## 8. Touch-target measurements

| Control | Before | After |
|---|---|---|
| Create Order photo remove | ~20×20 `GestureDetector`, unlabeled | `IconButton` with 48×48 constraints, tooltip “Remove photo”; visual chip stays 20 px |
| Support Chat send | ~40 px circle with unlabeled icon | `IconButton.filled` with enforced 48×48 minimum and tooltip “Send message” |
| Notification image thumbnail | 44×44 tappable image, no label | `AppImageThumbnail` 48×48 hit area (44 px image), label “View image” |
| Order galleries | 60/70/84 px images via unlabeled `GestureDetector` | `AppImageThumbnail` with ≥48 dp hit area and label “View image” |

Verification: `test/ux03_touch_targets_test.dart` (photo add via a mocked `image_picker` channel + real temp PNG, removal), chat send, notification thumbnail (names + ≥48 dp). Shared component test covers a 44 px image expanding to 48 dp.

---

## 9. Semantics and color-independent states

- **Create Order option cards**: `Semantics(button, selected, label)`, `excludeSemantics`, `InkWell` for press/focus, plus a check icon when selected; selected state no longer color-only.
- **Submit Offer quick price/time**: replaced OutlinedButtons with `ChoiceChip` (native selected semantics, checkmark, keyboard focus); the hard-coded Arabic `'د'` suffix was replaced with the existing localized `minutes_suffix` key while rewriting the control (no new translation invented).
- **Status chips**: one label, `container: true`, `excludeSemantics: true`; no duplicate child text.
- **Notification unread**: replaced the 10 px color-only dot with a localized “Unread” badge; pinned uses a localized “Pinned” badge with icon, replacing the 9 px white-on-orange label (2.16:1).
- **Image thumbnails**: labelled as images/buttons; decorative error icons remain non-interactive.
- **Icon-only actions**: Profile save/add/delete and Chat send now have tooltips/labels.
- **Home notification badges**: announce “N unread notifications” instead of a bare number.
- **Duplicate announcements removed**: customer available-drivers banner excludes child semantics; provider pending-work badge is excluded because the banner text already announces the count.
- **Chat failed message**: now has a localized semantic label (“Message failed to send”); retry remains a logic dependency (D-3).

---

## 10. Directional text-field improvements

`textDirection: TextDirection.ltr` applied to technical identifiers while labels/layout stay in the app locale:

- Login: email, phone.
- Password Recovery: email.
- Create Order: contact phone.
- Submit Offer: price and custom-time numeric fields.
- Profile: email, phone, public ID text; email field edit.
- Report / Complaint: reported public ID field.

Passwords remain locale-neutral (obscured); no whole-screen LTR forcing was introduced.

---

## 11. Logout confirmation behavior

- A shared localized dialog (`showLogoutConfirmation`) is used by **both** customer and provider home AppBars.
- Title/message/actions localized in Arabic and English; direction follows the locale (verified RTL in the shared test).
- Cancel: no action, no logout.
- Confirm: the existing code path runs exactly once (`SocketService.disconnect()`, `AuthBloc.LogoutEvent`, existing `pushAndRemoveUntil(LoginScreen)`), unchanged.
- Tests: `test/ux03_logout_confirmation_test.dart` (customer cancel + confirm; provider confirm; both land on `LoginScreen`; no navigation on cancel).

---

## 12. Tests added and results

### New UX-03 tests (43 tests)

| File | Tests | Verifies |
|---|---|---|
| `ux03_shared_components_test.dart` | 6 | Tone contrast light/dark; status chip label once; 48 dp thumbnail + name/role; confirmation dialog cancel/confirm; localized RTL logout dialog; loading indicator onSurface + live region |
| `ux03_appbar_migration_test.dart` | 12 | Each migrated AppBar inherits theme in light and dark |
| `ux03_safe_area_test.dart` | 16 | 13 screen insets + create-order action + keyboard inset + chat composer |
| `ux03_loading_sites_test.dart` | 3 | Shared indicator + single “Loading…” announcement at three call sites |
| `ux03_touch_targets_test.dart` | 3 | Photo remove, chat send, notification thumbnail sizes/names |
| `ux03_logout_confirmation_test.dart` | 2 | Customer cancel/confirm; provider confirm |
| `ux03_screenshots_test.dart` | 1 disabled stub / 31 captures | Gated visual evidence |

### Updated existing tests

`test/offer_flow_ui_test.dart` and `test/offer_timer_ui_test.dart` contained brittle source-string assertions tied to the previous implementation:
- localization call layout → formatting-tolerant `RegExp` that still requires the `est_time` localization and time interpolation;
- `contains('Colors.red')` → `contains('AppTone.danger')`, preserving the expired-state failure meaning under the semantic tone migration.

These are equivalent assertions, not weakened coverage.

### Full results

```
flutter test
→ 00:23 +186: All tests passed!        (exit 0)
```

186 = 143 pre-existing + 43 UX-03 tests.

---

## 13. Visual evidence

**Location:** `C:\Users\sare\Desktop\UX-03-screenshots\` (outside the repo)
**Method:** genuine widget-test rasterization via `RenderRepaintBoundary.toImage(pixelRatio: 2.0)`, test surface 800×600 logical, PNG **1600×1200**. Not device screenshots.

**Contents (31 PNGs):**

- `ux03_<screen>_light.png` / `ux03_<screen>_dark.png` for all 12 migrated AppBars.
- `ux03_status_chips_light.png`, `ux03_status_chips_dark.png` — all seven tones.
- `ux03_loading_create_order_light.png`, `ux03_loading_submit_offer_light.png`, `ux03_loading_report_light.png`.
- `ux03_logout_dialog_en_light.png`, `ux03_logout_dialog_ar_dark.png`.

**Visually inspected:** AppBar migrations in light/dark (dark surfaces, readable titles/actions), status chip gallery, logout dialogs (LTR and RTL; red destructive confirm), loading states, and the ChoiceChip selected state.

**Limitations:** the test renderer has no Arabic-capable font, so Arabic glyphs rasterize as placeholder boxes; direction/layout are genuine. Device/emulator screenshots and Arabic glyph fidelity remain UX-08 verification work. The earlier debug banner was disabled for these captures.

**Reproduce:**
```
STARS_UX03_SCREENSHOTS=1 flutter test test/ux03_screenshots_test.dart
→ 00:07 +31: All tests passed!
```

---

## 14. Command results (actual exit codes)

| Command | Result |
|---|---|
| `flutter test` | **exit 0** — 186 passed |
| `flutter analyze --no-pub` | **exit 1** — 13 `info`, 0 warnings, 0 errors |
| `dart format --output=none --set-exit-if-changed <33 changed files>` | **exit 0** — 0 changed |
| `git diff --check` | **exit 0** — no whitespace errors |
| Gated capture run | **exit 0** — 31 captures |

Analyzer note: the UX-02 baseline had **16** info findings. The UX-03 tree has **13**, with **no new findings**: three pre-existing findings disappeared because the rewritten regions no longer contain them (2 `unnecessary_underscores` in Notifications, 1 `unnecessary_brace_in_string_interps` in Submit Offer). No lint was disabled or suppressed, and the command still exits 1 (pre-existing findings), so it is not reported as passing.

Formatting: all 33 touched Dart files are formatter-clean. `api_config.dart` and `provider_bloc.dart` remain pre-existing non-compliant but were not touched in UX-03. Because several legacy screens were formatter-non-compliant before this phase, normalizing the touched files produces whitespace/reflow churn in the diff; `git diff --ignore-all-space` is recommended for semantic review.

---

## 15. Logic dependencies deferred (unchanged)

- **D-1** Silent service errors still prevent real error/retry states (home counts, area dropdown, profile phones, lists).
- **D-2** My Orders still conflates load failure with “no orders”.
- **D-3** Chat failed messages still cannot be retried.
- **D-4** Provider loading/error states remain unreachable; not fabricated.
- **D-5** Settings route and `ThemeMode.system` not added.
- **D-6** Currency/date formatting (`intl`) not changed; all displayed values and symbols remain as before.

No logic change was made in UX-03.

---

## 16. Remaining UX-02 findings (not part of UX-03)

| Finding | Status after UX-03 |
|---|---|
| F01 white AppBars | **Fixed** (12/12) |
| F02 palette contrast | **Fixed for CTA/status surfaces in scope**; further screen-specific polish continues in UX-05/06 |
| F03 safe areas | **Fixed** on the migrated screens (13 + composer) |
| F04 text scaling/overflow | Partially mitigated (Submit Offer now scrollable; keyboard test); full 200% matrix remains UX-08 |
| F05 loading contrast | **Fixed** at all identified sites |
| F06 touch targets | **Fixed** for photo remove, chat send, notification thumbnails |
| F07 semantics gaps | **Fixed for shared/custom controls touched**; screen-specific labels continue in later phases |
| F08 untranslated Profile/Report/Support/Notifications strings | **Deferred** to UX-05/07 (shared components are localized) |
| F09 forced RTL dialogs | **Fixed** for cancel/reject confirmations via the shared dialog; the Arabic-only conflict dialog content remains until its localization phase |
| F10 color-only states | **Fixed** for create-order selection, submit-offer chips, status chips, notification unread |
| F11 shared empty/error states | Deferred to UX-05/06/07 |
| F12 ad-hoc widths / adaptive layouts | Deferred (AppPageWidth intentionally not created yet) |
| F13 direction wrappers | Unchanged (future clean-up) |
| F14 AppBar crowding at 200% | Needs runtime verification (UX-08) |
| F15 logout confirmation | **Fixed** |
| F16 raw exception text | Deferred to screen phases |
| F17 currency/date formatting | Deferred (D-6) |
| F18 duplicate announcements | **Fixed** for the two identified banners |
| F19 Profile specifics | Partial (targets/labels/icons/dark surfaces fixed); password visibility remains UX-07 |
| F20 create-order selection semantics | **Fixed** |
| F21 notification unread/pin | **Fixed** (localized badges, contrast, dark theme) |
| F22 recovery icon contrast | **Fixed** |
| F23 settings screen | Deferred (D-5) |
| F24 adaptive large screens | Deferred (UX-08) |
| F25 provider banner | Deferred (UX-06) |
| F26 active-order image previews | **Fixed** (now previewable + labelled) |
| F27 FittedBox label shrink | Deferred (UX-06) |
| F28 bidi identifier fields | **Fixed** for email/phone/ID fields |
| F29 disabled text readability | Unchanged (exempt from WCAG; token review later) |
| F30 password visibility toggle | Deferred (UX-04/07) |
| F31 area dropdown silent failure | Deferred (D-1) |
| F32 chat failure state | Partial (semantic label); retry deferred (D-3) |

---

*End of UX-03 implementation record.*
