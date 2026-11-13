import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:swifora/models/user_model.dart';

void main() {
  test('user model parses the forced password-change flag', () {
    final user = UserModel.fromJson({
      'id': 'user-1',
      'fullName': 'User One',
      'email': 'user@example.com',
      'phone': '0599000000',
      'role': 'provider',
      'area': 'Al-Dawha',
      'publicId': 'PRV-1',
      'mustChangePassword': true,
    });

    expect(user.mustChangePassword, isTrue);
    expect(user.toJson()['mustChangePassword'], isTrue);
  });

  test('login routes forced users to the password screen before home', () {
    final source = File('lib/screens/login_screen.dart').readAsStringSync();

    expect(source, contains('ForceChangePasswordScreen'));

    expect(source, contains('state.user.mustChangePassword'));

    expect(source, contains('pushAndRemoveUntil'));
  });

  test(
    'forced password screen cannot be left before changing the password',
    () {
      final source = File(
        'lib/screens/force_change_password_screen.dart',
      ).readAsStringSync();

      expect(source, contains('PopScope('));

      expect(source, contains('canPop: false'));

      expect(source, contains("'/users/password'"));

      expect(source, contains("'currentPassword'"));

      expect(source, contains("'newPassword'"));

      expect(source, contains('SessionUpdatedEvent'));

      expect(source, contains('ProviderHomeScreen'));

      expect(source, contains('HomeScreen'));
    },
  );

  test('auth bloc persists the refreshed session after the forced change', () {
    final event = File('lib/bloc/auth/auth_event.dart').readAsStringSync();
    final bloc = File('lib/bloc/auth/auth_bloc.dart').readAsStringSync();
    final model = File('lib/models/user_model.dart').readAsStringSync();

    expect(event, contains('class SessionUpdatedEvent'));

    expect(bloc, contains('SessionUpdatedEvent'));

    expect(bloc, contains('writeToken(event.token)'));

    expect(model, contains('mustChangePassword'));
  });

  test('backend enforces the forced password change for mobile accounts', () {
    final model = File(
      'swifora_backend/src/models/User.js',
    ).readAsStringSync();
    final middleware = File(
      'swifora_backend/src/middleware/auth.js',
    ).readAsStringSync();
    final auth = File(
      'swifora_backend/src/routes/auth.js',
    ).readAsStringSync();
    final adminUsers = File(
      'swifora_backend/src/routes/adminUsers.js',
    ).readAsStringSync();
    final adminDrivers = File(
      'swifora_backend/src/routes/adminDrivers.js',
    ).readAsStringSync();

    expect(model, contains('mustChangePassword'));

    expect(middleware, contains('PASSWORD_CHANGE_REQUIRED'));

    expect(middleware, contains("path === '/password'"));

    expect(middleware, contains("path === '/me'"));

    expect(auth, contains('mustChangePassword'));

    expect(adminUsers, contains('mustChangePassword: true'));

    expect(adminDrivers, contains('mustChangePassword: true'));
  });
}
