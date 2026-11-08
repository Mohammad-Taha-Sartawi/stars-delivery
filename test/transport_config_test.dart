import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/services/api_config.dart';

void main() {
  test('Android debug keeps the local HTTP development fallback', () {
    final result = ApiConfig.resolveInitialServerUrl(
      configuredServerUrl: '',
      debugMode: true,
      android: true,
    );

    expect(result, 'http://192.168.1.7:3000');
  });

  test('Android debug discovers the backend across the local subnet', () {
    final source = File('lib/services/api_config.dart').readAsStringSync();

    expect(source, contains('_scanLocalSubnet'));

    expect(source, contains('NetworkInterface.list'));

    expect(source, contains("'/api/config'"));

    expect(source, contains('start += 32'));
  });

  test('release and profile style modes require explicit configuration', () {
    expect(
      () => ApiConfig.resolveInitialServerUrl(
        configuredServerUrl: '',
        debugMode: false,
        android: true,
      ),
      throwsA(isA<StateError>()),
    );
  });

  test('non Android debug also requires an explicit secure endpoint', () {
    expect(
      () => ApiConfig.resolveInitialServerUrl(
        configuredServerUrl: '',
        debugMode: true,
        android: false,
      ),
      throwsA(isA<StateError>()),
    );
  });

  test('production HTTPS origin is accepted and normalized', () {
    final result = ApiConfig.resolveInitialServerUrl(
      configuredServerUrl: ' https://api.example.test/ ',
      debugMode: false,
      android: true,
    );

    expect(result, 'https://api.example.test');
  });

  test('production HTTP endpoint is rejected', () {
    expect(
      () => ApiConfig.resolveInitialServerUrl(
        configuredServerUrl: 'http://api.example.test',
        debugMode: false,
        android: true,
      ),
      throwsA(isA<StateError>()),
    );
  });

  test('Android debug may explicitly target local HTTP', () {
    final result = ApiConfig.resolveInitialServerUrl(
      configuredServerUrl: 'http://10.0.2.2:3000/',
      debugMode: true,
      android: true,
    );

    expect(result, 'http://10.0.2.2:3000');
  });

  test(
    'configured endpoint rejects paths query fragment credentials and non HTTP schemes',
    () {
      const invalid = [
        'https://api.example.test/api',
        'https://api.example.test?mode=test',
        'https://api.example.test#fragment',
        'https://user:pass@api.example.test',
        'ftp://api.example.test',
      ];

      for (final value in invalid) {
        expect(
          () => ApiConfig.resolveInitialServerUrl(
            configuredServerUrl: value,
            debugMode: false,
            android: true,
          ),
          throwsA(isA<StateError>()),
          reason: value,
        );
      }
    },
  );
}
