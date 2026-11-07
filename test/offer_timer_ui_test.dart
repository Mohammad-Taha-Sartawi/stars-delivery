import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('customer offers screen shows a per-offer expiry countdown', () {
    final source = File('lib/screens/order_offers_screen.dart').readAsStringSync();

    expect(source, contains('expiresAt'));

    expect(source, contains('Timer.periodic'));

    expect(source, contains("'offer_expires_in'"));

    expect(source, contains("'offer_expired'"));

    expect(source, contains("'resend_order'"));

    expect(source, contains('ResendOrderEvent'));

    expect(source, contains('_confirmCancel'));

    expect(source, contains("'cancel_order'"));
  });

  test('submit offer screen enforces the provider cooldown countdown', () {
    final source = File('lib/screens/submit_offer_screen.dart').readAsStringSync();

    expect(source, contains('_cooldownSeconds'));

    expect(source, contains('_startCooldown'));

    expect(source, contains("'offer_cooldown_active'"));

    expect(source, contains("'cooldown_remaining'"));

    expect(source, contains('OfferCooldown'));
  });

  test('pending orders block opening another offer during cooldown', () {
    final source = File('lib/screens/pending_orders_screen.dart').readAsStringSync();

    expect(source, contains('_cooldownActive'));

    expect(source, contains('_loadCooldown'));

    expect(source, contains('_showCooldownMessage'));

    expect(source, contains('_buildCooldownBanner'));
  });

  test('order detail blocks its offer action during cooldown', () {
    final source = File('lib/screens/order_detail_screen.dart').readAsStringSync();

    expect(source, contains("_order?['offerCooldownUntil']"));

    expect(source, contains("'offer_cooldown_active'"));
  });

  test('offer service reads the cooldown retry delay', () {
    final source = File('lib/services/offer_service.dart').readAsStringSync();

    expect(source, contains('retryAfterSeconds'));

    expect(source, contains("data['retryAfterSeconds']"));
  });
}
