import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:swifora/bloc/auth/auth_bloc.dart';
import 'package:swifora/main.dart';
import 'package:swifora/services/auth_service.dart';
import 'package:swifora/services/session_storage.dart';

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
    String governorate = '',
    bool privacyPolicy = true,
    List<String> serviceTypes = const [],
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
      SwiforaApp(
        authBlocFactory: () => AuthBloc(
          authService: _WidgetTestAuthGateway(),
          sessionStorage: SessionStorage(vault: _WidgetTestTokenVault()),
          checkOnStart: false,
        ),
      ),
    );

    expect(find.text('ستارز دليفري'), findsOneWidget);

    expect(find.text('زبون'), findsOneWidget);

    expect(find.text('سائق'), findsOneWidget);

    // Explicitly dispose SwiforaApp while the test is active.
    // BlocProvider owns the factory-created AuthBloc and closes it.
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
