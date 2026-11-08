import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('new order cards use a clear hierarchy and labeled details', () {
    final source = File('lib/screens/pending_orders_screen.dart').readAsStringSync();

    expect(source, contains("'description'"));

    expect(source, contains("'customer'"));

    expect(source, contains("'phone_number'"));

    expect(source, contains("'area_region'"));

    expect(source, contains("'images'"));

    expect(source, contains('_buildInfoRow'));

    expect(source, isNot(contains('_buildCustomerRow')));

    expect(source, contains('fontSize: 18'));

    expect(source, contains('fontSize: 16'));

    expect(source, contains('height: 50'));
  });
}
