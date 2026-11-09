// UX-01 remediation test fixture: an in-memory Replacement ApiClient adapter.
//
// Flutter's widget-test binding installs `_MockHttpOverrides`, which intercepts
// every HttpClient and returns mock 400 responses even for runAsync blocks.
// Real loopback HTTP is therefore impossible inside `WidgetTester`. Instead of
// a socket mock, tests install a `Dio` HttpClientAdapter: requests are served
// from immutable fixture data with deterministic delays, all clock-driven by
// the test's fake async time.
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// Recorded fixture+stub used by the remediation widget tests.
class MockApi {
  // -------- mutable per-test fixtures --------

  Map<String, dynamic> statsJson = _defaultStats();

  List<Map<String, dynamic>> pendingOrders = [];

  List<Map<String, dynamic>> offeredOrders = [];

  int supportUnreadCount = 0;

  int statsRequests = 0;

  final List<Map<String, dynamic>> availabilityCalls = [];

  final List<Map<String, dynamic>> contactCalls = [];

  /// Artificial latency applied to the support-contact endpoint so tests can
  /// observe the dialog's in-flight loading state before it dismisses.
  Duration contactDelay = Duration.zero;

  // -------- construction --------

  MockApi();

  void reset() {
    statsJson = _defaultStats();
    pendingOrders = [];
    offeredOrders = [];
    supportUnreadCount = 0;
    statsRequests = 0;
    availabilityCalls.clear();
    contactCalls.clear();
    contactDelay = Duration.zero;
  }

  static Map<String, dynamic> _defaultStats() => {
    'dailyEarnings': 0.0,
    'monthlyEarnings': 0.0,
    'totalSuccessful': 0,
    'dailyOrderCount': 0,
    'dailyCommission': 0.0,
    'monthlyCommission': 0.0,
    'pendingOrdersCount': 0,
    'offeredOrdersCount': 0,
    'ordersReportCount': 0,
    'activeOrdersCount': 0,
    'isAvailable': true,
  };

  /// The [HttpClientAdapter] to install via
  /// `MobileApiClient.testAdapter = mockApi.adapter`.
  HttpClientAdapter get adapter => _MockApiAdapter._(this);
}

class _MockApiAdapter implements HttpClientAdapter {
  _MockApiAdapter._(this._api);

  final MockApi _api;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? bodyStream,
    Future<void>? cancelToken,
  ) async {
    final body =
        await (bodyStream?.expand((chunk) => chunk).toList() ??
            Future<List<int>>.value(const []));
    Map<String, dynamic>? decoded;

    if (body.isNotEmpty) {
      try {
        decoded = jsonDecode(utf8.decode(body)) as Map<String, dynamic>?;
      } catch (_) {}
    }

    return _respondFor(options.uri.path, decoded);
  }

  Future<ResponseBody> _respondFor(
    String path,
    Map<String, dynamic>? decoded,
  ) async {
    Object? data;
    int status = 200;

    switch (path) {
      case '/api/provider/stats':
        _api.statsRequests++;
        data = _api.statsJson;
      case '/api/provider/pending-orders':
        data = _api.pendingOrders;
      case '/api/provider/offered-orders':
        data = _api.offeredOrders;
      case '/api/notifications':
        data = <Map<String, dynamic>>[];
      case '/api/notifications/unread-count':
        data = {'count': 0};
      case '/api/chat/unread-count':
        data = {'count': _api.supportUnreadCount};
      case '/api/provider/availability':
        _api.availabilityCalls.add(decoded ?? {});
        data = const <String, dynamic>{};
      case '/api/chat/contact':
        if (_api.contactDelay > Duration.zero) {
          await Future<void>.delayed(_api.contactDelay);
        }
        _api.contactCalls.add(decoded ?? {});
        data = const <String, dynamic>{};
      default:
        status = 404;
        data = {'error': 'unexpected path in test: $path'};
    }

    return ResponseBody.fromString(
      jsonEncode(data),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  Future<void> close({bool force = false}) async {}
}
