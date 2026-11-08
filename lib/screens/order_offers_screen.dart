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
import '../bloc/app/app_bloc.dart';

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
  bool _cancelRequested = false;
  bool _resendRequested = false;
  bool _orderWindowExpired = false;
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
          LoadOffersEvent(
            token: widget.token,
            orderId: widget.orderId,
          ),
        );
      }
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
            LoadOffersEvent(
              token: widget.token,
              orderId: widget.orderId,
            ),
          );
        }
      }
    });
  }

  @override
  void dispose() {
    _offerTimer?.cancel();
    _newOfferSub?.cancel();
    super.dispose();
  }

  Future<void> _loadOrderWindowState() async {
    try {
      final order = await _orderService.getOrder(
        widget.token,
        widget.orderId,
      );

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
          backgroundColor: Colors.white,
          elevation: 0,
          title: Text(
            typeLabel.isEmpty
                ? AppLocalization.get(context, 'offers_list')
                : '${AppLocalization.get(context, 'offers_list')} • $typeLabel',
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
            child: BlocConsumer<OfferBloc, OfferState>(
              listener: (context, state) {
                if (state is OfferConflict) {
                  _showConflictDialog(context, state.message, state.orderId);
                }
                if (state is OffersLoaded && _cancelRequested) {
                  _cancelRequested = false;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        AppLocalization.get(context, 'order_cancelled'),
                      ),
                      backgroundColor: Colors.orange,
                    ),
                  );
                  Navigator.pop(context);
                  return;
                }
                if (state is OffersLoaded && _resendRequested) {
                  _resendRequested = false;
                  setState(() => _orderWindowExpired = false);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        AppLocalization.get(context, 'order_resent'),
                      ),
                      backgroundColor: Colors.green,
                    ),
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
                                    ? Colors.red[700]
                                    : Colors.grey,
                                fontSize: 16,
                                fontWeight: _rejectedByDriversCount > 0
                                    ? FontWeight.w600
                                    : FontWeight.normal,
                              ),
                            ),
                            const SizedBox(height: 24),
                            if (_orderWindowExpired) ...[
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton.icon(
                                  onPressed: () {
                                    setState(() => _resendRequested = true);
                                    context.read<OfferBloc>().add(
                                      ResendOrderEvent(
                                        token: widget.token,
                                        orderId: widget.orderId,
                                      ),
                                    );
                                  },
                                  icon: const Icon(Icons.refresh),
                                  label: Text(
                                    AppLocalization.get(
                                      context,
                                      'resend_order',
                                    ),
                                  ),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.orange,
                                    foregroundColor: Colors.white,
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
                                  AppLocalization.get(context, 'cancel_order'),
                                ),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: Colors.red,
                                  side: const BorderSide(color: Colors.red),
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
                  return RefreshIndicator(
                    onRefresh: () async {
                      final bloc = context.read<OfferBloc>();
                      bloc.add(LoadOffersEvent(
                        token: widget.token,
                        orderId: widget.orderId,
                      ));
                      await bloc.stream.firstWhere((s) => s is! OfferLoading);
                    },
                    child: ListView.builder(
                    padding: EdgeInsets.symmetric(
                      horizontal: Responsive.paddingHorizontal(context),
                      vertical: Responsive.paddingVertical(context),
                    ),
                    itemCount: state.offers.length,
                    itemBuilder: (_, i) {
                      final o = state.offers[i];
                      final expiresAt = o.expiresAt;
                      final remainingSeconds = expiresAt == null
                          ? 0
                          : expiresAt.difference(DateTime.now()).inSeconds;
                      final expired = o.status == 'pending' &&
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
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.person,
                                    color: Colors.orange,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          o.providerName,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 16,
                                          ),
                                        ),
                                        if (o.providerPublicId.isNotEmpty)
                                          Text(
                                            '#${o.providerPublicId}',
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: Colors.orange[700],
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${o.price} ${AppLocalization.get(context, 'shekel')}',
                                    style: const TextStyle(
                                      color: Colors.green,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 18,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              if (o.providerPhone.isNotEmpty) ...[
                                Row(
                                  children: [
                                    const Icon(Icons.phone, size: 14, color: Colors.grey),
                                    const SizedBox(width: 4),
                                    Text(
                                      o.status == 'accepted'
                                          ? o.providerPhone
                                          : _maskPhone(o.providerPhone),
                                      style: TextStyle(
                                        fontSize: 13,
                                        color: Colors.grey[700],
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
                                  style: TextStyle(fontSize: 13, color: Colors.grey[700]),
                                ),
                              if (o.estimatedTime > 0) ...[
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    const Icon(Icons.timer_outlined, size: 14, color: Colors.orange),
                                    const SizedBox(width: 4),
                                    Text(
                                      AppLocalization.get(context, 'est_time')
                                          .replaceAll('%d', '${o.estimatedTime}'),
                                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Colors.orange),
                                    ),
                                  ],
                                ),
                              ],
                              if (o.status == 'pending' && expiresAt != null) ...[
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    Icon(
                                      expired ? Icons.timer_off_outlined : Icons.timer_outlined,
                                      size: 14,
                                      color: Colors.red,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      expired
                                          ? AppLocalization.get(context, 'offer_expired')
                                          : AppLocalization.get(context, 'offer_expires_in').replaceAll(
                                              '%d',
                                              '${remainingSeconds > 0 ? remainingSeconds : 0}',
                                            ),
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.red),
                                    ),
                                  ],
                                ),
                              ],
                              if (o.orderArea.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    Icon(Icons.location_on, size: 14, color: Colors.grey[600]),
                                    const SizedBox(width: 4),
                                    Text(
                                      o.orderArea,
                                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
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
                  );
                }
                if (state is OfferError)
                  return Center(
                    child: Text(
                      state.message,
                      style: const TextStyle(color: Colors.red),
                    ),
                  );
                return const SizedBox();
              },
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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(AppLocalization.get(context, 'cancel_order')),
        content: Text(
          AppLocalization.get(context, 'cancel_order_confirm'),
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

    setState(() => _cancelRequested = true);
    context.read<OfferBloc>().add(
      CancelOrderEvent(
        token: widget.token,
        orderId: widget.orderId,
      ),
    );
  }

  void _showConflictDialog(BuildContext context, String message, String orderId) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: const Text('عذراً', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        content: Text(message, style: const TextStyle(fontSize: 14), textDirection: TextDirection.rtl),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              context.read<OfferBloc>().add(CancelOrderEvent(token: widget.token, orderId: orderId));
            },
            child: const Text('لا، حذف الطلب'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              context.read<OfferBloc>().add(ResendOrderEvent(token: widget.token, orderId: orderId));
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
            child: const Text('نعم، إعادة الإرسال', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Widget _buildOfferAction(BuildContext context, dynamic o) {
    final DateTime? expiresAt = o.expiresAt;
    final expired = o.status == 'pending' &&
        expiresAt != null &&
        !expiresAt.isAfter(DateTime.now());

    if (expired) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.red[50],
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          AppLocalization.get(context, 'offer_expired'),
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.red[700],
            fontWeight: FontWeight.bold,
          ),
        ),
      );
    }

    if (o.status == 'accepted') {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.green,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          AppLocalization.get(context, 'accepted'),
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
      );
    }
    if (o.status == 'rejected') {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.red[300],
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          AppLocalization.get(context, 'rejected'),
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
      );
    }
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () =>
            context.read<OfferBloc>().add(AcceptOfferEvent(
              token: widget.token,
              offerId: o.id,
              orderId: widget.orderId,
            )),
        icon: const Icon(Icons.check_circle, size: 20, color: Colors.white),
        label: Text(
          AppLocalization.get(context, 'accept'),
          style: const TextStyle(color: Colors.white),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.green,
          padding: const EdgeInsets.symmetric(vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
    );
  }
}
