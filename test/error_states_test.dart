// Error-state remediation tests (audit findings RISK-004, RISK-044, RISK-045,
// RISK-047, RISK-050).
//
// Behavioural tests: they run the real ProviderBloc and the real
// MyOrdersScreen. Network traffic goes through fakes or an in-memory Dio
// adapter; no real server is contacted.
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/bloc/provider/provider_bloc.dart';
import 'package:stars_delivery/bloc/provider/provider_event.dart';
import 'package:stars_delivery/bloc/provider/provider_state.dart';
import 'package:stars_delivery/models/provider_stats.dart';
import 'package:stars_delivery/screens/my_orders_screen.dart';
import 'package:stars_delivery/services/api_config.dart';
import 'package:stars_delivery/services/mobile_api_client.dart';
import 'package:stars_delivery/services/provider_service.dart';

import 'ux03_screen_harness.dart';

ProviderStats _stats({double due = 35.5, double rating = 4.6}) => ProviderStats(
  dailyEarnings: 120,
  monthlyEarnings: 2400,
  totalSuccessful: 87,
  dailyOrderCount: 6,
  dailyCommission: 12,
  monthlyCommission: 240,
  totalCommissionDue: due,
  pendingOrdersCount: 1,
  offeredOrdersCount: 1,
  activeOrdersCount: 0,
  averageRating: rating,
  ratingCount: 31,
  ratingStars: 5,
);

/// Scripted ProviderService: each call pops the next result (a value, or an
/// Exception to throw).
class _FakeProviderService extends ProviderService {
  final List<Object> stats = [];
  final List<Object> pending = [];
  final List<Object> offered = [];

  Future<T> _next<T>(List<Object> queue) async {
    final v = queue.removeAt(0);
    if (v is Exception) throw v;
    return v as T;
  }

  @override
  Future<ProviderStats> getStats(String token) => _next(stats);

  @override
  Future<List<Map<String, dynamic>>> getPendingOrders(String token) =>
      _next(pending);

  @override
  Future<List<Map<String, dynamic>>> getOfferedOrders(String token) =>
      _next(offered);
}

Future<ProviderState> _settle(ProviderBloc bloc) async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
  return bloc.state;
}

class _OrdersAdapter implements HttpClientAdapter {
  int status = 200;
  Duration delay = Duration.zero;
  List<Map<String, dynamic>> orders = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (delay > Duration.zero) await Future<void>.delayed(delay);
    final path = options.uri.path;
    Object body;
    var code = 200;
    if (path.endsWith('/orders') && options.method == 'GET') {
      code = status;
      body = status == 200 ? orders : {'error': 'Synthetic server error'};
    } else if (path.endsWith('unread-count')) {
      body = {'count': 0};
    } else {
      body = <String, dynamic>{};
    }
    return ResponseBody.fromString(
      jsonEncode(body),
      code,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> _order(String id, String status) => {
  '_id': id,
  'type': 'product',
  'description': 'Synthetic order $id',
  'phone': '0590000000',
  'status': status,
  'area': 'Ramallah',
  'createdAt': DateTime.now().toUtc().toIso8601String(),
  'customerId': {'_id': 'c-1', 'fullName': 'Test Customer'},
};

void main() {
  setUpAll(() => ApiConfig.initForTesting('http://127.0.0.1:1'));

  group('ProviderBloc (RISK-044, RISK-004)', () {
    test('starts in a loading state, not a zero-stats dashboard', () {
      final bloc = ProviderBloc(service: _FakeProviderService());
      expect(bloc.state, isA<ProviderLoading>());
      bloc.close();
    });

    test('first stats failure emits ProviderError', () async {
      final service = _FakeProviderService()
        ..stats.add(Exception('Network down'));
      final bloc = ProviderBloc(service: service)
        ..add(LoadProviderStats(token: 't'));
      final state = await _settle(bloc);
      expect(state, isA<ProviderError>());
      expect((state as ProviderError).message, 'Network down');
      await bloc.close();
    });

    test('a failed refresh keeps every last-known stat, including commission '
        'due and rating, and reports the failure', () async {
      final service = _FakeProviderService()
        ..stats.addAll([_stats(), Exception('Timeout')]);
      final bloc = ProviderBloc(service: service)
        ..add(LoadProviderStats(token: 't'));
      await _settle(bloc);
      bloc.add(LoadProviderStats(token: 't'));
      final state = await _settle(bloc) as ProviderStatsLoaded;
      expect(state.stats.totalCommissionDue, 35.5);
      expect(state.stats.averageRating, 4.6);
      expect(state.stats.monthlyEarnings, 2400);
      expect(state.refreshError, 'Timeout');
      await bloc.close();
    });

    test(
      'pending orders that arrive before the stats are not dropped',
      () async {
        final service = _FakeProviderService()
          ..pending.add([_order('p-1', 'pending')])
          ..stats.add(_stats());
        final bloc = ProviderBloc(service: service)
          ..add(LoadPendingOrders(token: 't'));
        await _settle(bloc);
        bloc.add(LoadProviderStats(token: 't'));
        final state = await _settle(bloc) as ProviderStatsLoaded;
        expect(state.pendingOrders, hasLength(1));
        await bloc.close();
      },
    );

    test('a stats refresh keeps the offered-orders list', () async {
      final service = _FakeProviderService()
        ..stats.addAll([_stats(), _stats()])
        ..offered.add([_order('o-1', 'offered')]);
      final bloc = ProviderBloc(service: service)
        ..add(LoadProviderStats(token: 't'));
      await _settle(bloc);
      bloc.add(LoadOfferedOrders(token: 't'));
      await _settle(bloc);
      bloc.add(LoadProviderStats(token: 't'));
      final state = await _settle(bloc) as ProviderStatsLoaded;
      expect(state.offeredOrders, hasLength(1));
      await bloc.close();
    });

    test('retry after an error goes back through loading to loaded', () async {
      final service = _FakeProviderService()
        ..stats.addAll([Exception('Network down'), _stats()]);
      final bloc = ProviderBloc(service: service);
      final seen = <ProviderState>[];
      final sub = bloc.stream.listen(seen.add);
      bloc.add(LoadProviderStats(token: 't'));
      await _settle(bloc);
      bloc.add(LoadProviderStats(token: 't'));
      await _settle(bloc);
      expect(seen.map((s) => s.runtimeType).toList(), [
        ProviderError,
        ProviderLoading,
        ProviderStatsLoaded,
      ]);
      await sub.cancel();
      await bloc.close();
    });
  });

  group('MyOrdersScreen (RISK-045, RISK-047, RISK-050)', () {
    late Ux03Harness harness;
    late _OrdersAdapter adapter;

    setUp(() {
      harness = Ux03Harness();
      adapter = _OrdersAdapter();
      MobileApiClient.testAdapter = adapter;
    });

    tearDown(() => harness.dispose());

    Future<void> pump(WidgetTester tester) async {
      await tester.pumpWidget(
        harness.app(
          const MyOrdersScreen(token: 't'),
          themeMode: ThemeMode.light,
          locale: const Locale('en'),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
    }

    Future<void> dispose(WidgetTester tester) async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 15));
    }

    testWidgets('a server error shows an error view with retry, '
        'not "No orders"', (tester) async {
      adapter.status = 500;
      await pump(tester);
      expect(find.text('No orders'), findsNothing);
      expect(
        find.text(
          'Could not load your orders. Check your connection and try again.',
        ),
        findsOneWidget,
      );

      adapter
        ..status = 200
        ..orders = [_order('ord-1', 'offered')];
      await tester.tap(find.text('Retry'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Retry'), findsNothing);
      expect(find.text('Synthetic order ord-1'), findsOneWidget);
      await dispose(tester);
    });

    testWidgets('an empty successful response still shows "No orders"', (
      tester,
    ) async {
      await pump(tester);
      expect(find.text('No orders'), findsOneWidget);
      await dispose(tester);
    });

    testWidgets('leaving before the response arrives does not throw', (
      tester,
    ) async {
      adapter.delay = const Duration(seconds: 2);
      await pump(tester);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 3));
      expect(tester.takeException(), isNull);
      await dispose(tester);
    });

    testWidgets('cancelled and expired orders show localized labels', (
      tester,
    ) async {
      adapter.orders = [
        _order('ord-1', 'cancelled'),
        _order('ord-2', 'expired'),
      ];
      await pump(tester);
      expect(find.text('cancelled'), findsNothing);
      expect(find.text('expired'), findsNothing);
      expect(find.text('Order Cancelled'), findsWidgets);
      // Expired orders are labelled through the offer-window path.
      expect(find.text('Expired'), findsWidgets);
      await dispose(tester);
    });
  });
}
