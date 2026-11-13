import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/notification/notification_bloc.dart';
import '../bloc/notification/notification_event.dart';
import '../bloc/notification/notification_state.dart';
import '../services/responsive.dart';
import '../services/notification_router.dart';
import '../services/localization_service.dart';
import '../services/theme_service.dart';
import '../bloc/app/app_bloc.dart';
import '../widgets/ui/app_status_badge.dart';
import '../widgets/ui/app_tone.dart';

class NotificationsScreen extends StatefulWidget {
  final String token;
  const NotificationsScreen({super.key, required this.token});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    context.read<NotificationBloc>().add(
      LoadNotifications(token: widget.token),
    );
    _refreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted) {
        context.read<NotificationBloc>().add(
          LoadNotifications(token: widget.token),
        );
      }
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';
    final scheme = Theme.of(context).colorScheme;
    final pinnedTone = appToneStyle(context, AppTone.warning);
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(AppLocalization.get(context, 'notifications')),
          centerTitle: true,
          actions: [
            TextButton(
              onPressed: () => context.read<NotificationBloc>().add(
                MarkAllNotificationsRead(token: widget.token),
              ),
              child: Text(AppLocalization.get(context, 'mark_all_read')),
            ),
          ],
        ),
        body: SafeArea(
          top: false,
          child: Center(
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
                          style: TextStyle(color: scheme.onSurfaceVariant),
                        ),
                      );
                    return RefreshIndicator(
                      onRefresh: () async {
                        final bloc = context.read<NotificationBloc>();
                        bloc.add(LoadNotifications(token: widget.token));
                        await bloc.stream.firstWhere(
                          (s) => s is! NotificationLoading,
                        );
                      },
                      child: ListView.builder(
                        padding: EdgeInsets.symmetric(
                          horizontal: Responsive.paddingHorizontal(context),
                          vertical: Responsive.paddingVertical(context),
                        ),
                        itemCount: state.notifications.length,
                        itemBuilder: (_, i) {
                          final n = state.notifications[i];
                          final isPinned = n.pinned;
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            color: isPinned
                                ? pinnedTone.background
                                : (n.read
                                      ? scheme.surfaceContainerLow
                                      : scheme.primaryContainer.withValues(
                                          alpha: 0.45,
                                        )),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadiusDirectional.circular(
                                AppRadius.md,
                              ),
                              side: BorderSide(
                                color: isPinned
                                    ? pinnedTone.border
                                    : scheme.outlineVariant,
                                width: isPinned ? 1.5 : 1,
                              ),
                            ),
                            child: ListTile(
                              leading: Icon(
                                _iconForType(n.type),
                                color: isPinned
                                    ? pinnedTone.foreground
                                    : scheme.onSurfaceVariant,
                              ),
                              title: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      n.title,
                                      style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: isPinned ? 14 : 13,
                                      ),
                                    ),
                                  ),
                                  if (isPinned)
                                    Padding(
                                      padding: const EdgeInsetsDirectional.only(
                                        start: AppSpacing.xs,
                                      ),
                                      child: AppStatusBadge(
                                        label: AppLocalization.get(
                                          context,
                                          'pinned',
                                        ),
                                        tone: AppTone.warning,
                                        icon: Icons.push_pin,
                                      ),
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
                                  ? Icon(
                                      Icons.push_pin,
                                      size: 16,
                                      color: pinnedTone.foreground,
                                    )
                                  : AppStatusBadge(
                                      label: AppLocalization.get(
                                        context,
                                        'unread',
                                      ),
                                      tone: AppTone.info,
                                    ),
                              onTap: () {
                                if (!n.read) {
                                  context.read<NotificationBloc>().add(
                                    MarkNotificationRead(
                                      token: widget.token,
                                      id: n.id,
                                    ),
                                  );
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
                        style: TextStyle(color: scheme.error),
                      ),
                    );
                  return const SizedBox();
                },
              ),
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
      case 'offer_not_selected':
        return Icons.block_outlined;
      case 'driver_taken':
        return Icons.person_off_outlined;
      case 'new_order':
        return Icons.add_shopping_cart;
      case 'order_pending':
        return Icons.delivery_dining;
      case 'order_completed':
        return Icons.check_circle_outline;
      case 'delivery_confirmation':
        return Icons.assignment_turned_in_outlined;
      case 'delivery_confirmed':
        return Icons.verified_outlined;
      case 'delivery_rejected':
        return Icons.report_gmailerrorred_outlined;
      case 'new_rating':
        return Icons.star_outline_rounded;
      case 'report_reply':
        return Icons.support_agent;
      case 'broadcast':
        return Icons.campaign;
      default:
        return Icons.notifications;
    }
  }

  void _openNotification(BuildContext context, dynamic n) {
    final page = NotificationRouter.pageFor(
      type: n.type.toString(),
      orderId: n.orderId.toString(),
      token: widget.token,
    );
    if (page == null) {
      _showDetail(context, n);
      return;
    }
    Navigator.push(context, MaterialPageRoute(builder: (_) => page));
  }

  void _showDetail(BuildContext context, dynamic n) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Row(
          children: [
            Icon(
              _iconForType(n.type),
              color: n.pinned
                  ? appToneStyle(dialogContext, AppTone.warning).foreground
                  : Theme.of(dialogContext).colorScheme.primary,
              size: 24,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(n.title, style: const TextStyle(fontSize: 16)),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Text(
            n.body,
            style: const TextStyle(fontSize: 14, height: 1.6),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(AppLocalization.get(context, 'ok')),
          ),
        ],
      ),
    );
  }
}
