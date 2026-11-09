import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/app/app_bloc.dart';
import '../bloc/app/app_event.dart';
import '../bloc/app/app_state.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/auth/auth_event.dart';
import '../bloc/order/order_bloc.dart';
import '../bloc/offer/offer_bloc.dart';
import '../bloc/notification/notification_bloc.dart';
import '../bloc/notification/notification_event.dart';
import '../bloc/notification/notification_state.dart';
import '../models/user_model.dart';
import '../services/responsive.dart';
import '../services/theme_service.dart';
import '../services/localization_service.dart';
import '../services/location_service.dart';
import '../services/order_service.dart';
import '../services/support_chat_service.dart';
import '../widgets/ui/app_action_tile.dart';
import '../widgets/ui/app_confirm_dialog.dart';
import '../widgets/ui/app_section_header.dart';
import '../widgets/ui/app_tone.dart';
import '../widgets/governorate_scope_card.dart';
import 'create_order_screen.dart';
import 'my_orders_screen.dart';
import 'notifications_screen.dart';
import 'order_offers_screen.dart';
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
  late UserModel _user = widget.user;
  late bool _governorateLevel = _user.governorateLevel;
  String? _openingOffersOrderId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _httpSessionRejectedSub = MobileSessionFailure.instance.onRejected.listen((
      event,
    ) {
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
      _loadOrderCounts();
      _loadAvailableDriversCount();
    });

    _newOfferSub = SocketService.instance.onNewOffer.listen((data) {
      if (!mounted) return;
      _loadOrderCounts();

      final orderId = data['orderId']?.toString();
      if (orderId != null && orderId.isNotEmpty) {
        unawaited(_openOffersForIncomingOffer(orderId));
      }
    });

    _orderStatusSub = SocketService.instance.onOrderStatusChanged.listen((
      data,
    ) {
      if (!mounted) return;
      _loadOrderCounts();
    });

    _offerAcceptedSub = SocketService.instance.onOfferAccepted.listen((data) {
      if (!mounted) return;
      _loadOrderCounts();
    });

    _broadcastSub = SocketService.instance.onBroadcast.listen((_) {
      if (!mounted) return;
      // Admin broadcasts are notification-only; do not show a home snackbar
      // and do not touch the support-chat unread counter.
      context.read<NotificationBloc>().add(
        LoadNotifications(token: widget.token),
      );
    });

    _accountDeletedSub = SocketService.instance.onAccountDeleted.listen((_) {
      _endSession();
    });

    _sessionRevokedSub = SocketService.instance.onSessionRevoked.listen((_) {
      _endSession();
    });
  }

  Future<void> _openOffersForIncomingOffer(String orderId) async {
    if (!mounted || orderId.isEmpty || _openingOffersOrderId != null) {
      return;
    }

    // Only auto-open while the customer is actually on the home screen; the
    // offers screen itself live-refreshes when it is already open.
    final route = ModalRoute.of(context);
    if (route != null && !route.isCurrent) {
      return;
    }

    _openingOffersOrderId = orderId;
    try {
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => BlocProvider(
            create: (_) => OfferBloc(),
            child: OrderOffersScreen(token: widget.token, orderId: orderId),
          ),
        ),
      );
    } finally {
      _openingOffersOrderId = null;
      if (mounted) {
        _loadOrderCounts();
      }
    }
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
      final count = await _orderService.getAvailableDriversCount(widget.token);

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
      MaterialPageRoute(builder: (_) => const LoginScreen()),
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
    final theme = Theme.of(context);

    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: _buildAppBar(context),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                maxWidth: Responsive.maxReadableContentWidth,
              ),
              child: RefreshIndicator(
                onRefresh: () async {
                  final bloc = context.read<NotificationBloc>();
                  bloc.add(LoadNotifications(token: widget.token));
                  await bloc.stream.firstWhere(
                    (s) => s is! NotificationLoading,
                  );
                  await _loadOrderCounts();
                  await _loadAvailableDriversCount();
                  await _loadSupportUnreadCount();
                },
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: Responsive.pageInsets(context),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        AppLocalization.get(context, 'welcome_back'),
                        style: theme.textTheme.headlineSmall,
                      ),
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        AppLocalization.get(context, 'customer_subtitle'),
                        style: theme.textTheme.bodyMedium,
                      ),
                      if (_pendingOrdersCount > 0) ...[
                        const SizedBox(height: AppSpacing.md),
                        _buildPendingBanner(context),
                      ],
                      const SizedBox(height: AppSpacing.lg),
                      _buildPrimaryOrderCard(context),
                      if (_availableDriversCount != null) ...[
                        const SizedBox(height: AppSpacing.md),
                        _buildAvailableDriversBanner(context),
                      ],
                      const SizedBox(height: AppSpacing.lg),
                      AppSectionHeader(
                        title: AppLocalization.get(
                          context,
                          'my_orders_section',
                        ),
                      ),
                      AppActionWrap(
                        children: [
                          AppActionTile(
                            icon: Icons.local_offer_outlined,
                            title: AppLocalization.get(context, 'offers_title'),
                            tone: AppTone.warning,
                            badgeCount: _pendingOrdersCount,
                            onTap: _openMyOrders,
                          ),
                          AppActionTile(
                            icon: Icons.delivery_dining_outlined,
                            title: AppLocalization.get(
                              context,
                              'in_progress_orders_btn',
                            ),
                            tone: AppTone.success,
                            badgeCount: _inProgressOrdersCount,
                            onTap: _openInProgressOrders,
                          ),
                          AppActionTile(
                            icon: Icons.assessment_outlined,
                            title: AppLocalization.get(context, 'report_30'),
                            tone: AppTone.neutral,
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
                        ],
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      AppSectionHeader(
                        title: AppLocalization.get(
                          context,
                          'order_settings_section',
                        ),
                      ),
                      GovernorateScopeCard(
                        token: widget.token,
                        initialEnabled: _governorateLevel,
                        isProvider: false,
                        governorateName: _user.governorate.trim().isNotEmpty
                            ? _user.governorate
                            : _user.area,
                        onChanged: (enabled) {
                          setState(() => _governorateLevel = enabled);
                          _loadAvailableDriversCount();
                        },
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      AppSectionHeader(
                        title: AppLocalization.get(
                          context,
                          'help_and_report_section',
                        ),
                      ),
                      AppActionWrap(
                        children: [
                          AppActionTile(
                            icon: Icons.report_outlined,
                            title: AppLocalization.get(
                              context,
                              'report_driver',
                            ),
                            tone: AppTone.danger,
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => ReportScreen(
                                    token: widget.token,
                                    reportType: 'driver',
                                    title: AppLocalization.get(
                                      context,
                                      'report_driver',
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                          AppActionTile(
                            icon: Icons.headset_mic_outlined,
                            title: AppLocalization.get(
                              context,
                              'contact_support',
                            ),
                            tone: AppTone.accent,
                            badgeCount: _supportUnreadCount,
                            onTap: () async {
                              await Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) =>
                                      SupportChatScreen(token: widget.token),
                                ),
                              );
                              _reloadSupportAfterChat();
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.xl),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _openCreateOrder() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BlocProvider(
          create: (_) => OrderBloc(),
          child: CreateOrderScreen(
            user: _user,
            token: widget.token,
            governorateLevel: _governorateLevel,
          ),
        ),
      ),
    ).then((_) => _loadOrderCounts());
  }

  Widget _buildPrimaryOrderCard(BuildContext context) {
    final theme = Theme.of(context);
    final tone = appToneStyle(context, AppTone.primary);
    final chevron = Directionality.of(context) == TextDirection.rtl
        ? Icons.chevron_left
        : Icons.chevron_right;

    return Semantics(
      button: true,
      label: AppLocalization.get(context, 'new_order'),
      onTap: _openCreateOrder,
      excludeSemantics: true,
      child: Material(
        key: const Key('createOrderCta'),
        color: tone.solid,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadiusDirectional.circular(AppRadius.lg),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: _openCreateOrder,
          child: Padding(
            padding: const EdgeInsetsDirectional.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.lg,
            ),
            child: Row(
              children: [
                Container(
                  width: AppSizes.minTouchTarget,
                  height: AppSizes.minTouchTarget,
                  decoration: BoxDecoration(
                    color: tone.onSolid.withValues(alpha: 0.14),
                    borderRadius: BorderRadiusDirectional.circular(
                      AppRadius.md,
                    ),
                  ),
                  child: Icon(
                    Icons.add_circle_outline,
                    color: tone.onSolid,
                    size: AppSizes.iconLg,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        AppLocalization.get(context, 'new_order'),
                        style: theme.textTheme.titleLarge?.copyWith(
                          color: tone.onSolid,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        AppLocalization.get(context, 'new_order_subtitle'),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: tone.onSolid.withValues(alpha: 0.88),
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Icon(chevron, color: tone.onSolid),
              ],
            ),
          ),
        ),
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return AppBar(
      title: Tooltip(
        message: AppLocalization.get(context, 'profile'),
        child: InkWell(
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => ProfileScreen(
                  user: _user,
                  token: widget.token,
                  onUserUpdated: (updated) {
                    setState(() {
                      _user = updated;
                      _governorateLevel = updated.governorateLevel;
                    });
                    _loadAvailableDriversCount();
                  },
                ),
              ),
            );
          },
          borderRadius: BorderRadius.circular(AppRadius.pill),
          child: Padding(
            padding: const EdgeInsetsDirectional.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.xs,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: AppSizes.avatarSm / 2,
                  backgroundColor: scheme.primaryContainer,
                  child: Text(
                    widget.user.fullName.isNotEmpty
                        ? widget.user.fullName[0].toUpperCase()
                        : 'C',
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: scheme.onPrimaryContainer,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Flexible(
                  child: Text(
                    widget.user.fullName,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        BlocBuilder<NotificationBloc, NotificationState>(
          builder: (context, nState) {
            final unread = nState is NotificationsLoaded
                ? nState.unreadCount
                : 0;
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
                          child: NotificationsScreen(token: widget.token),
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
        ),
        BlocBuilder<AppBloc, AppState>(
          builder: (context, appState) {
            final isDark = appState.themeMode == ThemeMode.dark;
            return IconButton(
              tooltip: AppLocalization.get(context, 'theme'),
              icon: Icon(
                isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined,
              ),
              onPressed: () => context.read<AppBloc>().add(ToggleTheme()),
            );
          },
        ),
        BlocBuilder<AppBloc, AppState>(
          builder: (context, appState) {
            final isAr = appState.locale.languageCode == 'ar';
            return IconButton(
              tooltip: AppLocalization.get(context, 'language'),
              icon: Text(isAr ? 'EN' : 'ع', style: theme.textTheme.labelLarge),
              onPressed: () => context.read<AppBloc>().add(ToggleLocale()),
            );
          },
        ),
        IconButton(
          tooltip: AppLocalization.get(context, 'logout'),
          icon: Icon(Icons.logout, color: scheme.error),
          onPressed: () async {
            final confirmed = await showLogoutConfirmation(context);
            if (!confirmed || !context.mounted) {
              return;
            }

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
    );
  }

  Widget _buildPendingBanner(BuildContext context) {
    final theme = Theme.of(context);
    final tone = appToneStyle(context, AppTone.warning);

    return Semantics(
      button: true,
      child: Material(
        color: tone.background,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadiusDirectional.circular(AppRadius.md),
          side: BorderSide(color: tone.border),
        ),
        child: InkWell(
          onTap: _openMyOrders,
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: Padding(
            padding: const EdgeInsetsDirectional.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.md,
            ),
            child: Row(
              children: [
                Icon(Icons.pending_actions, color: tone.foreground),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    AppLocalization.get(
                      context,
                      'pending_items_alert',
                    ).replaceAll('%d', '$_pendingOrdersCount'),
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: tone.foreground,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Icon(
                  Directionality.of(context) == TextDirection.rtl
                      ? Icons.chevron_left
                      : Icons.chevron_right,
                  size: AppSizes.iconSm,
                  color: tone.foreground,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAvailableDriversBanner(BuildContext context) {
    final theme = Theme.of(context);
    final tone = appToneStyle(context, AppTone.info);
    final noDrivers = _availableDriversCount == 0;
    final hint = AppLocalization.get(context, 'recommend_driver_share_hint');
    final message = noDrivers
        ? AppLocalization.get(
            context,
            _governorateLevel
                ? 'no_available_drivers_governorate'
                : 'no_available_drivers',
          )
        : AppLocalization.get(
            context,
            _governorateLevel
                ? 'available_drivers_count_governorate'
                : 'available_drivers_count',
          ).replaceAll('%d', '${_availableDriversCount!}');

    return Semantics(
      container: true,
      label: '$message $hint',
      excludeSemantics: true,
      child: Material(
        color: tone.background,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadiusDirectional.circular(AppRadius.md),
          side: BorderSide(color: tone.border),
        ),
        child: Padding(
          padding: const EdgeInsetsDirectional.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.md,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.delivery_dining_outlined, color: tone.foreground),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      message,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: tone.foreground,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      hint,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: tone.foreground.withValues(alpha: 0.86),
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
