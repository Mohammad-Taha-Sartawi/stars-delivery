# Firebase Push Notifications Setup

The app and API are already wired for Firebase Cloud Messaging. Actual push
delivery requires a Firebase project and platform credentials; without them the
feature is disabled safely and the rest of the app keeps working.

## 1. Firebase project

1. Create a Firebase project in the Firebase console.
2. Add an Android app with package name:
   `com.starsdelivery.stars_delivery`
3. Add an iOS app with bundle id:
   `com.starsdelivery.starsDelivery`
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
  --dart-define=FIREBASE_IOS_BUNDLE_ID=com.starsdelivery.starsDelivery
```

Optional: `FIREBASE_MEASUREMENT_ID`.

Release builds must use the same values or a CI secret store that injects them.

## 3. API server credentials

Set one of these in `stars_delivery_backend/.env`:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# or:
FIREBASE_SERVICE_ACCOUNT_PATH=C:/secure/firebase-service-account.json
```

Grant the service account Firebase Cloud Messaging permissions. Never commit the
service-account JSON or `.env` to Git.

## 4. What is sent

- Every persisted user notification is also sent through FCM when a device token
  exists (offers, accepted offers, delivery confirmation, delivery result,
  ratings, report replies, broadcasts).
- New orders are pushed to eligible providers in the same village/governorate
  who are available and support the order type.
- The app registers its FCM token after login and removes it on logout.

## 5. Verification

1. Start the API with Firebase credentials configured.
2. Build and install the app with the Firebase dart-defines.
3. Log in on a physical Android or iOS device and confirm
   `POST /api/users/push-token` succeeds.
4. Create an order or trigger a notification and verify delivery in the
   background/closed app.
5. For iOS, test with an Apple development provisioning profile that includes
   the Push Notifications capability.
