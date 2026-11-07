import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

class ApiConfig {
  static const String _configuredServerUrl = String.fromEnvironment(
    'STARS_SERVER_URL',
  );

  static const String _defaultDevelopmentServerUrl = 'http://192.168.1.6:3000';

  static String lanIp = '192.168.1.6';
  static int port = 3000;
  static String? detectedArea;

  static String _serverUrl = '';
  static bool _initialized = false;

  static String get serverUrl {
    if (!_initialized || _serverUrl.isEmpty) {
      throw StateError('ApiConfig.init() must complete before network access.');
    }

    return _serverUrl;
  }

  static String get apiUrl => '$serverUrl/api';

  @visibleForTesting
  static String resolveInitialServerUrl({
    required String configuredServerUrl,
    required bool debugMode,
    required bool android,
  }) {
    final allowHttp = debugMode && android;

    if (configuredServerUrl.trim().isEmpty) {
      if (!allowHttp) {
        throw StateError(
          'STARS_SERVER_URL is required outside '
          'Android debug builds.',
        );
      }

      return _normalizeServerUrl(_defaultDevelopmentServerUrl, allowHttp: true);
    }

    return _normalizeServerUrl(configuredServerUrl, allowHttp: allowHttp);
  }

  static String _normalizeServerUrl(String raw, {required bool allowHttp}) {
    final value = raw.trim();
    final uri = Uri.tryParse(value);

    if (uri == null || !uri.hasAuthority || uri.host.isEmpty) {
      throw StateError('STARS_SERVER_URL must be an absolute HTTP(S) origin.');
    }

    final secure = uri.scheme == 'https';

    final allowedDevelopmentHttp = allowHttp && uri.scheme == 'http';

    if (!secure && !allowedDevelopmentHttp) {
      throw StateError('STARS_SERVER_URL must use HTTPS.');
    }

    if (uri.userInfo.isNotEmpty ||
        uri.query.isNotEmpty ||
        uri.fragment.isNotEmpty ||
        (uri.path.isNotEmpty && uri.path != '/')) {
      throw StateError(
        'STARS_SERVER_URL must contain only '
        'scheme, host, and optional port.',
      );
    }

    var normalized = uri.toString();

    if (normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }

    return normalized;
  }

  static void _applyServerUrl(String value) {
    _serverUrl = value;
  }

  static Future<bool> _isReachable(String base) async {
    try {
      final dio = Dio(
        BaseOptions(
          baseUrl: base,
          connectTimeout: const Duration(seconds: 3),
          receiveTimeout: const Duration(seconds: 3),
        ),
      );

      final res = await dio.get('/api/health');

      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  static Future<void> _discoverAndroidLan() async {
    try {
      final dio = Dio(
        BaseOptions(
          baseUrl: serverUrl,
          connectTimeout: const Duration(seconds: 3),
          receiveTimeout: const Duration(seconds: 3),
        ),
      );

      final res = await dio.get('/api/config');

      final data = res.data;

      if (data is! Map) {
        return;
      }

      final advertisedIp = data['lanIp']?.toString().trim();

      if (advertisedIp == null || advertisedIp.isEmpty) {
        return;
      }

      final rawPort = data['port'];

      final advertisedPort = rawPort is int
          ? rawPort
          : int.tryParse(rawPort?.toString() ?? '');

      final candidatePort =
          advertisedPort != null &&
              advertisedPort >= 1 &&
              advertisedPort <= 65535
          ? advertisedPort
          : port;

      final candidateUri = Uri(
        scheme: 'http',
        host: advertisedIp,
        port: candidatePort,
      );

      final candidate = _normalizeServerUrl(
        candidateUri.toString(),
        allowHttp: true,
      );

      if (candidate != serverUrl && await _isReachable(candidate)) {
        lanIp = advertisedIp;
        port = candidatePort;
        _applyServerUrl(candidate);
      }
    } catch (_) {
      // Android debug keeps its configured
      // development fallback.
    }
  }

  static Future<void> init() async {
    if (_initialized) {
      return;
    }

    final androidDebug = kDebugMode && Platform.isAndroid;

    final configured = _configuredServerUrl.trim();

    final initial = resolveInitialServerUrl(
      configuredServerUrl: configured,
      debugMode: kDebugMode,
      android: Platform.isAndroid,
    );

    _applyServerUrl(initial);
    _initialized = true;

    if (androidDebug && configured.isEmpty) {
      await _discoverAndroidLan();
    }
  }
}
