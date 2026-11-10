import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/models/ad_model.dart';

void main() {
  test('ad model parses backend banner fields', () {
    final ad = AdModel.fromJson({
      '_id': 'ad-1',
      'title': 'عرض خاص',
      'body': 'خصم على التوصيل',
      'imageUrl': '/uploads/ad.png',
    });

    expect(ad.id, 'ad-1');
    expect(ad.title, 'عرض خاص');
    expect(ad.body, 'خصم على التوصيل');
    expect(ad.imageUrl, '/uploads/ad.png');
  });

  test(
    'customer and provider homes render the shared ad banner at the top',
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
      expect(widget, contains("AppLocalization.get(context, 'ad_label')"));
      expect(widget, contains('ApiConfig.resolveMediaUrl'));
    },
  );

  test('ad service and localization are wired', () {
    final service = File('lib/services/ad_service.dart').readAsStringSync();
    final localization = File(
      'lib/services/localization_service.dart',
    ).readAsStringSync();

    expect(service, contains("'/ads'"));
    expect(service, contains('Authorization'));
    expect(localization, contains("'ad_label'"));
  });
}
