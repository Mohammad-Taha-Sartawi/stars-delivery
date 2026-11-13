// Push notification taps and foreground pushes (no Firebase needed: the
// service's handlers are exercised directly).
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/screens/my_orders_screen.dart';
import 'package:stars_delivery/screens/order_detail_screen.dart';
import 'package:stars_delivery/screens/rejected_orders_screen.dart';
import 'package:stars_delivery/services/notification_router.dart';
import 'package:stars_delivery/services/push_notification_service.dart';

void main() {
  group('NotificationRouter.pageFor', () {
    Object? page(String type, [String orderId = 'o1']) =>
        NotificationRouter.pageFor(type: type, orderId: orderId, token: 't');

    test('driver order events open the order detail', () {
      for (final type in [
        'new_order',
        'offer_accepted',
        'delivery_confirmed',
        'delivery_rejected',
        'new_rating',
      ]) {
        final p = page(type);
        expect(p, isA<OrderDetailScreen>(), reason: type);
        expect((p! as OrderDetailScreen).orderId, 'o1');
      }
    });

    test('customer offer events open the order offers', () {
      for (final type in [
        'new_offer',
        'order_pending',
        'order_completed',
        'driver_taken',
      ]) {
        expect(page(type), isA<BlocProvider>(), reason: type);
      }
    });

    test('delivery confirmation and not-selected have their own screens', () {
      expect(page('delivery_confirmation'), isA<MyOrdersScreen>());
      expect(page('offer_not_selected'), isA<RejectedOrdersScreen>());
    });

    test('notifications without an order have no order screen', () {
      expect(page('broadcast', ''), isNull);
      expect(page('report_reply', ''), isNull);
      expect(page('unknown_type'), isNull);
    });
  });

  group('PushNotificationService taps', () {
    final service = PushNotificationService.instance;

    tearDown(() => service.takePendingOpen());

    test('a tap with no screen listening is kept for the next home screen', () {
      service.handleOpened({'type': 'new_offer', 'orderId': 'o9'});
      expect(service.takePendingOpen(), {'type': 'new_offer', 'orderId': 'o9'});
      expect(service.takePendingOpen(), isNull);
    });

    test('a tap is delivered to a listening home screen', () async {
      final received = <Map<String, dynamic>>[];
      final sub = service.onOpened.listen(received.add);
      service.handleOpened({'type': 'new_order', 'orderId': 'o2'});
      await Future<void>.delayed(Duration.zero);
      expect(received, [
        {'type': 'new_order', 'orderId': 'o2'},
      ]);
      expect(service.takePendingOpen(), isNull);
      await sub.cancel();
    });

    test('foreground pushes are streamed to the open app', () async {
      final received = <ForegroundPush>[];
      final sub = service.onForeground.listen(received.add);
      service.handleForeground(
        const ForegroundPush(title: 'عرض جديد', body: '15 شيكل', data: {}),
      );
      await Future<void>.delayed(Duration.zero);
      expect(received.single.title, 'عرض جديد');
      await sub.cancel();
    });
  });
}
