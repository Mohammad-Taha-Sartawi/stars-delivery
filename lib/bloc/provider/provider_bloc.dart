import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'provider_event.dart';
import 'provider_state.dart';
import '../../services/provider_service.dart';
import '../../models/provider_stats.dart';

/// Driver dashboard state.
///
/// Stats, pending orders and offered orders load through three independent
/// requests that Bloc 9 runs concurrently. The bloc keeps the latest result of
/// each in its own field and always emits all three together, so a response
/// that lands first is never dropped and one list is never wiped by another
/// handler's emit.
///
/// The bloc starts in [ProviderLoading]. If the first stats request fails it
/// emits [ProviderError], so the dashboard shows its error and retry view
/// instead of all-zero earnings that look real. When a later refresh fails,
/// the last good stats stay on screen and the failure is reported through
/// [ProviderStatsLoaded.refreshError].
class ProviderBloc extends Bloc<ProviderEvent, ProviderState> {
  ProviderBloc({ProviderService? service})
    : _service = service ?? ProviderService(),
      super(ProviderLoading()) {
    on<LoadProviderStats>(_onLoadStats);
    on<LoadPendingOrders>(_onLoadPendingOrders);
    on<LoadOfferedOrders>(_onLoadOfferedOrders);
  }

  final ProviderService _service;

  ProviderStats? _stats;
  List<Map<String, dynamic>>? _pendingOrders;
  List<Map<String, dynamic>>? _offeredOrders;
  int _refreshErrorSeq = 0;

  void _emitLoaded(Emitter<ProviderState> emit, {String? refreshError}) {
    final stats = _stats;
    if (stats == null) return;
    emit(
      ProviderStatsLoaded(
        stats: stats,
        pendingOrders: _pendingOrders,
        offeredOrders: _offeredOrders,
        refreshError: refreshError,
        refreshErrorSeq: _refreshErrorSeq,
      ),
    );
  }

  static String _message(Object error) =>
      error.toString().replaceFirst('Exception: ', '');

  Future<void> _onLoadStats(
    LoadProviderStats event,
    Emitter<ProviderState> emit,
  ) async {
    // Retrying from the error view (no stats yet) shows the spinner again.
    if (_stats == null && state is! ProviderLoading) {
      emit(ProviderLoading());
    }
    try {
      _stats = await _service.getStats(event.token);
      _emitLoaded(emit);
    } catch (e) {
      debugPrint('[ProviderBloc] getStats FAILED: $e');
      if (_stats == null) {
        emit(ProviderError(message: _message(e)));
      } else {
        _refreshErrorSeq += 1;
        _emitLoaded(emit, refreshError: _message(e));
      }
    }
  }

  Future<void> _onLoadPendingOrders(
    LoadPendingOrders event,
    Emitter<ProviderState> emit,
  ) async {
    try {
      _pendingOrders = await _service.getPendingOrders(event.token);
      _emitLoaded(emit);
    } catch (e) {
      // Keep the last good list; the stats request reports connectivity.
      debugPrint('[ProviderBloc] getPendingOrders FAILED: $e');
    }
  }

  Future<void> _onLoadOfferedOrders(
    LoadOfferedOrders event,
    Emitter<ProviderState> emit,
  ) async {
    try {
      _offeredOrders = await _service.getOfferedOrders(event.token);
      _emitLoaded(emit);
    } catch (e) {
      debugPrint('[ProviderBloc] getOfferedOrders FAILED: $e');
    }
  }
}
