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
import '../models/provider_stats.dart';
import '../models/user_model.dart';
import '../services/responsive.dart';
import '../services/theme_service.dart';
import '../services/localization_service.dart';
import '../services/api_config.dart';
import '../services/location_service.dart';
import '../services/provider_service.dart';
import '../services/support_chat_service.dart';
import '../services/socket_service.dart';
import '../services/mobile_session_failure.dart';
import '../widgets/ui/app_action_tile.dart';
import '../widgets/ui/app_confirm_dialog.dart';
import '../widgets/ui/app_feedback.dart';
import '../widgets/ui/app_section_header.dart';
import '../widgets/ui/app_state_views.dart';
import '../widgets/ui/app_status_badge.dart';
import '../widgets/ui/app_tone.dart';
import '../widgets/governorate_scope_card.dart';
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

class _ProviderHomeScreenState extends State<ProviderHomeScreen>
    with WidgetsBindingObserver {
  final ProviderService _providerService = ProviderService();
  Timer? _notifTimer;
  Timer? _dashboardRefreshTimer;
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
  late UserModel _user = widget.user;
  late bool _governorateLevel = _user.governorateLevel;
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

      context.read<ProviderBloc>().add(LoadProviderStats(token: widget.token));
      context.read<ProviderBloc>().add(LoadPendingOrders(token: widget.token));

      AppFeedback.success(
        context,
        AppLocalization.get(context, 'availability_updated'),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      AppFeedback.error(
        context,
        error.toString().replaceFirst('Exception: ', ''),
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

    _httpSessionRejectedSub = MobileSessionFailure.instance.onRejected.listen((
      event,
    ) {
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

    // Keep earnings, commission and order counters in sync with the server
    // (for example after test data is removed from the database).
    _dashboardRefreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      context.read<ProviderBloc>().add(LoadProviderStats(token: widget.token));
      context.read<ProviderBloc>().add(LoadPendingOrders(token: widget.token));
      context.read<ProviderBloc>().add(LoadOfferedOrders(token: widget.token));
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
      MaterialPageRoute(builder: (_) => const LoginScreen()),
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
    _dashboardRefreshTimer?.cancel();
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
        appBar: _buildAppBar(context),
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
                final prev = previous is ProviderStatsLoaded
                    ? previous.pendingOrders
                    : null;
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
                        user: _user,
                        onRefresh: () {
                          context.read<ProviderBloc>().add(
                            LoadPendingOrders(token: widget.token),
                          );
                          context.read<ProviderBloc>().add(
                            LoadProviderStats(token: widget.token),
                          );
                        },
                      ),
                    ),
                  ).then((_) {
                    if (!context.mounted) return;
                    context.read<ProviderBloc>().add(
                      LoadProviderStats(token: widget.token),
                    );
                  });
                });
              }
            },
            builder: (context, state) {
              if (state is ProviderLoading) {
                return const AppLoadingState();
              }
              if (state is ProviderError) {
                return AppErrorState(
                  message: state.message,
                  onRetry: () {
                    _refreshDashboard();
                  },
                );
              }
              if (state is ProviderStatsLoaded) {
                return _buildDashboard(context, state.stats);
              }
              return const SizedBox.shrink();
            },
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
                    // Reconnect so the server joins the new village and
                    // governorate socket rooms immediately.
                    SocketService.instance.connect(
                      token: widget.token,
                      area: ApiConfig.detectedArea,
                    );
                    context.read<ProviderBloc>().add(
                      LoadPendingOrders(token: widget.token),
                    );
                    context.read<ProviderBloc>().add(
                      LoadOfferedOrders(token: widget.token),
                    );
                    context.read<ProviderBloc>().add(
                      LoadProviderStats(token: widget.token),
                    );
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
                  backgroundColor: scheme.secondaryContainer,
                  child: Text(
                    widget.user.fullName.isNotEmpty
                        ? widget.user.fullName[0].toUpperCase()
                        : 'P',
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: scheme.onSecondaryContainer,
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

  Future<void> _refreshDashboard() async {
    final bloc = context.read<ProviderBloc>();
    bloc.add(LoadProviderStats(token: widget.token));
    bloc.add(LoadPendingOrders(token: widget.token));
    bloc.add(LoadOfferedOrders(token: widget.token));
    await bloc.stream.firstWhere(
      (state) => state is ProviderStatsLoaded || state is ProviderError,
    );
  }

  int _pendingWorkCount(ProviderStats s) =>
      s.pendingOrdersCount + s.offeredOrdersCount + s.activeOrdersCount;

  Widget _buildDashboard(BuildContext context, ProviderStats s) {
    final pendingWorkCount = _pendingWorkCount(s);

    // SafeArea(false top) keeps the last action row clear of the system
    // navigation/gesture inset on the bottom edge without duplicating the
    // AppBar's top inset (UX01-006/007).
    return SafeArea(
      top: false,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            maxWidth: Responsive.maxReadableContentWidth,
          ),
          child: RefreshIndicator(
            onRefresh: _refreshDashboard,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: Responsive.pageInsets(context),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppSectionHeader(
                    title: AppLocalization.get(context, 'provider_dashboard'),
                  ),
                  _buildAvailabilityCard(context, s),
                  const SizedBox(height: AppSpacing.md),
                  GovernorateScopeCard(
                    token: widget.token,
                    initialEnabled: _governorateLevel,
                    isProvider: true,
                    governorateName: _user.governorate.trim().isNotEmpty
                        ? _user.governorate
                        : _user.area,
                    onChanged: (enabled) {
                      setState(() => _governorateLevel = enabled);
                      // The server joins the governorate socket room only
                      // when the setting is enabled; reconnect to apply it.
                      SocketService.instance.connect(
                        token: widget.token,
                        area: ApiConfig.detectedArea,
                      );
                      context.read<ProviderBloc>().add(
                        LoadPendingOrders(token: widget.token),
                      );
                      context.read<ProviderBloc>().add(
                        LoadProviderStats(token: widget.token),
                      );
                    },
                  ),
                  if (pendingWorkCount > 0) ...[
                    const SizedBox(height: AppSpacing.md),
                    _buildPendingWorkBanner(context, pendingWorkCount),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  _buildEarnings(context, s),
                  const SizedBox(height: AppSpacing.lg),
                  AppSectionHeader(
                    title: AppLocalization.get(context, 'home_quick_actions'),
                  ),
                  AppActionWrap(
                    children: [
                      AppActionTile(
                        icon: Icons.pending_actions_outlined,
                        title: AppLocalization.get(
                          context,
                          'pending_orders_btn',
                        ),
                        tone: AppTone.danger,
                        trailingLabel: '${s.pendingOrdersCount}',
                        onTap: () {
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
                                  user: _user,
                                  onRefresh: () {
                                    context.read<ProviderBloc>().add(
                                      LoadPendingOrders(token: widget.token),
                                    );
                                    context.read<ProviderBloc>().add(
                                      LoadProviderStats(token: widget.token),
                                    );
                                  },
                                ),
                              ),
                            ).then((_) {
                              if (!context.mounted) return;
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
                      ),
                      AppActionTile(
                        icon: Icons.local_offer_outlined,
                        title: AppLocalization.get(
                          context,
                          'offered_orders_btn',
                        ),
                        tone: AppTone.info,
                        trailingLabel: '${s.offeredOrdersCount}',
                        onTap: () {
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
                                    context.read<ProviderBloc>().add(
                                      LoadOfferedOrders(token: widget.token),
                                    );
                                    context.read<ProviderBloc>().add(
                                      LoadProviderStats(token: widget.token),
                                    );
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
                      ),
                      AppActionTile(
                        icon: Icons.delivery_dining_outlined,
                        title: AppLocalization.get(
                          context,
                          'active_orders_btn',
                        ),
                        tone: AppTone.success,
                        trailingLabel: '${s.activeOrdersCount}',
                        onTap: () {
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
                            if (!context.mounted) return;
                            context.read<ProviderBloc>().add(
                              LoadProviderStats(token: widget.token),
                            );
                          });
                        },
                      ),
                      AppActionTile(
                        icon: Icons.assignment_outlined,
                        title: AppLocalization.get(
                          context,
                          'rejected_orders_btn',
                        ),
                        tone: AppTone.neutral,
                        trailingLabel: '${s.ordersReportCount}',
                        onTap: () {
                          final providerBloc = context.read<ProviderBloc>();
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) =>
                                  RejectedOrdersScreen(token: widget.token),
                            ),
                          ).then((_) {
                            providerBloc.add(
                              LoadProviderStats(token: widget.token),
                            );
                          });
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _buildCommissionCard(context, s),
                  const SizedBox(height: AppSpacing.lg),
                  AppActionWrap(
                    children: [
                      AppActionTile(
                        icon: Icons.report_outlined,
                        title: AppLocalization.get(context, 'report_customer'),
                        tone: AppTone.danger,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => ReportScreen(
                                token: widget.token,
                                reportType: 'user',
                                title: AppLocalization.get(
                                  context,
                                  'report_customer',
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                      AppActionTile(
                        icon: Icons.headset_mic_outlined,
                        title: AppLocalization.get(context, 'contact_support'),
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

                          if (mounted) {
                            _loadSupportUnreadCount();
                          }
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
    );
  }

  Widget _buildAvailabilityCard(BuildContext context, ProviderStats s) {
    final theme = Theme.of(context);
    final tone = appToneStyle(
      context,
      s.isAvailable ? AppTone.success : AppTone.danger,
    );

    return Material(
      color: tone.background,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadiusDirectional.circular(AppRadius.lg),
        side: BorderSide(color: tone.border),
      ),
      child: SwitchListTile(
        contentPadding: const EdgeInsetsDirectional.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.xs,
        ),
        value: s.isAvailable,
        onChanged: _updatingAvailability
            ? null
            : (value) => _setAvailability(value),
        title: Text(
          AppLocalization.get(context, 'driver_availability'),
          style: theme.textTheme.titleMedium?.copyWith(
            color: tone.foreground,
            fontWeight: FontWeight.bold,
          ),
        ),
        subtitle: Text(
          s.isAvailable
              ? AppLocalization.get(context, 'driver_available')
              : AppLocalization.get(context, 'driver_unavailable'),
          style: theme.textTheme.bodySmall?.copyWith(color: tone.foreground),
        ),
        secondary: Icon(
          s.isAvailable ? Icons.toggle_on : Icons.toggle_off,
          color: tone.foreground,
          size: AppSizes.iconLg,
        ),
      ),
    );
  }

  Widget _buildPendingWorkBanner(BuildContext context, int total) {
    final theme = Theme.of(context);
    final tone = appToneStyle(context, AppTone.warning);

    return Material(
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
          children: [
            Icon(Icons.pending_actions, color: tone.foreground),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                AppLocalization.get(
                  context,
                  'pending_items_alert',
                ).replaceAll('%d', '$total'),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: tone.foreground,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            // The banner text already announces the count; keep the badge
            // visual but exclude it from the semantics tree.
            ExcludeSemantics(
              child: AppStatusBadge(
                label: '$total',
                tone: AppTone.warning,
                icon: Icons.notifications_active_outlined,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEarnings(BuildContext context, ProviderStats s) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth >= 560;
        final cardWidth = isWide
            ? (constraints.maxWidth - AppSpacing.md) / 2
            : constraints.maxWidth;

        return Wrap(
          spacing: AppSpacing.md,
          runSpacing: AppSpacing.md,
          children: [
            SizedBox(
              width: cardWidth,
              child: _buildMetricCard(
                context,
                label: AppLocalization.get(context, 'daily_earnings'),
                value: '${s.dailyEarnings.toStringAsFixed(0)} ILS',
                tone: AppTone.info,
                footer: Row(
                  children: [
                    Text(
                      '${s.dailyOrderCount}',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: appToneStyle(context, AppTone.info).foreground,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Flexible(
                      child: Text(
                        AppLocalization.get(context, 'today_orders').trim(),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: appToneStyle(context, AppTone.info).foreground,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(
              width: cardWidth,
              child: _buildMetricCard(
                context,
                label: AppLocalization.get(context, 'monthly_earnings'),
                value: '${s.monthlyEarnings.toStringAsFixed(0)} ILS',
                tone: AppTone.success,
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildMetricCard(
    BuildContext context, {
    required String label,
    required String value,
    required AppTone tone,
    Widget? footer,
  }) {
    final theme = Theme.of(context);
    final toneStyle = appToneStyle(context, tone);

    return Material(
      color: toneStyle.background,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadiusDirectional.circular(AppRadius.lg),
        side: BorderSide(color: toneStyle.border),
      ),
      child: Padding(
        padding: const EdgeInsetsDirectional.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: toneStyle.foreground,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              value,
              style: theme.textTheme.headlineMedium?.copyWith(
                color: toneStyle.foreground,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (footer != null) ...[
              const SizedBox(height: AppSpacing.xs),
              footer,
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildCommissionCard(BuildContext context, ProviderStats s) {
    final theme = Theme.of(context);
    final tone = appToneStyle(context, AppTone.warning);

    return Material(
      color: tone.background,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadiusDirectional.circular(AppRadius.lg),
        side: BorderSide(color: tone.border),
      ),
      child: Padding(
        padding: const EdgeInsetsDirectional.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              AppLocalization.get(context, 'platform_commission'),
              style: theme.textTheme.bodySmall?.copyWith(
                color: tone.foreground,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '${s.monthlyCommission.toStringAsFixed(0)}'
              '${AppLocalization.get(context, 'commission_body').trim()}',
              style: theme.textTheme.titleLarge?.copyWith(
                color: tone.foreground,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
