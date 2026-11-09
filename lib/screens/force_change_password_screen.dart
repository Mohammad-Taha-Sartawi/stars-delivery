import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/app/app_bloc.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/auth/auth_event.dart';
import '../bloc/provider/provider_bloc.dart';
import '../models/user_model.dart';
import '../services/api_config.dart';
import '../services/auth_service.dart';
import '../services/localization_service.dart';
import '../services/mobile_api_client.dart';
import '../services/responsive.dart';
import '../services/theme_service.dart';
import '../services/validators.dart';
import '../widgets/ui/app_button_loading_indicator.dart';
import '../widgets/ui/app_feedback.dart';
import 'home_screen.dart';
import 'provider_home_screen.dart';

class ForceChangePasswordScreen extends StatefulWidget {
  final UserModel user;
  final String token;

  const ForceChangePasswordScreen({
    super.key,
    required this.user,
    required this.token,
  });

  @override
  State<ForceChangePasswordScreen> createState() =>
      _ForceChangePasswordScreenState();
}

class _ForceChangePasswordScreenState extends State<ForceChangePasswordScreen> {
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _submitting = false;

  @override
  void dispose() {
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting || !_formKey.currentState!.validate()) return;

    FocusScope.of(context).unfocus();
    setState(() => _submitting = true);

    try {
      final dio = MobileApiClient.create(
        baseUrl: ApiConfig.apiUrl,
        headers: {
          'Authorization': 'Bearer ${widget.token}',
          'Content-Type': 'application/json',
        },
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
      );

      final response = await dio.put(
        '/users/password',
        data: {
          'currentPassword': _currentPasswordController.text,
          'newPassword': _newPasswordController.text,
          'confirmPassword': _confirmPasswordController.text,
        },
      );

      if (!mounted) return;

      final data = response.data is Map
          ? Map<String, dynamic>.from(response.data as Map)
          : <String, dynamic>{};
      var token = data['token']?.toString() ?? '';
      UserModel? updatedUser;
      if (data['user'] is Map) {
        updatedUser = UserModel.fromJson(
          Map<String, dynamic>.from(data['user'] as Map),
        );
      }

      if (token.isEmpty || updatedUser == null) {
        final loginData = await AuthService().login(
          widget.user.email,
          _newPasswordController.text,
          widget.user.role,
        );
        token = loginData['token']?.toString() ?? '';
        if (loginData['user'] is Map) {
          updatedUser = UserModel.fromJson(
            Map<String, dynamic>.from(loginData['user'] as Map),
          );
        }
      }

      if (!mounted) return;

      if (token.isEmpty || updatedUser == null) {
        throw Exception(
          AppLocalization.get(context, 'password_change_session_failed'),
        );
      }

      if (updatedUser.mustChangePassword) {
        throw Exception(
          AppLocalization.get(context, 'password_change_session_failed'),
        );
      }

      if (!mounted) return;

      context.read<AuthBloc>().add(
        SessionUpdatedEvent(user: updatedUser, token: token),
      );
      AppFeedback.success(
        context,
        AppLocalization.get(context, 'password_changed_success'),
      );
      _openHome(updatedUser, token);
    } on DioException catch (error) {
      if (!mounted) return;
      final data = error.response?.data;
      final code = data is Map ? data['code']?.toString() : null;
      final message = code == 'CURRENT_PASSWORD_INVALID'
          ? AppLocalization.get(context, 'current_password_invalid')
          : (data is Map ? data['error'] ?? data['message'] : null)
                    ?.toString() ??
                error.message ??
                AppLocalization.get(context, 'password_change_failed');
      AppFeedback.error(context, message);
    } catch (error) {
      if (!mounted) return;
      AppFeedback.error(
        context,
        error.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  void _openHome(UserModel user, String token) {
    final home = user.role == 'provider'
        ? BlocProvider(
            create: (_) => ProviderBloc(),
            child: ProviderHomeScreen(user: user, token: token),
          )
        : HomeScreen(user: user, role: user.role, token: token);

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => home),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';
    final scheme = Theme.of(context).colorScheme;

    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) {
            AppFeedback.warning(
              context,
              AppLocalization.get(context, 'forced_password_cannot_leave'),
            );
          }
        },
        child: Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: false,
            centerTitle: true,
            title: Text(AppLocalization.get(context, 'forced_password_title')),
          ),
          body: SafeArea(
            top: false,
            child: Center(
              child: SingleChildScrollView(
                padding: Responsive.pageInsets(context),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Icon(
                          Icons.lock_reset_outlined,
                          size: 64,
                          color: scheme.primary,
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        Text(
                          AppLocalization.get(context, 'forced_password_title'),
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineSmall
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          AppLocalization.get(context, 'forced_password_body'),
                          textAlign: TextAlign.center,
                          style: TextStyle(color: scheme.onSurfaceVariant),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          AppLocalization.get(context, 'forced_password_hint'),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: scheme.onSurfaceVariant,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          widget.user.email,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: scheme.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xl),
                        TextFormField(
                          controller: _currentPasswordController,
                          obscureText: true,
                          autocorrect: false,
                          enableSuggestions: false,
                          textInputAction: TextInputAction.next,
                          decoration: InputDecoration(
                            labelText: AppLocalization.get(
                              context,
                              'current_password',
                            ),
                            border: const OutlineInputBorder(),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return AppLocalization.get(context, 'required');
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: AppSpacing.md),
                        TextFormField(
                          controller: _newPasswordController,
                          obscureText: true,
                          autocorrect: false,
                          enableSuggestions: false,
                          textInputAction: TextInputAction.next,
                          decoration: InputDecoration(
                            labelText: AppLocalization.get(
                              context,
                              'new_password',
                            ),
                            border: const OutlineInputBorder(),
                          ),
                          validator: (value) {
                            return Validators.password(value ?? '');
                          },
                        ),
                        const SizedBox(height: AppSpacing.md),
                        TextFormField(
                          controller: _confirmPasswordController,
                          obscureText: true,
                          autocorrect: false,
                          enableSuggestions: false,
                          textInputAction: TextInputAction.done,
                          onFieldSubmitted: (_) => _submit(),
                          decoration: InputDecoration(
                            labelText: AppLocalization.get(
                              context,
                              'confirm_password',
                            ),
                            border: const OutlineInputBorder(),
                          ),
                          validator: (value) {
                            if ((value ?? '') != _newPasswordController.text) {
                              return AppLocalization.get(
                                context,
                                'password_mismatch',
                              );
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: AppSpacing.xl),
                        ElevatedButton(
                          onPressed: _submitting ? null : _submit,
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: _submitting
                              ? const AppButtonLoadingIndicator()
                              : Text(
                                  AppLocalization.get(
                                    context,
                                    'change_password',
                                  ),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
