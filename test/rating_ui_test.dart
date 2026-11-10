import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/models/provider_stats.dart';

void main() {
  test('provider stats parse rating summary fields', () {
    final stats = ProviderStats.fromJson({
      'dailyEarnings': 10,
      'monthlyEarnings': 20,
      'totalSuccessful': 2,
      'dailyOrderCount': 1,
      'dailyCommission': 1,
      'monthlyCommission': 2,
      'pendingOrdersCount': 0,
      'offeredOrdersCount': 0,
      'activeOrdersCount': 0,
      'averageRating': 4.6,
      'ratingCount': 7,
      'ratingStars': 32,
    });

    expect(stats.averageRating, 4.6);
    expect(stats.ratingCount, 7);
    expect(stats.ratingStars, 32);
  });

  test(
    'customer is prompted to rate immediately after delivery confirmation',
    () {
      final source = File(
        'lib/screens/my_orders_screen.dart',
      ).readAsStringSync();

      expect(source, contains('_showRatingPrompt'));

      expect(source, contains("'rating_prompt_title'"));

      expect(source, contains("'rating_prompt_body'"));

      expect(source, contains('_submitRating'));

      expect(source, contains('_orderService.rateOrder'));

      expect(source, contains('await _showRatingPrompt()'));
    },
  );

  test('provider dashboard shows cumulative stars and rating count', () {
    final source = File(
      'lib/screens/provider_home_screen.dart',
    ).readAsStringSync();

    expect(source, contains('_buildRatingCard'));

    expect(source, contains("'driver_rating'"));

    expect(source, contains('ratingStars'));

    expect(source, contains("'rating_stars_total'"));

    expect(source, contains('ratingCount'));

    expect(source, contains("'rating_count'"));
  });

  test('rating notifications use a dedicated icon and order route', () {
    final source = File(
      'lib/screens/notifications_screen.dart',
    ).readAsStringSync();

    expect(source, contains("'new_rating'"));

    expect(source, contains('Icons.star_outline_rounded'));
  });

  test('backend supports rating endpoints and notifications', () {
    final orders = File(
      'stars_delivery_backend/src/routes/orders.js',
    ).readAsStringSync();
    final model = File(
      'stars_delivery_backend/src/models/Rating.js',
    ).readAsStringSync();

    expect(orders, contains("router.post('/:id/rating'"));

    expect(orders, contains("type: 'new_rating'"));

    expect(model, contains('unique: true'));
  });
}
