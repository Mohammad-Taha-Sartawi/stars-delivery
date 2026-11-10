import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('provider registration lets the driver choose service types', () {
    final screen = File('lib/screens/login_screen.dart').readAsStringSync();
    final event = File('lib/bloc/auth/auth_event.dart').readAsStringSync();
    final service = File('lib/services/auth_service.dart').readAsStringSync();

    expect(screen, contains('_serviceTypes'));

    expect(screen, contains('FilterChip'));

    expect(screen, contains("'service_types'"));

    expect(screen, contains("'service_type_required'"));

    expect(event, contains('List<String> serviceTypes'));

    expect(service, contains("'serviceTypes': serviceTypes"));

    final localization = File(
      'lib/services/localization_service.dart',
    ).readAsStringSync();

    expect(localization, contains("'service_types'"));

    expect(localization, contains("'service_type_required'"));
  });
}
