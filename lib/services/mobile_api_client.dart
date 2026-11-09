import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'api_config.dart';
import 'mobile_session_failure.dart';

class MobileSessionInterceptor extends Interceptor {
  final MobileSessionFailure _sessionFailure;

  MobileSessionInterceptor({MobileSessionFailure? sessionFailure})
    : _sessionFailure = sessionFailure ?? MobileSessionFailure.instance;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    _sessionFailure.report(err);
    handler.next(err);
  }
}

class MobileApiClient {
  /// Test-only hook: when set, every client created by this factory uses this
  /// adapter instead of the real network stack. Null in production.
  @visibleForTesting
  static HttpClientAdapter? testAdapter;

  static Dio create({
    String? baseUrl,
    Map<String, dynamic>? headers,
    Duration? connectTimeout = const Duration(seconds: 30),
    Duration? receiveTimeout = const Duration(seconds: 30),
    MobileSessionFailure? sessionFailure,
  }) {
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl ?? ApiConfig.apiUrl,
        headers: headers,
        connectTimeout: connectTimeout,
        receiveTimeout: receiveTimeout,
      ),
    );

    dio.interceptors.add(
      MobileSessionInterceptor(sessionFailure: sessionFailure),
    );

    final adapter = testAdapter;
    if (adapter != null) {
      dio.httpClientAdapter = adapter;
    }

    return dio;
  }
}
