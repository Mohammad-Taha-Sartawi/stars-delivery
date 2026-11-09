import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('customer home shows the available drivers count below reports', () {
    final home = File('lib/screens/home_screen.dart').readAsStringSync();

    expect(home, contains('_availableDriversCount'));

    expect(home, contains('_loadAvailableDriversCount'));

    expect(home, contains('getAvailableDriversCount'));

    expect(home, contains("'available_drivers_count'"));

    expect(home, contains("'no_available_drivers'"));

    expect(home, contains("'recommend_driver_share_hint'"));

    expect(home, isNot(contains('if (noDrivers)')));

    final service = File('lib/services/order_service.dart').readAsStringSync();

    expect(service, contains("'/users/available-providers'"));

    final localization = File(
      'lib/services/localization_service.dart',
    ).readAsStringSync();

    expect(localization, contains("'available_drivers_count'"));

    expect(localization, contains("'no_available_drivers'"));

    expect(localization, contains("'recommend_driver_share_hint'"));
  });
}
