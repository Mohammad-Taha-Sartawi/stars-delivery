import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('in-progress orders show real elapsed delivery minutes', () {
    final source = File('lib/screens/my_orders_screen.dart').readAsStringSync();

    expect(source, contains("o['acceptedAt']"));

    expect(source, contains("o['estimatedTime']"));

    expect(source, contains('DateTime.now().difference(acceptedAt)'));

    expect(source, contains('LinearProgressIndicator'));

    expect(source, contains("'delivery_progress'"));

    expect(source, contains("'delivery_remaining'"));

    expect(source, contains("'delivery_overdue'"));
  });

  test('delivery clock starts at acceptance in the backend', () {
    final source = File(
      'stars_delivery_backend/src/services/orderLifecycle.js',
    ).readAsStringSync();

    expect(source, contains('acceptedAt: new Date()'));

    expect(source, contains('estimatedTime: offer.estimatedTime || 0'));
  });
}
