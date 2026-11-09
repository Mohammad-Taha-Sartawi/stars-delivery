import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('new orders card exposes a reject action with confirmation', () {
    final source = File(
      'lib/screens/pending_orders_screen.dart',
    ).readAsStringSync();

    expect(source, contains("AppLocalization.get(context, 'reject_order')"));

    expect(source, contains('_rejectOrder'));

    expect(source, contains('_providerService.rejectOrder'));

    expect(source, contains('_orders.removeWhere'));
  });

  test('provider service exposes reject and rejected-orders endpoints', () {
    final source = File(
      'lib/services/provider_service.dart',
    ).readAsStringSync();

    expect(source, contains("'/provider/orders/\$orderId/reject'"));

    expect(source, contains("'/provider/rejected-orders'"));
  });

  test('provider dashboard links to the rejected orders list', () {
    final home = File(
      'lib/screens/provider_home_screen.dart',
    ).readAsStringSync();

    final screen = File(
      'lib/screens/rejected_orders_screen.dart',
    ).readAsStringSync();

    expect(home, contains('RejectedOrdersScreen'));

    expect(home, contains("'rejected_orders_btn'"));

    expect(home, contains('ordersReportCount'));

    expect(screen, contains("'rejected_orders_btn'"));

    expect(screen, contains("'no_rejected_orders'"));

    expect(screen, contains("'status_completed'"));

    expect(screen, contains('recordType'));

    expect(screen, contains("'reject_reason_driver'"));

    expect(screen, contains("'reject_reason_expired'"));

    expect(screen, contains("'offer_not_selected_status'"));

    expect(screen, contains("'offer_not_selected_reason'"));

    expect(screen, contains("'your_offer_price'"));

    expect(screen, contains("'winning_offer_price'"));

    expect(screen, contains('offeredPrice'));

    expect(screen, contains('acceptedPrice'));
  });

  test('offered orders screen refreshes and reports a lost offer', () {
    final screen = File(
      'lib/screens/offered_orders_screen.dart',
    ).readAsStringSync();

    expect(screen, contains('onOfferNotSelected'));

    expect(screen, contains('_orders.removeWhere'));

    expect(screen, contains('_refresh'));

    expect(screen, contains('getOfferedOrders'));

    expect(screen, contains('AppNotificationBell'));

    expect(screen, contains('RejectedOrdersScreen'));

    expect(screen, contains("'view_reports'"));
  });
}
