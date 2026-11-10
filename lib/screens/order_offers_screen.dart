import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'dart:async';
import '../bloc/offer/offer_bloc.dart';
import '../bloc/offer/offer_event.dart';
import '../bloc/offer/offer_state.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../services/order_service.dart';
import '../services/socket_service.dart';
import '../services/theme_service.dart';
import '../models/offer_model.dart';
import '../bloc/app/app_bloc.dart';
import '../widgets/ui/app_confirm_dialog.dart';
import '../widgets/ui/app_feedback.dart';
import '../widgets/ui/app_tone.dart';

class OrderOffersScreen extends StatefulWidget {
  final String token, orderId;
  const OrderOffersScreen({
    super.key,
    required this.token,
    required this.orderId,
  });
  @override
  State<OrderOffersScreen> createState() => _OrderOffersScreenState();
}

class _OrderOffersScreenState extends State<OrderOffersScreen> {
  final Set<String> _expiredOfferIds = {};
  final OrderService _orderService = OrderService();
  Timer? _offerTimer;
  StreamSubscription? _newOfferSub;
  StreamSubscription? _offerCancelledSub;
  bool _cancelRequested = false;
  bool _resendRequested = false;
  bool _orderWindowExpired = false;
  bool _driverUnavailable = false;
  bool _driverTakenDialogOpen = false;
  String _orderType = '';
  int _rejectedByDriversCount = 0;

  @override
  void initState() {
    super.initState();
    context.read<OfferBloc>().add(
      LoadOffersEvent(token: widget.token, orderId: widget.orderId),
    );
    _loadOrderWindowState();
    _newOfferSub = SocketService.instance.onNewOffer.listen((data) {
      if (!mounted) {
        return;
      }

      final incomingOrderId = data['orderId']?.toString();

      if (incomingOrderId == null || incomingOrderId == widget.orderId) {
        context.read<OfferBloc>().add(
          LoadOffersEvent(token: widget.token, orderId: widget.orderId),
        );
      }
    });
    _offerCancelledSub = SocketService.instance.onOfferCancelled.listen((data) {
      if (!mounted) return;

      final incomingOrderId = data['orderId']?.toString();
      if (incomingOrderId == null || incomingOrderId != widget.orderId) return;

      setState(() => _driverUnavailable = true);
      context.read<OfferBloc>().add(
        LoadOffersEvent(token: widget.token, orderId: widget.orderId),
      );
      _loadOrderWindowState();
      _showDriverTakenDialog();
    });
    _offerTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) {
        return;
      }

      final state = context.read<OfferBloc>().state;

      if (state is OffersLoaded) {
        var shouldReload = false;

        for (final offer in state.offers) {
          final expiresAt = offer.expiresAt;

          if (offer.status == 'pending' &&
              expiresAt != null &&
              !expiresAt.isAfter(DateTime.now()) &&
              _expiredOfferIds.add(offer.id)) {
            shouldReload = true;
          }
        }

        setState(() {});

        if (shouldReload) {
          _loadOrderWindowState();
          context.read<OfferBloc>().add(
            LoadOffersEvent(token: widget.token, orderId: widget.orderId),
          );
        }
      }
    });
  }

  @override
  void dispose() {
    _offerTimer?.cancel();
    _newOfferSub?.cancel();
    _offerCancelledSub?.cancel();
    super.dispose();
  }

  Future<void> _loadOrderWindowState() async {
    try {
      final order = await _orderService.getOrder(widget.token, widget.orderId);

      if (!mounted) {
        return;
      }

      setState(() {
        _orderWindowExpired =
            order['status'] == 'pending' &&
            order['offerWindowExpiredAt'] != null;
        _orderType = order['type']?.toString() ?? '';
        _rejectedByDriversCount =
            (order['rejectedByDriversCount'] as num?)?.toInt() ?? 0;
      });
    } catch (_) {}
  }

  void _resendOrder() {
    setState(() => _resendRequested = true);
    context.read<OfferBloc>().add(
      ResendOrderEvent(token: widget.token, orderId: widget.orderId),
    );
  }

  String _typeLabel(String type) {
    switch (type) {
      case 'product':
        return AppLocalization.get(context, 'product');
      case 'people':
        return AppLocalization.get(context, 'people');
      case 'goods':
        return AppLocalization.get(context, 'goods');
      default:
        return type;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';
    final typeLabel = _typeLabel(_orderType);
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            typeLabel.isEmpty
                ? AppLocalization.get(context, 'offers_list')
                : '${AppLocalization.get(context, 'offers_list')} • $typeLabel',
          ),
          centerTitle: true,
        ),
        body: SafeArea(
          top: false,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: BlocConsumer<OfferBloc, OfferState>(
                listener: (context, state) {
                  if (state is OfferConflict) {
                    if (state.code == 'PROVIDER_TAKEN') {
                      setState(() => _driverUnavailable = true);
                      context.read<OfferBloc>().add(
                        LoadOffersEvent(
                          token: widget.token,
                          orderId: widget.orderId,
                        ),
                      );
                      _loadOrderWindowState();
                      _showDriverTakenDialog();
                    } else {
                      _showConflictDialog(
                        context,
                        state.message,
                        state.orderId,
                      );
                    }
                  }
                  if (state is OffersLoaded && _cancelRequested) {
                    _cancelRequested = false;
                    AppFeedback.info(
                      context,
                      AppLocalization.get(context, 'order_cancelled'),
                    );
                    Navigator.pop(context);
                    return;
                  }
                  if (state is OffersLoaded && _resendRequested) {
                    _resendRequested = false;
                    setState(() {
                      _orderWindowExpired = false;
                      _driverUnavailable = false;
                    });
                    AppFeedback.success(
                      context,
                      AppLocalization.get(context, 'order_resent'),
                    );
                  }
                  if (state is OfferError) {
                    _cancelRequested = false;
                    _resendRequested = false;
                  }
                },
                builder: (context, state) {
                  if (state is OfferLoading)
                    return const Center(child: CircularProgressIndicator());
                  if (state is OffersLoaded) {
                    if (state.offers.isEmpty)
                      return Center(
                        child: SingleChildScrollView(
                          padding: EdgeInsets.symmetric(
                            horizontal: Responsive.paddingHorizontal(context),
                            vertical: Responsive.paddingVertical(context),
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _rejectedByDriversCount > 0
                                    ? AppLocalization.get(
                                        context,
                                        'order_rejected_by_drivers_count',
                                      ).replaceAll(
                                        '%d',
                                        '$_rejectedByDriversCount',
                                      )
                                    : AppLocalization.get(
                                        context,
                                        'awaiting_driver_offers',
                                      ),
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: _rejectedByDriversCount > 0
                                      ? Theme.of(context).colorScheme.error
                                      : Theme.of(
                                          context,
                                        ).colorScheme.onSurfaceVariant,
                                  fontSize: 16,
                                  fontWeight: _rejectedByDriversCount > 0
                                      ? FontWeight.w600
                                      : FontWeight.normal,
                                ),
                              ),
                              const SizedBox(height: 24),
                              if (_orderWindowExpired ||
                                  _driverUnavailable) ...[
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed: _resendOrder,
                                    icon: const Icon(Icons.refresh),
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
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 14,
                                      ),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 10),
                              ],
                              SizedBox(
                                width: double.infinity,
                                child: OutlinedButton.icon(
                                  onPressed: _confirmCancel,
                                  icon: const Icon(Icons.cancel_outlined),
                                  label: Text(
                                    AppLocalization.get(
                                      context,
                                      'cancel_order',
                                    ),
                                  ),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: Theme.of(
                                      context,
                                    ).colorScheme.error,
                                    side: BorderSide(
                                      color: Theme.of(
                                        context,
                                      ).colorScheme.error,
                                    ),
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 14,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    final hasDriverTakenOffer =
                        state.offers.any(
                          (offer) =>
                              offer.rejectionReason == 'provider_unavailable',
                        ) &&
                        !state.offers.any(
                          (offer) => offer.status == 'accepted',
                        );
                    final showDriverTakenNotice =
                        _driverUnavailable || hasDriverTakenOffer;
                    return Column(
                      children: [
                        if (showDriverTakenNotice)
                          Padding(
                            padding: EdgeInsets.fromLTRB(
                              Responsive.paddingHorizontal(context),
                              Responsive.paddingVertical(context),
                              Responsive.paddingHorizontal(context),
                              0,
                            ),
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: appToneStyle(
                                  context,
                                  AppTone.warning,
                                ).background,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: appToneStyle(
                                    context,
                                    AppTone.warning,
                                  ).border,
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    AppLocalization.get(
                                      context,
                                      'driver_taken_notification_title',
                                    ),
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: appToneStyle(
                                        context,
                                        AppTone.warning,
                                      ).foreground,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    AppLocalization.get(
                                      context,
                                      'driver_taken_notification_body',
                                    ),
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: appToneStyle(
                                        context,
                                        AppTone.warning,
                                      ).foreground,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  TextButton.icon(
                                    onPressed: _resendOrder,
                                    icon: const Icon(Icons.refresh, size: 18),
                                    label: Text(
                                      AppLocalization.get(
                                        context,
                                        'resend_order',
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        Expanded(
                          child: RefreshIndicator(
                            onRefresh: () async {
                              final bloc = context.read<OfferBloc>();
                              bloc.add(
                                LoadOffersEvent(
                                  token: widget.token,
                                  orderId: widget.orderId,
                                ),
                              );
                              await bloc.stream.firstWhere(
                                (s) => s is! OfferLoading,
                              );
                            },
                            child: ListView.builder(
                              padding: EdgeInsets.symmetric(
                                horizontal: Responsive.paddingHorizontal(
                                  context,
                                ),
                                vertical: Responsive.paddingVertical(context),
                              ),
                              itemCount: state.offers.length,
                              itemBuilder: (_, i) {
                                final o = state.offers[i];
                                final expiresAt = o.expiresAt;
                                final remainingSeconds = expiresAt == null
                                    ? 0
                                    : expiresAt
                                          .difference(DateTime.now())
                                          .inSeconds;
                                final expired =
                                    o.status == 'pending' &&
                                    expiresAt != null &&
                                    remainingSeconds <= 0;
                                return Card(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Icon(
                                              Icons.person,
                                              color: Theme.of(
                                                context,
                                              ).colorScheme.primary,
                                            ),
                                            const SizedBox(width: 8),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  Row(
                                                    children: [
                                                      Flexible(
                                                        child: Text(
                                                          o.providerName,
                                                          style:
                                                              const TextStyle(
                                                                fontWeight:
                                                                    FontWeight
                                                                        .bold,
                                                                fontSize: 16,
                                                              ),
                                                        ),
                                                      ),
                                                      if (o.outsideArea) ...[
                                                        const SizedBox(
                                                          width: 8,
                                                        ),
                                                        Container(
                                                          padding:
                                                              const EdgeInsets.symmetric(
                                                                horizontal: 8,
                                                                vertical: 2,
                                                              ),
                                                          decoration: BoxDecoration(
                                                            color: appToneStyle(
                                                              context,
                                                              AppTone.warning,
                                                            ).background,
                                                            borderRadius:
                                                                BorderRadius.circular(
                                                                  999,
                                                                ),
                                                            border: Border.all(
                                                              color:
                                                                  appToneStyle(
                                                                    context,
                                                                    AppTone
                                                                        .warning,
                                                                  ).border,
                                                            ),
                                                          ),
                                                          child: Text(
                                                            AppLocalization.get(
                                                              context,
                                                              'provider_outside_area_badge',
                                                            ),
                                                            style: TextStyle(
                                                              fontSize: 11,
                                                              fontWeight:
                                                                  FontWeight
                                                                      .bold,
                                                              color:
                                                                  appToneStyle(
                                                                    context,
                                                                    AppTone
                                                                        .warning,
                                                                  ).foreground,
                                                            ),
                                                          ),
                                                        ),
                                                      ],
                                                    ],
                                                  ),
                                                  if (o
                                                      .providerPublicId
                                                      .isNotEmpty)
                                                    Text(
                                                      'ID ${o.providerPublicId}',
                                                      style: TextStyle(
                                                        fontSize: 12,
                                                        color: Theme.of(context)
                                                            .colorScheme
                                                            .onSurfaceVariant,
                                                        fontWeight:
                                                            FontWeight.w500,
                                                      ),
                                                    ),
                                                ],
                                              ),
                                            ),
                                            const SizedBox(width: 8),
                                            Text(
                                              '${o.price} ${AppLocalization.get(context, 'shekel')}',
                                              style: TextStyle(
                                                color: appToneStyle(
                                                  context,
                                                  AppTone.success,
                                                ).foreground,
                                                fontWeight: FontWeight.bold,
                                                fontSize: 18,
                                              ),
                                            ),
                                          ],
                                        ),
                                        if (o.outsideArea) ...[
                                          const SizedBox(height: 10),
                                          _buildOutsideAreaNotice(context, o),
                                        ],
                                        const SizedBox(height: 12),
                                        if (o.providerPhone.isNotEmpty) ...[
                                          Row(
                                            children: [
                                              Icon(
                                                Icons.phone,
                                                size: 14,
                                                color: Theme.of(
                                                  context,
                                                ).colorScheme.onSurfaceVariant,
                                              ),
                                              const SizedBox(width: 4),
                                              Text(
                                                o.status == 'accepted'
                                                    ? o.providerPhone
                                                    : _maskPhone(
                                                        o.providerPhone,
                                                      ),
                                                style: TextStyle(
                                                  fontSize: 13,
                                                  color: Theme.of(context)
                                                      .colorScheme
                                                      .onSurfaceVariant,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                        const SizedBox(height: 8),
                                        if (o.orderDescription.isNotEmpty)
                                          Text(
                                            o.orderDescription,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 13,
                                              color: Theme.of(
                                                context,
                                              ).colorScheme.onSurfaceVariant,
                                            ),
                                          ),
                                        if (o.estimatedTime > 0) ...[
                                          const SizedBox(height: 4),
                                          Row(
                                            children: [
                                              Icon(
                                                Icons.timer_outlined,
                                                size: 14,
                                                color: appToneStyle(
                                                  context,
                                                  AppTone.info,
                                                ).solid,
                                              ),
                                              const SizedBox(width: 4),
                                              Text(
                                                AppLocalization.get(
                                                  context,
                                                  'est_time',
                                                ).replaceAll(
                                                  '%d',
                                                  '${o.estimatedTime}',
                                                ),
                                                style: TextStyle(
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.w500,
                                                  color: Theme.of(context)
                                                      .colorScheme
                                                      .onSurfaceVariant,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                        if (o.status == 'pending' &&
                                            expiresAt != null) ...[
                                          const SizedBox(height: 4),
                                          Row(
                                            children: [
                                              Icon(
                                                expired
                                                    ? Icons.timer_off_outlined
                                                    : Icons.timer_outlined,
                                                size: 14,
                                                color: Theme.of(
                                                  context,
                                                ).colorScheme.error,
                                              ),
                                              const SizedBox(width: 4),
                                              Text(
                                                expired
                                                    ? AppLocalization.get(
                                                        context,
                                                        'offer_expired',
                                                      )
                                                    : AppLocalization.get(
                                                        context,
                                                        'offer_expires_in',
                                                      ).replaceAll(
                                                        '%d',
                                                        '${remainingSeconds > 0 ? remainingSeconds : 0}',
                                                      ),
                                                style: TextStyle(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w600,
                                                  color: Theme.of(
                                                    context,
                                                  ).colorScheme.error,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                        if (o.orderArea.isNotEmpty) ...[
                                          const SizedBox(height: 4),
                                          Row(
                                            children: [
                                              Icon(
                                                Icons.location_on,
                                                size: 14,
                                                color: Theme.of(
                                                  context,
                                                ).colorScheme.onSurfaceVariant,
                                              ),
                                              const SizedBox(width: 4),
                                              Text(
                                                o.orderArea,
                                                style: TextStyle(
                                                  fontSize: 13,
                                                  color: Theme.of(context)
                                                      .colorScheme
                                                      .onSurfaceVariant,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                        const SizedBox(height: 12),
                                        _buildOfferAction(context, o),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                      ],
                    );
                  }
                  if (state is OfferError)
                    return Center(
                      child: Text(
                        state.message,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
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

  String _maskPhone(String phone) {
    if (phone.length <= 4) return '***';
    return '${phone.substring(0, phone.length - 3)}***';
  }

  Future<void> _confirmCancel() async {
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

    setState(() => _cancelRequested = true);
    context.read<OfferBloc>().add(
      CancelOrderEvent(token: widget.token, orderId: widget.orderId),
    );
  }

  Future<void> _showDriverTakenDialog() async {
    if (_driverTakenDialogOpen || !mounted) return;

    _driverTakenDialogOpen = true;
    final shouldResend = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          AppLocalization.get(dialogContext, 'driver_taken_notification_title'),
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        content: Text(
          AppLocalization.get(dialogContext, 'driver_taken_notification_body'),
          style: const TextStyle(fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(
              AppLocalization.get(dialogContext, 'continue_viewing_offers'),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: appToneStyle(context, AppTone.accent).solid,
              foregroundColor: appToneStyle(context, AppTone.accent).onSolid,
            ),
            child: Text(AppLocalization.get(dialogContext, 'resend_order')),
          ),
        ],
      ),
    );
    _driverTakenDialogOpen = false;

    if (!mounted || shouldResend != true) return;

    _resendOrder();
  }

  void _showConflictDialog(
    BuildContext context,
    String message,
    String orderId,
  ) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: const Text(
          'عذراً',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        content: Text(
          message,
          style: const TextStyle(fontSize: 14),
          textDirection: TextDirection.rtl,
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              context.read<OfferBloc>().add(
                CancelOrderEvent(token: widget.token, orderId: orderId),
              );
            },
            child: const Text('لا، حذف الطلب'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              context.read<OfferBloc>().add(
                ResendOrderEvent(token: widget.token, orderId: orderId),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: appToneStyle(context, AppTone.accent).solid,
              foregroundColor: appToneStyle(context, AppTone.accent).onSolid,
            ),
            child: const Text('نعم، إعادة الإرسال'),
          ),
        ],
      ),
    );
  }

  String _providerPlace(OfferModel offer) {
    final city = offer.providerCity.trim();
    final area = offer.providerArea.trim();

    if (city.isNotEmpty && city != 'من المحافظة نفسها') {
      return city;
    }
    if (area.isNotEmpty) {
      return area;
    }
    return AppLocalization.get(context, 'area_region');
  }

  Widget _buildOutsideAreaNotice(BuildContext context, OfferModel offer) {
    final tone = appToneStyle(context, AppTone.warning);
    final place = _providerPlace(offer);
    final rawGovernorate = offer.providerGovernorate.trim();
    final governorate = rawGovernorate.isEmpty || rawGovernorate == 'غير محدد'
        ? '—'
        : rawGovernorate;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tone.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber_rounded, size: 18, color: tone.foreground),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              AppLocalization.get(
                context,
                'provider_outside_area_card',
              ).replaceFirst('%s', place).replaceFirst('%s', governorate),
              style: TextStyle(
                color: tone.foreground,
                fontSize: 12,
                height: 1.4,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmAcceptOffer(OfferModel offer) async {
    if (offer.outsideArea) {
      final place = _providerPlace(offer);
      final rawGovernorate = offer.providerGovernorate.trim();
      final governorate = rawGovernorate.isEmpty || rawGovernorate == 'غير محدد'
          ? '—'
          : rawGovernorate;
      final confirmed = await showAppConfirmDialog(
        context,
        title: AppLocalization.get(context, 'provider_outside_area_title'),
        message: AppLocalization.get(context, 'provider_outside_area_message')
            .replaceFirst('%s', place)
            .replaceFirst('%s', governorate)
            .replaceFirst('%s', offer.orderArea),
        confirmLabel: AppLocalization.get(
          context,
          'provider_outside_area_confirm',
        ),
        cancelLabel: AppLocalization.get(context, 'cancel'),
      );

      if (!confirmed || !mounted) return;
    }

    context.read<OfferBloc>().add(
      AcceptOfferEvent(
        token: widget.token,
        offerId: offer.id,
        orderId: widget.orderId,
      ),
    );
  }

  Widget _buildOfferAction(BuildContext context, OfferModel o) {
    final DateTime? expiresAt = o.expiresAt;
    final expired =
        o.status == 'pending' &&
        expiresAt != null &&
        !expiresAt.isAfter(DateTime.now());

    if (expired) {
      final tone = appToneStyle(context, AppTone.danger);
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: tone.background,
          borderRadius: BorderRadiusDirectional.circular(AppRadius.pill),
          border: Border.all(color: tone.border),
        ),
        child: Text(
          AppLocalization.get(context, 'offer_expired'),
          textAlign: TextAlign.center,
          style: TextStyle(color: tone.foreground, fontWeight: FontWeight.bold),
        ),
      );
    }

    if (o.status == 'accepted') {
      final tone = appToneStyle(context, AppTone.success);
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: tone.solid,
          borderRadius: BorderRadiusDirectional.circular(AppRadius.pill),
        ),
        child: Text(
          AppLocalization.get(context, 'accepted'),
          textAlign: TextAlign.center,
          style: TextStyle(color: tone.onSolid, fontWeight: FontWeight.bold),
        ),
      );
    }
    if (o.status == 'rejected') {
      final driverTaken = o.rejectionReason == 'provider_unavailable';
      final tone = appToneStyle(
        context,
        driverTaken ? AppTone.warning : AppTone.danger,
      );
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: tone.solid,
          borderRadius: BorderRadiusDirectional.circular(AppRadius.pill),
        ),
        child: Text(
          AppLocalization.get(
            context,
            driverTaken ? 'driver_taken_short' : 'rejected',
          ),
          textAlign: TextAlign.center,
          style: TextStyle(color: tone.onSolid, fontWeight: FontWeight.bold),
        ),
      );
    }
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () => _confirmAcceptOffer(o),
        icon: Icon(
          Icons.check_circle,
          size: 20,
          color: appToneStyle(context, AppTone.success).onSolid,
        ),
        label: Text(
          AppLocalization.get(context, 'accept'),
          style: TextStyle(
            color: appToneStyle(context, AppTone.success).onSolid,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: appToneStyle(context, AppTone.success).solid,
          padding: const EdgeInsets.symmetric(vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
    );
  }
}
