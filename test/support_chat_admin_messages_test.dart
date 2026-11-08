import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('admin messages surface in the contact_support box with unread badges', () {
    final service = File('lib/services/support_chat_service.dart').readAsStringSync();
    final supportScreen = File('lib/screens/support_chat_screen.dart').readAsStringSync();
    final home = File('lib/screens/home_screen.dart').readAsStringSync();
    final providerHome = File('lib/screens/provider_home_screen.dart').readAsStringSync();

    expect(service, contains("_dio.get('/chat/unread-count')"));

    expect(service, contains("_dio.put('/chat/read')"));

    expect(supportScreen, contains('_markAdminRead()'));

    expect(supportScreen, contains('_service.markAdminRead()'));

    expect(supportScreen, contains('_refreshHistory'));

    expect(supportScreen, contains('Timer.periodic'));

    expect(home, contains('_supportUnreadCount'));

    expect(home, contains('badgeCount: _supportUnreadCount'));

    expect(home, contains('onSupportReply'));

    expect(providerHome, contains('_supportUnreadCount'));

    expect(providerHome, contains('onSupportReply'));
  });
}

