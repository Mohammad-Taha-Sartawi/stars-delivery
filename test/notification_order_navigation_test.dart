import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('order notifications open the related order instead of the dialog', () {
    final source = File(
      'lib/screens/notifications_screen.dart',
    ).readAsStringSync();

    expect(source, contains('_openNotification'));

    expect(source, contains('OrderDetailScreen'));

    expect(source, contains('OrderOffersScreen'));

    expect(source, contains("'new_order'"));

    expect(source, contains("'offer_accepted'"));

    expect(source, contains("'delivery_confirmed'"));

    expect(source, contains("'delivery_rejected'"));

    expect(source, contains("'delivery_confirmation'"));

    expect(source, contains("'new_offer'"));

    expect(source, contains("'order_pending'"));

    expect(source, contains("'order_completed'"));

    expect(source, contains("'driver_taken'"));
  });

  test(
    'order detail screen exposes provider actions for its current state',
    () {
      final source = File(
        'lib/screens/order_detail_screen.dart',
      ).readAsStringSync();

      expect(source, contains('getOrder(widget.token, widget.orderId)'));

      expect(source, contains('SubmitOfferScreen'));

      expect(source, contains('markFulfilling'));

      expect(source, contains('markComplete'));

      expect(source, contains("order['myOffer']"));
    },
  );

  test('order service fetches a single authorized order', () {
    final source = File('lib/services/order_service.dart').readAsStringSync();

    expect(source, contains("'/orders/\$orderId'"));

    expect(source, contains("'/orders/\$orderId/confirm-delivery'"));

    expect(source, contains("'/orders/\$orderId/reject-delivery'"));
  });
}
