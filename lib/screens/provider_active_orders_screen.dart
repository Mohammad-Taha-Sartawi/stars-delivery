import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'dart:async';
import '../services/provider_service.dart';
import '../bloc/provider/provider_bloc.dart';
import '../bloc/provider/provider_event.dart';
import '../bloc/app/app_bloc.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../services/api_config.dart';
import '../services/location_service.dart';
import '../services/socket_service.dart';
import '../services/theme_service.dart';
import '../widgets/image_preview.dart';
import '../widgets/ui/app_feedback.dart';
import '../widgets/ui/app_image_thumbnail.dart';
import '../widgets/ui/app_status_chip.dart';
import '../widgets/ui/app_tone.dart';

class ProviderActiveOrdersScreen extends StatefulWidget {
  final String token;
  const ProviderActiveOrdersScreen({super.key, required this.token});
  @override
  State<ProviderActiveOrdersScreen> createState() =>
      _ProviderActiveOrdersScreenState();
}

class _ProviderActiveOrdersScreenState
    extends State<ProviderActiveOrdersScreen> {
  final ProviderService _service = ProviderService();
  List<Map<String, dynamic>>? _orders;
  bool _loading = true;
  String? _error;
  final List<StreamSubscription> _socketSubs = [];
  Timer? _locationTimer;

  @override
  void initState() {
    super.initState();
    _loadOrders();
    _locationTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted && (_orders?.isNotEmpty ?? false)) {
        LocationService.syncToBackend(widget.token);
      }
    });
    for (final stream in [
      SocketService.instance.onOfferAccepted,
      SocketService.instance.onOrderStatusChanged,
    ]) {
      _socketSubs.add(
        stream.listen((_) {
          if (mounted) _loadOrders();
        }),
      );
    }
    _socketSubs.add(
      SocketService.instance.onDeliveryConfirmationResult.listen((data) {
        if (!mounted) return;
        _loadOrders();
        final approved = data['approved'] == true;
        if (approved) {
          AppFeedback.success(
            context,
            AppLocalization.get(context, 'delivery_confirmed_provider'),
          );
        } else {
          AppFeedback.warning(
            context,
            AppLocalization.get(context, 'delivery_rejected_provider'),
          );
        }
      }),
    );
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    for (final subscription in _socketSubs) {
      subscription.cancel();
    }
    super.dispose();
  }

  Future<void> _loadOrders() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final orders = await _service.getMyOrders(widget.token);
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  String _statusLabel(String? s) {
    switch (s) {
      case 'accepted':
        return AppLocalization.get(context, 'status_accepted');
      case 'fulfilling':
        return AppLocalization.get(context, 'status_fulfilling');
      case 'completed':
        return AppLocalization.get(context, 'status_completed');
      default:
        return s ?? '';
    }
  }

  Widget _buildCustomerRow(BuildContext context, Map<String, dynamic> o) {
    final c = o['customerId'];
    final String name;
    final String pid;
    if (c is Map) {
      name = (c['fullName'] ?? '').toString();
      pid = (c['publicId'] ?? '').toString();
    } else {
      name = '';
      pid = '';
    }
    return Row(
      children: [
        Icon(
          Icons.person_outline,
          size: 14,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(width: 4),
        Text(
          name.isNotEmpty ? name : AppLocalization.get(context, 'unknown'),
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
        ),
        if (pid.isNotEmpty) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.secondaryContainer,
              borderRadius: BorderRadiusDirectional.circular(AppRadius.xs),
            ),
            child: Text(
              '#$pid',
              style: TextStyle(
                fontSize: 11,
                color: Theme.of(context).colorScheme.onSecondaryContainer,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ],
    );
  }

  AppTone _statusTone(String? s) {
    switch (s) {
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

  Future<void> _markFulfilling(String orderId) async {
    try {
      await _service.markFulfilling(widget.token, orderId);
      _loadOrders();
      if (mounted) {
        context.read<ProviderBloc>().add(
          LoadProviderStats(token: widget.token),
        );
        AppFeedback.success(
          context,
          AppLocalization.get(context, 'status_updated'),
        );
      }
    } catch (e) {
      if (mounted)
        AppFeedback.error(
          context,
          e.toString().replaceFirst('Exception: ', ''),
        );
    }
  }

  Future<void> _markComplete(String orderId) async {
    try {
      await _service.markComplete(widget.token, orderId);
      _loadOrders();
      if (mounted) {
        context.read<ProviderBloc>().add(
          LoadProviderStats(token: widget.token),
        );
        AppFeedback.info(
          context,
          AppLocalization.get(context, 'waiting_customer_confirmation'),
        );
      }
    } catch (e) {
      if (mounted)
        AppFeedback.error(
          context,
          e.toString().replaceFirst('Exception: ', ''),
        );
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
          title: Text(AppLocalization.get(context, 'active_orders_btn')),
          centerTitle: true,
        ),
        body: SafeArea(
          top: false,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                  ? Center(
                      child: Text(
                        _error!,
                        style: TextStyle(color: scheme.error),
                      ),
                    )
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
                      onRefresh: () => _loadOrders(),
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
                          final isActive =
                              o['status'] == 'accepted' ||
                              o['status'] == 'fulfilling';
                          final completionRequested =
                              o['completionRequestedAt'] != null &&
                              o['completionRequestedAt'].toString().isNotEmpty;
                          if (!isActive) return const SizedBox.shrink();
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          typeLabels[o['type']] ??
                                              o['type'] ??
                                              '',
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 16,
                                          ),
                                        ),
                                      ),
                                      AppStatusChip(
                                        label: _statusLabel(o['status']),
                                        tone: _statusTone(o['status']),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  _buildCustomerRow(context, o),
                                  const SizedBox(height: 6),
                                  Text(
                                    o['description'] ?? '',
                                    style: TextStyle(
                                      color: Theme.of(
                                        context,
                                      ).colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                  if (o['status'] == 'fulfilling' ||
                                      o['status'] == 'completed') ...[
                                    if (o['phone'] != null) ...[
                                      const SizedBox(height: 4),
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
                                            o['phone'].toString(),
                                            style: TextStyle(
                                              fontSize: 13,
                                              color: Theme.of(
                                                context,
                                              ).colorScheme.onSurfaceVariant,
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                    if (o['area'] != null) ...[
                                      const SizedBox(height: 2),
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
                                            o['area'].toString(),
                                            style: TextStyle(
                                              fontSize: 13,
                                              color: Theme.of(
                                                context,
                                              ).colorScheme.onSurfaceVariant,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                    if (o['images'] is List &&
                                        (o['images'] as List).isNotEmpty) ...[
                                      const SizedBox(height: 8),
                                      SizedBox(
                                        height: 60,
                                        child: ListView.separated(
                                          scrollDirection: Axis.horizontal,
                                          itemCount:
                                              (o['images'] as List).length,
                                          separatorBuilder: (_, __) =>
                                              const SizedBox(width: 6),
                                          itemBuilder: (_, i) {
                                            final img = (o['images'] as List)[i]
                                                .toString();
                                            final url = img.startsWith('http')
                                                ? img
                                                : '${ApiConfig.serverUrl}$img';
                                            return AppImageThumbnail(
                                              imageUrl: url,
                                              semanticLabel:
                                                  AppLocalization.get(
                                                    context,
                                                    'view_image',
                                                  ),
                                              onTap: () => ImagePreview.show(
                                                context,
                                                url,
                                              ),
                                              size: 60,
                                              borderRadius: AppRadius.xs,
                                            );
                                          },
                                        ),
                                      ),
                                    ],
                                  ],
                                  if (o['price'] != null) ...[
                                    const SizedBox(height: 6),
                                    Text(
                                      '${AppLocalization.get(context, 'price')}: ${o['price']} ${AppLocalization.get(context, 'shekel')}',
                                      style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                        color: appToneStyle(
                                          context,
                                          AppTone.success,
                                        ).foreground,
                                      ),
                                    ),
                                  ],
                                  if (o['status'] == 'accepted') ...[
                                    const SizedBox(height: 12),
                                    SizedBox(
                                      width: double.infinity,
                                      child: ElevatedButton(
                                        onPressed: () => _markFulfilling(
                                          o['_id']?.toString() ?? '',
                                        ),
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor: appToneStyle(
                                            context,
                                            AppTone.info,
                                          ).solid,
                                          foregroundColor: appToneStyle(
                                            context,
                                            AppTone.info,
                                          ).onSolid,
                                          shape: RoundedRectangleBorder(
                                            borderRadius:
                                                BorderRadiusDirectional.circular(
                                                  AppRadius.xs,
                                                ),
                                          ),
                                        ),
                                        child: Text(
                                          AppLocalization.get(
                                            context,
                                            'start_delivery',
                                          ),
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                  if (o['status'] == 'fulfilling') ...[
                                    const SizedBox(height: 12),
                                    if (completionRequested)
                                      Container(
                                        width: double.infinity,
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                          color: appToneStyle(
                                            context,
                                            AppTone.warning,
                                          ).background,
                                          borderRadius:
                                              BorderRadiusDirectional.circular(
                                                AppRadius.xs,
                                              ),
                                          border: Border.all(
                                            color: appToneStyle(
                                              context,
                                              AppTone.warning,
                                            ).border,
                                          ),
                                        ),
                                        child: Text(
                                          AppLocalization.get(
                                            context,
                                            'awaiting_delivery_confirmation',
                                          ),
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            color: appToneStyle(
                                              context,
                                              AppTone.warning,
                                            ).foreground,
                                          ),
                                        ),
                                      )
                                    else
                                      SizedBox(
                                        width: double.infinity,
                                        child: ElevatedButton(
                                          onPressed: () => _markComplete(
                                            o['_id']?.toString() ?? '',
                                          ),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: appToneStyle(
                                              context,
                                              AppTone.success,
                                            ).solid,
                                            foregroundColor: appToneStyle(
                                              context,
                                              AppTone.success,
                                            ).onSolid,
                                            shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadiusDirectional.circular(
                                                    AppRadius.xs,
                                                  ),
                                            ),
                                          ),
                                          child: Text(
                                            AppLocalization.get(
                                              context,
                                              'confirm_delivery',
                                            ),
                                            style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ),
                                      ),
                                  ],
                                ],
                              ),
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
