import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/app/app_bloc.dart';
import '../bloc/notification/notification_bloc.dart';
import '../bloc/notification/notification_event.dart';
import '../services/localization_service.dart';
import '../services/provider_service.dart';
import '../services/responsive.dart';
import '../services/socket_service.dart';
import '../services/theme_service.dart';
import '../widgets/ui/app_notification_bell.dart';
import '../widgets/ui/app_status_chip.dart';
import '../widgets/ui/app_tone.dart';
import 'rejected_orders_screen.dart';

class OfferedOrdersScreen extends StatefulWidget {
  final List<Map<String, dynamic>> orders;
  final String token;
  final VoidCallback? onRefresh;
  const OfferedOrdersScreen({
    super.key,
    required this.orders,
    required this.token,
    this.onRefresh,
  });

  @override
  State<OfferedOrdersScreen> createState() => _OfferedOrdersScreenState();
}

class _OfferedOrdersScreenState extends State<OfferedOrdersScreen> {
  final ProviderService _providerService = ProviderService();
  late final List<Map<String, dynamic>> _orders = List.of(widget.orders);
  StreamSubscription? _offerNotSelectedSub;
  StreamSubscription? _offerAcceptedSub;
  Timer? _refreshTimer;
  bool _refreshing = false;

  @override
  void initState() {
    super.initState();

    context.read<NotificationBloc>().add(
      LoadNotifications(token: widget.token),
    );

    _offerNotSelectedSub = SocketService.instance.onOfferNotSelected.listen((
      data,
    ) {
      if (!mounted) return;

      final orderId = data['orderId']?.toString();
      if (orderId == null || orderId.isEmpty) return;

      final wasListed = _orders.any(
        (order) => order['_id']?.toString() == orderId,
      );
      setState(
        () =>
            _orders.removeWhere((order) => order['_id']?.toString() == orderId),
      );
      widget.onRefresh?.call();

      if (!wasListed) return;

      final price = (data['price'] as num?)?.toInt() ?? 0;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            AppLocalization.get(
              context,
              'another_driver_selected_body',
            ).replaceAll('%d', '$price'),
          ),
          action: SnackBarAction(
            label: AppLocalization.get(context, 'view_reports'),
            onPressed: _openReports,
          ),
        ),
      );
    });

    _offerAcceptedSub = SocketService.instance.onOfferAccepted.listen((data) {
      if (!mounted) return;

      final orderId = data['orderId']?.toString();
      if (orderId != null && orderId.isNotEmpty) {
        setState(
          () => _orders.removeWhere(
            (order) => order['_id']?.toString() == orderId,
          ),
        );
      }
      widget.onRefresh?.call();
      _refresh();
    });

    _refreshTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _refresh(),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _offerNotSelectedSub?.cancel();
    _offerAcceptedSub?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    _refreshing = true;

    try {
      final orders = await _providerService.getOfferedOrders(widget.token);
      if (!mounted) return;

      setState(() {
        _orders
          ..clear()
          ..addAll(orders);
      });
    } catch (_) {
      // Keep the current list; the next refresh retries.
    } finally {
      _refreshing = false;
    }
  }

  void _openReports() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => RejectedOrdersScreen(token: widget.token),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';
    final scheme = Theme.of(context).colorScheme;

    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: scheme.surface,
          elevation: 0,
          title: Text(
            AppLocalization.get(context, 'offered_orders_btn'),
            style: TextStyle(
              color: scheme.onSurface,
              fontWeight: FontWeight.bold,
              fontSize: 15,
            ),
          ),
          centerTitle: true,
          leading: IconButton(
            icon: Icon(Icons.arrow_back, color: scheme.onSurface),
            onPressed: () => Navigator.pop(context),
          ),
          actions: [AppNotificationBell(token: widget.token)],
        ),
        body: SafeArea(
          top: false,
          child: RefreshIndicator(
            onRefresh: () async {
              await _refresh();
              widget.onRefresh?.call();
            },
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 600),
                child: _orders.isEmpty
                    ? ListView(
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(40),
                            child: Column(
                              children: [
                                Icon(
                                  Icons.local_offer_outlined,
                                  size: 48,
                                  color: scheme.onSurfaceVariant,
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  AppLocalization.get(
                                    context,
                                    'no_offered_orders',
                                  ),
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 16,
                                    color: scheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: EdgeInsets.symmetric(
                          horizontal: Responsive.paddingHorizontal(context),
                          vertical: Responsive.paddingVertical(context),
                        ),
                        itemCount: _orders.length,
                        itemBuilder: (context, index) {
                          final o = _orders[index];
                          return _buildOrderCard(context, o, scheme);
                        },
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildOrderCard(
    BuildContext context,
    Map<String, dynamic> o,
    ColorScheme scheme,
  ) {
    final typeLabels = {
      'product': AppLocalization.get(context, 'product'),
      'people': AppLocalization.get(context, 'people'),
      'goods': AppLocalization.get(context, 'goods'),
    };
    final typeLabel = typeLabels[o['type']] ?? o['type'] ?? '';
    final typeIcon = switch (o['type']) {
      'product' => Icons.inventory_2_outlined,
      'people' => Icons.groups_outlined,
      'goods' => Icons.local_shipping_outlined,
      _ => Icons.local_shipping_outlined,
    };
    final customer = o['customerId'];
    final customerName = customer is Map
        ? (customer['fullName'] ?? '').toString()
        : '';
    final customerPublicId = customer is Map
        ? (customer['publicId'] ?? '').toString()
        : '';
    final phone = (o['phone'] ?? '').toString();
    final area = (o['area'] ?? '').toString();
    final description = (o['description'] ?? '').toString();
    final offeredPrice = (o['offeredPrice'] as num?)?.toDouble() ?? 0;
    final offeredTime = (o['offeredTime'] as num?)?.toInt() ?? 0;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 0,
      color: Theme.of(context).cardColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: scheme.primaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    typeIcon,
                    color: scheme.onPrimaryContainer,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    typeLabel,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: scheme.onSurface,
                    ),
                  ),
                ),
                AppStatusChip(
                  label: AppLocalization.get(context, 'awaiting_response'),
                  tone: AppTone.info,
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (description.isNotEmpty) ...[
              Text(
                AppLocalization.get(context, 'description'),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: scheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 6),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  description,
                  style: TextStyle(
                    fontSize: 16,
                    height: 1.5,
                    color: scheme.onSurface,
                  ),
                ),
              ),
              const SizedBox(height: 14),
            ],
            _buildInfoRow(
              context,
              icon: Icons.person_outline,
              label: AppLocalization.get(context, 'customer'),
              value: Row(
                children: [
                  Flexible(
                    child: Text(
                      customerName.isNotEmpty
                          ? customerName
                          : AppLocalization.get(context, 'unknown'),
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (customerPublicId.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: scheme.secondaryContainer,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        'ID $customerPublicId',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: scheme.onSecondaryContainer,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            _buildInfoRow(
              context,
              icon: Icons.phone_outlined,
              label: AppLocalization.get(context, 'phone_number'),
              value: Text(
                phone.isNotEmpty
                    ? phone
                    : AppLocalization.get(context, 'hidden_phone'),
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            if (area.isNotEmpty)
              _buildInfoRow(
                context,
                icon: Icons.location_on_outlined,
                label: AppLocalization.get(context, 'area_region'),
                value: Text(
                  area,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            _buildOfferHighlight(context, scheme, offeredPrice, offeredTime),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Widget value,
  }) {
    final scheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: scheme.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 2),
                DefaultTextStyle.merge(
                  style: TextStyle(color: scheme.onSurface),
                  child: value,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOfferHighlight(
    BuildContext context,
    ColorScheme scheme,
    double price,
    int time,
  ) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.secondaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AppLocalization.get(context, 'your_price'),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: scheme.onSecondaryContainer,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${price.toStringAsFixed(0)} ${AppLocalization.get(context, 'shekel')}',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: scheme.onSecondaryContainer,
                  ),
                ),
              ],
            ),
          ),
          if (time > 0) ...[
            Container(
              width: 1,
              height: 44,
              color: scheme.onSecondaryContainer.withValues(alpha: 0.25),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    AppLocalization.get(context, 'offer_time'),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: scheme.onSecondaryContainer,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$time ${AppLocalization.get(context, 'minutes_suffix')}',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: scheme.onSecondaryContainer,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
