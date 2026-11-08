import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:stars_delivery/bloc/auth/auth_bloc.dart';
import 'package:stars_delivery/main.dart';
import 'package:stars_delivery/services/auth_service.dart';
import 'package:stars_delivery/services/session_storage.dart';

class _WidgetTestTokenVault implements TokenVault {
  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> delete(String key) async {}
}

class _WidgetTestAuthGateway implements AuthGateway {
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
    bool privacyPolicy = true,
    List<String> serviceTypes = const [],
    ProviderRegistrationDocument? driverLicenseDocument,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Map<String, dynamic>> validateSession(String token) {
    throw UnimplementedError();
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('App shows login screen', (WidgetTester tester) async {
    await tester.pumpWidget(
      StarsDeliveryApp(
        authBlocFactory: () => AuthBloc(
          authService: _WidgetTestAuthGateway(),
          sessionStorage: SessionStorage(vault: _WidgetTestTokenVault()),
          checkOnStart: false,
        ),
      ),
    );

    expect(find.text('ستارز دليفري'), findsOneWidget);

    expect(find.text('عميل'), findsOneWidget);

    expect(find.text('سائق'), findsOneWidget);

    // Explicitly dispose StarsDeliveryApp while the test is active.
    // BlocProvider owns the factory-created AuthBloc and closes it.
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
