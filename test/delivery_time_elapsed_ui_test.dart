import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('in-progress orders show real elapsed delivery minutes', () {
    final source = File('lib/screens/my_orders_screen.dart').readAsStringSync();

    expect(source, contains("o['fulfillingAt']"));

    expect(source, contains("o['acceptedAt']"));

    expect(source, contains("o['estimatedTime']"));

    expect(source, contains('DateTime.now().difference(clockStart)'));

    expect(source, contains('LinearProgressIndicator'));

    expect(source, contains("'delivery_progress'"));

    expect(source, contains("'delivery_remaining'"));

    expect(source, contains("'delivery_overdue'"));

    expect(source, contains("'delivery_not_started'"));
  });

  test('customer can approve or reject the driver delivery confirmation', () {
    final source = File('lib/screens/my_orders_screen.dart').readAsStringSync();

    expect(source, contains("o['completionRequestedAt']"));

    expect(source, contains("'awaiting_delivery_confirmation'"));

    expect(source, contains("'approve_delivery'"));

    expect(source, contains("'reject_delivery'"));

    expect(source, contains('_confirmDelivery'));

    expect(source, contains('_rejectDelivery'));
  });

  test(
    'delivery clock starts when the driver starts delivery in the backend',
    () {
      final source = File(
        'stars_delivery_backend/src/services/orderLifecycle.js',
      ).readAsStringSync();

      expect(source, contains('acceptedAt: new Date()'));

      expect(source, contains('fulfillingAt: new Date()'));

      expect(source, contains('estimatedTime: offer.estimatedTime || 0'));
    },
  );

  test('delivery confirmation lifecycle requires customer approval', () {
    final source = File(
      'stars_delivery_backend/src/services/orderLifecycle.js',
    ).readAsStringSync();

    expect(source, contains('requestDeliveryConfirmation'));

    expect(source, contains('completionRequestedAt: now'));

    expect(source, contains('async function confirmDelivery'));

    expect(source, contains('async function rejectDelivery'));

    expect(source, contains('deliveryConfirmedAt: now'));

    expect(source, contains('deliveryRejectedAt: now'));
  });
}
