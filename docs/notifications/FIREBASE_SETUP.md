# Firebase Push Notifications Setup

The app and API are already wired for Firebase Cloud Messaging. Actual push
delivery requires a Firebase project and platform credentials; without them the
feature is disabled safely and the rest of the app keeps working.

## 1. Firebase project

1. Create a Firebase project in the Firebase console.
2. Add an Android app with package name:
   `com.swifora.app`
3. Add an iOS app with bundle id:
   `com.swifora.app`
4. Enable **Cloud Messaging**.
5. For iOS, upload an APNs authentication key under
   Project Settings → Cloud Messaging → Apple app configuration.

## 2. Android and iOS client values

The Flutter client reads Firebase options from compile-time values. Pass
`--dart-define` values when building/running (do not commit real credentials to
the repository):

```bash
flutter run \
  --dart-define=FIREBASE_API_KEY=... \
  --dart-define=FIREBASE_PROJECT_ID=... \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=... \
  --dart-define=FIREBASE_STORAGE_BUCKET=... \
  --dart-define=FIREBASE_ANDROID_APP_ID=... \
  --dart-define=FIREBASE_IOS_APP_ID=... \
  --dart-define=FIREBASE_IOS_BUNDLE_ID=com.swifora.app
```

Optional: `FIREBASE_MEASUREMENT_ID`.

Release builds must use the same values or a CI secret store that injects them.

Simpler: keep the values in a JSON file **outside the repository** and pass it
with `--dart-define-from-file`. The keys are the same names as above (plus
`STARS_SERVER_URL`); the values come from `google-services.json`:

| Define | `google-services.json` field |
|---|---|
| `FIREBASE_API_KEY` | `client[].api_key[0].current_key` |
| `FIREBASE_PROJECT_ID` | `project_info.project_id` (`swiforaa`) |
| `FIREBASE_MESSAGING_SENDER_ID` | `project_info.project_number` |
| `FIREBASE_STORAGE_BUCKET` | `project_info.storage_bucket` |
| `FIREBASE_ANDROID_APP_ID` | `client[].client_info.mobilesdk_app_id` |

```bash
flutter build apk --release --dart-define-from-file=C:/secure/swifora-defines.json
```

The Android app is registered in the Firebase project `swiforaa` with package
`com.swifora.app`. The Gradle `google-services` plugin is **not** needed.

## 3. API server credentials

Set one of these in `swifora_backend/.env`:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# or:
FIREBASE_SERVICE_ACCOUNT_PATH=C:/secure/firebase-service-account.json
```

Grant the service account Firebase Cloud Messaging permissions. Never commit the
service-account JSON or `.env` to Git.

On the production server: copy the service-account JSON to a protected path
readable only by the service user (for example `/etc/stars-delivery/firebase.json`,
mode 600), set `FIREBASE_SERVICE_ACCOUNT_PATH` to it in the service environment,
and restart the API. A wrong or missing key only disables pushes; the log then
shows `Firebase Admin initialization skipped: …`.

The server uses the modular `firebase-admin` v14 API (`firebase-admin/app`,
`firebase-admin/messaging`); the old `admin.credential` API no longer exists.

## 4. What is sent

- Every persisted user notification is also sent through FCM when a device token
  exists (offers, accepted offers, delivery confirmation, delivery result,
  ratings, report replies, broadcasts).
- New orders are pushed to eligible providers in the same village/governorate
  who are available and support the order type.
- The app registers its FCM token after login and removes it on logout.

## 5. App behaviour

- **App closed or in the background:** Android shows the notification in the
  tray by itself (the server sends a `notification` block). The app creates the
  `swifora_default` channel with high importance ("Order updates" /
  "تحديثات الطلبات"), so order pushes appear as heads-up alerts.
- **Tapping a notification** opens the related screen: offers for a customer's
  order, the order detail for drivers, in-progress orders for delivery
  confirmation, the rejected-orders report for "offer not selected", and the
  notifications list otherwise (`lib/services/notification_router.dart`). This
  also works when the tap launches the closed app.
- **App open:** the push is shown as a short in-app message (Android does not
  put foreground pushes in the tray).
- **Logout:** the app removes its device token before revoking the session, and
  the server deletes all of the account's tokens on logout, so a signed-out
  phone stops receiving that account's pushes.

## 6. Verification

1. Start the API with Firebase credentials configured.
2. Build and install the app with the Firebase dart-defines.
3. Log in on a physical Android or iOS device and confirm
   `POST /api/users/push-token` succeeds.
4. Create an order or trigger a notification and verify delivery in the
   background/closed app.
5. For iOS, test with an Apple development provisioning profile that includes
   the Push Notifications capability.
