import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Firebase push registration is wired into both home roles', () {
    final customer = File('lib/screens/home_screen.dart').readAsStringSync();
    final provider = File(
      'lib/screens/provider_home_screen.dart',
    ).readAsStringSync();
    final service = File(
      'lib/services/push_notification_service.dart',
    ).readAsStringSync();
    final bootstrap = File(
      'lib/services/firebase_bootstrap.dart',
    ).readAsStringSync();

    expect(customer, contains('PushNotificationService.instance.start'));
    expect(provider, contains('PushNotificationService.instance.start'));
    expect(service, contains("'/users/push-token'"));
    expect(service, contains('FirebaseMessaging'));
    expect(service, contains('onBackgroundMessage'));
    expect(bootstrap, contains('FIREBASE_ANDROID_APP_ID'));
    expect(bootstrap, contains('FIREBASE_IOS_APP_ID'));
    expect(bootstrap, contains('Firebase.initializeApp'));
  });

  test('backend push tokens, FCM sender, and new-order pushes exist', () {
    final model = File(
      'stars_delivery_backend/src/models/PushToken.js',
    ).readAsStringSync();
    final sender = File(
      'stars_delivery_backend/src/services/pushNotifications.js',
    ).readAsStringSync();
    final notifications = File(
      'stars_delivery_backend/src/services/mobileNotifications.js',
    ).readAsStringSync();
    final orders = File(
      'stars_delivery_backend/src/routes/orders.js',
    ).readAsStringSync();
    final users = File(
      'stars_delivery_backend/src/routes/users.js',
    ).readAsStringSync();

    expect(model, contains('token'));
    expect(model, contains('unique: true'));
    expect(sender, contains('sendEachForMulticast'));
    expect(sender, contains('FIREBASE_SERVICE_ACCOUNT_JSON'));
    expect(notifications, contains('sendPushToUser'));
    expect(orders, contains('sendPushToUsers'));
    expect(users, contains("router.post('/push-token'"));
    expect(users, contains("router.delete('/push-token'"));
  });

  test('customer tracking screen and provider location updates exist', () {
    final tracking = File(
      'lib/screens/order_tracking_screen.dart',
    ).readAsStringSync();
    final myOrders = File(
      'lib/screens/my_orders_screen.dart',
    ).readAsStringSync();
    final active = File(
      'lib/screens/provider_active_orders_screen.dart',
    ).readAsStringSync();

    expect(tracking, contains('FlutterMap'));
    expect(tracking, contains('TileLayer'));
    expect(tracking, contains('MarkerLayer'));
    expect(tracking, contains('providerLocation'));
    expect(myOrders, contains('OrderTrackingScreen'));
    expect(myOrders, contains("'track_driver'"));
    expect(active, contains('LocationService.syncToBackend'));
    expect(active, contains('Timer.periodic'));
  });

  test('Android and iOS push/location configuration is present', () {
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    final podfile = File('ios/Podfile').readAsStringSync();
    final debugEntitlements = File(
      'ios/Runner/DebugProfile.entitlements',
    ).readAsStringSync();

    expect(manifest, contains('POST_NOTIFICATIONS'));
    expect(
      manifest,
      contains('com.google.firebase.messaging.default_notification_channel_id'),
    );
    expect(plist, contains('NSLocationWhenInUseUsageDescription'));
    expect(plist, contains('remote-notification'));
    expect(podfile, contains("platform :ios, '15.0'"));
    expect(debugEntitlements, contains('aps-environment'));
  });

  test('commission settings are editable from the admin dashboard', () {
    final view = File(
      'stars_delivery_backend/src/views/admin/index.ejs',
    ).readAsStringSync();
    final script = File(
      'stars_delivery_backend/src/public/js/main.js',
    ).readAsStringSync();

    expect(view, contains('commissionSettingsForm'));
    expect(view, contains('commissionType'));
    expect(view, contains('commissionValue'));
    expect(script, contains('loadCommissionSettings'));
    expect(script, contains('saveCommissionSettings'));
    expect(script, contains("'/admin/api/commission-settings'"));
  });
}
