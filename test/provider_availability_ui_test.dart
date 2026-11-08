import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('provider stats expose the availability block expiry', () {
    final source = File('lib/models/provider_stats.dart').readAsStringSync();

    expect(source, contains('blockedUntil'));

    expect(source, contains("json['blockedUntil']"));
  });

  test('provider home refreshes available orders when the block expires', () {
    final source = File('lib/screens/provider_home_screen.dart').readAsStringSync();

    expect(source, contains('_unblockTimer'));

    expect(source, contains('_scheduleUnblockRefresh'));

    expect(source, contains('state.stats.blockedUntil'));
  });

  test('provider home exposes an availability switch', () {
    final home = File('lib/screens/provider_home_screen.dart').readAsStringSync();

    expect(home, contains('_setAvailability'));

    expect(home, contains('SwitchListTile'));

    expect(home, contains("'driver_availability'"));

    expect(home, contains("'driver_available'"));

    expect(home, contains("'driver_unavailable'"));

    final service = File('lib/services/provider_service.dart').readAsStringSync();

    expect(service, contains("'/provider/availability'"));

    final stats = File('lib/models/provider_stats.dart').readAsStringSync();

    expect(stats, contains('isAvailable'));

    final localization = File('lib/services/localization_service.dart').readAsStringSync();

    expect(localization, contains("'availability_updated'"));
  });
}
