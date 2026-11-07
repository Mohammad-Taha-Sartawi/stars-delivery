import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('my orders exposes cancel only for pending orders', () {
    final source = File('lib/screens/my_orders_screen.dart').readAsStringSync();

    expect(source, contains('_cancelOrder'));

    expect(source, contains("o['status'] == 'pending'"));

    expect(source, contains("'cancel_order'"));

    expect(source, contains('_offerService.cancelOrder'));
  });

  test('offer service cancels through the customer order endpoint', () {
    final source = File('lib/services/offer_service.dart').readAsStringSync();

    expect(source, contains("'/offers/\$orderId/cancel'"));

    expect(source, contains("'Failed to cancel order'"));
  });

  test('cancel order texts are localized', () {
    final source = File('lib/services/localization_service.dart').readAsStringSync();

    expect(source, contains("'cancel_order'"));

    expect(source, contains("'cancel_order_confirm'"));

    expect(source, contains("'order_cancelled'"));
  });
}
