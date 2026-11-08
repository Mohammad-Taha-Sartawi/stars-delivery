import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('offer activity does not raise a notification alert on the home screen', () {
    final home = File('lib/screens/home_screen.dart').readAsStringSync();

    expect(home, isNot(contains("'new_offer_received'")));

    expect(home, contains('_loadOrderCounts'));
  });
}
