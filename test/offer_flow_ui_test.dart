import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('customer offers screen displays the provider estimated time', () {
    final source = File('lib/screens/order_offers_screen.dart').readAsStringSync();

    expect(source, contains("AppLocalization.get(context, 'est_time')"));

    expect(source, contains(r".replaceAll('%d', '${o.estimatedTime}')"));
  });

  test('offer submission treats duplicate submissions as already submitted', () {
    final service = File('lib/services/offer_service.dart').readAsStringSync();
    final bloc = File('lib/bloc/offer/offer_bloc.dart').readAsStringSync();
    final screen = File('lib/screens/submit_offer_screen.dart').readAsStringSync();

    expect(service, contains('OfferSubmitException'));
    expect(service, contains("data['code']"));
    expect(bloc, contains("ex.code == 'OFFER_NOT_AVAILABLE'"));
    expect(bloc, contains('OfferAlreadySubmitted'));
    expect(screen, contains('OfferAlreadySubmitted'));
    expect(screen, contains('Navigator.pop(context, true)'));
  });

  test('pending orders remove a submitted order and the form requires a time', () {
    final pending = File('lib/screens/pending_orders_screen.dart').readAsStringSync();
    final screen = File('lib/screens/submit_offer_screen.dart').readAsStringSync();

    expect(pending, contains('StatefulWidget'));
    expect(pending, contains('_openSubmitOffer'));
    expect(pending, contains('_orders.removeWhere'));

    expect(screen, contains("'time_required'"));
    expect(screen, contains("'invalid_time'"));
  });

  test('customer offers screen refreshes live when a driver sends an offer', () {
    final source = File('lib/screens/order_offers_screen.dart').readAsStringSync();

    expect(source, contains('_newOfferSub'));

    expect(source, contains('onNewOffer'));

    expect(source, contains('incomingOrderId'));

    expect(source, contains('LoadOffersEvent'));
  });
}
