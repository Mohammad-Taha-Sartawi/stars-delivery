import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/auth/auth_event.dart';
import '../bloc/auth/auth_state.dart';
import '../bloc/app/app_bloc.dart';
import '../bloc/app/app_event.dart';
import '../bloc/provider/provider_bloc.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../services/auth_service.dart';
import '../services/validators.dart';
import '../services/api_config.dart';
import '../services/mobile_api_client.dart';
import '../services/theme_service.dart';
import '../widgets/ui/app_button_loading_indicator.dart';
import '../widgets/ui/app_feedback.dart';
import 'home_screen.dart';
import 'provider_home_screen.dart';
import 'forgot_password_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  final _providerDocumentPicker = ImagePicker();

  ProviderRegistrationDocument? _driverLicenseDocument;
  final Set<String> _serviceTypes = {'product', 'people', 'goods'};

  bool _isLogin = true;
  String _selectedRole = 'customer';
  List<String> _areas = [];
  List<String> _areasAr = []; // Always Arabic for saving
  static const _areaEnToAr = {
    'Jerusalem (Quds)': 'القدس',
    'Ramallah': 'رام الله والبيرة',
    'Hebron': 'الخليل',
    'Nablus': 'نابلس',
    'Bethlehem': 'بيت لحم',
    'Jericho': 'أريحا',
    'Salfit': 'سلفيت',
    'Jenin': 'جنين',
    'Tulkarm': 'طولكرم',
    'Qalqilya': 'قلقيلية',
    'Tubas': 'طوباس',
    'Gaza': 'غزة',
    'Khan Yunis': 'خان يونس',
    'Rafah': 'رفح',
    'Deir El Balah': 'دير البلح',
    'North Gaza': 'شمال غزة',
    'Haifa': 'حيفا',
    'Acre': 'عكا',
    'Nazareth': 'الناصرة',
    'Jaffa': 'يافا',
  };

  // Ensure all keys are trimmed for matching
  static final _areaEnToArTrimmed = {
    for (var k in _areaEnToAr.keys) k.trim(): _areaEnToAr[k]!,
  };

  String _areaLabel(String enName, bool isAr) {
    if (isAr) {
      return _areaEnToArTrimmed[enName.trim()] ??
          enName.replaceFirst(' (Quds)', '').trim();
    }
    return enName.replaceFirst(' (Quds)', '').trim();
  }

  String? _selectedArea;

  @override
  void initState() {
    super.initState();
    _loadAreas();
  }

  Future<void> _loadAreas() async {
    try {
      final json = await rootBundle.loadString(
        'assets/countries+states+cities.json',
      );
      final list = jsonDecode(json) as List;
      final palestine = list.cast<Map<String, dynamic>>().firstWhere(
        (c) => c['iso2'] == 'PS',
      );
      final states = palestine['states'] as List;
      final names = states
          .cast<Map<String, dynamic>>()
          .map((s) => s['name'].toString())
          .toList();
      // Add interior/cross-area cities not in the JSON
      final allNames = [...names, 'Haifa', 'Acre', 'Nazareth', 'Jaffa'];
      setState(() {
        _areas = allNames;
        _areasAr = allNames
            .map((n) => _areaEnToArTrimmed[n.trim()] ?? n.trim())
            .toList();
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';
    final isMobile = Responsive.isMobile(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: Responsive.pageInsets(context),
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                maxWidth: Responsive.maxAuthWidth,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildLanguageBar(context, isAr),
                  SizedBox(height: isMobile ? AppSpacing.xl : AppSpacing.lg),
                  _buildBrandHeader(context),
                  const SizedBox(height: AppSpacing.xl),
                  _buildRoleSelection(context),
                  const SizedBox(height: AppSpacing.xl),
                  _buildFormCard(context),
                  const SizedBox(height: AppSpacing.xxl),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLanguageBar(BuildContext context, bool isAr) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Tooltip(
          message: AppLocalization.get(context, 'language'),
          child: TextButton.icon(
            onPressed: () => context.read<AppBloc>().add(ToggleLocale()),
            icon: const Icon(Icons.translate, size: AppSizes.iconSm),
            label: Text(
              isAr ? 'EN' : 'ع',
              style: Theme.of(context).textTheme.labelLarge,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBrandHeader(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Column(
      children: [
        Container(
          width: 88,
          height: 88,
          decoration: BoxDecoration(
            color: scheme.primaryContainer,
            shape: BoxShape.circle,
            border: Border.all(
              color: scheme.secondary.withValues(alpha: 0.42),
              width: 1.5,
            ),
          ),
          child: Icon(
            Icons.local_shipping_outlined,
            size: 44,
            color: scheme.onPrimaryContainer,
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          AppLocalization.get(context, 'stars_delivery'),
          style: theme.textTheme.headlineLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          _isLogin
              ? AppLocalization.get(context, 'welcome_back')
              : AppLocalization.get(context, 'create_account_hint'),
          style: theme.textTheme.bodyLarge?.copyWith(
            color: scheme.onSurfaceVariant,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildRoleSelection(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _RoleCard(
            icon: Icons.person_outline,
            title: AppLocalization.get(context, 'customer'),
            subtitle: AppLocalization.get(context, 'customer_subtitle'),
            isSelected: _selectedRole == 'customer',
            onTap: () => _selectRole('customer'),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: _RoleCard(
            icon: Icons.delivery_dining_outlined,
            title: AppLocalization.get(context, 'provider'),
            subtitle: AppLocalization.get(context, 'provider_subtitle'),
            isSelected: _selectedRole == 'provider',
            onTap: () => _selectRole('provider'),
          ),
        ),
      ],
    );
  }

  Widget _buildFormCard(BuildContext context) {
    final theme = Theme.of(context);
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';

    return Card(
      child: Padding(
        padding: const EdgeInsetsDirectional.all(AppSpacing.xl),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (!_isLogin) ...[
                TextFormField(
                  controller: _nameController,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.name],
                  decoration: _inputDecoration(
                    AppLocalization.get(context, 'full_name'),
                    Icons.person_outline,
                  ),
                  validator: (v) => v == null || v.trim().isEmpty
                      ? AppLocalization.get(context, 'required')
                      : null,
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  decoration: _inputDecoration(
                    AppLocalization.get(context, 'phone_number'),
                    Icons.phone_outlined,
                  ),
                  validator: (v) => v == null || v.trim().isEmpty
                      ? AppLocalization.get(context, 'required')
                      : null,
                ),
                const SizedBox(height: AppSpacing.md),
                DropdownButtonFormField<String>(
                  initialValue: _selectedArea,
                  decoration: _inputDecoration(
                    AppLocalization.get(context, 'area_region'),
                    Icons.location_on_outlined,
                  ),
                  items: _areas
                      .asMap()
                      .entries
                      .map(
                        (e) => DropdownMenuItem(
                          value: _areasAr[e.key],
                          child: Text(_areaLabel(e.value, isAr)),
                        ),
                      )
                      .toList(),
                  onChanged: (v) => setState(() => _selectedArea = v),
                  validator: (v) => v == null
                      ? AppLocalization.get(context, 'required')
                      : null,
                ),
                const SizedBox(height: AppSpacing.lg),
                if (_selectedRole == 'provider') ...[
                  Text(
                    AppLocalization.get(context, 'service_types'),
                    style: theme.textTheme.titleSmall,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: ['product', 'people', 'goods']
                        .map(
                          (type) => FilterChip(
                            label: Text(AppLocalization.get(context, type)),
                            selected: _serviceTypes.contains(type),
                            onSelected: (selected) {
                              setState(() {
                                if (selected) {
                                  _serviceTypes.add(type);
                                } else {
                                  _serviceTypes.remove(type);
                                }
                              });
                            },
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    AppLocalization.get(context, 'provider_documents_title'),
                    style: theme.textTheme.titleSmall,
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    AppLocalization.get(context, 'provider_documents_hint'),
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _providerDocumentButton(
                    key: const Key('driverLicenseDocumentPicker'),
                    labelKey: 'driver_license_document',
                    document: _driverLicenseDocument,
                    onPressed: _pickProviderDocument,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
              ],
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                decoration: _inputDecoration(
                  AppLocalization.get(context, 'email'),
                  Icons.email_outlined,
                ),
                validator: (v) => v == null || v.trim().isEmpty
                    ? AppLocalization.get(context, 'required')
                    : null,
              ),
              const SizedBox(height: AppSpacing.md),
              TextFormField(
                controller: _passwordController,
                obscureText: true,
                textInputAction: _isLogin
                    ? TextInputAction.done
                    : TextInputAction.next,
                autofillHints: [
                  _isLogin ? AutofillHints.password : AutofillHints.newPassword,
                ],
                decoration: _inputDecoration(
                  AppLocalization.get(context, 'password'),
                  Icons.lock_outline,
                ),
                validator: (v) {
                  if (v == null || v.isEmpty) {
                    return AppLocalization.get(context, 'required');
                  }

                  if (!_isLogin) {
                    final passwordError = Validators.password(v);

                    if (passwordError != null) {
                      return passwordError;
                    }
                  }

                  return null;
                },
              ),
              if (_isLogin)
                Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: TextButton(
                    key: const Key('forgotPasswordButton'),
                    onPressed: _openPasswordRecovery,
                    child: Text(
                      AppLocalization.get(context, 'forgot_password'),
                    ),
                  ),
                ),
              if (!_isLogin) ...[
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _confirmPasswordController,
                  obscureText: true,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: _inputDecoration(
                    AppLocalization.get(context, 'confirm_password'),
                    Icons.lock_outline,
                  ),
                  validator: (v) {
                    if (v == null || v.isEmpty) {
                      return AppLocalization.get(context, 'required');
                    }
                    if (v != _passwordController.text) {
                      return AppLocalization.get(context, 'password_mismatch');
                    }
                    return null;
                  },
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              BlocConsumer<AuthBloc, AuthState>(
                listener: (context, state) {
                  if (state is AuthSuccess) {
                    final home = state.user.role == 'provider'
                        ? BlocProvider(
                            create: (_) => ProviderBloc(),
                            child: ProviderHomeScreen(
                              user: state.user,
                              token: state.token,
                            ),
                          )
                        : HomeScreen(
                            user: state.user,
                            role: state.user.role,
                            token: state.token,
                          );
                    Navigator.pushReplacement(
                      context,
                      MaterialPageRoute(builder: (_) => home),
                    );
                  }
                  if (state is AuthError) {
                    AppFeedback.error(context, state.message);
                  }
                },
                builder: (context, state) {
                  final isLoading = state is AuthLoading;
                  return ElevatedButton(
                    onPressed: isLoading ? null : _submit,
                    child: isLoading
                        // Disabled button paints onSurface@12% over the card,
                        // so onPrimary would disappear; onSurface keeps the
                        // indicator legible in both themes (UX01-001).
                        ? const AppButtonLoadingIndicator()
                        : Text(
                            _isLogin
                                ? AppLocalization.get(context, 'sign_in')
                                : AppLocalization.get(
                                    context,
                                    'create_account',
                                  ),
                          ),
                  );
                },
              ),
              const SizedBox(height: AppSpacing.sm),
              TextButton(
                onPressed: _toggleAuthMode,
                child: RichText(
                  textAlign: TextAlign.center,
                  text: TextSpan(
                    style: theme.textTheme.bodyMedium,
                    children: [
                      TextSpan(
                        text: _isLogin
                            ? AppLocalization.get(context, 'no_account')
                            : AppLocalization.get(context, 'have_account'),
                      ),
                      TextSpan(
                        text: _isLogin
                            ? AppLocalization.get(context, 'sign_up')
                            : AppLocalization.get(context, 'sign_in'),
                        style: TextStyle(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              TextButton.icon(
                onPressed: _showContactDialog,
                icon: Icon(
                  Icons.headset_mic_outlined,
                  size: AppSizes.iconSm,
                  color: theme.colorScheme.secondary,
                ),
                label: Text(
                  AppLocalization.get(context, 'contact_support'),
                  style: TextStyle(color: theme.colorScheme.secondary),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String get selectedRole => _selectedRole;

  InputDecoration _inputDecoration(String label, IconData icon) {
    return InputDecoration(labelText: label, prefixIcon: Icon(icon));
  }

  Future<void> _openPasswordRecovery() async {
    final recoveredEmail = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) =>
            ForgotPasswordScreen(initialEmail: _emailController.text.trim()),
      ),
    );

    if (!mounted || recoveredEmail == null) {
      return;
    }

    _emailController.text = recoveredEmail;
  }

  void _showContactDialog() {
    final nameCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    final msgCtrl = TextEditingController();
    final formKey = GlobalKey<FormState>();
    bool sending = false;

    showDialog(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final theme = Theme.of(ctx);
          final scheme = theme.colorScheme;

          return AlertDialog(
            title: Row(
              children: [
                Icon(Icons.headset_mic_outlined, color: scheme.secondary),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    AppLocalization.get(ctx, 'support_contact_title'),
                  ),
                ),
              ],
            ),
            content: Form(
              key: formKey,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextFormField(
                      controller: nameCtrl,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.name],
                      decoration: InputDecoration(
                        labelText: AppLocalization.get(ctx, 'name_field'),
                      ),
                      validator: (v) => v == null || v.trim().isEmpty
                          ? AppLocalization.get(ctx, 'required')
                          : null,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextFormField(
                      controller: emailCtrl,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.email],
                      decoration: InputDecoration(
                        labelText: AppLocalization.get(ctx, 'email_field'),
                      ),
                      validator: (v) => v == null || v.trim().isEmpty
                          ? AppLocalization.get(ctx, 'required')
                          : null,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextFormField(
                      controller: phoneCtrl,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      decoration: InputDecoration(
                        labelText: AppLocalization.get(ctx, 'phone_field'),
                      ),
                      validator: (v) => v == null || v.trim().isEmpty
                          ? AppLocalization.get(ctx, 'required')
                          : null,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextFormField(
                      controller: msgCtrl,
                      maxLines: 3,
                      decoration: InputDecoration(
                        labelText: AppLocalization.get(ctx, 'message_field'),
                        hintText: AppLocalization.get(ctx, 'message_hint'),
                      ),
                      validator: (v) => v == null || v.trim().isEmpty
                          ? AppLocalization.get(ctx, 'required')
                          : null,
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: sending ? null : () => Navigator.pop(ctx),
                child: Text(AppLocalization.get(ctx, 'cancel')),
              ),
              ElevatedButton(
                onPressed: sending
                    ? null
                    : () async {
                        if (!formKey.currentState!.validate()) {
                          return;
                        }

                        setDialogState(() => sending = true);

                        try {
                          final dio = MobileApiClient.create(
                            baseUrl: ApiConfig.apiUrl,
                            connectTimeout: const Duration(seconds: 8),
                          );
                          await dio.post(
                            '/chat/contact',
                            data: {
                              'name': nameCtrl.text.trim(),
                              'email': emailCtrl.text.trim(),
                              'phone': phoneCtrl.text.trim(),
                              'text': msgCtrl.text.trim(),
                            },
                          );

                          if (!ctx.mounted) {
                            return;
                          }
                          Navigator.pop(ctx);
                          if (mounted) {
                            AppFeedback.success(
                              context,
                              AppLocalization.get(context, 'contact_success'),
                            );
                          }
                        } catch (_) {
                          if (!ctx.mounted) {
                            return;
                          }
                          setDialogState(() => sending = false);
                          if (mounted) {
                            AppFeedback.error(
                              context,
                              AppLocalization.get(context, 'contact_failed'),
                            );
                          }
                        }
                      },
                child: sending
                    // Same disabled-button pattern as the submit button; onSurface
                    // stays visible against the disabled background (UX01-001).
                    ? const AppButtonLoadingIndicator()
                    : Text(AppLocalization.get(ctx, 'send')),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _providerDocumentButton({
    required Key key,
    required String labelKey,
    required ProviderRegistrationDocument? document,
    required VoidCallback onPressed,
  }) {
    final selected = document != null;

    return OutlinedButton(
      key: key,
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        alignment: AlignmentDirectional.centerStart,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      ),
      child: Row(
        children: [
          Icon(
            selected
                ? Icons.verified_outlined
                : Icons.add_photo_alternate_outlined,
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(AppLocalization.get(context, labelKey))),
          Text(
            AppLocalization.get(
              context,
              selected ? 'replace_image' : 'choose_image',
            ),
          ),
        ],
      ),
    );
  }

  void _selectRole(String role) {
    if (_selectedRole == role) {
      return;
    }

    setState(() {
      _selectedRole = role;

      if (role != 'provider') {
        _driverLicenseDocument = null;
      }
    });
  }

  void _toggleAuthMode() {
    setState(() {
      _isLogin = !_isLogin;

      if (_isLogin) {
        _driverLicenseDocument = null;
      }
    });

    context.read<AuthBloc>().add(ToggleAuthModeEvent(isLogin: _isLogin));
  }

  Future<void> _pickProviderDocument() async {
    try {
      final picked = await _providerDocumentPicker.pickImage(
        source: ImageSource.gallery,
        requestFullMetadata: false,
      );

      if (picked == null) {
        return;
      }

      final document = await ProviderRegistrationDocument.fromXFile(
        picked,
        safeBaseName: 'driver-license',
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _driverLicenseDocument = document;
      });
    } on ProviderDocumentValidationException catch (error) {
      if (!mounted) {
        return;
      }

      final key = switch (error.failure) {
        ProviderDocumentValidationFailure.empty => 'provider_document_empty',
        ProviderDocumentValidationFailure.tooLarge =>
          'provider_document_too_large',
        ProviderDocumentValidationFailure.unsupportedType =>
          'provider_document_unsupported',
      };

      AppFeedback.error(context, AppLocalization.get(context, key));
    } catch (_) {
      if (!mounted) {
        return;
      }

      AppFeedback.error(
        context,
        AppLocalization.get(context, 'provider_document_pick_failed'),
      );
    }
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;

    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (_isLogin) {
      context.read<AuthBloc>().add(
        LoginEvent(email: email, password: password, role: _selectedRole),
      );
    } else {
      // Check password match
      if (_confirmPasswordController.text != password) {
        AppFeedback.error(
          context,
          AppLocalization.get(context, 'password_mismatch'),
        );
        return;
      }

      if (_selectedRole == 'provider' && _serviceTypes.isEmpty) {
        AppFeedback.error(
          context,
          AppLocalization.get(context, 'service_type_required'),
        );

        return;
      }

      if (_selectedRole == 'provider' && _driverLicenseDocument == null) {
        AppFeedback.error(
          context,
          AppLocalization.get(context, 'provider_documents_required'),
        );

        return;
      }

      _showTermsOfService();
    }
  }

  void _showTermsOfService() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: Text(
          // Title is ordinary UI: localize it. The body below is the
          // approved Arabic-only legal document (see report UX01-003 policy).
          AppLocalization.get(context, 'legal_terms_title'),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        content: SingleChildScrollView(
          child: Text(
            'الوثيقة الأولى: شروط الخدمة\n\nإصدار: 1.0\nتاريخ السريان: 1 يوليو 2026\n\nالباب الأول: تعريفات وأحكام تمهيدية\n\nالبند 1: تعريف الأطراف والخدمة\n· المنصة/الشركة: الجهة المالكة للتطبيق (يُشار إليها بـ "نحن" أو "المنصة").\n· المستخدم: كل شخص طبيعي يسجل في التطبيق (سائقاً كان أو عميلاً).\n· الخدمة: منصة وسيطة إلكترونية تربط بين طالب التوصيل (عميل) ومقدم التوصيل (سائق).\n· العلاقة: المنصة ليست شركة توصيل، ولا طرفاً في عقد النقل، دورنا تقني حصري.\n\nالبند 2: شروط التسجيل والقبول\n· التسجيل متاح للأفراد الذين أتمّوا 12 سنة فما فوق.\n· يجب تقديم بيانات صحيحة وكاملة.\n· نحتفظ بحق رفض أو إلغاء أي حساب دون إبداء أسباب، خاصة في حال ثبوت احتيال أو مخالفة سابقة.\n\nالبند 2-أ: مسؤولية ولي الأمر عن القاصرين (دون 18 سنة)\nنظراً لأن التطبيق يسمح بالتسجيل للأفراد الذين أتموا 12 سنة فما فوق، يُقر ولي الأمر بموافقته الضمنية على تسجيل القاصر واستخدامه للتطبيق، ويتحمل المسؤولية الكاملة عنه وفق البنود التالية:\n\nأولاً: تعريف القاصر وولي الأمر:\n· القاصر: كل مستخدم لم يبلغ سن الـ 18 سنة ميلادية كاملة وقت التسجيل.\n· ولي الأمر: الأب، الأم، أو الوصي القانوني المعترف به رسمياً.\n\nثانياً: مسؤوليات ولي الأمر:\n1. الإشراف المباشر: مراقبة استخدام القاصر للتطبيق.\n2. الالتزامات المالية: يتحمل ولي الأمر كامل المسؤولية عن أي التزامات مالية تترتب على القاصر.\n3. المخالفات والغرامات: يتحمل ولي الأمر مسؤولية أي مخالفات يرتكبها القاصر.\n4. التعويضات: يلتزم ولي الأمر بتعويض المنصة عن أي أضرار تنشأ عن أفعال القاصر.\n5. حماية بيانات القاصر: يوافق ولي الأمر على جمع ومعالجة بيانات القاصر.\n\nثالثاً: التزامات القاصر: يبقى القاصر ملزماً شخصياً باحترام شروط الخدمة.\n\nالبند 2-ب: المسؤولية الجنائية للقاصرين\nالقاصر وولي الأمر يتحملان المسؤولية عن أي جرائم إلكترونية يرتكبها القاصر.\nنحتفظ بحق إبلاغ الجهات الرسمية فوراً مع تزويدهم بجميع الأدلة المتوفرة.\n\nالبند 3: التزامات السائق\n· تقديم هوية ورخصة قيادة سارية.\n· الحصول على تأمين شامل يغطي حوادث الطريق وتلف المنتجات.\n· الالتزام بالمواعيد وحماية المنتجات من التلف.\n\nالبند 3-أ: مسؤولية السائق عن المنتجات القابلة للتلف\n· استخدام حقيبة عازلة للحرارة أو صندوق تبريد.\n· إيصال الطلب خلال المدة الزمنية المحددة.\n· في حال ثبوت تلف المنتج: يُخصم كامل قيمة المنتج مع غرامة 20%.\n· إثبات التسليم: تصوير الطلب فور تسليمه.\n\nالبند 3-ب: المخالفات المرورية والغرامات\nالسائق هو المسؤول القانوني الوحيد عن أي مخالفات مرورية أو غرامات أو حوادث.\n\nالبند 4: التزامات العميل\n· توفير عنوان دقيق ورقم هاتف صحيح.\n· استلام المنتج في الوقت والمكان المحددين.\n· الدفع نقداً عند الاستلام.\n\nالبند 5: سياسة الإلغاء والاسترجاع\n· يحق للعميل الإلغاء قبل بدء التنفيذ.\n\nالباب الثالث: البنود الحماية الإضافية\n\nالبند 6: بند "الوسيط التقني فقط"\nالمنصة ليست شركة توصيل ولا طرفاً في عقد النقل. دورنا تقني حصري.\n\nالبند 7: بند "الغرامات التأخيرية"\n· غرامة تأخير يومية 0.5% من المبلغ المستحق، بحد أقصى 20%.\n· يحق للمنصة حجب المبالغ المستقبلية وإيقاف الحساب.\n\nالبند 8: بند "القيمة المضافة والضرائب"\n· جميع الرسوم لا تشمل الضرائب ما لم يُنص صراحةً.\n· يتحمل كل طرف مسؤولية الالتزام بقوانين الضرائب في منطقته.\n\nالبند 9: بند "التعويضات والضمانات المتبادلة"\nيوافق المستخدم على تعويض المنصة عن أي خسائر تنشأ عن مخالفته لهذه الاتفاقية.\n\nالبند 10: بند "المخاطر التشغيلية والطوارئ" (Force Majeure)\nلا تتحمل المنصة مسؤولية عن تأخير أو فشل بسبب الكوارث الطبيعية، الحروب، الإضرابات، انقطاع الكهرباء.\n\nالبند 11: بند "الإخطارات وطريقة الإبلاغ الرسمية"\n· الإشعارات عبر البريد الإلكتروني hamodehussen2@gmail.com أو إشعار داخل التطبيق ملزمة بعد 24 ساعة.\n\nالبند 12: بند "أمان الحساب"\n· المستخدم مسؤول عن سرية بيانات دخوله.\n· يمنع مشاركة الحساب مع أي شخص آخر.\n\nالبند 13: بند "التقييمات والشهرة"\n· التقييمات تخضع لمراجعة المنصة وقد تُحذف إذا اعتُبرت مسيئة.\n\nالبند 14: بند "السرعة والوقت" (Time is of the Essence)\n· أي تأخير في أداء الالتزامات يُعتبر إخلالاً جوهرياً.\n· مهلة الاعتراض على أي عملية هي 48 ساعة.\n\nالباب الرابع: الأحكام القانونية والحوكمة\n\nالبند 15: الملكية الفكرية\n· جميع حقوق التطبيق والتصميم والكود ملك حصري للمنصة.\n\nالبند 16: إخلاء المسؤولية\n· التطبيق يُقدّم "كما هو" (As Is) دون أي ضمانات.\n· الحد الأقصى لتعويض المنصة هو المبلغ المدفوع كرسوم خدمة.\n\nالبند 17: إنهاء الحساب وتعليقه\n· للمنصة الحق المطلق في تعليق أو إنهاء أي حساب دون إشعار مسبق في حال المخالفة.\n· حذف الحساب: بعد طلب المستخدم + 30 يوماً تصفية.\n\nالبند 18: بند "التحكيم الإلزامي"\n· أي نزاع يُحال إلى التحكيم الإلزامي وفقاً لقواعد غرفة التجارة والصناعة في فلسطين.\n· مقر التحكيم: مدينة سلفيت. لغة التحكيم: العربية.\n\nالبند 19: القانون الحاكم والنزاعات\n· تخضع هذه الاتفاقية لقوانين فلسطين.\n· المحاكم المختصة: المحاكم النظامية في مدينة سلفيت.\n\nالبند 20: التعديلات على الشروط\n· نحتفظ بحق تعديل هذه الشروط مع إشعار قبل 15 يوماً.\n\nالبند 21: جهات الاتصال الرسمية\n· البريد الإلكتروني الرسمي: hamodehussen2@gmail.com\n\nالبند 22: بند "الإقرار المطلق والنهائي"\nيُقر المستخدم بأنه قرأ وفهم جميع بنود هذه الاتفاقية بكاملها.\n\nالبند 23: بند "التنازل عن المقاصة"\n· ليس للمستخدم حق خصم أي مبالغ من المستحقات المالية للمنصة.\n\nالبند 24: بند "الضمان البنكي أو التأمين الإلزامي للسائقين"\n· كشرط لتفعيل حساب السائق: ضمان بنكي 500 دولار أو تأمين شامل.\n\nالبند 25: بند "سقوط الحقوق بالتقادم"\n· أي دعوى يجب أن تُرفع خلال 90 يوماً من تاريخ وقوع الحدث.\n\nالبند 26: بند "التحديثات التلقائية وتعديل الأسعار"\n· يحق للمنصة تحديث التطبيق تلقائياً وتعديل الرسوم مع إشعار مسبق.\n\n"أوافق على جميع الشروط والأحكام المذكورة أعلاه، وأقر بأني قرأتها وفهمتها بالكامل، وأتحمل كامل المسؤولية عن استخدامي لهذا التطبيق."',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(height: 1.5),
            textDirection: TextDirection.rtl,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _showRejectDialog();
            },
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error,
            ),
            child: Text(AppLocalization.get(context, 'decline')),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _showPrivacyPolicy();
            },
            child: Text(AppLocalization.get(context, 'agree')),
          ),
        ],
      ),
    );
  }

  void _showPrivacyPolicy() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: Text(
          // Title is ordinary UI: localize it. The body below is the
          // approved Arabic-only legal document (see report UX01-003 policy).
          AppLocalization.get(context, 'legal_privacy_title'),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        content: SingleChildScrollView(
          child: Text(
            'الوثيقة الثانية: سياسة الخصوصية\n\nإصدار: 1.0\nتاريخ السريان: 1 يوليو 2026\n\nالبند 1: البيانات التي نجمعها\n· بيانات التسجيل: البريد الإلكتروني، رقم الهاتف، العنوان، صورة الهوية للسائقين.\n· بيانات الموقع: الموقع الجغرافي أثناء استخدام التطبيق.\n· بيانات تلقائية: عنوان IP، نوع الجهاز، نظام التشغيل، إصدار التطبيق.\n· بيانات الطلبات: تفاصيل المنتجات، أوقات الطلب والتسليم، التقييمات.\n\nالبند 2: كيفية استخدام البيانات\n· إنشاء الحساب والتحقق من الهوية (خاصة للسائقين).\n· ربط الطلبات بالسائقين بناءً على الموقع.\n· تحسين أداء التطبيق وتجربة المستخدم.\n· إرسال إشعارات مهمة (تأكيد طلب، تحديث حالة التوصيل).\n· حماية المنصة من الاحتيال وسوء الاستخدام.\n· لا نستخدم بياناتك للتسويق دون موافقة صريحة.\n\nالبند 3: تخزين البيانات ومشاركتها\n· التخزين: خوادم سحابية آمنة مع تشفير أثناء النقل والسكون.\n· المشاركة الحالية: لا نشارك بياناتك مع أي جهة خارجية حالياً.\n· المشاركة المستقبلية: إذا تغير الأمر، سنطلب موافقة صريحة.\n· الالتزام القانوني: قد نكشف عن بياناتك إذا طلبت جهة رسمية بموجب قانون فلسطيني.\n\nالبند 4: حماية البيانات\n· نطبق إجراءات تقنية وتنظيمية لحماية بياناتك من الوصول غير المصرح به.\n· الوصول إلى البيانات مقتصر على الموظفين المخولين فقط.\n\nالبند 5: فترة الاحتفاظ بالبيانات\n· نحتفظ ببياناتك طالما كان حسابك نشطاً.\n· بعد طلب حذف الحساب، نحتفظ بالبيانات لمدة 30 يوماً (فترة تصفية) ثم نحذفها نهائياً، باستثناء:\n  · البيانات المطلوب الاحتفاظ بها قانونياً (مثل سجلات المعاملات المالية لمدة 5 سنوات).\n  · البيانات المجهولة المصدر للأغراض الإحصائية.\n\nالبند 6: حقوق المستخدمين\n· حق الوصول: طلب نسخة من بياناتك المخزّنة.\n· حق التصحيح: تعديل أي بيانات غير صحيحة.\n· حق الحذف: طلب حذف حسابك (لكن الحذف يتم من طرفنا بعد التحقق).\n· حق الاعتراض: الاعتراض على معالجة بياناتك.\n· لممارسة هذه الحقوق، تواصل عبر: hamodehussen2@gmail.com\n\nالبند 7: خصوصية الأطفال والرقابة الأبوية\n· التطبيق مخصص لمن هم فوق 12 سنة.\n· عند تسجيل مستخدم تحت 18 سنة: حساب خاضع للرقابة الأبوية.\n· يتحمل ولي الأمر مسؤولية متابعة نشاط القاصر.\n· إذا تبين جمع بيانات من شخص تحت 12 سنة، سنحذفها فوراً.\n\nالبند 8: ملفات تعريف الارتباط (Cookies)\n· نستخدم ملفات تعريف ارتباط أساسية لتحسين الأداء.\n\nالبند 9: الإخطارات والتحديثات الأمنية\n· سنقوم بإشعارك فوراً في حال حدوث أي خرق أمني.\n\nالبند 10: نقل البيانات عبر الحدود\n· قد تُنقل بياناتك إلى خوادم خارج فلسطين مع ضمان معايير حماية مناسبة.\n\nالبند 11: التعديلات على سياسة الخصوصية\n· سيتم إشعارك قبل 15 يوماً من أي تغيير جوهري.\n\nالبند 12: التواصل\n· للاستفسارات: hamodehussen2@gmail.com\n· نلتزم بالرد خلال 5 أيام عمل كحد أقصى.\n\n"أوافق على سياسة الخصوصية المذكورة أعلاه، وأقر بأني قرأتها وفهمتها، وأوافق على جمع ومعالجة بياناتي وفقاً لها."',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(height: 1.5),
            textDirection: TextDirection.rtl,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _showRejectDialog();
            },
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error,
            ),
            child: Text(AppLocalization.get(context, 'decline')),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _doRegister();
            },
            child: Text(AppLocalization.get(context, 'agree')),
          ),
        ],
      ),
    );
  }

  void _showRejectDialog() {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          // Ordinary UI text: localized and following the app direction.
          // Only the Arabic legal document bodies above keep static RTL.
          AppLocalization.get(dialogContext, 'reject_terms_title'),
          style: Theme.of(dialogContext).textTheme.titleLarge,
        ),
        content: Text(
          AppLocalization.get(dialogContext, 'reject_terms_body'),
          style: Theme.of(
            dialogContext,
          ).textTheme.bodyMedium?.copyWith(height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(AppLocalization.get(dialogContext, 'ok')),
          ),
        ],
      ),
    );
  }

  void _doRegister() {
    final email = _emailController.text.trim();

    final password = _passwordController.text;

    final driverLicenseDocument = _driverLicenseDocument;

    context.read<AuthBloc>().add(
      RegisterEvent(
        fullName: _nameController.text.trim(),
        email: email,
        phone: _phoneController.text.trim(),
        password: password,
        role: _selectedRole,
        area: _selectedArea ?? '',
        serviceTypes: _serviceTypes.toList(),
        driverLicenseDocument: driverLicenseDocument,
      ),
    );

    // Drop the screen's references immediately after
    // handing the immutable in-memory values to BLoC.
    // A failed provider submission requires re-selection
    // rather than retaining sensitive verification bytes.
    if (_selectedRole == 'provider') {
      setState(() {
        _driverLicenseDocument = null;
      });
    }
  }
}

class _RoleCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool isSelected;
  final VoidCallback onTap;

  const _RoleCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final background = isSelected
        ? scheme.secondaryContainer
        : scheme.surfaceContainerLow;
    final foreground = isSelected
        ? scheme.onSecondaryContainer
        : scheme.onSurface;
    final subtitleColor = isSelected
        ? scheme.onSecondaryContainer.withValues(alpha: 0.82)
        : scheme.onSurfaceVariant;
    final borderColor = isSelected ? scheme.secondary : scheme.outlineVariant;

    return Semantics(
      selected: isSelected,
      button: true,
      label: '$title. $subtitle',
      onTap: onTap,
      excludeSemantics: true,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadiusDirectional.circular(AppRadius.lg),
          border: Border.all(color: borderColor, width: isSelected ? 2 : 1),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: scheme.shadow.withValues(alpha: 0.12),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Material(
          type: MaterialType.transparency,
          child: Stack(
            children: [
              // Non-color selection cue (UX01-004): the check icon remains
              // meaningful when color contrast or elevation is not perceivable.
              if (isSelected)
                PositionedDirectional(
                  top: AppSpacing.sm,
                  end: AppSpacing.sm,
                  child: Icon(
                    Icons.check_circle,
                    size: 20,
                    color: scheme.secondary,
                  ),
                ),
              InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(AppRadius.lg),
                child: Padding(
                  padding: const EdgeInsetsDirectional.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: AppSpacing.lg,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(icon, size: 36, color: foreground),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        title,
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: foreground,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: subtitleColor,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
