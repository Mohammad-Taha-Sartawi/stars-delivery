import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../bloc/app/app_bloc.dart';
import '../services/localization_service.dart';
import '../services/order_service.dart';

class OrderTrackingScreen extends StatefulWidget {
  final String token;
  final String orderId;

  const OrderTrackingScreen({
    super.key,
    required this.token,
    required this.orderId,
  });

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> {
  static const _defaultCenter = LatLng(31.7054, 35.2024);

  final OrderService _orderService = OrderService();
  final MapController _mapController = MapController();
  Timer? _refreshTimer;
  LatLng? _driverLocation;
  String _driverName = '';
  String? _updatedAt;
  String? _error;
  bool _loading = true;
  bool _movedToDriver = false;

  @override
  void initState() {
    super.initState();
    _loadLocation();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _loadLocation(showLoading: false),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadLocation({bool showLoading = true}) async {
    if (showLoading && mounted) {
      setState(() => _loading = true);
    }

    try {
      final order = await _orderService.getOrder(widget.token, widget.orderId);
      if (!mounted) return;

      final location = order['providerLocation'];
      final providerName = order['providerName']?.toString() ?? '';
      LatLng? nextLocation;

      if (location is Map) {
        final latitude = (location['latitude'] as num?)?.toDouble();
        final longitude = (location['longitude'] as num?)?.toDouble();
        if (latitude != null && longitude != null) {
          nextLocation = LatLng(latitude, longitude);
        }
        _updatedAt = location['updatedAt']?.toString();
      }

      setState(() {
        _driverLocation = nextLocation;
        _driverName = providerName;
        _error = null;
        _loading = false;
      });

      if (nextLocation != null && (!_movedToDriver || showLoading)) {
        _movedToDriver = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            _mapController.move(nextLocation!, 15);
          }
        });
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  String _timeLabel(String? raw) {
    final value = DateTime.tryParse(raw ?? '');
    if (value == null) return '';
    final local = value.toLocal();
    final minute = local.minute.toString().padLeft(2, '0');
    return '${local.hour}:$minute';
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';
    final scheme = Theme.of(context).colorScheme;
    final center = _driverLocation ?? _defaultCenter;

    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(AppLocalization.get(context, 'track_driver')),
          centerTitle: true,
        ),
        body: Stack(
          children: [
            FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: center,
                initialZoom: 15,
                minZoom: 8,
                maxZoom: 18,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.starsdelivery.stars_delivery',
                ),
                if (_driverLocation != null)
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: _driverLocation!,
                        width: 56,
                        height: 56,
                        child: Icon(
                          Icons.local_shipping,
                          size: 44,
                          color: scheme.primary,
                        ),
                      ),
                    ],
                  ),
              ],
            ),
            Positioned(
              left: 8,
              bottom: 8,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: scheme.surface.withValues(alpha: 0.85),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 3,
                  ),
                  child: Text(
                    '© OpenStreetMap contributors',
                    style: TextStyle(
                      fontSize: 10,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              left: 12,
              right: 12,
              top: 12,
              child: Material(
                color: scheme.surface.withValues(alpha: 0.94),
                borderRadius: BorderRadius.circular(14),
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: _loading
                      ? const Center(
                          child: SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Row(
                              children: [
                                Icon(
                                  Icons.local_shipping_outlined,
                                  color: scheme.primary,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _driverName.isEmpty
                                        ? AppLocalization.get(
                                            context,
                                            'driver_location',
                                          )
                                        : _driverName,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              _driverLocation == null
                                  ? AppLocalization.get(
                                      context,
                                      'driver_location_unavailable',
                                    )
                                  : _timeLabel(_updatedAt).isEmpty
                                  ? AppLocalization.get(
                                      context,
                                      'driver_location_updated',
                                    )
                                  : AppLocalization.get(
                                      context,
                                      'driver_location_updated_at',
                                    ).replaceAll('%s', _timeLabel(_updatedAt)),
                              style: TextStyle(
                                color: scheme.onSurfaceVariant,
                                fontSize: 13,
                              ),
                            ),
                            if (_error != null) ...[
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Icon(
                                    Icons.error_outline,
                                    size: 16,
                                    color: scheme.error,
                                  ),
                                  const SizedBox(width: 4),
                                  Expanded(
                                    child: Text(
                                      _error!,
                                      style: TextStyle(
                                        color: scheme.error,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: () => _loadLocation(),
                                    child: Text(
                                      AppLocalization.get(context, 'retry'),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
