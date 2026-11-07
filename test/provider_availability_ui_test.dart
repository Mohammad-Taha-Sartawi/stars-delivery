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
}
