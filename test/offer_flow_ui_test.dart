import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('customer offers screen displays the provider estimated time', () {
    final source = File(
      'lib/screens/order_offers_screen.dart',
    ).readAsStringSync();

    // Formatting-tolerant: the localization call may wrap across lines.
    expect(
      source,
      matches(RegExp(r"AppLocalization\.get\(\s*context,\s*'est_time',?\s*\)")),
    );

    expect(
      source,
      matches(
        RegExp(r"\.replaceAll\(\s*'%d',\s*'\$\{o\.estimatedTime\}',?\s*\)"),
      ),
    );
  });

  test('customer offers screen shows the driver rating summary', () {
    final screen = File(
      'lib/screens/order_offers_screen.dart',
    ).readAsStringSync();
    final model = File('lib/models/offer_model.dart').readAsStringSync();
    final localization = File(
      'lib/services/localization_service.dart',
    ).readAsStringSync();

    expect(screen, contains('_buildProviderRating'));
    expect(screen, contains("'rating_average'"));
    expect(screen, contains("'positive_ratings_count'"));
    expect(screen, contains('providerRatingAverage'));
    expect(screen, contains('providerPositiveRatingCount'));

    expect(model, contains('providerRatingAverage'));
    expect(model, contains('providerRatingCount'));
    expect(model, contains('providerPositiveRatingCount'));
    expect(model, contains("json['providerRating']"));

    expect(localization, contains("'rating_average'"));
    expect(localization, contains("'positive_ratings_count'"));
  });

  test(
    'offer submission treats duplicate submissions as already submitted',
    () {
      final service = File(
        'lib/services/offer_service.dart',
      ).readAsStringSync();
      final bloc = File('lib/bloc/offer/offer_bloc.dart').readAsStringSync();
      final screen = File(
        'lib/screens/submit_offer_screen.dart',
      ).readAsStringSync();

      expect(service, contains('OfferSubmitException'));
      expect(service, contains("data['code']"));
      expect(bloc, contains("ex.code == 'OFFER_NOT_AVAILABLE'"));
      expect(bloc, contains('OfferAlreadySubmitted'));
      expect(screen, contains('OfferAlreadySubmitted'));
      expect(screen, contains('Navigator.pop(context, true)'));
    },
  );

  test(
    'pending orders remove a submitted order and the form requires a time',
    () {
      final pending = File(
        'lib/screens/pending_orders_screen.dart',
      ).readAsStringSync();
      final screen = File(
        'lib/screens/submit_offer_screen.dart',
      ).readAsStringSync();

      expect(pending, contains('StatefulWidget'));
      expect(pending, contains('_openSubmitOffer'));
      expect(pending, contains('_orders.removeWhere'));

      expect(screen, contains("'time_required'"));
      expect(screen, contains("'invalid_time'"));
    },
  );

  test(
    'customer offers screen refreshes live when a driver sends an offer',
    () {
      final source = File(
        'lib/screens/order_offers_screen.dart',
      ).readAsStringSync();

      expect(source, contains('_newOfferSub'));

      expect(source, contains('onNewOffer'));

      expect(source, contains('incomingOrderId'));

      expect(source, contains('LoadOffersEvent'));
    },
  );

  test('customer home opens the offers screen for an incoming offer', () {
    final home = File('lib/screens/home_screen.dart').readAsStringSync();

    expect(home, contains('OrderOffersScreen('));
    expect(home, contains('OfferBloc()'));
    expect(home, contains('_openOffersForIncomingOffer'));
    expect(home, contains('data[\'orderId\']'));
  });

  test('order details show the outside-area warning before offering', () {
    final detail = File(
      'lib/screens/order_detail_screen.dart',
    ).readAsStringSync();
    final ordersRoute = File(
      'stars_delivery_backend/src/routes/orders.js',
    ).readAsStringSync();

    expect(detail, contains('showGovernorateScopeWarning'));
    expect(detail, contains("order['outsideArea']"));
    expect(ordersRoute, contains('order.outsideArea'));
    expect(ordersRoute, contains('providerGovernorate'));
  });

  test('driver home opens the accepted order immediately', () {
    final providerHome = File(
      'lib/screens/provider_home_screen.dart',
    ).readAsStringSync();

    expect(providerHome, contains('_openAcceptedOrder'));
    expect(providerHome, contains("data['orderId']"));
    expect(providerHome, contains('OrderDetailScreen('));
    expect(providerHome, contains('onOfferAccepted'));
  });
}
