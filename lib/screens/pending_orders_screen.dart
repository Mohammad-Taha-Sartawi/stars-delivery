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
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.red[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.red[200]!),
      ),
      child: Row(
        children: [
          const Icon(Icons.timer_off_outlined, color: Colors.red),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AppLocalization.get(context, 'offer_cooldown_active'),
                  style: const TextStyle(
                    color: Colors.red,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  AppLocalization.get(context, 'cooldown_remaining')
                      .replaceAll('%d', '$_cooldownSeconds'),
                  style: const TextStyle(
                    color: Colors.red,
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
        const Icon(Icons.person_outline, size: 14, color: Colors.orange),
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
              color: Colors.orange[50],
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.orange[200]!),
            ),
            child: Text(
              '#$pid',
              style: TextStyle(fontSize: 11, color: Colors.orange[800], fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ],
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
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          title: Text(
            AppLocalization.get(context, 'new_orders_title'),
            style: const TextStyle(
              color: Colors.black87,
              fontWeight: FontWeight.bold,
            ),
          ),
          centerTitle: true,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.black87),
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
                    children: const [
                      Center(child: Padding(padding: EdgeInsets.all(40), child: Text('لا توجد طلبات', style: TextStyle(fontSize: 16, color: Colors.grey)))),
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
                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 1,
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                typeLabels[o['type']] ?? o['type'] ?? '',
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              _buildCustomerRow(context, o),
                              const SizedBox(height: 6),
                              Text(
                                o['description'] ?? '',
                                style: TextStyle(color: Colors.grey[700]),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.phone,
                                    size: 14,
                                    color: Colors.grey,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    o['phone'] ??
                                        AppLocalization.get(
                                          context,
                                          'hidden_phone',
                                        ),
                                    style: TextStyle(
                                      color: Colors.grey[500],
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                              ),
                              if (o['area'] != null &&
                                  o['area'].toString().isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    const Icon(
                                      Icons.location_on,
                                      size: 14,
                                      color: Colors.grey,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      o['area'].toString(),
                                      style: TextStyle(
                                        color: Colors.grey[500],
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                              if (o['images'] != null &&
                                  (o['images'] as List).isNotEmpty) ...[
                                const SizedBox(height: 8),
                                SizedBox(
                                  height: 60,
                                  child: ListView.separated(
                                    scrollDirection: Axis.horizontal,
                                    itemCount: (o['images'] as List).length,
                                    separatorBuilder: (_, i) =>
                                        const SizedBox(width: 8),
                                    itemBuilder: (_, i) {
                                      final img = (o['images'] as List)[i].toString();
                                      final imageUrl = img.startsWith('http') ? img : '${ApiConfig.serverUrl}$img';
                                      return GestureDetector(
                                        onTap: () => ImagePreview.show(context, imageUrl),
                                        child: ClipRRect(
                                          borderRadius: BorderRadius.circular(8),
                                          child: Image.network(
                                            imageUrl,
                                            width: 60,
                                            height: 60,
                                            fit: BoxFit.cover,
                                            errorBuilder: (_, e1, e2) =>
                                                Container(
                                                  width: 60,
                                                  height: 60,
                                                  color: Colors.grey[200],
                                                  child: const Icon(
                                                    Icons.image_not_supported,
                                                    color: Colors.grey,
                                                  ),
                                                ),
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                ),
                              ],
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: ElevatedButton(
                                      onPressed: () => _openSubmitOffer(
                                        o['_id']?.toString() ?? '',
                                      ),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: Colors.orange,
                                        foregroundColor: Colors.white,
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                      ),
                                      child: Text(
                                        AppLocalization.get(
                                          context,
                                          'submit_offer_btn',
                                        ),
                                        style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  OutlinedButton.icon(
                                    onPressed: () => _rejectOrder(
                                      o['_id']?.toString() ?? '',
                                    ),
                                    icon: const Icon(Icons.close, size: 18),
                                    label: Text(
                                      AppLocalization.get(context, 'reject_order'),
                                    ),
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: Colors.red,
                                      side: const BorderSide(color: Colors.red),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 12,
                                      ),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(8),
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
