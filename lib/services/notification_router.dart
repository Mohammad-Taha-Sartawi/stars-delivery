import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../bloc/offer/offer_bloc.dart';
import '../screens/my_orders_screen.dart';
import '../screens/notifications_screen.dart';
import '../screens/order_detail_screen.dart';
import '../screens/order_offers_screen.dart';
import '../screens/rejected_orders_screen.dart';

/// Screen to open for a notification, shared by the in-app notifications
/// list and push-notification taps so both behave the same.
abstract final class NotificationRouter {
  /// Driver notifications that open the order detail.
  static const providerOrderTypes = {
    'new_order',
    'offer_accepted',
    'delivery_confirmed',
    'delivery_rejected',
    'new_rating',
  };

  /// Customer notifications that open the order's offers.
  static const customerOrderTypes = {
    'new_offer',
    'order_pending',
    'order_completed',
    'driver_taken',
  };

  /// The page for [type]/[orderId], or null when the notification has no
  /// order-specific screen (the caller then shows its details instead).
  static Widget? pageFor({
    required String type,
    required String orderId,
    required String token,
  }) {
    if (orderId.isEmpty) return null;

    if (type == 'delivery_confirmation') {
      return MyOrdersScreen(
        token: token,
        statuses: const {'fulfilling'},
        titleKey: 'in_progress_orders_btn',
      );
    }
    if (type == 'offer_not_selected') {
      return RejectedOrdersScreen(token: token);
    }
    if (providerOrderTypes.contains(type)) {
      return OrderDetailScreen(token: token, orderId: orderId);
    }
    if (customerOrderTypes.contains(type)) {
      return BlocProvider(
        create: (_) => OfferBloc(),
        child: OrderOffersScreen(token: token, orderId: orderId),
      );
    }
    return null;
  }

  /// Opens the screen for a tapped push notification. Notifications without
  /// an order screen (broadcasts, report replies, …) open the notifications
  /// list, where the full text is shown.
  static Future<void> openFromPush(
    BuildContext context, {
    required Map<String, dynamic> data,
    required String token,
  }) {
    final type = (data['type'] ?? '').toString();
    final orderId = (data['orderId'] ?? '').toString();
    final page =
        pageFor(type: type, orderId: orderId, token: token) ??
        NotificationsScreen(token: token);
    return Navigator.push(context, MaterialPageRoute(builder: (_) => page));
  }
}
