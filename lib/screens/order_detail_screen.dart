import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/app/app_bloc.dart';
import '../bloc/offer/offer_bloc.dart';
import '../services/api_config.dart';
import '../services/localization_service.dart';
import '../services/order_service.dart';
import '../services/provider_service.dart';
import '../services/responsive.dart';
import '../widgets/image_preview.dart';
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

  Color _statusColor(String? status) {
    switch (status) {
      case 'pending':
        return Colors.orange;
      case 'offered':
        return Colors.blue;
      case 'accepted':
        return Colors.teal;
      case 'fulfilling':
        return Colors.purple;
      case 'completed':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  Future<void> _markFulfilling() async {
    try {
      await _providerService.markFulfilling(widget.token, widget.orderId);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalization.get(context, 'status_updated')),
          backgroundColor: Colors.green,
        ),
      );
    } catch (error) {
      if (!mounted) return;
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

  Future<void> _markComplete() async {
    try {
      await _providerService.markComplete(widget.token, widget.orderId);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            AppLocalization.get(context, 'order_completed_msg'),
          ),
          backgroundColor: Colors.green,
        ),
      );
    } catch (error) {
      if (!mounted) return;
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

  Future<void> _submitOffer() async {
    final cooldownUntil = DateTime.tryParse(
      _order?['offerCooldownUntil']?.toString() ?? '',
    );

    if (cooldownUntil != null && cooldownUntil.isAfter(DateTime.now())) {
      final seconds = cooldownUntil.difference(DateTime.now()).inSeconds;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${AppLocalization.get(context, 'offer_cooldown_active')} - '
            '${AppLocalization.get(context, 'cooldown_remaining').replaceAll('%d', '$seconds')}',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
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
          backgroundColor: Colors.white,
          elevation: 0,
          title: Text(
            AppLocalization.get(context, 'order_details'),
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
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: _buildBody(context),
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
            style: const TextStyle(color: Colors.red),
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
    final customerName = customer is Map ? (customer['fullName'] ?? '').toString() : '';
    final customerPublicId = customer is Map ? (customer['publicId'] ?? '').toString() : '';
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
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: _statusColor(status).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        _statusLabel(status),
                        style: TextStyle(
                          color: _statusColor(status),
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  order['description']?.toString() ?? '',
                  style: TextStyle(color: Colors.grey[700], fontSize: 14),
                ),
                if (customerName.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      const Icon(
                        Icons.person_outline,
                        size: 15,
                        color: Colors.orange,
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
                            color: Colors.orange[700],
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
                      const Icon(Icons.phone, size: 14, color: Colors.grey),
                      const SizedBox(width: 4),
                      Text(
                        phone,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey[700],
                        ),
                      ),
                    ],
                  ),
                ],
                if (area.isNotEmpty || location.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(
                        Icons.location_on,
                        size: 14,
                        color: Colors.grey,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          [area, location].where((value) => value.isNotEmpty).join(' - '),
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.grey[700],
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
                        return GestureDetector(
                          onTap: () => ImagePreview.show(context, url),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.network(
                              url,
                              width: 70,
                              height: 70,
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => Container(
                                width: 70,
                                height: 70,
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
                if (price > 0) ...[
                  const SizedBox(height: 10),
                  Text(
                    '${AppLocalization.get(context, 'price')}: $price ${AppLocalization.get(context, 'shekel')}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.green,
                    ),
                  ),
                ],
                if (hasOffer) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.orange[50],
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '${AppLocalization.get(context, 'your_price')}: '
                      '${myOffer['price']} ${AppLocalization.get(context, 'shekel')}'
                      ' · '
                      '${AppLocalization.get(context, 'est_time').replaceAll('%d', '${myOffer['estimatedTime'] ?? 0}')}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Colors.orange,
                      ),
                    ),
                  ),
                ],
                if (rejected) ...[
                  const SizedBox(height: 10),
                  Text(
                    AppLocalization.get(context, 'rejected'),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.red,
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
                  backgroundColor: Colors.orange,
                  foregroundColor: Colors.white,
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
                backgroundColor: Colors.purple,
                foregroundColor: Colors.white,
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
                backgroundColor: Colors.green,
                foregroundColor: Colors.white,
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
