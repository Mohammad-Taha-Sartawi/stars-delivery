import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('order notifications open the related order instead of the dialog', () {
    final source = File('lib/screens/notifications_screen.dart').readAsStringSync();

    expect(source, contains('_openNotification'));

    expect(source, contains('OrderDetailScreen'));

    expect(source, contains('OrderOffersScreen'));

    expect(source, contains("'new_order', 'offer_accepted'"));

    expect(source, contains("'new_offer', 'order_pending', 'order_completed'"));
  });

  test('order detail screen exposes provider actions for its current state', () {
    final source = File('lib/screens/order_detail_screen.dart').readAsStringSync();

    expect(source, contains('getOrder(widget.token, widget.orderId)'));

    expect(source, contains('SubmitOfferScreen'));

    expect(source, contains('markFulfilling'));

    expect(source, contains('markComplete'));

    expect(source, contains("order['myOffer']"));
  });

  test('order service fetches a single authorized order', () {
    final source = File('lib/services/order_service.dart').readAsStringSync();

    expect(source, contains("get('/orders/\$orderId'"));
  });
}
