import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'customer home prioritizes the new-order action and groups the rest',
    () {
      final home = File('lib/screens/home_screen.dart').readAsStringSync();

      expect(home, contains('createOrderCta'));
      expect(home, contains('_buildPrimaryOrderCard'));
      expect(home, contains("'my_orders_section'"));
      expect(home, contains("'order_settings_section'"));
      expect(home, contains("'help_and_report_section'"));

      final ctaIndex = home.indexOf('_buildPrimaryOrderCard(context)');
      final ordersIndex = home.indexOf("'my_orders_section'");
      final settingsIndex = home.indexOf("'order_settings_section'");
      final helpIndex = home.indexOf("'help_and_report_section'");

      expect(ctaIndex, greaterThanOrEqualTo(0));
      expect(ordersIndex, greaterThan(ctaIndex));
      expect(settingsIndex, greaterThan(ordersIndex));
      expect(helpIndex, greaterThan(settingsIndex));
    },
  );

  test('provider home orders come before finance, settings and help', () {
    final home = File(
      'lib/screens/provider_home_screen.dart',
    ).readAsStringSync();

    final ordersIndex = home.indexOf("'driver_orders_section'");
    final financeIndex = home.indexOf("'financial_summary_section'");
    final settingsIndex = home.indexOf("'work_settings_section'");
    final helpIndex = home.indexOf("'help_and_report_section'");

    expect(ordersIndex, greaterThanOrEqualTo(0));
    expect(financeIndex, greaterThan(ordersIndex));
    expect(settingsIndex, greaterThan(financeIndex));
    expect(helpIndex, greaterThan(settingsIndex));
  });
}
