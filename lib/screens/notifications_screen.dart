import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/notification/notification_bloc.dart';
import '../bloc/notification/notification_event.dart';
import '../bloc/notification/notification_state.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../bloc/app/app_bloc.dart';
import '../bloc/offer/offer_bloc.dart';
import 'order_detail_screen.dart';
import 'order_offers_screen.dart';
import 'support_chat_screen.dart';
import '../widgets/image_preview.dart';

class NotificationsScreen extends StatefulWidget {
  final String token;
  const NotificationsScreen({super.key, required this.token});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    context.read<NotificationBloc>().add(
      LoadNotifications(token: widget.token),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          title: Text(
            AppLocalization.get(context, 'notifications'),
            style: const TextStyle(
              color: Colors.black87,
              fontWeight: FontWeight.bold,
            ),
          ),
          centerTitle: true,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.black87),
            onPressed: () => Navigator.pop(context),
          ),
          actions: [
            TextButton(
              onPressed: () => context.read<NotificationBloc>().add(
                MarkAllNotificationsRead(token: widget.token),
              ),
              child: Text(AppLocalization.get(context, 'mark_all_read')),
            ),
          ],
        ),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: BlocBuilder<NotificationBloc, NotificationState>(
              builder: (context, state) {
                if (state is NotificationLoading)
                  return const Center(child: CircularProgressIndicator());
                if (state is NotificationsLoaded) {
                  if (state.notifications.isEmpty)
                    return Center(
                      child: Text(
                        AppLocalization.get(context, 'no_notifications'),
                        style: const TextStyle(color: Colors.grey),
                      ),
                    );
                  return RefreshIndicator(
                    onRefresh: () async {
                      final bloc = context.read<NotificationBloc>();
                      bloc.add(LoadNotifications(token: widget.token));
                      await bloc.stream.firstWhere((s) => s is! NotificationLoading);
                    },
                    child: ListView.builder(
                    padding: EdgeInsets.symmetric(
                      horizontal: Responsive.paddingHorizontal(context),
                      vertical: Responsive.paddingVertical(context),
                    ),
                    itemCount: state.notifications.length,
                    itemBuilder: (_, i) {
                      final n = state.notifications[i];
                      final hasImage = n.image.isNotEmpty;
                      final isPinned = n.pinned;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        color: isPinned ? Colors.orange[50] : (n.read ? Colors.white : Colors.blue[50]),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: isPinned ? BorderSide(color: Colors.orange[300]!, width: 1.5) : BorderSide.none,
                        ),
                        child: ListTile(
                          leading: hasImage
                              ? GestureDetector(
                                  onTap: () => ImagePreview.show(context, n.image),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: Image.network(
                                      n.image,
                                      width: 44,
                                      height: 44,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => Icon(
                                        _iconForType(n.type),
                                        color: Colors.orange,
                                      ),
                                    ),
                                  ),
                                )
                              : Icon(
                                  _iconForType(n.type),
                                  color: isPinned ? Colors.orange : Colors.grey,
                                ),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  n.title,
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: isPinned ? 14 : 13),
                                ),
                              ),
                              if (isPinned)
                                Container(
                                  margin: const EdgeInsets.only(left: 6),
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                  decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(4)),
                                  child: const Text('مثبت', style: TextStyle(fontSize: 9, color: Colors.white, fontWeight: FontWeight.bold)),
                                ),
                            ],
                          ),
                          subtitle: Text(
                            n.body,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          trailing: n.read && !isPinned
                              ? null
                              : isPinned
                                  ? const Icon(Icons.push_pin, size: 16, color: Colors.orange)
                                  : Container(
                                      width: 10,
                                      height: 10,
                                      decoration: const BoxDecoration(
                                        color: Colors.red,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                          onTap: () {
                            if (!n.read) {
                              context.read<NotificationBloc>().add(MarkNotificationRead(token: widget.token, id: n.id));
                            }
                            _openNotification(context, n);
                          },
                        ),
                      );
                    },
                  ),
                  );
                }
                if (state is NotificationError)
                  return Center(
                    child: Text(
                      state.message,
                      style: const TextStyle(color: Colors.red),
                    ),
                  );
                return const SizedBox();
              },
            ),
          ),
        ),
      ),
    );
  }

  IconData _iconForType(String type) {
    switch (type) {
      case 'new_offer':
        return Icons.monetization_on;
      case 'offer_accepted':
        return Icons.check_circle;
      case 'new_order':
        return Icons.add_shopping_cart;
      case 'order_pending':
        return Icons.delivery_dining;
      case 'order_completed':
        return Icons.check_circle_outline;
      case 'broadcast':
        return Icons.campaign;
      default:
        return Icons.notifications;
    }
  }

  void _openNotification(BuildContext context, dynamic n) {
    if (n.orderId.toString().isEmpty) {
      _showDetail(context, n);
      return;
    }

    const providerTypes = {'new_order', 'offer_accepted'};
    const customerTypes = {'new_offer', 'order_pending', 'order_completed'};

    if (providerTypes.contains(n.type)) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => OrderDetailScreen(
            token: widget.token,
            orderId: n.orderId.toString(),
          ),
        ),
      );
      return;
    }

    if (customerTypes.contains(n.type)) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => BlocProvider(
            create: (_) => OfferBloc(),
            child: OrderOffersScreen(
              token: widget.token,
              orderId: n.orderId.toString(),
            ),
          ),
        ),
      );
      return;
    }

    _showDetail(context, n);
  }

  void _showDetail(BuildContext context, dynamic n) {
    final hasContactAction = n.type == 'broadcast' &&
        (n.body.contains('الدعم') || n.body.contains('contact'));
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Row(
          children: [
            Icon(_iconForType(n.type), color: n.pinned ? Colors.orange : Colors.blue, size: 24),
            const SizedBox(width: 10),
            Expanded(child: Text(n.title, style: const TextStyle(fontSize: 16))),
          ],
        ),
        content: SingleChildScrollView(
          child: Text(n.body, style: const TextStyle(fontSize: 14, height: 1.6)),
        ),
        actions: [
          if (hasContactAction)
            TextButton.icon(
              onPressed: () {
                Navigator.pop(context);
                Navigator.push(context, MaterialPageRoute(
                  builder: (_) => SupportChatScreen(token: widget.token),
                ));
              },
              icon: const Icon(Icons.headset_mic, size: 18),
              label: const Text('التواصل مع الدعم'),
            ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('حسناً'),
          ),
        ],
      ),
    );
  }
}
