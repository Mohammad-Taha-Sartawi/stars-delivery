import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../bloc/password_recovery/password_recovery_bloc.dart';
import '../bloc/password_recovery/password_recovery_event.dart';
import '../bloc/password_recovery/password_recovery_state.dart';
import '../services/localization_service.dart';
import '../services/validators.dart';
import '../widgets/ui/app_button_loading_indicator.dart';
import '../widgets/ui/app_feedback.dart';

class ForgotPasswordScreen extends StatelessWidget {
  final String initialEmail;

  const ForgotPasswordScreen({super.key, this.initialEmail = ''});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => PasswordRecoveryBloc(),
      child: _ForgotPasswordView(initialEmail: initialEmail),
    );
  }
}

class _ForgotPasswordView extends StatefulWidget {
  final String initialEmail;

  const _ForgotPasswordView({required this.initialEmail});

  @override
  State<_ForgotPasswordView> createState() => _ForgotPasswordViewState();
}

class _ForgotPasswordViewState extends State<_ForgotPasswordView> {
  final _formKey = GlobalKey<FormState>();

  final _emailController = TextEditingController();

  final _codeController = TextEditingController();

  final _passwordController = TextEditingController();

  final _confirmPasswordController = TextEditingController();

  @override
  void initState() {
    super.initState();

    _emailController.text = widget.initialEmail.trim();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();

    super.dispose();
  }

  String _errorMessage(BuildContext context, PasswordRecoveryState state) {
    switch (state.errorCode) {
      case 'PASSWORD_RECOVERY_INVALID':
        return AppLocalization.get(context, 'recovery_invalid');

      case 'PASSWORD_RECOVERY_RATE_LIMITED':
        return AppLocalization.get(context, 'recovery_rate_limited');

      case 'PASSWORD_RECOVERY_UNAVAILABLE':
        return AppLocalization.get(context, 'recovery_unavailable');

      case 'PASSWORD_CONFIRMATION_MISMATCH':
        return AppLocalization.get(context, 'password_mismatch');

      case 'PASSWORD_POLICY':
        return AppLocalization.get(context, 'min_password');

      default:
        return AppLocalization.get(context, 'recovery_failed');
    }
  }

  void _requestCode(BuildContext context) {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    context.read<PasswordRecoveryBloc>().add(
      RequestPasswordRecoveryCode(email: _emailController.text),
    );
  }

  void _resetPassword(BuildContext context, String email) {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    context.read<PasswordRecoveryBloc>().add(
      SubmitPasswordRecoveryReset(
        email: email,
        code: _codeController.text,
        newPassword: _passwordController.text,
        confirmPassword: _confirmPasswordController.text,
      ),
    );
  }

  void _restart(BuildContext context) {
    _codeController.clear();
    _passwordController.clear();
    _confirmPasswordController.clear();

    context.read<PasswordRecoveryBloc>().add(const RestartPasswordRecovery());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalization.get(context, 'password_recovery')),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: BlocConsumer<PasswordRecoveryBloc, PasswordRecoveryState>(
                listener: (context, state) {
                  if (state.errorCode != null || state.errorMessage != null) {
                    AppFeedback.error(context, _errorMessage(context, state));
                  }

                  if (state.completed) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          AppLocalization.get(
                            context,
                            'recovery_reset_success',
                          ),
                        ),
                      ),
                    );

                    Navigator.of(context).pop(state.email);
                  }
                },
                builder: (context, state) {
                  return Form(
                    key: _formKey,
                    child: AutofillGroup(
                      child: state.stage == PasswordRecoveryStage.requestEmail
                          ? _buildEmailStep(context, state)
                          : _buildResetStep(context, state),
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEmailStep(BuildContext context, PasswordRecoveryState state) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Icon(
          Icons.lock_reset,
          size: 72,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(height: 24),
        Text(
          AppLocalization.get(context, 'password_recovery'),
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        Text(
          AppLocalization.get(context, 'recovery_email_instructions'),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 28),
        TextFormField(
          key: const Key('recoveryEmailField'),
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          textDirection: TextDirection.ltr,
          autofillHints: const [AutofillHints.email],
          decoration: InputDecoration(
            labelText: AppLocalization.get(context, 'email'),
            prefixIcon: const Icon(Icons.email_outlined),
            border: const OutlineInputBorder(),
          ),
          validator: Validators.email,
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          key: const Key('sendRecoveryCodeButton'),
          onPressed: state.isLoading ? null : () => _requestCode(context),
          child: state.isLoading
              ? const AppButtonLoadingIndicator()
              : Text(AppLocalization.get(context, 'send_recovery_code')),
        ),
      ],
    );
  }

  Widget _buildResetStep(BuildContext context, PasswordRecoveryState state) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Icon(
          Icons.mark_email_read_outlined,
          size: 72,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(height: 20),
        Text(
          AppLocalization.get(context, 'recovery_code_generic_notice'),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          state.email,
          textAlign: TextAlign.center,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 28),
        TextFormField(
          key: const Key('recoveryCodeField'),
          controller: _codeController,
          keyboardType: TextInputType.number,
          autofillHints: const [AutofillHints.oneTimeCode],
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(8),
          ],
          decoration: InputDecoration(
            labelText: AppLocalization.get(context, 'recovery_code'),
            prefixIcon: const Icon(Icons.pin_outlined),
            border: const OutlineInputBorder(),
          ),
          validator: (value) {
            final code = value?.trim() ?? '';

            if (!RegExp(r'^\d{8}$').hasMatch(code)) {
              return AppLocalization.get(context, 'invalid_recovery_code');
            }

            return null;
          },
        ),
        const SizedBox(height: 16),
        TextFormField(
          key: const Key('recoveryNewPasswordField'),
          controller: _passwordController,
          obscureText: true,
          autofillHints: const [AutofillHints.newPassword],
          decoration: InputDecoration(
            labelText: AppLocalization.get(context, 'new_password'),
            prefixIcon: const Icon(Icons.lock_outline),
            border: const OutlineInputBorder(),
          ),
          validator: Validators.password,
        ),
        const SizedBox(height: 16),
        TextFormField(
          key: const Key('recoveryConfirmPasswordField'),
          controller: _confirmPasswordController,
          obscureText: true,
          autofillHints: const [AutofillHints.newPassword],
          decoration: InputDecoration(
            labelText: AppLocalization.get(context, 'confirm_password'),
            prefixIcon: const Icon(Icons.lock_outline),
            border: const OutlineInputBorder(),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return AppLocalization.get(context, 'required');
            }

            if (value != _passwordController.text) {
              return AppLocalization.get(context, 'password_mismatch');
            }

            return null;
          },
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          key: const Key('resetRecoveredPasswordButton'),
          onPressed: state.isLoading
              ? null
              : () => _resetPassword(context, state.email),
          child: state.isLoading
              ? const AppButtonLoadingIndicator()
              : Text(AppLocalization.get(context, 'reset_password')),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: state.isLoading ? null : () => _restart(context),
          child: Text(AppLocalization.get(context, 'change_recovery_email')),
        ),
      ],
    );
  }
}
