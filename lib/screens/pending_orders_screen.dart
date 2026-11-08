import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'dart:async';
import '../bloc/offer/offer_bloc.dart';
import '../bloc/app/app_bloc.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../services/api_config.dart';
import '../services/provider_service.dart';
import '../services/socket_service.dart';
import '../widgets/image_preview.dart';
import 'submit_offer_screen.dart';

class PendingOrdersScreen extends StatefulWidget {
  final List<Map<String, dynamic>> orders;
  final String token;
  final VoidCallback? onRefresh;
  const PendingOrdersScreen({
    super.key,
    required this.orders,
    required this.token,
    this.onRefresh,
  });

  @override
  State<PendingOrdersScreen> createState() => _PendingOrdersScreenState();
}

class _PendingOrdersScreenState extends State<PendingOrdersScreen> {
  final ProviderService _providerService = ProviderService();

  late final List<Map<String, dynamic>> _orders = List.of(widget.orders);
  StreamSubscription? _offerAcceptedSub;
  Timer? _cooldownTimer;
  DateTime? _cooldownUntil;

  bool get _cooldownActive {
    final until = _cooldownUntil;
    return until != null && until.isAfter(DateTime.now());
  }

  int get _cooldownSeconds {
    final until = _cooldownUntil;

    if (until == null) {
      return 0;
    }

    final seconds = until.difference(DateTime.now()).inSeconds;
    return seconds > 0 ? seconds : 0;
  }

  @override
  void initState() {
    super.initState();

    _loadCooldown();
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _cooldownActive) {
        setState(() {});
      }
    });

    _offerAcceptedSub =
        SocketService.instance.onOfferAccepted.listen((_) {
      if (!mounted) {
        return;
      }

      setState(() => _orders.clear());
      widget.onRefresh?.call();
    });
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _offerAcceptedSub?.cancel();
    super.dispose();
  }

  Future<void> _loadCooldown() async {
    try {
      final stats = await _providerService.getStats(widget.token);

      if (!mounted) {
        return;
      }

      setState(() {
        _cooldownUntil = DateTime.tryParse(stats.offerCooldownUntil ?? '');
      });
    } catch (_) {}
  }

  void _showCooldownMessage() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '${AppLocalization.get(context, 'offer_cooldown_active')} - '
          '${AppLocalization.get(context, 'cooldown_remaining').replaceAll('%d', '$_cooldownSeconds')}',
        ),
        backgroundColor: Colors.red,
      ),
    );
  }

  Widget _buildCooldownBanner(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: scheme.error.withValues(alpha: 0.4),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.timer_off_outlined, color: scheme.onErrorContainer),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AppLocalization.get(context, 'offer_cooldown_active'),
                  style: TextStyle(
                    color: scheme.onErrorContainer,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  AppLocalization.get(context, 'cooldown_remaining')
                      .replaceAll('%d', '$_cooldownSeconds'),
                  style: TextStyle(
                    color: scheme.onErrorContainer,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
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

  Future<void> _openSubmitOffer(String orderId) async {
    if (_cooldownActive) {
      _showCooldownMessage();
      return;
    }

    final submitted = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => BlocProvider(
          create: (_) => OfferBloc(),
          child: SubmitOfferScreen(
            token: widget.token,
            orderId: orderId,
          ),
        ),
      ),
    );

    if (!mounted || submitted != true) {
      return;
    }

    setState(() {
      _orders.removeWhere(
        (order) => order['_id']?.toString() == orderId,
      );
    });

    widget.onRefresh?.call();
    await _loadCooldown();
  }

  Future<void> _rejectOrder(String orderId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(AppLocalization.get(context, 'reject_order')),
        content: Text(
          AppLocalization.get(context, 'reject_order_confirm'),
          textDirection: TextDirection.rtl,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(AppLocalization.get(context, 'cancel')),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: Text(
              AppLocalization.get(context, 'confirm'),
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) {
      return;
    }

    try {
      await _providerService.rejectOrder(widget.token, orderId);

      if (!mounted) {
        return;
      }

      setState(() {
        _orders.removeWhere(
          (order) => order['_id']?.toString() == orderId,
        );
      });

      widget.onRefresh?.call();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalization.get(context, 'order_rejected')),
          backgroundColor: Colors.orange,
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
          backgroundColor: scheme.surface,
          elevation: 0,
          title: Text(
            AppLocalization.get(context, 'new_orders_title'),
            style: TextStyle(
              color: scheme.onSurface,
              fontWeight: FontWeight.bold,
            ),
          ),
          centerTitle: true,
          leading: IconButton(
            icon: Icon(Icons.arrow_back, color: scheme.onSurface),
            onPressed: () => Navigator.pop(context),
          ),
        ),
        body: RefreshIndicator(
          onRefresh: () async {
            widget.onRefresh?.call();
            await _loadCooldown();
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
                              Icons.inbox_outlined,
                              size: 48,
                              color: scheme.onSurfaceVariant,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              AppLocalization.get(context, 'no_new_orders'),
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
                    itemCount: _orders.length + (_cooldownActive ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (_cooldownActive && index == 0) {
                        return _buildCooldownBanner(context);
                      }

                      final o = _orders[_cooldownActive ? index - 1 : index];
                      final typeLabels = {
                        'product': AppLocalization.get(context, 'product'),
                        'people': AppLocalization.get(context, 'people'),
                        'goods': AppLocalization.get(context, 'goods'),
                      };
                      final typeLabel =
                          typeLabels[o['type']] ?? o['type'] ?? '';
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
                      final description =
                          (o['description'] ?? '').toString();
                      final images = o['images'] is List
                          ? (o['images'] as List)
                          : const [];

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
                                ],
                              ),
                              const SizedBox(height: 16),
                              if (description.isNotEmpty) ...[
                                Text(
                                  AppLocalization.get(
                                    context,
                                    'description',
                                  ),
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
                                label: AppLocalization.get(
                                  context,
                                  'customer',
                                ),
                                value: Row(
                                  children: [
                                    Flexible(
                                      child: Text(
                                        customerName.isNotEmpty
                                            ? customerName
                                            : AppLocalization.get(
                                                context,
                                                'unknown',
                                              ),
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
                                          borderRadius:
                                              BorderRadius.circular(10),
                                        ),
                                        child: Text(
                                          '#$customerPublicId',
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.bold,
                                            color: scheme
                                                .onSecondaryContainer,
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
                                label: AppLocalization.get(
                                  context,
                                  'phone_number',
                                ),
                                value: Text(
                                  phone.isNotEmpty
                                      ? phone
                                      : AppLocalization.get(
                                          context,
                                          'hidden_phone',
                                        ),
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
                                  label: AppLocalization.get(
                                    context,
                                    'area_region',
                                  ),
                                  value: Text(
                                    area,
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ),
                              if (images.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  AppLocalization.get(context, 'images'),
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: scheme.onSurfaceVariant,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                SizedBox(
                                  height: 84,
                                  child: ListView.separated(
                                    scrollDirection: Axis.horizontal,
                                    itemCount: images.length,
                                    separatorBuilder: (_, _) =>
                                        const SizedBox(width: 8),
                                    itemBuilder: (_, i) {
                                      final img = images[i].toString();
                                      final imageUrl =
                                          img.startsWith('http')
                                              ? img
                                              : '${ApiConfig.serverUrl}$img';
                                      return GestureDetector(
                                        onTap: () => ImagePreview.show(
                                          context,
                                          imageUrl,
                                        ),
                                        child: ClipRRect(
                                          borderRadius:
                                              BorderRadius.circular(10),
                                          child: Image.network(
                                            imageUrl,
                                            width: 84,
                                            height: 84,
                                            fit: BoxFit.cover,
                                            errorBuilder: (_, _, _) =>
                                                Container(
                                              width: 84,
                                              height: 84,
                                              color: scheme
                                                  .surfaceContainerHighest,
                                              child: Icon(
                                                Icons
                                                    .image_not_supported,
                                                color: scheme
                                                    .onSurfaceVariant,
                                              ),
                                            ),
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                ),
                              ],
                              const SizedBox(height: 8),
                              Divider(color: scheme.outlineVariant),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Expanded(
                                    child: SizedBox(
                                      height: 50,
                                      child: ElevatedButton.icon(
                                        onPressed: () => _openSubmitOffer(
                                          o['_id']?.toString() ?? '',
                                        ),
                                        icon: const Icon(
                                          Icons.local_offer_outlined,
                                          size: 20,
                                        ),
                                        label: FittedBox(
                                          fit: BoxFit.scaleDown,
                                          child: Text(
                                            AppLocalization.get(
                                              context,
                                              'submit_offer_btn',
                                            ),
                                            maxLines: 1,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 14,
                                            ),
                                          ),
                                        ),
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor: Colors.orange[800],
                                          foregroundColor: Colors.white,
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 8,
                                          ),
                                          shape: RoundedRectangleBorder(
                                            borderRadius:
                                                BorderRadius.circular(12),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  SizedBox(
                                    height: 50,
                                    child: OutlinedButton.icon(
                                      onPressed: () => _rejectOrder(
                                        o['_id']?.toString() ?? '',
                                      ),
                                      icon: const Icon(Icons.close, size: 20),
                                      label: FittedBox(
                                        fit: BoxFit.scaleDown,
                                        child: Text(
                                          AppLocalization.get(
                                            context,
                                            'reject_order',
                                          ),
                                          maxLines: 1,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 14,
                                          ),
                                        ),
                                      ),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: scheme.error,
                                        side: BorderSide(
                                          color: scheme.error,
                                          width: 1.5,
                                        ),
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 10,
                                        ),
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(12),
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
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
    );
  }
}
