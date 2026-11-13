import 'package:equatable/equatable.dart';
import '../../models/provider_stats.dart';

abstract class ProviderState extends Equatable {
  @override
  List<Object?> get props => [];
}

class ProviderInitial extends ProviderState {}

class ProviderLoading extends ProviderState {}

class ProviderStatsLoaded extends ProviderState {
  final ProviderStats stats;
  final List<Map<String, dynamic>>? pendingOrders;
  final List<Map<String, dynamic>>? offeredOrders;

  /// Set when a background refresh of the stats failed while earlier stats
  /// are still on screen. The stats above are then the last good values, not
  /// zeros. [refreshErrorSeq] grows with every failure so each one is a
  /// distinct state (Equatable would otherwise suppress a repeat emit).
  final String? refreshError;
  final int refreshErrorSeq;

  ProviderStatsLoaded({
    required this.stats,
    this.pendingOrders,
    this.offeredOrders,
    this.refreshError,
    this.refreshErrorSeq = 0,
  });
  @override
  List<Object?> get props => [
    stats,
    pendingOrders,
    offeredOrders,
    refreshError,
    refreshErrorSeq,
  ];
}

class ProviderError extends ProviderState {
  final String message;
  ProviderError({required this.message});
  @override
  List<Object?> get props => [message];
}
