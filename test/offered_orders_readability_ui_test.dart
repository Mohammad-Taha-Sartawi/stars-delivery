import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('offered orders cards match the new orders readability design', () {
    final source = File(
      'lib/screens/offered_orders_screen.dart',
    ).readAsStringSync();

    expect(source, contains('_buildInfoRow'));

    expect(source, contains('_buildOfferHighlight'));

    expect(source, contains("'description'"));

    expect(source, contains("'customer'"));

    expect(source, contains("'phone_number'"));

    expect(source, contains("'area_region'"));

    expect(source, contains("'awaiting_response'"));

    expect(source, contains('offeredPrice'));

    expect(source, contains('offeredTime'));

    expect(source, contains('fontSize: 18'));

    expect(source, contains('fontSize: 16'));

    expect(source, contains('fontSize: 15'));

    final localization = File(
      'lib/services/localization_service.dart',
    ).readAsStringSync();

    expect(localization, contains("'offer_time'"));
  });
}
