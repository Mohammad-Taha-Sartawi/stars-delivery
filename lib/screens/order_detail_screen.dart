import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'dart:async';
import '../bloc/app/app_bloc.dart';
import '../bloc/offer/offer_bloc.dart';
import '../services/api_config.dart';
import '../services/localization_service.dart';
import '../services/order_service.dart';
import '../services/provider_service.dart';
import '../services/responsive.dart';
import '../services/socket_service.dart';
import '../services/theme_service.dart';
import '../widgets/image_preview.dart';
import '../widgets/ui/app_feedback.dart';
import '../widgets/ui/app_image_thumbnail.dart';
import '../widgets/ui/app_status_chip.dart';
import '../widgets/ui/app_tone.dart';
import '../widgets/ui/governorate_scope_warning.dart';
import 'submit_offer_screen.dart';

class OrderDetailScreen extends StatefulWidget {
  final String token;
  final String orderId;
  const OrderDetailScreen({
    super.key,
    required this.token,
    required this.orderId,
  });

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  final OrderService _orderService = OrderService();
  final ProviderService _providerService = ProviderService();

  Map<String, dynamic>? _order;
  bool _loading = true;
  String? _error;
  final List<StreamSubscription> _socketSubs = [];

  @override
  void initState() {
    super.initState();
    _load();
    for (final stream in [
      SocketService.instance.onNewOffer,
      SocketService.instance.onOrderStatusChanged,
    ]) {
      _socketSubs.add(
        stream.listen((_) {
          if (mounted) _load();
        }),
      );
    }
  }

  @override
  void dispose() {
    for (final subscription in _socketSubs) {
      subscription.cancel();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final order = await _orderService.getOrder(widget.token, widget.orderId);
      if (!mounted) return;
      setState(() {
        _order = order;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
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

  Future<void> _markFulfilling() async {
    try {
      await _providerService.markFulfilling(widget.token, widget.orderId);
      await _load();
      if (!mounted) return;
      AppFeedback.success(
        context,
        AppLocalization.get(context, 'status_updated'),
      );
    } catch (error) {
      if (!mounted) return;
      AppFeedback.error(
        context,
        error.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<void> _markComplete() async {
    try {
      await _providerService.markComplete(widget.token, widget.orderId);
      await _load();
      if (!mounted) return;
      AppFeedback.success(
        context,
        AppLocalization.get(context, 'order_completed_msg'),
      );
    } catch (error) {
      if (!mounted) return;
      AppFeedback.error(
        context,
        error.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<void> _submitOffer() async {
    final cooldownUntil = DateTime.tryParse(
      _order?['offerCooldownUntil']?.toString() ?? '',
    );

    if (cooldownUntil != null && cooldownUntil.isAfter(DateTime.now())) {
      final seconds = cooldownUntil.difference(DateTime.now()).inSeconds;

      AppFeedback.warning(
        context,
        '${AppLocalization.get(context, 'offer_cooldown_active')} - '
        '${AppLocalization.get(context, 'cooldown_remaining').replaceAll('%d', '$seconds')}',
      );
      return;
    }

    final order = _order;
    if (order != null && order['outsideArea'] == true) {
      final orderArea = (order['area'] ?? '').toString().trim();
      final providerCity = (order['providerCity'] ?? '').toString().trim();
      final providerArea = (order['providerArea'] ?? '').toString().trim();
      final providerGovernorate = (order['providerGovernorate'] ?? '')
          .toString()
          .trim();
      final providerPlace =
          providerCity.isNotEmpty && providerCity != 'من المحافظة نفسها'
          ? providerCity
          : (providerArea.isNotEmpty
                ? providerArea
                : AppLocalization.get(context, 'area_region'));
      final governorate = providerGovernorate.isEmpty
          ? AppLocalization.get(context, 'your_governorate')
          : providerGovernorate;

      final proceed = await showGovernorateScopeWarning(
        context,
        title: AppLocalization.get(context, 'governorate_outside_area_title'),
        message:
            AppLocalization.get(context, 'governorate_outside_area_message')
                .replaceFirst('%s', orderArea)
                .replaceFirst('%s', governorate)
                .replaceFirst('%s', providerPlace),
        note: AppLocalization.get(context, 'governorate_outside_area_note'),
        confirmLabel: AppLocalization.get(
          context,
          'governorate_outside_area_confirm',
        ),
      );

      if (!proceed || !mounted) return;
    }

    await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => BlocProvider(
          create: (_) => OfferBloc(),
          child: SubmitOfferScreen(
            token: widget.token,
            orderId: widget.orderId,
          ),
        ),
      ),
    );

    if (mounted) {
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(AppLocalization.get(context, 'order_details')),
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

    final status = order['status']?.toString() ?? '';
    final myOffer = order['myOffer'];
    final hasOffer = myOffer is Map;
    final rejected = order['rejected'] == true;
    final price = (order['price'] as num?)?.toDouble() ?? 0;
    final phone = order['phone']?.toString() ?? '';
    final area = order['area']?.toString() ?? '';
    final location = order['location']?.toString() ?? '';
    final customer = order['customerId'];
    final customerName = customer is Map
        ? (customer['fullName'] ?? '').toString()
        : '';
    final customerPublicId = customer is Map
        ? (customer['publicId'] ?? '').toString()
        : '';
    final images = order['images'] is List
        ? (order['images'] as List).map((image) => image.toString()).toList()
        : <String>[];

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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _typeLabel(order['type']?.toString()),
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    AppStatusChip(
                      label: _statusLabel(status),
                      tone: _statusTone(status),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  order['description']?.toString() ?? '',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontSize: 14,
                  ),
                ),
                if (customerName.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(
                        Icons.person_outline,
                        size: 15,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        customerName,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (customerPublicId.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Text(
                          '#$customerPublicId',
                          style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
                if (phone.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(
                        Icons.phone,
                        size: 14,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        phone,
                        style: TextStyle(
                          fontSize: 13,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ],
                if (area.isNotEmpty || location.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(
                        Icons.location_on,
                        size: 14,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          [
                            area,
                            location,
                          ].where((value) => value.isNotEmpty).join(' - '),
                          style: TextStyle(
                            fontSize: 13,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                if (images.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 70,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: images.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (_, index) {
                        final image = images[index];
                        final url = image.startsWith('http')
                            ? image
                            : '${ApiConfig.serverUrl}$image';
                        return AppImageThumbnail(
                          imageUrl: url,
                          semanticLabel: AppLocalization.get(
                            context,
                            'view_image',
                          ),
                          onTap: () => ImagePreview.show(context, url),
                          size: 70,
                        );
                      },
                    ),
                  ),
                ],
                if (price > 0) ...[
                  const SizedBox(height: 10),
                  Text(
                    '${AppLocalization.get(context, 'price')}: $price ${AppLocalization.get(context, 'shekel')}',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: appToneStyle(context, AppTone.success).foreground,
                    ),
                  ),
                ],
                if (hasOffer) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: appToneStyle(context, AppTone.warning).background,
                      borderRadius: BorderRadiusDirectional.circular(
                        AppRadius.sm,
                      ),
                    ),
                    child: Text(
                      '${AppLocalization.get(context, 'your_price')}: '
                      '${myOffer['price']} ${AppLocalization.get(context, 'shekel')}'
                      ' · '
                      '${AppLocalization.get(context, 'est_time').replaceAll('%d', '${myOffer['estimatedTime'] ?? 0}')}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: appToneStyle(
                          context,
                          AppTone.warning,
                        ).foreground,
                      ),
                    ),
                  ),
                ],
                if (rejected) ...[
                  const SizedBox(height: 10),
                  Text(
                    AppLocalization.get(context, 'rejected'),
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        if (status == 'pending' || status == 'offered') ...[
          if (!hasOffer && !rejected)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submitOffer,
                style: ElevatedButton.styleFrom(
                  backgroundColor: appToneStyle(context, AppTone.accent).solid,
                  foregroundColor: appToneStyle(
                    context,
                    AppTone.accent,
                  ).onSolid,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Text(
                  AppLocalization.get(context, 'submit_offer_btn'),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ),
        ],
        if (status == 'accepted')
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _markFulfilling,
              style: ElevatedButton.styleFrom(
                backgroundColor: appToneStyle(context, AppTone.info).solid,
                foregroundColor: appToneStyle(context, AppTone.info).onSolid,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: Text(
                AppLocalization.get(context, 'start_delivery'),
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
        if (status == 'fulfilling')
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _markComplete,
              style: ElevatedButton.styleFrom(
                backgroundColor: appToneStyle(context, AppTone.success).solid,
                foregroundColor: appToneStyle(context, AppTone.success).onSolid,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: Text(
                AppLocalization.get(context, 'confirm_delivery'),
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
      ],
    );
  }
}
