import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('orders report opens a read-only order report', () {
    final orders = File('lib/screens/my_orders_screen.dart').readAsStringSync();

    expect(orders, contains('readOnlyReport'));

    expect(orders, contains('OrderReportScreen'));

    expect(orders, contains('!widget.readOnlyReport'));

    final home = File('lib/screens/home_screen.dart').readAsStringSync();

    expect(home, contains('readOnlyReport: true'));

    expect(home, contains("titleKey: 'orders_report'"));
  });

  test('order report explains completion or driver rejection without actions', () {
    final source = File('lib/screens/order_report_screen.dart').readAsStringSync();

    expect(source, contains("'status_completed'"));

    expect(source, contains("'status_cancelled'"));

    expect(source, contains("'order_rejected_by_drivers'"));

    expect(source, contains("'order_suspended'"));

    expect(source, contains("order['offerSuspendedUntil']"));

    expect(source, contains("'offers_history'"));

    expect(source, isNot(contains('AcceptOfferEvent')));

    expect(source, isNot(contains('ResendOrderEvent')));

    expect(source, isNot(contains('CancelOrderEvent')));
  });

  test('reports show the counterpart name and masked or completed phone', () {
    final report = File('lib/screens/order_report_screen.dart').readAsStringSync();

    expect(report, contains('_maskPhone'));

    expect(report, contains('orderCompleted'));

    expect(report, contains('displayPhone'));

    expect(report, contains('offer.providerPhone'));

    final rejected = File('lib/screens/rejected_orders_screen.dart').readAsStringSync();

    expect(rejected, contains("order['phone']"));
  });

  test('order report texts are localized', () {
    final source = File('lib/services/localization_service.dart').readAsStringSync();

    expect(source, contains("'orders_report'"));

    expect(source, contains("'order_report'"));

    expect(source, contains("'order_rejected_by_drivers'"));

    expect(source, contains("'offers_history'"));
  });
}
