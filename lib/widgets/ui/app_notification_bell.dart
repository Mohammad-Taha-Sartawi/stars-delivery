import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../bloc/notification/notification_bloc.dart';
import '../../bloc/notification/notification_state.dart';
import '../../screens/notifications_screen.dart';
import '../../services/localization_service.dart';
import '../../services/theme_service.dart';

class AppNotificationBell extends StatelessWidget {
  final String token;
  const AppNotificationBell({super.key, required this.token});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return BlocBuilder<NotificationBloc, NotificationState>(
      builder: (context, state) {
        final unread = state is NotificationsLoaded ? state.unreadCount : 0;

        return Stack(
          children: [
            IconButton(
              tooltip: AppLocalization.get(context, 'notifications'),
              icon: const Icon(Icons.notifications_outlined),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => BlocProvider.value(
                      value: context.read<NotificationBloc>(),
                      child: NotificationsScreen(token: token),
                    ),
                  ),
                );
              },
            ),
            if (unread > 0)
              PositionedDirectional(
                end: 6,
                top: 6,
                child: Semantics(
                  label: AppLocalization.get(
                    context,
                    'unread_notifications',
                  ).replaceAll('%d', '$unread'),
                  excludeSemantics: true,
                  child: Container(
                    padding: const EdgeInsetsDirectional.all(AppSpacing.xs),
                    decoration: BoxDecoration(
                      color: scheme.error,
                      shape: BoxShape.circle,
                      border: Border.all(color: scheme.surface, width: 1.5),
                    ),
                    child: Text(
                      '$unread',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: scheme.onError,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
