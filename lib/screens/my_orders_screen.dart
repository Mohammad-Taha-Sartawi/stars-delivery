import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'dart:async';
import '../bloc/offer/offer_bloc.dart';
import 'order_offers_screen.dart';
import 'order_report_screen.dart';
import '../services/order_service.dart';
import '../services/offer_service.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../widgets/ui/app_confirm_dialog.dart';
import '../widgets/ui/app_feedback.dart';
import '../widgets/ui/app_status_chip.dart';
import '../widgets/ui/app_tone.dart';
import '../bloc/app/app_bloc.dart';

class MyOrdersScreen extends StatefulWidget {
  final String token;
  final Set<String>? statuses;
  final String titleKey;
  final bool readOnlyReport;
  const MyOrdersScreen({
    super.key,
    required this.token,
    this.statuses,
    this.titleKey = 'my_orders',
    this.readOnlyReport = false,
  });
  @override
  State<MyOrdersScreen> createState() => _MyOrdersScreenState();
}

class _MyOrdersScreenState extends State<MyOrdersScreen> {
  final OrderService _orderService = OrderService();
  final OfferService _offerService = OfferService();
  List<Map<String, dynamic>>? _orders;
  bool _loading = true;
  Timer? _clockTimer;

  @override
  void initState() {
    super.initState();
    _loadOrders();
    _clockTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadOrders() async {
    try {
      final orders = await _orderService.getMyOrders(widget.token);
      final statuses = widget.statuses;
      final filtered = statuses == null
          ? orders
          : orders
                .where(
                  (order) => statuses.contains(order['status']?.toString()),
                )
                .toList();
      setState(() {
        _orders = filtered;
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  Future<void> _cancelOrder(String orderId) async {
    final confirmed = await showAppConfirmDialog(
      context,
      title: AppLocalization.get(context, 'cancel_order'),
      message: AppLocalization.get(context, 'cancel_order_confirm'),
      confirmLabel: AppLocalization.get(context, 'confirm'),
      cancelLabel: AppLocalization.get(context, 'cancel'),
      destructive: true,
    );

    if (!confirmed || !mounted) {
      return;
    }

    try {
      await _offerService.cancelOrder(widget.token, orderId);
      await _loadOrders();

      if (!mounted) {
        return;
      }

      AppFeedback.info(
        context,
        AppLocalization.get(context, 'order_cancelled'),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      AppFeedback.error(
        context,
        error.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<void> _resendOrder(String orderId) async {
    try {
      await _offerService.resendOrder(widget.token, orderId);
      await _loadOrders();

      if (!mounted) {
        return;
      }

      AppFeedback.success(
        context,
        AppLocalization.get(context, 'order_resent'),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      AppFeedback.error(
        context,
        error.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  String _statusLabel(String? status) {
    switch (status) {
      case 'pending':
        return AppLocalization.get(context, 'status_pending');
      case 'offered':
        return AppLocalization.get(context, 'status_offered');
      case 'accepted':
        return AppLocalization.get(context, 'status_accepted');
      case 'fulfilling':
        return AppLocalization.get(context, 'status_fulfilling');
      case 'completed':
        return AppLocalization.get(context, 'status_completed');
      default:
        return status ?? '';
    }
  }

  AppTone _statusTone(String? status) {
    switch (status) {
      case 'pending':
        return AppTone.warning;
      case 'offered':
        return AppTone.info;
      case 'accepted':
        return AppTone.primary;
      case 'fulfilling':
        return AppTone.accent;
      case 'completed':
        return AppTone.success;
      default:
        return AppTone.neutral;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';
    final scheme = Theme.of(context).colorScheme;
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(AppLocalization.get(context, widget.titleKey)),
          centerTitle: true,
        ),
        body: SafeArea(
          top: false,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _orders == null || _orders!.isEmpty
                  ? Center(
                      child: Text(
                        AppLocalization.get(context, 'no_orders'),
                        style: TextStyle(
                          color: scheme.onSurfaceVariant,
                          fontSize: 16,
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadOrders,
                      child: ListView.builder(
                        padding: EdgeInsets.symmetric(
                          horizontal: Responsive.paddingHorizontal(context),
                          vertical: Responsive.paddingVertical(context),
                        ),
                        itemCount: _orders!.length,
                        itemBuilder: (_, i) {
                          final o = _orders![i];
                          final typeLabels = {
                            'product': AppLocalization.get(context, 'product'),
                            'people': AppLocalization.get(context, 'people'),
                            'goods': AppLocalization.get(context, 'goods'),
                          };
                          final status = o['status']?.toString() ?? '';
                          final offerSuspendedUntil = DateTime.tryParse(
                            o['offerSuspendedUntil']?.toString() ?? '',
                          );
                          final suspensionRemaining =
                              offerSuspendedUntil == null
                              ? 0
                              : offerSuspendedUntil
                                    .difference(DateTime.now())
                                    .inSeconds;
                          final isOfferSuspended =
                              status == 'pending' && suspensionRemaining > 0;
                          final isOfferExpired =
                              status == 'expired' ||
                              (status == 'pending' &&
                                  o['offerWindowExpiredAt'] != null &&
                                  !isOfferSuspended);
                          final statusLabel = isOfferSuspended
                              ? AppLocalization.get(context, 'order_suspended')
                              : isOfferExpired
                              ? AppLocalization.get(
                                  context,
                                  'offer_window_expired_short',
                                )
                              : _statusLabel(status);
                          final statusTone = isOfferExpired
                              ? AppTone.danger
                              : isOfferSuspended
                              ? AppTone.warning
                              : _statusTone(status);
                          final acceptedAt = DateTime.tryParse(
                            o['acceptedAt']?.toString() ?? '',
                          );
                          final estimatedMinutes =
                              (o['estimatedTime'] as num?)?.toInt() ?? 0;
                          final showDeliveryClock =
                              (status == 'accepted' ||
                                  status == 'fulfilling') &&
                              acceptedAt != null &&
                              estimatedMinutes > 0;
                          final elapsed = acceptedAt == null
                              ? Duration.zero
                              : DateTime.now().difference(acceptedAt);
                          final elapsedMinutes = elapsed.inMinutes;
                          final remainingMinutes =
                              estimatedMinutes - elapsedMinutes;
                          final overdue =
                              showDeliveryClock && remainingMinutes <= 0;
                          final progress = showDeliveryClock
                              ? (elapsed.inSeconds / (estimatedMinutes * 60))
                                    .clamp(0.0, 1.0)
                                    .toDouble()
                              : 0.0;
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              children: [
                                ListTile(
                                  contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 16,
                                    vertical: 8,
                                  ),
                                  title: Text(
                                    typeLabels[o['type']] ?? o['type'] ?? '',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  subtitle: Text(
                                    o['description'] ?? '',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  trailing: AppStatusChip(
                                    label: statusLabel,
                                    tone: statusTone,
                                  ),
                                  onTap: () {
                                    if (widget.readOnlyReport) {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) => OrderReportScreen(
                                            token: widget.token,
                                            orderId: o['_id']?.toString() ?? '',
                                          ),
                                        ),
                                      ).then((_) => _loadOrders());
                                      return;
                                    }

                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => BlocProvider(
                                          create: (_) => OfferBloc(),
                                          child: OrderOffersScreen(
                                            token: widget.token,
                                            orderId: o['_id']?.toString() ?? '',
                                          ),
                                        ),
                                      ),
                                    ).then((_) => _loadOrders());
                                  },
                                ),
                                if (isOfferSuspended)
                                  Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                      16,
                                      0,
                                      16,
                                      8,
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          Icons.hourglass_bottom,
                                          size: 14,
                                          color: appToneStyle(
                                            context,
                                            AppTone.warning,
                                          ).foreground,
                                        ),
                                        const SizedBox(width: 4),
                                        Expanded(
                                          child: Text(
                                            AppLocalization.get(
                                              context,
                                              'order_suspended_report_in',
                                            ).replaceAll(
                                              '%d',
                                              '$suspensionRemaining',
                                            ),
                                            style: TextStyle(
                                              color: appToneStyle(
                                                context,
                                                AppTone.warning,
                                              ).foreground,
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  )
                                else if (isOfferExpired)
                                  Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                      16,
                                      0,
                                      16,
                                      8,
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          Icons.timer_off_outlined,
                                          size: 14,
                                          color: scheme.error,
                                        ),
                                        const SizedBox(width: 4),
                                        Expanded(
                                          child: Text(
                                            AppLocalization.get(
                                              context,
                                              'offer_window_expired',
                                            ),
                                            style: TextStyle(
                                              color: scheme.error,
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                if (showDeliveryClock)
                                  Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                      16,
                                      0,
                                      16,
                                      12,
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Icon(
                                              Icons.timer_outlined,
                                              size: 16,
                                              color: appToneStyle(
                                                context,
                                                AppTone.info,
                                              ).solid,
                                            ),
                                            const SizedBox(width: 6),
                                            Expanded(
                                              child: Text(
                                                AppLocalization.get(
                                                      context,
                                                      'delivery_progress',
                                                    )
                                                    .replaceAll(
                                                      '%t',
                                                      '$estimatedMinutes',
                                                    )
                                                    .replaceAll(
                                                      '%d',
                                                      '$elapsedMinutes',
                                                    ),
                                                style: TextStyle(
                                                  fontSize: 13,
                                                  color:
                                                      scheme.onSurfaceVariant,
                                                ),
                                              ),
                                            ),
                                            Text(
                                              overdue
                                                  ? AppLocalization.get(
                                                      context,
                                                      'delivery_overdue',
                                                    )
                                                  : AppLocalization.get(
                                                      context,
                                                      'delivery_remaining',
                                                    ).replaceAll(
                                                      '%d',
                                                      '${remainingMinutes < 0 ? 0 : remainingMinutes}',
                                                    ),
                                              style: TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.bold,
                                                color: overdue
                                                    ? scheme.error
                                                    : appToneStyle(
                                                        context,
                                                        AppTone.info,
                                                      ).solid,
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 6),
                                        ClipRRect(
                                          borderRadius: BorderRadius.circular(
                                            4,
                                          ),
                                          child: LinearProgressIndicator(
                                            value: progress,
                                            minHeight: 6,
                                            backgroundColor:
                                                scheme.surfaceContainerHighest,
                                            valueColor:
                                                AlwaysStoppedAnimation<Color>(
                                                  overdue
                                                      ? scheme.error
                                                      : appToneStyle(
                                                          context,
                                                          AppTone.info,
                                                        ).solid,
                                                ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                if (o['status'] == 'pending' &&
                                    !widget.readOnlyReport)
                                  Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                      16,
                                      0,
                                      16,
                                      12,
                                    ),
                                    child: Column(
                                      children: [
                                        if (widget.titleKey == 'offers_title' &&
                                            o['offerWindowExpiredAt'] !=
                                                null) ...[
                                          SizedBox(
                                            width: double.infinity,
                                            child: ElevatedButton.icon(
                                              onPressed: () => _resendOrder(
                                                o['_id']?.toString() ?? '',
                                              ),
                                              icon: const Icon(
                                                Icons.refresh,
                                                size: 18,
                                              ),
                                              label: Text(
                                                AppLocalization.get(
                                                  context,
                                                  'resend_order',
                                                ),
                                              ),
                                              style: ElevatedButton.styleFrom(
                                                backgroundColor: appToneStyle(
                                                  context,
                                                  AppTone.accent,
                                                ).solid,
                                                foregroundColor: appToneStyle(
                                                  context,
                                                  AppTone.accent,
                                                ).onSolid,
                                                shape: RoundedRectangleBorder(
                                                  borderRadius:
                                                      BorderRadius.circular(8),
                                                ),
                                              ),
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                        ],
                                        SizedBox(
                                          width: double.infinity,
                                          child: OutlinedButton.icon(
                                            onPressed: () => _cancelOrder(
                                              o['_id']?.toString() ?? '',
                                            ),
                                            icon: const Icon(
                                              Icons.cancel_outlined,
                                              size: 18,
                                            ),
                                            label: Text(
                                              AppLocalization.get(
                                                context,
                                                'cancel_order',
                                              ),
                                            ),
                                            style: OutlinedButton.styleFrom(
                                              foregroundColor: scheme.error,
                                              side: BorderSide(
                                                color: scheme.error,
                                              ),
                                              shape: RoundedRectangleBorder(
                                                borderRadius:
                                                    BorderRadius.circular(8),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
