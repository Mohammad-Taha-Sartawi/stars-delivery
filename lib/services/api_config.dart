import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

class ApiConfig {
  static const String _configuredServerUrl = String.fromEnvironment(
    'STARS_SERVER_URL',
  );

  static const String _defaultDevelopmentServerUrl = 'http://192.168.1.7:3000';

  static String lanIp = '192.168.1.7';
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

  static Future<Map<String, dynamic>?> _fetchConfig(String base) async {
    try {
      final dio = Dio(
        BaseOptions(
          baseUrl: base,
          connectTimeout: const Duration(milliseconds: 800),
          receiveTimeout: const Duration(milliseconds: 800),
        ),
      );

      final res = await dio.get('/api/config');
      final data = res.data;

      if (data is Map) {
        return Map<String, dynamic>.from(data);
      }
    } catch (_) {}

    return null;
  }

  static String? _candidateFromConfig(
    Map<String, dynamic> data, {
    String? fallbackHost,
    bool preferFallbackHost = false,
  }) {
    final advertisedIp = data['lanIp']?.toString().trim();
    final host = preferFallbackHost
        ? (fallbackHost ?? advertisedIp)
        : (advertisedIp == null || advertisedIp.isEmpty
            ? fallbackHost
            : advertisedIp);

    if (host == null || host.isEmpty) {
      return null;
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

    try {
      return _normalizeServerUrl(
        Uri(scheme: 'http', host: host, port: candidatePort).toString(),
        allowHttp: true,
      );
    } catch (_) {
      return null;
    }
  }

  static Future<void> _discoverAndroidLan() async {
    final currentConfig = await _fetchConfig(serverUrl);

    if (currentConfig != null) {
      final candidate = _candidateFromConfig(currentConfig);

      if (candidate != null && candidate != serverUrl) {
        final candidateConfig = await _fetchConfig(candidate);

        if (candidateConfig != null) {
          _applyServerUrl(candidate);
        }
      }

      return;
    }

    final scanned = await _scanLocalSubnet();

    if (scanned != null) {
      _applyServerUrl(scanned);
    }
  }

  static Future<String?> _scanLocalSubnet() async {
    try {
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLinkLocal: false,
      );

      final subnets = <String>{};

      for (final interface in interfaces) {
        for (final address in interface.addresses) {
          if (address.address.startsWith('127.')) {
            continue;
          }

          final parts = address.address.split('.');

          if (parts.length == 4) {
            subnets.add('${parts[0]}.${parts[1]}.${parts[2]}');
          }
        }
      }

      final probePort = Uri.tryParse(serverUrl)?.port ?? port;
      final client = HttpClient()
        ..connectionTimeout = const Duration(milliseconds: 400);

      try {
        for (final subnet in subnets) {
          for (var start = 1; start <= 254; start += 32) {
            final end = start + 31 <= 254 ? start + 31 : 254;
            final hosts = [
              for (var i = start; i <= end; i++) '$subnet.$i',
            ];

            final results = await Future.wait(
              hosts.map(
                (host) => _probeHost(client, host, probePort),
              ),
            );

            for (final result in results) {
              if (result != null) {
                return result;
              }
            }
          }
        }
      } finally {
        client.close(force: true);
      }
    } catch (_) {}

    return null;
  }

  static Future<String?> _probeHost(
    HttpClient client,
    String host,
    int probePort,
  ) async {
    try {
      final uri = Uri(
        scheme: 'http',
        host: host,
        port: probePort,
        path: '/api/config',
      );

      final request = await client
          .getUrl(uri)
          .timeout(const Duration(milliseconds: 500));

      final response = await request
          .close()
          .timeout(const Duration(milliseconds: 500));

      if (response.statusCode != 200) {
        return null;
      }

      final body = await response
          .transform(utf8.decoder)
          .join()
          .timeout(const Duration(milliseconds: 500));

      final data = jsonDecode(body);

      if (data is! Map) {
        return null;
      }

      return _candidateFromConfig(
        Map<String, dynamic>.from(data),
        fallbackHost: host,
        preferFallbackHost: true,
      );
    } catch (_) {
      return null;
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
