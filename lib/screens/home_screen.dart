import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/app/app_bloc.dart';
import '../bloc/app/app_event.dart';
import '../bloc/app/app_state.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/auth/auth_event.dart';
import '../bloc/order/order_bloc.dart';
import '../bloc/notification/notification_bloc.dart';
import '../bloc/notification/notification_event.dart';
import '../bloc/notification/notification_state.dart';
import '../models/user_model.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../services/api_config.dart';
import '../services/location_service.dart';
import '../services/order_service.dart';
import '../services/support_chat_service.dart';
import 'create_order_screen.dart';
import 'my_orders_screen.dart';
import 'notifications_screen.dart';
import 'login_screen.dart';
import 'report_screen.dart';
import 'profile_screen.dart';
import 'support_chat_screen.dart';
import '../services/socket_service.dart';
import '../services/mobile_session_failure.dart';

class HomeScreen extends StatefulWidget {
  final UserModel user;
  final String role;
  final String token;
  const HomeScreen({
    super.key,
    required this.user,
    required this.role,
    required this.token,
  });
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  final OrderService _orderService = OrderService();
  Timer? _notifTimer;
  int _pendingOrdersCount = 0;
  int _inProgressOrdersCount = 0;
  int? _availableDriversCount;
  int _supportUnreadCount = 0;
  late ChatService _supportChatService;
  StreamSubscription? _newOfferSub;
  StreamSubscription? _orderStatusSub;
  StreamSubscription? _offerAcceptedSub;
  StreamSubscription? _broadcastSub;
  StreamSubscription? _accountDeletedSub;
  StreamSubscription? _sessionRevokedSub;
  StreamSubscription? _httpSessionRejectedSub;
  StreamSubscription? _supportReplySub;
  bool _sessionExitStarted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _httpSessionRejectedSub =
        MobileSessionFailure.instance.onRejected.listen((event) {
      if (!event.belongsTo(widget.token)) {
        return;
      }

      _endSession();
    });

    LocationService.syncToBackend(widget.token);

    SocketService.instance.connect(token: widget.token);

    context.read<NotificationBloc>().add(
      LoadNotifications(token: widget.token),
    );

    _loadOrderCounts();
    _loadAvailableDriversCount();
    _supportChatService = ChatService(widget.token);
    _loadSupportUnreadCount();
    _supportReplySub = SocketService.instance.onSupportReply.listen((_) {
      _loadSupportUnreadCount();
    });

    _notifTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      context.read<NotificationBloc>().add(
        LoadNotifications(token: widget.token),
      );
      _loadSupportUnreadCount();
    });

    _newOfferSub = SocketService.instance.onNewOffer.listen((data) {
      if (!mounted) return;
      _loadOrderCounts();
    });

    _orderStatusSub = SocketService.instance.onOrderStatusChanged.listen((data) {
      if (!mounted) return;
      _loadOrderCounts();
    });

    _offerAcceptedSub = SocketService.instance.onOfferAccepted.listen((data) {
      if (!mounted) return;
      _loadOrderCounts();
    });

    _broadcastSub = SocketService.instance.onBroadcast.listen((data) {
      if (!mounted) return;
      context.read<NotificationBloc>().add(
        LoadNotifications(token: widget.token),
      );
      _loadSupportUnreadCount();
      final title = data['title']?.toString() ?? '';
      final body = data['body']?.toString() ?? '';
      if (title.isNotEmpty || body.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(title.isNotEmpty ? '$title - $body' : body),
            backgroundColor: Colors.orange,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    });

    _accountDeletedSub =
        SocketService.instance.onAccountDeleted.listen((_) {
      _endSession();
    });

    _sessionRevokedSub =
        SocketService.instance.onSessionRevoked.listen((_) {
      _endSession();
    });
  }

  Future<void> _loadOrderCounts() async {
    try {
      final orders = await _orderService.getMyOrders(widget.token);

      if (!mounted) {
        return;
      }

      var pending = 0;
      var inProgress = 0;

      for (final order in orders) {
        final status = order['status']?.toString();

        if (status == 'pending' || status == 'offered') {
          pending += 1;
        } else if (status == 'accepted' || status == 'fulfilling') {
          inProgress += 1;
        }
      }

      setState(() {
        _pendingOrdersCount = pending;
        _inProgressOrdersCount = inProgress;
      });
    } catch (_) {}
  }

  Future<void> _loadSupportUnreadCount() async {
    try {
      final count = await _supportChatService.getUnreadCount();

      if (!mounted) {
        return;
      }

      setState(() => _supportUnreadCount = count);
    } catch (_) {}
  }

  Future<void> _loadAvailableDriversCount() async {
    try {
      final count = await _orderService.getAvailableDriversCount(
        widget.token,
      );

      if (!mounted) {
        return;
      }

      setState(() => _availableDriversCount = count);
    } catch (_) {}
  }

  Future<void> _openMyOrders() async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => MyOrdersScreen(
          token: widget.token,
          statuses: const {'pending', 'offered'},
          titleKey: 'offers_title',
        ),
      ),
    );

    if (mounted) {
      _loadOrderCounts();
    }
  }

  Future<void> _openInProgressOrders() async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => MyOrdersScreen(
          token: widget.token,
          statuses: const {'accepted', 'fulfilling'},
          titleKey: 'in_progress_orders_btn',
        ),
      ),
    );

    if (mounted) {
      _loadOrderCounts();
    }
  }

  void _endSession() {
    if (!mounted || _sessionExitStarted) {
      return;
    }

    _sessionExitStarted = true;

    SocketService.instance.disconnect();
    context.read<AuthBloc>().add(LogoutEvent());

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => const LoginScreen(),
      ),
      (route) => false,
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState st) {
    if (st == AppLifecycleState.resumed) {
      LocationService.syncToBackend(widget.token);
      _loadOrderCounts();
      _loadAvailableDriversCount();
      _loadSupportUnreadCount();
    }
  }

  void _reloadSupportAfterChat() {
    if (mounted) {
      _loadSupportUnreadCount();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _notifTimer?.cancel();
    _newOfferSub?.cancel();
    _orderStatusSub?.cancel();
    _offerAcceptedSub?.cancel();
    _broadcastSub?.cancel();
    _accountDeletedSub?.cancel();
    _sessionRevokedSub?.cancel();
    _httpSessionRejectedSub?.cancel();
    _supportReplySub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppBloc>().state;
    final isAr = appState.locale.languageCode == 'ar';
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          title: GestureDetector(
            onTap: () {
              Navigator.push(context, MaterialPageRoute(builder: (_) => ProfileScreen(user: widget.user, token: widget.token)));
            },
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: Colors.blue,
                  child: Text(widget.user.fullName.isNotEmpty ? widget.user.fullName[0].toUpperCase() : 'C', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(widget.user.fullName, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.black87, fontWeight: FontWeight.w600, fontSize: 15)),
                ),
              ],
            ),
          ),
          centerTitle: true,
          actions: [
            BlocBuilder<NotificationBloc, NotificationState>(
              builder: (context, nState) {
                final unread = nState is NotificationsLoaded
                    ? nState.unreadCount
                    : 0;
                return Stack(
                  children: [
                    IconButton(
                      icon: const Icon(
                        Icons.notifications_outlined,
                        color: Colors.black87,
                      ),
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => BlocProvider.value(
                              value: context.read<NotificationBloc>(),
                              child: NotificationsScreen(token: widget.token),
                            ),
                          ),
                        );
                      },
                    ),
                    if (unread > 0)
                      Positioned(
                        right: 6,
                        top: 6,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Colors.red,
                            shape: BoxShape.circle,
                          ),
                          child: Text(
                            '$unread',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
            BlocBuilder<AppBloc, AppState>(
              builder: (context, appState) {
                final isDark = appState.themeMode == ThemeMode.dark;
                return IconButton(
                  icon: Icon(isDark ? Icons.light_mode : Icons.dark_mode, color: Colors.grey[700]),
                  onPressed: () => context.read<AppBloc>().add(ToggleTheme()),
                );
              },
            ),
            BlocBuilder<AppBloc, AppState>(
              builder: (context, appState) {
                final isAr = appState.locale.languageCode == 'ar';
                return IconButton(
                  icon: Text(isAr ? 'EN' : 'ع', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.grey[700], fontSize: 15)),
                  onPressed: () => context.read<AppBloc>().add(ToggleLocale()),
                );
              },
            ),
            IconButton(
              icon: const Icon(Icons.logout, color: Colors.red),
              onPressed: () {
                SocketService.instance.disconnect();
                context.read<AuthBloc>().add(LogoutEvent());
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                  (route) => false,
                );
              },
            ),
          ],
        ),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: RefreshIndicator(
              onRefresh: () async {
                final bloc = context.read<NotificationBloc>();
                bloc.add(LoadNotifications(token: widget.token));
                await bloc.stream.firstWhere((s) => s is! NotificationLoading);
                await _loadOrderCounts();
                await _loadAvailableDriversCount();
                await _loadSupportUnreadCount();
              },
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: EdgeInsets.symmetric(
                  horizontal: Responsive.paddingHorizontal(context),
                  vertical: Responsive.paddingVertical(context),
                ),
                child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (_pendingOrdersCount > 0) ...[
                    GestureDetector(
                      onTap: _openMyOrders,
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.orange[50],
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.orange[300]!),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.pending_actions,
                              color: Colors.orange[800],
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                AppLocalization.get(
                                  context,
                                  'pending_items_alert',
                                ).replaceAll('%d', '$_pendingOrdersCount'),
                                style: TextStyle(
                                  color: Colors.orange[900],
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                            Icon(
                              Icons.chevron_left,
                              size: 18,
                              color: Colors.orange[800],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  _ActionButton(
                    icon: Icons.add_circle_outline,
                    label: AppLocalization.get(context, 'new_order'),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => BlocProvider(
                            create: (_) => OrderBloc(),
                            child: CreateOrderScreen(
                              user: widget.user,
                              token: widget.token,
                            ),
                          ),
                        ),
                      ).then((_) => _loadOrderCounts());
                    },
                  ),
                  const SizedBox(height: 16),
                  _ActionButton(
                    icon: Icons.local_offer_outlined,
                    label: AppLocalization.get(context, 'offers_title'),
                    badgeCount: _pendingOrdersCount,
                    onTap: _openMyOrders,
                  ),
                  const SizedBox(height: 16),
                  _ActionButton(
                    icon: Icons.delivery_dining,
                    label: AppLocalization.get(context, 'in_progress_orders_btn'),
                    badgeCount: _inProgressOrdersCount,
                    iconColor: Colors.teal,
                    onTap: _openInProgressOrders,
                  ),
                  const SizedBox(height: 16),
                  _ActionButton(
                    icon: Icons.assessment_outlined,
                    label: AppLocalization.get(context, 'report_30'),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => MyOrdersScreen(
                            token: widget.token,
                            titleKey: 'orders_report',
                            readOnlyReport: true,
                          ),
                        ),
                      );
                    },
                  ),
                  if (_availableDriversCount != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.teal[50],
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.teal[200]!),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.delivery_dining,
                            color: Colors.teal[800],
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _availableDriversCount == 0
                                  ? AppLocalization.get(
                                      context,
                                      'no_available_drivers',
                                    )
                                  : AppLocalization.get(
                                      context,
                                      'available_drivers_count',
                                    ).replaceAll(
                                      '%d',
                                      '${_availableDriversCount!}',
                                    ),
                              style: TextStyle(
                                color: Colors.teal[900],
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  _ActionButton(
                    icon: Icons.report_outlined,
                    label: AppLocalization.get(context, 'report_driver'),
                    iconColor: Colors.red,
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => ReportScreen(
                            token: widget.token,
                            reportType: 'driver',
                            title: 'الابلاغ عن سائق',
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  _ActionButton(
                    icon: Icons.headset_mic_outlined,
                    label: AppLocalization.get(context, 'contact_support'),
                    iconColor: Colors.orange,
                    badgeCount: _supportUnreadCount,
                    onTap: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => SupportChatScreen(token: widget.token),
                        ),
                      );
                      _reloadSupportAfterChat();
                    },
                  ),
                ],
                ),
              ),
            ),
          ),
          ),
        ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? iconColor;
  final int badgeCount;
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.iconColor,
    this.badgeCount = 0,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 24),
          backgroundColor: Colors.white,
          foregroundColor: iconColor ?? Colors.blue[700],
          side: BorderSide(color: Colors.grey[300]!),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 0,
        ),
        child: Row(
          children: [
            Icon(icon, size: 28, color: iconColor),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                textAlign: TextAlign.right,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            if (badgeCount > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: Colors.red,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '$badgeCount',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
