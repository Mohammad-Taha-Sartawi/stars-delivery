import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('customer offers screen handles a driver who took another order', () {
    final source = File(
      'lib/screens/order_offers_screen.dart',
    ).readAsStringSync();

    expect(source, contains('onOfferCancelled'));

    expect(source, contains("'PROVIDER_TAKEN'"));

    expect(source, contains("'driver_taken_notification_title'"));

    expect(source, contains("'driver_taken_notification_body'"));

    expect(source, contains("'continue_viewing_offers'"));

    expect(source, contains('ResendOrderEvent'));

    expect(source, contains("'driver_taken_short'"));
  });

  test('socket service exposes offer selection and cancellation events', () {
    final source = File('lib/services/socket_service.dart').readAsStringSync();

    expect(source, contains("'offer_not_selected'"));

    expect(source, contains("'offer_cancelled'"));

    expect(source, contains('onOfferNotSelected'));

    expect(source, contains('onOfferCancelled'));
  });

  test('notifications expose driver-taken and not-selected alerts', () {
    final source = File(
      'lib/screens/notifications_screen.dart',
    ).readAsStringSync();

    expect(source, contains("'driver_taken'"));

    expect(source, contains("'offer_not_selected'"));

    expect(source, contains('RejectedOrdersScreen'));
  });

  test('providers are notified and pending lists drop selected orders', () {
    final home = File(
      'lib/screens/provider_home_screen.dart',
    ).readAsStringSync();
    final pending = File(
      'lib/screens/pending_orders_screen.dart',
    ).readAsStringSync();

    expect(home, contains('onOfferNotSelected'));

    expect(home, contains("'another_driver_selected_body'"));

    expect(pending, contains('onOfferNotSelected'));

    expect(pending, contains('_orders.removeWhere'));
  });

  test(
    'pending orders refresh when a new order arrives or the app resumes',
    () {
      final pending = File(
        'lib/screens/pending_orders_screen.dart',
      ).readAsStringSync();
      final providerHome = File(
        'lib/screens/provider_home_screen.dart',
      ).readAsStringSync();
      final socket = File(
        'lib/services/socket_service.dart',
      ).readAsStringSync();

      expect(pending, contains('onNewOrder'));

      expect(pending, contains('_refreshOrders'));

      expect(pending, contains('getPendingOrders'));

      expect(pending, contains('Duration(seconds: 15)'));

      expect(pending, contains('await _refreshOrders()'));

      expect(providerHome, contains('onConnected'));

      expect(
        providerHome,
        contains('Future.delayed(const Duration(seconds: 3)'),
      );

      expect(socket, contains('onConnected'));

      expect(socket, contains("'Socket connected'"));
    },
  );

  test('backend cancels stale offers and notifies both sides', () {
    final lifecycle = File(
      'stars_delivery_backend/src/services/orderLifecycle.js',
    ).readAsStringSync();
    final offers = File(
      'stars_delivery_backend/src/routes/offers.js',
    ).readAsStringSync();
    final offerModel = File(
      'stars_delivery_backend/src/models/Offer.js',
    ).readAsStringSync();

    expect(offerModel, contains('rejectionReason'));

    expect(lifecycle, contains("'PROVIDER_TAKEN'"));

    expect(lifecycle, contains("rejectionReason: 'provider_unavailable'"));

    expect(lifecycle, contains("rejectionReason: 'another_driver_selected'"));

    expect(lifecycle, contains('competingProviderIds'));

    expect(lifecycle, contains('unavailableOffers'));

    expect(offers, contains('notifyOfferNotSelected'));

    expect(offers, contains('notifyDriverTaken'));

    expect(offers, contains("'offer_not_selected'"));

    expect(offers, contains("'offer_cancelled'"));

    expect(offers, contains("'new_order'"));

    final provider = File(
      'stars_delivery_backend/src/routes/provider.js',
    ).readAsStringSync();

    expect(provider, contains("recordType: 'offer_not_selected'"));

    expect(provider, contains('competingPrice'));

    expect(provider, contains('offeredPrice: offer.price'));
  });
}
