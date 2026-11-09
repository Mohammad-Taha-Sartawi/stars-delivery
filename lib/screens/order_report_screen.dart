import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/app/app_bloc.dart';
import '../models/offer_model.dart';
import '../services/localization_service.dart';
import '../services/offer_service.dart';
import '../services/order_service.dart';
import '../services/responsive.dart';
import '../widgets/ui/app_status_chip.dart';
import '../widgets/ui/app_tone.dart';

class OrderReportScreen extends StatefulWidget {
  final String token;
  final String orderId;
  const OrderReportScreen({
    super.key,
    required this.token,
    required this.orderId,
  });

  @override
  State<OrderReportScreen> createState() => _OrderReportScreenState();
}

class _OrderReportScreenState extends State<OrderReportScreen> {
  final OrderService _orderService = OrderService();
  final OfferService _offerService = OfferService();

  Map<String, dynamic>? _order;
  List<OfferModel> _offers = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final order = await _orderService.getOrder(widget.token, widget.orderId);

      var offers = <OfferModel>[];

      try {
        offers = await _offerService.getOffers(widget.token, widget.orderId);
      } catch (_) {}

      if (!mounted) {
        return;
      }

      setState(() {
        _order = order;
        _offers = offers;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  String _typeLabel(String? type) {
    switch (type) {
      case 'product':
        return AppLocalization.get(context, 'product');
      case 'people':
        return AppLocalization.get(context, 'people');
      case 'goods':
        return AppLocalization.get(context, 'goods');
      default:
        return type ?? '';
    }
  }

  ({String key, AppTone tone, IconData icon}) _outcome(
    Map<String, dynamic> order,
  ) {
    final status = order['status']?.toString() ?? '';
    final suspendedUntil = DateTime.tryParse(
      order['offerSuspendedUntil']?.toString() ?? '',
    );

    if (status == 'completed') {
      return (
        key: 'status_completed',
        tone: AppTone.success,
        icon: Icons.check_circle_outline,
      );
    }

    if (status == 'cancelled') {
      return (
        key: 'status_cancelled',
        tone: AppTone.danger,
        icon: Icons.cancel_outlined,
      );
    }

    if (status == 'pending' &&
        suspendedUntil != null &&
        suspendedUntil.isAfter(DateTime.now())) {
      return (
        key: 'order_suspended',
        tone: AppTone.warning,
        icon: Icons.hourglass_bottom,
      );
    }

    if (status == 'expired') {
      return (
        key: 'order_rejected_by_drivers',
        tone: AppTone.danger,
        icon: Icons.cancel_outlined,
      );
    }

    if (status == 'pending' && order['offerWindowExpiredAt'] != null) {
      return (
        key: 'order_rejected_by_drivers',
        tone: AppTone.danger,
        icon: Icons.cancel_outlined,
      );
    }

    if (status == 'accepted' || status == 'fulfilling') {
      return (
        key: 'status_fulfilling',
        tone: AppTone.warning,
        icon: Icons.delivery_dining,
      );
    }

    if (status == 'offered') {
      return (
        key: 'status_offered',
        tone: AppTone.info,
        icon: Icons.local_offer_outlined,
      );
    }

    return (
      key: 'status_pending',
      tone: AppTone.warning,
      icon: Icons.hourglass_empty,
    );
  }

  String _offerStatusLabel(String status) {
    switch (status) {
      case 'accepted':
        return AppLocalization.get(context, 'accepted');
      case 'rejected':
        return AppLocalization.get(context, 'rejected');
      default:
        return AppLocalization.get(context, 'awaiting_response');
    }
  }

  AppTone _offerStatusTone(String status) {
    switch (status) {
      case 'accepted':
        return AppTone.success;
      case 'rejected':
        return AppTone.danger;
      default:
        return AppTone.info;
    }
  }

  String _maskPhone(String phone) {
    if (phone.length <= 4) {
      return '***';
    }

    return '${phone.substring(0, phone.length - 3)}***';
  }

  String _formatDate(dynamic value) {
    final date = DateTime.tryParse(value?.toString() ?? '');

    if (date == null) {
      return '';
    }

    final local = date.toLocal();
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');

    return '${local.year}-$month-$day $hour:$minute';
  }

  Widget _infoRow(IconData icon, String label, String value) {
    if (value.isEmpty) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon,
            size: 16,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 6),
          Text(
            '$label: ',
            style: TextStyle(
              fontSize: 13,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w500,
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 13,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';

    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(AppLocalization.get(context, 'order_report')),
          centerTitle: true,
        ),
        body: SafeArea(
          top: false,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: _buildBody(context),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            _error!,
            textAlign: TextAlign.center,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ),
      );
    }

    final order = _order;

    if (order == null) {
      return const SizedBox();
    }

    final outcome = _outcome(order);
    final outcomeTone = appToneStyle(context, outcome.tone);
    final price = (order['price'] as num?)?.toDouble() ?? 0;
    final area = order['area']?.toString() ?? '';
    final orderCompleted = order['status'] == 'completed';
    final suspendedUntil = DateTime.tryParse(
      order['offerSuspendedUntil']?.toString() ?? '',
    );
    final suspensionSeconds = suspendedUntil == null
        ? 0
        : suspendedUntil.difference(DateTime.now()).inSeconds;

    return ListView(
      padding: EdgeInsets.symmetric(
        horizontal: Responsive.paddingHorizontal(context),
        vertical: Responsive.paddingVertical(context),
      ),
      children: [
        Card(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(outcome.icon, color: outcomeTone.foreground, size: 34),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    AppLocalization.get(context, outcome.key),
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: outcomeTone.foreground,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _typeLabel(order['type']?.toString()),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 10),
                _infoRow(
                  Icons.description_outlined,
                  AppLocalization.get(context, 'description'),
                  order['description']?.toString() ?? '',
                ),
                _infoRow(
                  Icons.location_on_outlined,
                  AppLocalization.get(context, 'area_region'),
                  area,
                ),
                _infoRow(
                  Icons.calendar_today_outlined,
                  AppLocalization.get(context, 'order_date'),
                  _formatDate(order['createdAt']),
                ),
                if (price > 0)
                  _infoRow(
                    Icons.monetization_on_outlined,
                    AppLocalization.get(context, 'price'),
                    '$price ${AppLocalization.get(context, 'shekel')}',
                  ),
                if (suspensionSeconds > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      AppLocalization.get(
                        context,
                        'order_suspended_report_in',
                      ).replaceAll('%d', '$suspensionSeconds'),
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
          ),
        ),
        const SizedBox(height: 16),
        Text(
          AppLocalization.get(context, 'offers_history'),
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
        ),
        const SizedBox(height: 8),
        if (_offers.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(
              AppLocalization.get(context, 'no_offers'),
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          )
        else
          ..._offers.map((offer) {
            final displayPhone = offer.providerPhone.isEmpty
                ? ''
                : (orderCompleted && offer.status == 'accepted'
                      ? offer.providerPhone
                      : _maskPhone(offer.providerPhone));

            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.person_outline,
                          size: 16,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            offer.providerName,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        AppStatusChip(
                          label: _offerStatusLabel(offer.status),
                          tone: _offerStatusTone(offer.status),
                        ),
                      ],
                    ),
                    if (displayPhone.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(
                            Icons.phone,
                            size: 13,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            displayPhone,
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 6),
                    Text(
                      '${AppLocalization.get(context, 'price')}: '
                      '${offer.price} ${AppLocalization.get(context, 'shekel')}'
                      ' · '
                      '${AppLocalization.get(context, 'est_time').replaceAll('%d', '${offer.estimatedTime}')}',
                      style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }
}
