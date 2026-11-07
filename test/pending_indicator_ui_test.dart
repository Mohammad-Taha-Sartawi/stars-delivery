import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('customer home shows a pending orders indicator and offers badge', () {
    final source = File('lib/screens/home_screen.dart').readAsStringSync();

    expect(source, contains('_pendingOrdersCount'));

    expect(source, contains("'pending_items_alert'"));

    expect(source, contains('badgeCount'));

    expect(source, contains('_loadOrderCounts'));
  });

  test('customer home separates in-progress orders below driver offers', () {
    final source = File('lib/screens/home_screen.dart').readAsStringSync();

    expect(source, contains('_inProgressOrdersCount'));

    expect(source, contains("'in_progress_orders_btn'"));

    expect(source, contains('_openInProgressOrders'));

    expect(source, contains("statuses: const {'accepted', 'fulfilling'}"));

    expect(source, contains("statuses: const {'pending', 'offered'}"));
  });

  test('provider home shows the pending work alert', () {
    final source = File('lib/screens/provider_home_screen.dart').readAsStringSync();

    expect(source, contains("'pending_items_alert'"));

    expect(
      source,
      contains(
        's.pendingOrdersCount + s.offeredOrdersCount + s.activeOrdersCount',
      ),
    );
  });

  test('pending alert text is localized in both languages', () {
    final source = File('lib/services/localization_service.dart').readAsStringSync();

    expect(source, contains("'pending_items_alert'"));

    expect(source, contains('لديك %d طلب/عرض قيد الانتظار'));
  });
}
