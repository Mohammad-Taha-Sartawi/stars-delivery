import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'offer activity does not raise a notification alert on the home screen',
    () {
      final home = File('lib/screens/home_screen.dart').readAsStringSync();

      expect(home, isNot(contains("'new_offer_received'")));

      expect(home, contains('_loadOrderCounts'));
    },
  );

  test(
    'admin broadcasts stay in notifications and never reach support chat',
    () {
      final broadcast = File(
        'swifora_backend/src/routes/adminBroadcast.js',
      ).readAsStringSync();

      expect(broadcast, isNot(contains('ChatMessage')));
      expect(broadcast, isNot(contains('support_reply')));
      expect(broadcast, contains("type: 'broadcast'"));

      final notifications = File(
        'lib/screens/notifications_screen.dart',
      ).readAsStringSync();

      expect(notifications, isNot(contains('hasContactAction')));
      expect(notifications, isNot(contains('SupportChatScreen')));
      expect(notifications, isNot(contains('التواصل مع الدعم')));

      for (final path in <String>[
        'lib/screens/home_screen.dart',
        'lib/screens/provider_home_screen.dart',
      ]) {
        final source = File(path).readAsStringSync();
        expect(source, isNot(contains("data['title']")));
        expect(source, isNot(contains("data['body']")));
      }
    },
  );
}
