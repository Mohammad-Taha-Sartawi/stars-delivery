import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'dart:async';
import '../bloc/offer/offer_bloc.dart';
import '../bloc/app/app_bloc.dart';
import '../services/responsive.dart';
import '../services/location_catalog.dart';
import '../services/localization_service.dart';
import '../services/provider_service.dart';
import '../services/socket_service.dart';
import '../models/user_model.dart';
import '../widgets/ui/app_confirm_dialog.dart';
import '../widgets/ui/app_feedback.dart';
import '../widgets/ui/app_tone.dart';
import '../widgets/ui/governorate_scope_warning.dart';
import 'submit_offer_screen.dart';

class PendingOrdersScreen extends StatefulWidget {
  final List<Map<String, dynamic>> orders;
  final String token;
  final UserModel? user;
  final VoidCallback? onRefresh;
  const PendingOrdersScreen({
    super.key,
    required this.orders,
    required this.token,
    this.user,
    this.onRefresh,
  });

  @override
  State<PendingOrdersScreen> createState() => _PendingOrdersScreenState();
}

class _PendingOrdersScreenState extends State<PendingOrdersScreen> {
  final ProviderService _providerService = ProviderService();

  late final List<Map<String, dynamic>> _orders = List.of(widget.orders);
  StreamSubscription? _offerAcceptedSub;
  StreamSubscription? _offerNotSelectedSub;
  StreamSubscription? _newOrderSub;
  Timer? _cooldownTimer;
  Timer? _refreshTimer;
  bool _refreshing = false;
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
    _refreshOrders();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _refreshOrders(),
    );
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _cooldownActive) {
        setState(() {});
      }
    });

    _newOrderSub = SocketService.instance.onNewOrder.listen((_) {
      _refreshOrders();
    });

    _offerAcceptedSub = SocketService.instance.onOfferAccepted.listen((_) {
      if (!mounted) {
        return;
      }

      setState(() => _orders.clear());
      widget.onRefresh?.call();
    });

    _offerNotSelectedSub = SocketService.instance.onOfferNotSelected.listen((
      data,
    ) {
      if (!mounted) {
        return;
      }

      final orderId = data['orderId']?.toString();
      if (orderId == null || orderId.isEmpty) {
        return;
      }

      setState(
        () =>
            _orders.removeWhere((order) => order['_id']?.toString() == orderId),
      );
      widget.onRefresh?.call();
    });
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _refreshTimer?.cancel();
    _offerAcceptedSub?.cancel();
    _offerNotSelectedSub?.cancel();
    _newOrderSub?.cancel();
    super.dispose();
  }

  Future<void> _refreshOrders() async {
    if (_refreshing) return;
    _refreshing = true;

    try {
      final orders = await _providerService.getPendingOrders(widget.token);
      if (!mounted) return;

      setState(() {
        _orders
          ..clear()
          ..addAll(orders);
      });
    } catch (_) {
      // Keep the current list; the next refresh or pull-to-refresh retries.
    } finally {
      _refreshing = false;
    }
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
    AppFeedback.warning(
      context,
      '${AppLocalization.get(context, 'offer_cooldown_active')} - '
      '${AppLocalization.get(context, 'cooldown_remaining').replaceAll('%d', '$_cooldownSeconds')}',
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
        border: Border.all(color: scheme.error.withValues(alpha: 0.4)),
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
                  AppLocalization.get(
                    context,
                    'cooldown_remaining',
                  ).replaceAll('%d', '$_cooldownSeconds'),
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

  bool _isOutsideArea(Map<String, dynamic> order) {
    final user = widget.user;
    if (user == null) return false;

    final driverArea = user.area.trim();
    final orderArea = (order['area'] ?? '').toString().trim();
    if (driverArea.isEmpty || orderArea.isEmpty || driverArea == orderArea) {
      return false;
    }

    final driverGovernorate = user.governorate.trim();
    final orderGovernorate = (order['governorate'] ?? '').toString().trim();
    if (driverGovernorate.isNotEmpty && orderGovernorate.isNotEmpty) {
      return driverGovernorate == orderGovernorate;
    }
    return true;
  }

  String _outsideAreaMessage(Map<String, dynamic> order) {
    final user = widget.user;
    final orderArea = (order['area'] ?? '').toString().trim();
    final orderGovernorate = (order['governorate'] ?? '').toString().trim();
    final governorate = orderGovernorate.isNotEmpty
        ? orderGovernorate
        : (user?.governorate.trim().isNotEmpty == true
              ? user!.governorate.trim()
              : (user?.area.trim().isNotEmpty == true
                    ? user!.area.trim()
                    : AppLocalization.get(context, 'your_governorate')));
    final driverArea = user?.area.trim().isNotEmpty == true
        ? user!.area.trim()
        : AppLocalization.get(context, 'area_region');

    return AppLocalization.get(context, 'governorate_outside_area_message')
        .replaceFirst('%s', LocationCatalog.localize(context, orderArea))
        .replaceFirst('%s', LocationCatalog.localize(context, governorate))
        .replaceFirst('%s', LocationCatalog.localize(context, driverArea));
  }

  Widget _buildOutsideAreaBanner(
    BuildContext context,
    Map<String, dynamic> order,
  ) {
    final tone = appToneStyle(context, AppTone.warning);

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: tone.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber_rounded, color: tone.foreground, size: 22),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AppLocalization.get(
                    context,
                    'governorate_outside_area_title',
                  ),
                  style: TextStyle(
                    color: tone.foreground,
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _outsideAreaMessage(order),
                  style: TextStyle(
                    color: tone.foreground,
                    fontSize: 12,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openSubmitOffer(
    String orderId,
    Map<String, dynamic> order,
  ) async {
    if (_cooldownActive) {
      _showCooldownMessage();
      return;
    }

    if (_isOutsideArea(order)) {
      final proceed = await showGovernorateScopeWarning(
        context,
        title: AppLocalization.get(context, 'governorate_outside_area_title'),
        message: _outsideAreaMessage(order),
        note: AppLocalization.get(context, 'governorate_outside_area_note'),
        confirmLabel: AppLocalization.get(
          context,
          'governorate_outside_area_confirm',
        ),
      );
      if (!proceed || !mounted) return;
    }

    final submitted = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => BlocProvider(
          create: (_) => OfferBloc(),
          child: SubmitOfferScreen(token: widget.token, orderId: orderId),
        ),
      ),
    );

    if (!mounted || submitted != true) {
      return;
    }

    setState(() {
      _orders.removeWhere((order) => order['_id']?.toString() == orderId);
    });

    widget.onRefresh?.call();
    await _loadCooldown();
  }

  Future<void> _rejectOrder(String orderId) async {
    final confirmed = await showAppConfirmDialog(
      context,
      title: AppLocalization.get(context, 'reject_order'),
      message: AppLocalization.get(context, 'reject_order_confirm'),
      confirmLabel: AppLocalization.get(context, 'confirm'),
      cancelLabel: AppLocalization.get(context, 'cancel'),
      destructive: true,
    );

    if (!confirmed || !mounted) {
      return;
    }

    try {
      await _providerService.rejectOrder(widget.token, orderId);

      if (!mounted) {
        return;
      }

      setState(() {
        _orders.removeWhere((order) => order['_id']?.toString() == orderId);
      });

      widget.onRefresh?.call();

      AppFeedback.info(context, AppLocalization.get(context, 'order_rejected'));
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
        body: SafeArea(
          top: false,
          child: RefreshIndicator(
            onRefresh: () async {
              await _refreshOrders();
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

                          final o =
                              _orders[_cooldownActive ? index - 1 : index];
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
                          final area = LocationCatalog.localize(
                            context,
                            (o['area'] ?? '').toString(),
                          );
                          final description = (o['description'] ?? '')
                              .toString();
                          final outsideArea = _isOutsideArea(o);

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
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
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
                                  if (outsideArea) ...[
                                    const SizedBox(height: 12),
                                    _buildOutsideAreaBanner(context, o),
                                  ],
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
                                              'ID $customerPublicId',
                                              style: TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.bold,
                                                color:
                                                    scheme.onSecondaryContainer,
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
                                              o,
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
                                              backgroundColor: appToneStyle(
                                                context,
                                                AppTone.accent,
                                              ).solid,
                                              foregroundColor: appToneStyle(
                                                context,
                                                AppTone.accent,
                                              ).onSolid,
                                              padding:
                                                  const EdgeInsets.symmetric(
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
                                          icon: const Icon(
                                            Icons.close,
                                            size: 20,
                                          ),
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
      ),
    );
  }
}
