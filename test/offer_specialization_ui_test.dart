import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('offers are fetched and shown per order with its own type', () {
    final offersRoute = File(
      'swifora_backend/src/routes/offers.js',
    ).readAsStringSync();

    expect(offersRoute, contains("populate('orderId', 'description area type')"));

    final model = File('lib/models/offer_model.dart').readAsStringSync();

    expect(model, contains('orderType'));

    final screen = File('lib/screens/order_offers_screen.dart').readAsStringSync();

    expect(screen, contains('_orderType'));

    expect(screen, contains('_typeLabel'));

    expect(screen, contains("'offers_list'"));

    expect(screen, contains('orderId: widget.orderId'));

    final orders = File('lib/screens/my_orders_screen.dart').readAsStringSync();

    expect(orders, contains("orderId: o['_id']?.toString()"));
  });

  test('pending order screen explains driver rejections or waiting state', () {
    final screen = File('lib/screens/order_offers_screen.dart').readAsStringSync();

    expect(screen, contains('rejectedByDriversCount'));

    expect(screen, contains("'order_rejected_by_drivers_count'"));

    expect(screen, contains("'awaiting_driver_offers'"));

    final localization = File('lib/services/localization_service.dart').readAsStringSync();

    expect(localization, contains("'order_rejected_by_drivers_count'"));

    expect(localization, contains("'awaiting_driver_offers'"));
  });
}
