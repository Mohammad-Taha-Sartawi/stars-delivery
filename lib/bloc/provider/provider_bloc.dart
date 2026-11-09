import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'provider_event.dart';
import 'provider_state.dart';
import '../../services/provider_service.dart';
import '../../models/provider_stats.dart';

class ProviderBloc extends Bloc<ProviderEvent, ProviderState> {
  final ProviderService _service = ProviderService();

  ProviderBloc() : super(ProviderStatsLoaded(
    stats: ProviderStats(
      dailyEarnings: 0, monthlyEarnings: 0,
      totalSuccessful: 0, dailyOrderCount: 0,
      dailyCommission: 0, monthlyCommission: 0,
      pendingOrdersCount: 0, offeredOrdersCount: 0, activeOrdersCount: 0,
    ),
  )) {
    on<LoadProviderStats>(_onLoadStats);
    on<LoadPendingOrders>(_onLoadPendingOrders);
    on<LoadOfferedOrders>(_onLoadOfferedOrders);
  }

  Future<void> _onLoadStats(LoadProviderStats event, Emitter<ProviderState> emit) async {
    try {
      final stats = await _service.getStats(event.token);
      // Bloc 9 processes event handlers concurrently, so pending/offered may
      // have emitted meanwhile; merge onto the latest state, not a stale snapshot.
      final c = state;
      emit(ProviderStatsLoaded(
        stats: stats,
        pendingOrders: c is ProviderStatsLoaded ? c.pendingOrders : null,
      ));
    } catch (e) {
      debugPrint('[ProviderBloc] getStats FAILED: $e');
      final c = state;
      if (c is ProviderStatsLoaded) {
        emit(ProviderStatsLoaded(
          stats: ProviderStats(
            dailyEarnings: c.stats.dailyEarnings,
            monthlyEarnings: c.stats.monthlyEarnings,
            totalSuccessful: c.stats.totalSuccessful,
            dailyOrderCount: c.stats.dailyOrderCount,
            dailyCommission: c.stats.dailyCommission,
            monthlyCommission: c.stats.monthlyCommission,
            pendingOrdersCount: c.stats.pendingOrdersCount,
            offeredOrdersCount: c.stats.offeredOrdersCount,
            ordersReportCount: c.stats.ordersReportCount,
            activeOrdersCount: c.stats.activeOrdersCount,
            blockedUntil: c.stats.blockedUntil,
            isAvailable: c.stats.isAvailable,
            offerCooldownUntil: c.stats.offerCooldownUntil,
          ),
          pendingOrders: List.from(c.pendingOrders ?? []),
        ));
      }
    }
  }

  Future<void> _onLoadPendingOrders(LoadPendingOrders event, Emitter<ProviderState> emit) async {
    try {
      final orders = await _service.getPendingOrders(event.token);
      // Re-read state after the await so concurrent stats/offered emissions are
      // not overwritten with a stale pre-await snapshot.
      final current = state;
      if (current is ProviderStatsLoaded) {
        emit(ProviderStatsLoaded(stats: current.stats, pendingOrders: orders));
      }
    } catch (e) {
      debugPrint('[ProviderBloc] getPendingOrders FAILED: $e');
      final current = state;
      if (current is ProviderStatsLoaded) {
        emit(ProviderStatsLoaded(
          stats: ProviderStats(
            dailyEarnings: current.stats.dailyEarnings,
            monthlyEarnings: current.stats.monthlyEarnings,
            totalSuccessful: current.stats.totalSuccessful,
            dailyOrderCount: current.stats.dailyOrderCount,
            dailyCommission: current.stats.dailyCommission,
            monthlyCommission: current.stats.monthlyCommission,
            pendingOrdersCount: current.stats.pendingOrdersCount,
            offeredOrdersCount: current.stats.offeredOrdersCount,
            ordersReportCount: current.stats.ordersReportCount,
            activeOrdersCount: current.stats.activeOrdersCount,
            blockedUntil: current.stats.blockedUntil,
            isAvailable: current.stats.isAvailable,
            offerCooldownUntil: current.stats.offerCooldownUntil,
          ),
          pendingOrders: List.from(current.pendingOrders ?? []),
        ));
      }
    }
  }

  Future<void> _onLoadOfferedOrders(LoadOfferedOrders event, Emitter<ProviderState> emit) async {
    try {
      final orders = await _service.getOfferedOrders(event.token);
      // Same concurrent-handler merge rule as pending orders.
      final current = state;
      if (current is ProviderStatsLoaded) {
        emit(ProviderStatsLoaded(stats: current.stats, pendingOrders: current.pendingOrders, offeredOrders: orders));
      }
    } catch (e) {
      debugPrint('[ProviderBloc] getOfferedOrders FAILED: $e');
    }
  }
}