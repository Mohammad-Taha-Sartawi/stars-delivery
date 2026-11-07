import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('my orders supports a status-filtered report view', () {
    final source = File('lib/screens/my_orders_screen.dart').readAsStringSync();

    expect(source, contains('Set<String>? statuses'));

    expect(source, contains('widget.statuses'));

    expect(source, contains('widget.titleKey'));
  });

  test('in-progress orders label is localized', () {
    final source = File('lib/services/localization_service.dart').readAsStringSync();

    expect(source, contains("'in_progress_orders_btn'"));

    expect(source, contains('طلبات جاري العمل عليها'));
  });
}
