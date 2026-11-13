import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:swifora/models/ad_model.dart';

void main() {
  test(
    'ad model parses optional title, multiple images, and countdown dates',
    () {
      final ad = AdModel.fromJson({
        '_id': 'ad-1',
        'title': '',
        'body': 'خصم على التوصيل',
        'images': ['/uploads/ads/a.png', '/uploads/ads/b.png'],
        'startsAt': '2026-11-10T10:00:00.000Z',
        'endsAt': '2026-11-20T10:00:00.000Z',
      });

      expect(ad.id, 'ad-1');
      expect(ad.title, '');
      expect(ad.body, 'خصم على التوصيل');
      expect(ad.images.length, 2);
      expect(ad.startsAt, isNotNull);
      expect(ad.endsAt, isNotNull);
      expect(ad.isActiveAt(DateTime.utc(2026, 11, 15)), isTrue);
      expect(ad.isActiveAt(DateTime.utc(2026, 11, 21)), isFalse);

      final imageOnly = AdModel.fromJson({
        '_id': 'ad-2',
        'title': '',
        'body': '',
        'images': ['/uploads/ads/only.png'],
      });

      expect(imageOnly.title, isEmpty);
      expect(imageOnly.body, isEmpty);
      expect(imageOnly.images.single, '/uploads/ads/only.png');
    },
  );

  test(
    'customer and provider homes render the shared ad slider at the top',
    () {
      final customer = File('lib/screens/home_screen.dart').readAsStringSync();
      final provider = File(
        'lib/screens/provider_home_screen.dart',
      ).readAsStringSync();
      final widget = File(
        'lib/widgets/ui/ad_banner_carousel.dart',
      ).readAsStringSync();

      expect(customer, contains('AdBannerCarousel('));
      expect(customer, contains('refreshTick: _adRefreshTick'));
      expect(provider, contains('AdBannerCarousel('));
      expect(provider, contains('refreshTick: _adRefreshTick'));
      expect(widget, contains('PageView.builder'));
      expect(widget, contains('Timer.periodic'));
      expect(widget, contains('AnimatedContainer'));
      expect(widget, contains('ad_ends_in'));
      expect(widget, contains('ApiConfig.resolveMediaUrl'));
      expect(widget, contains('AnimatedSwitcher'));
    },
  );

  test('ad service and localization are wired', () {
    final service = File('lib/services/ad_service.dart').readAsStringSync();
    final localization = File(
      'lib/services/localization_service.dart',
    ).readAsStringSync();

    expect(service, contains("'/ads'"));
    expect(service, contains('Authorization'));
    expect(service, isNot(contains('title.trim().isNotEmpty')));
    expect(localization, contains("'ad_label'"));
    expect(localization, contains("'ad_ends_in'"));
  });
}
