import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('customer screens no longer expose frequent items', () {
    final createOrder = File('lib/screens/create_order_screen.dart').readAsStringSync();
    final profile = File('lib/screens/profile_screen.dart').readAsStringSync();

    expect(createOrder.toLowerCase(), isNot(contains('frequent')));

    expect(createOrder, isNot(contains('العناصر المتكررة')));

    expect(createOrder, isNot(contains('mobile_api_client')));

    expect(profile.toLowerCase(), isNot(contains('frequent')));

    expect(profile, isNot(contains('العناصر المتكررة')));
  });
}
