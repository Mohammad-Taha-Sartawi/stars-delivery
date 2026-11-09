import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:stars_delivery/bloc/auth/auth_bloc.dart';
import 'package:stars_delivery/bloc/auth/auth_event.dart';
import 'package:stars_delivery/bloc/auth/auth_state.dart';
import 'package:stars_delivery/services/auth_service.dart';
import 'package:stars_delivery/services/jwt_token.dart';
import 'package:stars_delivery/services/session_storage.dart';

class FakeTokenVault implements TokenVault {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async {
    return values[key];
  }

  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}

class FakeAuthGateway implements AuthGateway {
  int validateCalls = 0;

  Object? validationError;

  Map<String, dynamic> validationResult = {
    'user': {
      'id': '64b7c38f3f8b07f0c1234567',
      'fullName': 'Server User',
      'email': 'server@example.com',
      'phone': '0599000000',
      'role': 'customer',
      'area': 'Ramallah',
      'publicId': 'USR-001',
    },
  };

  @override
  Future<Map<String, dynamic>> validateSession(String token) async {
    validateCalls += 1;

    if (validationError != null) {
      throw validationError!;
    }

    return validationResult;
  }

  @override
  Future<Map<String, dynamic>> login(
    String email,
    String password,
    String role,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<Map<String, dynamic>> register(
    String fullName,
    String email,
    String phone,
    String password,
    String role,
    String area, {
    String governorate = '',
    bool privacyPolicy = true,
    List<String> serviceTypes = const [],
    ProviderRegistrationDocument? driverLicenseDocument,
  }) {
    throw UnimplementedError();
  }
}

String fakeJwt({
  required DateTime expiresAt,
  String id = '64b7c38f3f8b07f0c1234567',
  String role = 'customer',
}) {
  String encode(Map<String, dynamic> value) {
    return base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  }

  final header = encode({'alg': 'HS256', 'typ': 'JWT'});

  final payload = encode({
    'id': id,
    'role': role,
    'exp': expiresAt.toUtc().millisecondsSinceEpoch ~/ 1000,
  });

  return '$header.$payload.signature';
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('JWT restore guard accepts only future mobile sessions', () {
    final now = DateTime.utc(2026, 8, 29, 12);

    final valid = fakeJwt(expiresAt: now.add(const Duration(hours: 1)));

    final expired = fakeJwt(
      expiresAt: now.subtract(const Duration(seconds: 1)),
    );

    final admin = fakeJwt(
      expiresAt: now.add(const Duration(hours: 1)),
      role: 'admin',
    );

    expect(JwtToken.isRestorable(valid, now: now), isTrue);

    expect(
      JwtToken.isRestorable(expired, now: now, clockSkew: Duration.zero),
      isFalse,
    );

    expect(JwtToken.isRestorable(admin, now: now), isFalse);

    expect(JwtToken.isRestorable('not-a-jwt', now: now), isFalse);
  });

  test(
    'legacy SharedPreferences session migrates once into secure vault',
    () async {
      SharedPreferences.setMockInitialValues({
        SessionStorage.legacyTokenKey: 'legacy-token',
        SessionStorage.legacyUserKey: '{"legacy":true}',
      });

      final vault = FakeTokenVault();

      final storage = SessionStorage(vault: vault);

      final token = await storage.readToken();

      expect(token, 'legacy-token');

      expect(vault.values[SessionStorage.secureTokenKey], 'legacy-token');

      final prefs = await SharedPreferences.getInstance();

      expect(prefs.getString(SessionStorage.legacyTokenKey), isNull);

      expect(prefs.getString(SessionStorage.legacyUserKey), isNull);
    },
  );

  test('writing secure token removes legacy preference cache', () async {
    SharedPreferences.setMockInitialValues({
      SessionStorage.legacyTokenKey: 'old-token',
      SessionStorage.legacyUserKey: '{"old":true}',
    });

    final vault = FakeTokenVault();

    final storage = SessionStorage(vault: vault);

    await storage.writeToken('new-secure-token');

    expect(vault.values[SessionStorage.secureTokenKey], 'new-secure-token');

    final prefs = await SharedPreferences.getInstance();

    expect(prefs.getString(SessionStorage.legacyTokenKey), isNull);

    expect(prefs.getString(SessionStorage.legacyUserKey), isNull);
  });

  test('startup restores only after authoritative server validation', () async {
    final vault = FakeTokenVault();

    final token = fakeJwt(
      expiresAt: DateTime.now().toUtc().add(const Duration(hours: 1)),
    );

    vault.values[SessionStorage.secureTokenKey] = token;

    final gateway = FakeAuthGateway();

    final bloc = AuthBloc(
      authService: gateway,
      sessionStorage: SessionStorage(vault: vault),
      checkOnStart: false,
    );

    final expectation = expectLater(
      bloc.stream,
      emitsInOrder([
        isA<AuthLoading>(),
        isA<AuthSuccess>().having(
          (state) => state.user.email,
          'server user',
          'server@example.com',
        ),
      ]),
    );

    bloc.add(CheckAuthEvent());

    await expectation;

    expect(gateway.validateCalls, 1);

    await bloc.close();
  });

  test('expired secure token is cleared without server call', () async {
    final vault = FakeTokenVault();

    vault.values[SessionStorage.secureTokenKey] = fakeJwt(
      expiresAt: DateTime.now().toUtc().subtract(const Duration(minutes: 1)),
    );

    final gateway = FakeAuthGateway();

    final bloc = AuthBloc(
      authService: gateway,
      sessionStorage: SessionStorage(vault: vault),
      checkOnStart: false,
    );

    final expectation = expectLater(
      bloc.stream,
      emitsInOrder([isA<AuthLoading>(), isA<AuthInitial>()]),
    );

    bloc.add(CheckAuthEvent());

    await expectation;

    expect(gateway.validateCalls, 0);

    expect(vault.values[SessionStorage.secureTokenKey], isNull);

    await bloc.close();
  });

  test('server-rejected session is cleared', () async {
    final vault = FakeTokenVault();

    vault.values[SessionStorage.secureTokenKey] = fakeJwt(
      expiresAt: DateTime.now().toUtc().add(const Duration(hours: 1)),
    );

    final gateway = FakeAuthGateway()
      ..validationError = const SessionRejectedException(
        statusCode: 403,
        message: 'Account is not active',
      );

    final bloc = AuthBloc(
      authService: gateway,
      sessionStorage: SessionStorage(vault: vault),
      checkOnStart: false,
    );

    final expectation = expectLater(
      bloc.stream,
      emitsInOrder([isA<AuthLoading>(), isA<AuthInitial>()]),
    );

    bloc.add(CheckAuthEvent());

    await expectation;

    expect(gateway.validateCalls, 1);

    expect(vault.values[SessionStorage.secureTokenKey], isNull);

    await bloc.close();
  });

  test('temporary network failure preserves secure token', () async {
    final vault = FakeTokenVault();

    final token = fakeJwt(
      expiresAt: DateTime.now().toUtc().add(const Duration(hours: 1)),
    );

    vault.values[SessionStorage.secureTokenKey] = token;

    final gateway = FakeAuthGateway()
      ..validationError = Exception('network unavailable');

    final bloc = AuthBloc(
      authService: gateway,
      sessionStorage: SessionStorage(vault: vault),
      checkOnStart: false,
    );

    final expectation = expectLater(
      bloc.stream,
      emitsInOrder([isA<AuthLoading>(), isA<AuthError>()]),
    );

    bloc.add(CheckAuthEvent());

    await expectation;

    expect(gateway.validateCalls, 1);

    expect(vault.values[SessionStorage.secureTokenKey], token);

    await bloc.close();
  });

  test('logout clear removes secure and legacy session values', () async {
    SharedPreferences.setMockInitialValues({
      SessionStorage.legacyTokenKey: 'legacy-token',
      SessionStorage.legacyUserKey: '{"legacy":true}',
    });

    final vault = FakeTokenVault();

    vault.values[SessionStorage.secureTokenKey] = 'secure-token';

    final storage = SessionStorage(vault: vault);

    await storage.clear();

    expect(vault.values[SessionStorage.secureTokenKey], isNull);

    final prefs = await SharedPreferences.getInstance();

    expect(prefs.getString(SessionStorage.legacyTokenKey), isNull);

    expect(prefs.getString(SessionStorage.legacyUserKey), isNull);
  });
}
