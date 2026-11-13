import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/app/app_bloc.dart';
import '../services/location_catalog.dart';
import '../services/localization_service.dart';
import '../services/provider_service.dart';
import '../services/responsive.dart';
import '../widgets/ui/app_status_chip.dart';
import '../widgets/ui/app_tone.dart';

class RejectedOrdersScreen extends StatefulWidget {
  final String token;
  const RejectedOrdersScreen({super.key, required this.token});

  @override
  State<RejectedOrdersScreen> createState() => _RejectedOrdersScreenState();
}

class _RejectedOrdersScreenState extends State<RejectedOrdersScreen> {
  final ProviderService _providerService = ProviderService();

  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;
  String? _error;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _load();
    // Reflect server-side deletions (reports) without closing the screen.
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) {
        _load(showLoading: false);
      }
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool showLoading = true}) async {
    if (showLoading) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final orders = await _providerService.getRejectedOrders(widget.token);

      if (!mounted) {
        return;
      }

      setState(() {
        _orders = orders;
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

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';
    final typeLabels = {
      'product': AppLocalization.get(context, 'product'),
      'people': AppLocalization.get(context, 'people'),
      'goods': AppLocalization.get(context, 'goods'),
    };

    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(AppLocalization.get(context, 'rejected_orders_btn')),
          centerTitle: true,
        ),
        body: SafeArea(
          top: false,
          child: RefreshIndicator(
            onRefresh: _load,
            child: _buildBody(context, typeLabels),
          ),
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context, Map<String, String> typeLabels) {
    final scheme = Theme.of(context).colorScheme;

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(40),
            child: Text(
              _error!,
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.error),
            ),
          ),
        ],
      );
    }

    if (_orders.isEmpty) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(40),
            child: Text(
              AppLocalization.get(context, 'no_rejected_orders'),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 16, color: scheme.onSurfaceVariant),
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      padding: EdgeInsets.symmetric(
        horizontal: Responsive.paddingHorizontal(context),
        vertical: Responsive.paddingVertical(context),
      ),
      itemCount: _orders.length,
      itemBuilder: (context, index) {
        final order = _orders[index];
        final customer = order['customerId'];
        final name = customer is Map ? (customer['fullName'] ?? '') : '';
        final pid = customer is Map ? (customer['publicId'] ?? '') : '';
        final notSelected = order['recordType'] == 'offer_not_selected';
        final delivered = order['recordType'] == 'delivered';
        final phone = order['phone']?.toString() ?? '';
        final offeredPrice = (order['offeredPrice'] as num?)?.toInt() ?? 0;
        final acceptedPrice = (order['acceptedPrice'] as num?)?.toInt() ?? 0;

        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      typeLabels[order['type']] ?? order['type'] ?? '',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const Spacer(),
                    AppStatusChip(
                      label: AppLocalization.get(
                        context,
                        delivered
                            ? 'status_completed'
                            : notSelected
                            ? 'offer_not_selected_status'
                            : 'rejected',
                      ),
                      tone: delivered
                          ? AppTone.success
                          : notSelected
                          ? AppTone.warning
                          : AppTone.danger,
                      icon: delivered
                          ? Icons.check_circle_outline
                          : notSelected
                          ? Icons.person_off_outlined
                          : Icons.cancel_outlined,
                    ),
                  ],
                ),
                if (name.toString().isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(
                        Icons.person_outline,
                        size: 13,
                        color: scheme.primary,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        name.toString(),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (pid.toString().isNotEmpty) ...[
                        const SizedBox(width: 6),
                        Text(
                          'ID $pid',
                          style: TextStyle(
                            fontSize: 11,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
                if (phone.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(
                        Icons.phone,
                        size: 13,
                        color: scheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        phone,
                        style: TextStyle(
                          fontSize: 12,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 6),
                Text(
                  order['description'] ?? '',
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 13,
                  ),
                ),
                if (notSelected) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(
                        Icons.info_outline,
                        size: 13,
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
                            'offer_not_selected_reason',
                          ),
                          style: TextStyle(
                            fontSize: 12,
                            color: appToneStyle(
                              context,
                              AppTone.warning,
                            ).foreground,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    children: [
                      Text(
                        AppLocalization.get(
                          context,
                          'your_offer_price',
                        ).replaceAll('%d', '$offeredPrice'),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (acceptedPrice > 0)
                        Text(
                          AppLocalization.get(
                            context,
                            'winning_offer_price',
                          ).replaceAll('%d', '$acceptedPrice'),
                          style: TextStyle(
                            fontSize: 12,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                    ],
                  ),
                ] else if (!delivered) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(Icons.info_outline, size: 13, color: scheme.error),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          AppLocalization.get(
                            context,
                            order['reason'] == 'offer_expired'
                                ? 'reject_reason_expired'
                                : 'reject_reason_driver',
                          ),
                          style: TextStyle(
                            fontSize: 12,
                            color: scheme.error,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                if (order['area'] != null &&
                    order['area'].toString().isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Icon(
                        Icons.location_on,
                        size: 13,
                        color: scheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        LocationCatalog.localize(
                          context,
                          order['area'].toString(),
                        ),
                        style: TextStyle(
                          fontSize: 12,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}
