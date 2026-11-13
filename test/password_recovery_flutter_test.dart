import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:swifora/bloc/password_recovery/password_recovery_bloc.dart';
import 'package:swifora/bloc/password_recovery/password_recovery_event.dart';
import 'package:swifora/bloc/password_recovery/password_recovery_state.dart';
import 'package:swifora/services/password_recovery_service.dart';

class _FakeRecoveryGateway implements PasswordRecoveryGateway {
  bool failRequest = false;
  bool failReset = false;

  String? requestedEmail;
  String? resetEmail;
  String? resetCode;
  String? resetPasswordValue;
  String? resetConfirmationValue;

  @override
  Future<void> requestCode(String email) async {
    requestedEmail = email;

    if (failRequest) {
      throw const PasswordRecoveryException(
        statusCode: 429,
        code: 'PASSWORD_RECOVERY_RATE_LIMITED',
        message: 'rate limited',
      );
    }
  }

  @override
  Future<void> resetPassword({
    required String email,
    required String code,
    required String newPassword,
    required String confirmPassword,
  }) async {
    resetEmail = email;
    resetCode = code;
    resetPasswordValue = newPassword;
    resetConfirmationValue = confirmPassword;

    if (failReset) {
      throw const PasswordRecoveryException(
        statusCode: 400,
        code: 'PASSWORD_RECOVERY_INVALID',
        message: 'invalid',
      );
    }
  }
}

String _source(String path) {
  return File(path).readAsStringSync();
}

void main() {
  test(
    'recovery service exposes request and reset endpoints without session persistence',
    () {
      final source = _source('lib/services/password_recovery_service.dart');

      expect(
        source,
        contains('abstract interface class PasswordRecoveryGateway'),
      );

      expect(source, contains("'/auth/password-recovery/request'"));

      expect(source, contains("'/auth/password-recovery/reset'"));

      expect(source, isNot(contains('Authorization')));

      expect(source, isNot(contains('writeToken')));

      expect(source, isNot(contains('SessionStorage')));
    },
  );

  test(
    'recovery service normalizes email and sends the backend reset contract',
    () {
      final source = _source('lib/services/password_recovery_service.dart');

      expect(source, contains('trim().toLowerCase()'));

      for (final field in [
        "'email':",
        "'code':",
        "'newPassword':",
        "'confirmPassword':",
      ]) {
        expect(source, contains(field));
      }

      expect(source, isNot(contains("'token':")));
    },
  );

  test('reset event Equatable identity excludes OTP and password values', () {
    const event = SubmitPasswordRecoveryReset(
      email: 'user@example.com',
      code: '87654321',
      newPassword: 'Secret-Recovery-Password-2026',
      confirmPassword: 'Secret-Recovery-Password-2026',
    );

    expect(event.props, equals(const ['user@example.com']));

    final debugText = event.toString();

    expect(debugText, isNot(contains('87654321')));

    expect(debugText, isNot(contains('Secret-Recovery-Password-2026')));
  });

  test('request BLoC normalizes email then advances to OTP stage', () async {
    final gateway = _FakeRecoveryGateway();

    final bloc = PasswordRecoveryBloc(gateway: gateway);

    final expectation = expectLater(
      bloc.stream,
      emitsInOrder([
        isA<PasswordRecoveryState>()
            .having((state) => state.isLoading, 'loading', true)
            .having(
              (state) => state.stage,
              'stage',
              PasswordRecoveryStage.requestEmail,
            )
            .having((state) => state.email, 'email', 'user@example.com'),
        isA<PasswordRecoveryState>()
            .having((state) => state.isLoading, 'loading', false)
            .having(
              (state) => state.stage,
              'stage',
              PasswordRecoveryStage.enterCode,
            )
            .having((state) => state.email, 'email', 'user@example.com'),
      ]),
    );

    bloc.add(const RequestPasswordRecoveryCode(email: ' USER@Example.COM '));

    await expectation;

    expect(gateway.requestedEmail, 'user@example.com');

    await bloc.close();
  });

  test(
    'successful reset BLoC completes without creating an authenticated session',
    () async {
      final gateway = _FakeRecoveryGateway();

      final bloc = PasswordRecoveryBloc(gateway: gateway);

      bloc.add(const RequestPasswordRecoveryCode(email: 'user@example.com'));

      await bloc.stream.firstWhere(
        (state) =>
            state.stage == PasswordRecoveryStage.enterCode && !state.isLoading,
      );

      final expectation = expectLater(
        bloc.stream,
        emitsInOrder([
          isA<PasswordRecoveryState>()
              .having((state) => state.isLoading, 'loading', true)
              .having((state) => state.completed, 'completed', false),
          isA<PasswordRecoveryState>()
              .having((state) => state.isLoading, 'loading', false)
              .having((state) => state.completed, 'completed', true)
              .having((state) => state.email, 'email', 'user@example.com'),
        ]),
      );

      bloc.add(
        const SubmitPasswordRecoveryReset(
          email: 'user@example.com',
          code: '12345678',
          newPassword: 'StrongRecoveryPassword2026',
          confirmPassword: 'StrongRecoveryPassword2026',
        ),
      );

      await expectation;

      expect(gateway.resetEmail, 'user@example.com');

      expect(gateway.resetCode, '12345678');

      expect(gateway.resetPasswordValue, 'StrongRecoveryPassword2026');

      expect(gateway.resetConfirmationValue, 'StrongRecoveryPassword2026');

      await bloc.close();
    },
  );

  test(
    'recovery request failure stays at email stage with backend error code',
    () async {
      final gateway = _FakeRecoveryGateway()..failRequest = true;

      final bloc = PasswordRecoveryBloc(gateway: gateway);

      final expectation = expectLater(
        bloc.stream,
        emitsInOrder([
          isA<PasswordRecoveryState>().having(
            (state) => state.isLoading,
            'loading',
            true,
          ),
          isA<PasswordRecoveryState>()
              .having((state) => state.isLoading, 'loading', false)
              .having(
                (state) => state.stage,
                'stage',
                PasswordRecoveryStage.requestEmail,
              )
              .having(
                (state) => state.errorCode,
                'errorCode',
                'PASSWORD_RECOVERY_RATE_LIMITED',
              ),
        ]),
      );

      bloc.add(const RequestPasswordRecoveryCode(email: 'user@example.com'));

      await expectation;

      await bloc.close();
    },
  );

  test(
    'recovery reset failure stays at OTP stage and exposes only error classification',
    () async {
      final gateway = _FakeRecoveryGateway();

      final bloc = PasswordRecoveryBloc(gateway: gateway);

      bloc.add(const RequestPasswordRecoveryCode(email: 'user@example.com'));

      await bloc.stream.firstWhere(
        (state) =>
            state.stage == PasswordRecoveryStage.enterCode && !state.isLoading,
      );

      gateway.failReset = true;

      final expectation = expectLater(
        bloc.stream,
        emitsInOrder([
          isA<PasswordRecoveryState>().having(
            (state) => state.isLoading,
            'loading',
            true,
          ),
          isA<PasswordRecoveryState>()
              .having((state) => state.isLoading, 'loading', false)
              .having(
                (state) => state.stage,
                'stage',
                PasswordRecoveryStage.enterCode,
              )
              .having(
                (state) => state.errorCode,
                'errorCode',
                'PASSWORD_RECOVERY_INVALID',
              )
              .having((state) => state.completed, 'completed', false),
        ]),
      );

      bloc.add(
        const SubmitPasswordRecoveryReset(
          email: 'user@example.com',
          code: '00000000',
          newPassword: 'StrongRecoveryPassword2026',
          confirmPassword: 'StrongRecoveryPassword2026',
        ),
      );

      await expectation;

      await bloc.close();
    },
  );

  test(
    'recovery UI reuses validators and constrains OTP to eight numeric digits',
    () {
      final source = _source('lib/screens/forgot_password_screen.dart');

      expect(
        RegExp(r'validator\s*:\s*Validators\.email').hasMatch(source),
        isTrue,
      );

      expect(
        RegExp(r'validator\s*:\s*Validators\.password').hasMatch(source),
        isTrue,
      );

      expect(source, contains('FilteringTextInputFormatter.digitsOnly'));

      expect(
        RegExp(
          r'LengthLimitingTextInputFormatter\s*\(\s*8\s*\)',
        ).hasMatch(source),
        isTrue,
      );

      expect(source, contains(r"r'^\d{8}$'"));

      expect(source, isNot(contains('LoginEvent(')));

      expect(source, isNot(contains('AuthBloc')));
    },
  );

  test(
    'login exposes forgot-password navigation and restores recovered email',
    () {
      final source = _source('lib/screens/login_screen.dart');

      expect(source, contains('forgotPasswordButton'));

      expect(source, contains("'forgot_password'"));

      expect(source, contains('ForgotPasswordScreen('));

      expect(source, contains('if (_isLogin)'));

      expect(
        RegExp(
          r'_emailController\.text\s*=\s*recoveredEmail\s*;',
        ).hasMatch(source),
        isTrue,
      );
    },
  );

  test(
    'recovery wording is non-enumerating and successful reset returns to normal login',
    () {
      final localization = _source('lib/services/localization_service.dart');

      final screen = _source('lib/screens/forgot_password_screen.dart');

      for (final key in [
        'forgot_password',
        'password_recovery',
        'recovery_code_generic_notice',
        'recovery_invalid',
        'recovery_rate_limited',
        'recovery_unavailable',
        'recovery_reset_success',
      ]) {
        expect(localization, contains("'$key'"));
      }

      expect(
        localization,
        contains('If an eligible account exists for this email'),
      );

      expect(
        RegExp(
          r'Navigator\.of\s*\(\s*context\s*\)'
          r'\s*\.pop\s*\(\s*state\.email\s*\)\s*;',
        ).hasMatch(screen),
        isTrue,
      );

      expect(screen, isNot(contains('AuthSuccess')));

      expect(screen, isNot(contains('writeToken')));

      expect(screen, isNot(contains('_selectedRole')));
    },
  );
}
