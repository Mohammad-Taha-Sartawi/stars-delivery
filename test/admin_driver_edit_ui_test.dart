import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('provider app refreshes profile changes from the admin dashboard', () {
    final socket = File('lib/services/socket_service.dart').readAsStringSync();
    final provider = File(
      'lib/screens/provider_home_screen.dart',
    ).readAsStringSync();

    expect(socket, contains("'provider_profile_updated'"));

    expect(socket, contains('onProviderProfileUpdated'));

    expect(provider, contains('onProviderProfileUpdated'));

    expect(provider, contains('_user = updated'));

    expect(provider, contains('LoadPendingOrders'));

    expect(provider, contains('LoadOfferedOrders'));
  });
}
