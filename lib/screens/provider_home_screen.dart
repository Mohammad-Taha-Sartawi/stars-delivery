import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/app/app_bloc.dart';
import '../bloc/app/app_event.dart';
import '../bloc/app/app_state.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/auth/auth_event.dart';
import '../bloc/provider/provider_bloc.dart';
import '../bloc/provider/provider_event.dart';
import '../bloc/provider/provider_state.dart';
import '../bloc/notification/notification_bloc.dart';
import '../bloc/notification/notification_event.dart';
import '../bloc/notification/notification_state.dart';
import '../models/user_model.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../services/api_config.dart';
import '../services/location_service.dart';
import '../services/provider_service.dart';
import '../services/support_chat_service.dart';
import '../services/socket_service.dart';
import '../services/mobile_session_failure.dart';
import 'login_screen.dart';
import 'pending_orders_screen.dart';
import 'provider_active_orders_screen.dart';
import 'offered_orders_screen.dart';
import 'rejected_orders_screen.dart';
import 'notifications_screen.dart';
import 'profile_screen.dart';
import 'report_screen.dart';
import 'support_chat_screen.dart';

class ProviderHomeScreen extends StatefulWidget {
  final UserModel user;
  final String token;
  const ProviderHomeScreen({
    super.key,
    required this.user,
    required this.token,
  });
  @override
  State<ProviderHomeScreen> createState() => _ProviderHomeScreenState();
}

class _ProviderHomeScreenState extends State<ProviderHomeScreen> with WidgetsBindingObserver {
  final ProviderService _providerService = ProviderService();
  Timer? _notifTimer;
  Timer? _unblockTimer;
  StreamSubscription? _newOrderSub;
  StreamSubscription? _notifCountSub;
  StreamSubscription? _offerAcceptedSub;
  StreamSubscription? _broadcastSub;
  StreamSubscription? _accountDeletedSub;
  StreamSubscription? _sessionRevokedSub;
  StreamSubscription? _httpSessionRejectedSub;
  StreamSubscription? _supportReplySub;
  bool _sessionExitStarted = false;
  bool _updatingAvailability = false;
  int _supportUnreadCount = 0;
  late ChatService _supportChatService;

  Future<void> _loadSupportUnreadCount() async {
    try {
      final count = await _supportChatService.getUnreadCount();

      if (!mounted) {
        return;
      }

      setState(() => _supportUnreadCount = count);
    } catch (_) {}
  }

  Future<void> _setAvailability(bool value) async {
    if (_updatingAvailability) {
      return;
    }

    setState(() => _updatingAvailability = true);

    try {
      await _providerService.setAvailability(widget.token, value);

      if (!mounted) {
        return;
      }

      context.read<ProviderBloc>().add(
        LoadProviderStats(token: widget.token),
      );
      context.read<ProviderBloc>().add(
        LoadPendingOrders(token: widget.token),
      );

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            AppLocalization.get(context, 'availability_updated'),
          ),
          backgroundColor: Colors.green,
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error.toString().replaceFirst('Exception: ', ''),
          ),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _updatingAvailability = false);
      }
    }
  }

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

    SocketService.instance.connect(
      token: widget.token,
      area: ApiConfig.detectedArea,
    );

    context.read<ProviderBloc>().add(LoadProviderStats(token: widget.token));
    context.read<ProviderBloc>().add(LoadPendingOrders(token: widget.token));
    context.read<ProviderBloc>().add(LoadOfferedOrders(token: widget.token));
    context.read<NotificationBloc>().add(
      LoadNotifications(token: widget.token),
    );

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

    _newOrderSub = SocketService.instance.onNewOrder.listen((_) {
      if (!mounted) return;
      context.read<ProviderBloc>().add(LoadPendingOrders(token: widget.token));
      context.read<ProviderBloc>().add(LoadOfferedOrders(token: widget.token));
      context.read<ProviderBloc>().add(LoadProviderStats(token: widget.token));
    });

    _notifCountSub = SocketService.instance.onNotificationCount.listen((count) {
      if (!mounted) return;
      context.read<NotificationBloc>().add(
        LoadNotifications(token: widget.token),
      );
    });

    _offerAcceptedSub = SocketService.instance.onOfferAccepted.listen((_) {
      if (!mounted) return;
      context.read<ProviderBloc>().add(LoadProviderStats(token: widget.token));
      context.read<ProviderBloc>().add(LoadPendingOrders(token: widget.token));
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

  void _scheduleUnblockRefresh(String? blockedUntil) {
    _unblockTimer?.cancel();

    final until = DateTime.tryParse(blockedUntil ?? '');

    if (until == null) {
      return;
    }

    final delay = until.difference(DateTime.now());

    if (delay.isNegative || delay == Duration.zero) {
      return;
    }

    _unblockTimer = Timer(delay + const Duration(seconds: 1), () {
      if (!mounted) {
        return;
      }

      context.read<ProviderBloc>().add(LoadPendingOrders(token: widget.token));
      context.read<ProviderBloc>().add(LoadProviderStats(token: widget.token));
    });
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
      context.read<ProviderBloc>().add(LoadPendingOrders(token: widget.token));
      context.read<ProviderBloc>().add(LoadProviderStats(token: widget.token));
      _loadSupportUnreadCount();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _notifTimer?.cancel();
    _unblockTimer?.cancel();
    _newOrderSub?.cancel();
    _notifCountSub?.cancel();
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
                  backgroundColor: Colors.orange,
                  child: Text(widget.user.fullName.isNotEmpty ? widget.user.fullName[0].toUpperCase() : 'P', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    widget.user.fullName,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.black87, fontWeight: FontWeight.w600, fontSize: 15),
                  ),
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
        body: BlocListener<ProviderBloc, ProviderState>(
          listenWhen: (_, current) => current is ProviderStatsLoaded,
          listener: (context, state) {
            if (state is ProviderStatsLoaded) {
              _scheduleUnblockRefresh(state.stats.blockedUntil);
            }
          },
          child: BlocConsumer<ProviderBloc, ProviderState>(
          listenWhen: (previous, current) {
            if (current is ProviderStatsLoaded &&
                current.pendingOrders != null &&
                current.pendingOrders!.isNotEmpty) {
              final prev = previous is ProviderStatsLoaded ? previous.pendingOrders : null;
              return prev == null || prev.isEmpty;
            }
            return false;
          },
          listener: (context, state) {
            if (state is ProviderStatsLoaded &&
                state.pendingOrders != null &&
                state.pendingOrders!.isNotEmpty) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (!mounted) return;
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => PendingOrdersScreen(
                      orders: state.pendingOrders!,
                      token: widget.token,
                      onRefresh: () {
                        context.read<ProviderBloc>().add(LoadPendingOrders(token: widget.token));
                        context.read<ProviderBloc>().add(LoadProviderStats(token: widget.token));
                      },
                    ),
                  ),
                ).then((_) {
                  if (!mounted) return;
                  context.read<ProviderBloc>().add(
                    LoadProviderStats(token: widget.token),
                  );
                });
              });
            }
          },
          builder: (context, state) {
            if (state is ProviderLoading)
              return const Center(child: CircularProgressIndicator());
            if (state is ProviderError)
              return Center(
                child: Text(
                  state.message,
                  style: const TextStyle(color: Colors.red),
                ),
              );
            if (state is ProviderStatsLoaded) {
              final s = state.stats;
              return Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 600),
                  child: RefreshIndicator(
                    onRefresh: () async {
                      final bloc = context.read<ProviderBloc>();
                      bloc.add(LoadProviderStats(token: widget.token));
                      bloc.add(LoadPendingOrders(token: widget.token));
                      bloc.add(LoadOfferedOrders(token: widget.token));
                      await bloc.stream.first;
                    },
                    child: SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: EdgeInsets.symmetric(
                        horizontal: Responsive.paddingHorizontal(context),
                        vertical: Responsive.paddingVertical(context),
                      ),
                      child: Column(
                      children: [
                        Container(
                          width: double.infinity,
                          decoration: BoxDecoration(
                            color: s.isAvailable
                                ? Colors.green[50]
                                : Colors.red[50],
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: s.isAvailable
                                  ? Colors.green[300]!
                                  : Colors.red[300]!,
                            ),
                          ),
                          child: SwitchListTile(
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                            ),
                            value: s.isAvailable,
                            onChanged: _updatingAvailability
                                ? null
                                : (value) => _setAvailability(value),
                            title: Text(
                              AppLocalization.get(
                                context,
                                'driver_availability',
                              ),
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
                            subtitle: Text(
                              s.isAvailable
                                  ? AppLocalization.get(
                                      context,
                                      'driver_available',
                                    )
                                  : AppLocalization.get(
                                      context,
                                      'driver_unavailable',
                                    ),
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey[700],
                              ),
                            ),
                            secondary: Icon(
                              s.isAvailable
                                  ? Icons.toggle_on
                                  : Icons.toggle_off,
                              color: s.isAvailable
                                  ? Colors.green
                                  : Colors.red,
                              size: 32,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        if (s.pendingOrdersCount + s.offeredOrdersCount + s.activeOrdersCount > 0) ...[
                          Container(
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
                                    ).replaceAll(
                                      '%d',
                                      '${s.pendingOrdersCount + s.offeredOrdersCount + s.activeOrdersCount}',
                                    ),
                                    style: TextStyle(
                                      color: Colors.orange[900],
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                        Row(
                          children: [
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(20),
                                decoration: BoxDecoration(
                                  color: Colors.blue[50],
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      AppLocalization.get(context, 'daily_earnings'),
                                      style: TextStyle(
                                        fontSize: 14,
                                        color: Colors.black54,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      '${s.dailyEarnings.toStringAsFixed(0)} ILS',
                                      style: const TextStyle(
                                        fontSize: 28,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.black87,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Row(
                                      children: [
                                        Text(
                                          '${s.dailyOrderCount}',
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.bold,
                                            color: Colors.blue,
                                          ),
                                        ),
                                        Text(AppLocalization.get(context, 'today_orders').trim(),
                                          style: TextStyle(
                                            fontSize: 13,
                                            color: Colors.black54,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(20),
                                decoration: BoxDecoration(
                                  color: Colors.green[50],
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      AppLocalization.get(context, 'monthly_earnings'),
                                      style: TextStyle(
                                        fontSize: 14,
                                        color: Colors.black54,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      '${s.monthlyEarnings.toStringAsFixed(0)} ILS',
                                      style: const TextStyle(
                                        fontSize: 28,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.black87,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () {
                              final state = context.read<ProviderBloc>().state;
                              if (state is ProviderStatsLoaded &&
                                  state.pendingOrders != null &&
                                  state.pendingOrders!.isNotEmpty) {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => PendingOrdersScreen(
                                      orders: state.pendingOrders!,
                                      token: widget.token,
                                      onRefresh: () {
                                        context.read<ProviderBloc>().add(LoadPendingOrders(token: widget.token));
                                        context.read<ProviderBloc>().add(LoadProviderStats(token: widget.token));
                                      },
                                    ),
                                  ),
                                ).then((_) {
                                  if (!mounted) return;
                                  context.read<ProviderBloc>().add(
                                    LoadProviderStats(token: widget.token),
                                  );
                                });
                              } else {
                                context.read<ProviderBloc>().add(
                                  LoadPendingOrders(token: widget.token),
                                );
                              }
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              side: const BorderSide(
                                color: Colors.red,
                                width: 2,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 18),
                            ),
                            child: Column(
                              children: [
                                Text(
                                  AppLocalization.get(context, 'pending_orders_btn'),
                                  style: TextStyle(
                                    color: Colors.black87,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      '${s.pendingOrdersCount}',
                                      style: const TextStyle(
                                        color: Colors.red,
                                        fontSize: 20,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    Text(AppLocalization.get(context, 'order_count').trim(),
                                      style: TextStyle(
                                        color: Colors.red,
                                        fontSize: 16,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () {
                              final state = context.read<ProviderBloc>().state;
                              if (state is ProviderStatsLoaded &&
                                  state.offeredOrders != null &&
                                  state.offeredOrders!.isNotEmpty) {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => OfferedOrdersScreen(
                                      orders: state.offeredOrders!,
                                      token: widget.token,
                                      onRefresh: () {
                                        context.read<ProviderBloc>().add(LoadOfferedOrders(token: widget.token));
                                        context.read<ProviderBloc>().add(LoadProviderStats(token: widget.token));
                                      },
                                    ),
                                  ),
                                );
                              } else {
                                context.read<ProviderBloc>().add(
                                  LoadOfferedOrders(token: widget.token),
                                );
                              }
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              side: const BorderSide(
                                color: Colors.blue,
                                width: 2,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 18),
                            ),
                            child: Column(
                              children: [
                                Text(
                                  AppLocalization.get(context, 'offered_orders_btn'),
                                  style: TextStyle(
                                    color: Colors.black87,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      '${s.offeredOrdersCount}',
                                      style: const TextStyle(
                                        color: Colors.blue,
                                        fontSize: 20,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    Text(AppLocalization.get(context, 'order_count').trim(),
                                      style: TextStyle(
                                        color: Colors.blue,
                                        fontSize: 16,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => BlocProvider.value(
                                    value: context.read<ProviderBloc>(),
                                    child: ProviderActiveOrdersScreen(
                                      token: widget.token,
                                    ),
                                  ),
                                ),
                              ).then((_) {
                                if (!mounted) return;
                                context.read<ProviderBloc>().add(
                                  LoadProviderStats(token: widget.token),
                                );
                              });
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              side: const BorderSide(
                                color: Colors.teal,
                                width: 2,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 18),
                            ),
                            child: Column(
                              children: [
                                Text(
                                  AppLocalization.get(context, 'active_orders_btn'),
                                  style: TextStyle(
                                    color: Colors.black87,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      '${s.activeOrdersCount}',
                                      style: const TextStyle(
                                        color: Colors.teal,
                                        fontSize: 20,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    Text(AppLocalization.get(context, 'order_count').trim(),
                                      style: TextStyle(
                                        color: Colors.teal,
                                        fontSize: 16,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () {
                              final providerBloc =
                                  context.read<ProviderBloc>();
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => RejectedOrdersScreen(
                                    token: widget.token,
                                  ),
                                ),
                              ).then((_) {
                                providerBloc.add(
                                  LoadProviderStats(token: widget.token),
                                );
                              });
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              side: const BorderSide(
                                color: Colors.grey,
                                width: 2,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 18),
                            ),
                            child: Column(
                              children: [
                                Text(
                                  AppLocalization.get(context, 'rejected_orders_btn'),
                                  style: TextStyle(
                                    color: Colors.black87,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      '${s.ordersReportCount}',
                                      style: TextStyle(
                                        color: Colors.grey[700],
                                        fontSize: 20,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    Text(AppLocalization.get(context, 'order_count').trim(),
                                      style: TextStyle(
                                        color: Colors.grey[700],
                                        fontSize: 16,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: Colors.orange[50],
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                AppLocalization.get(context, 'platform_commission'),
                                style: TextStyle(
                                  fontSize: 14,
                                  color: Colors.black54,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                '${s.monthlyCommission.toStringAsFixed(0)}' + AppLocalization.get(context, 'commission_body').trim(),
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.orange,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => ReportScreen(
                                    token: widget.token,
                                    reportType: 'user',
                                    title: AppLocalization.get(context, 'report_customer'),
                                  ),
                                ),
                              );
                            },
                            icon: const Icon(Icons.report_outlined, size: 22, color: Colors.red),
                            label: const Text(
                              'الابلاغ عن زبون',
                              style: TextStyle(
                                color: Colors.black87,
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              side: const BorderSide(color: Colors.red, width: 1.5),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              elevation: 0,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: () async {
                              await Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => SupportChatScreen(token: widget.token),
                                ),
                              );

                              if (mounted) {
                                _loadSupportUnreadCount();
                              }
                            },
                            icon: const Icon(Icons.headset_mic_outlined, size: 22, color: Colors.orange),
                            label: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  AppLocalization.get(context, 'contact_support'),
                                  style: TextStyle(
                                    color: Colors.black87,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                if (_supportUnreadCount > 0) ...[
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: Colors.red,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Text(
                                      '$_supportUnreadCount',
                                      style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              side: const BorderSide(color: Colors.orange, width: 1.5),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              elevation: 0,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  ),
                ),
              );
            }
            return const SizedBox();
          },
          ),
        ),
      ),
    );
  }
}
