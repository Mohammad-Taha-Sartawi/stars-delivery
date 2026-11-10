import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import 'dart:async';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/auth/auth_event.dart';
import '../models/user_model.dart';
import '../services/api_config.dart';
import '../services/mobile_api_client.dart';
import '../services/location_catalog.dart';
import '../services/validators.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../services/socket_service.dart';
import '../widgets/ui/app_feedback.dart';

class ProfileScreen extends StatefulWidget {
  final UserModel user;
  final String token;
  final ValueChanged<UserModel>? onUserUpdated;

  const ProfileScreen({
    super.key,
    required this.user,
    required this.token,
    this.onUserUpdated,
  });

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _currentPassCtrl = TextEditingController();
  final _newPassCtrl = TextEditingController();
  final _confirmPassCtrl = TextEditingController();
  List<Map<String, dynamic>> _phones = [];
  final _phoneCtrl = TextEditingController();
  bool _loadingPhones = true;

  late UserModel _currentUser = widget.user;
  late final _cityFieldKey = GlobalKey<FormFieldState<String>>();
  List<GovernorateOption> _governorates = [];
  String? _selectedGovernorate;
  String? _selectedArea;
  bool _loadingLocation = true;
  bool _savingLocation = false;
  StreamSubscription? _profileUpdatedSub;

  @override
  void initState() {
    super.initState();
    _nameCtrl.text = widget.user.fullName;
    _emailCtrl.text = widget.user.email;
    _loadPhones();
    _loadLocationOptions();
    _profileUpdatedSub = SocketService.instance.onProviderProfileUpdated.listen(
      (data) {
        if (!mounted) return;
        final rawUser = data['user'];
        if (rawUser is! Map) return;

        final updated = UserModel.fromJson(Map<String, dynamic>.from(rawUser));
        setState(() {
          _currentUser = updated;
          _nameCtrl.text = updated.fullName;
          _emailCtrl.text = updated.email;
          _selectedGovernorate = updated.governorate;
          _selectedArea = updated.area;
        });
        _loadPhones();
        widget.onUserUpdated?.call(updated);
      },
    );
  }

  GovernorateOption? get _currentGovernorate {
    for (final governorate in _governorates) {
      if (governorate.name == _selectedGovernorate) {
        return governorate;
      }
    }
    return null;
  }

  String _governorateLabel(GovernorateOption governorate) {
    return governorate.nativeName;
  }

  Future<void> _loadLocationOptions() async {
    try {
      final governorates = await LocationCatalog.load();
      final currentGovernorate = LocationCatalog.findForUser(
        governorates,
        governorate: _currentUser.governorate,
        area: _currentUser.area,
      );

      if (!mounted) return;
      setState(() {
        _governorates = governorates;
        _selectedGovernorate = currentGovernorate?.name;
        _selectedArea = currentGovernorate == null
            ? null
            : LocationCatalog.cityForUser(
                currentGovernorate,
                _currentUser.area,
              );
        _loadingLocation = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _loadingLocation = false);
      }
    }
  }

  Future<void> _saveLocation() async {
    final governorate = _currentGovernorate;
    final area = _selectedArea;

    if (governorate == null || area == null) {
      AppFeedback.error(context, 'يرجى اختيار المحافظة والقرية/المدينة أولاً.');
      return;
    }

    if (_savingLocation) return;
    setState(() => _savingLocation = true);

    try {
      final response = await _client().put(
        '/users/area',
        data: {'governorate': governorate.areaValue, 'area': area},
      );
      final updated = UserModel.fromJson(
        Map<String, dynamic>.from(response.data['user'] as Map),
      );

      if (!mounted) return;
      setState(() => _currentUser = updated);
      widget.onUserUpdated?.call(updated);
      AppFeedback.success(
        context,
        'تم تحديث المحافظة والقرية. الطلبات الجديدة ستستخدم المنطقة الجديدة.',
      );
    } catch (e) {
      if (!mounted) return;
      AppFeedback.error(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() => _savingLocation = false);
      }
    }
  }

  @override
  void dispose() {
    _profileUpdatedSub?.cancel();
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _currentPassCtrl.dispose();
    _newPassCtrl.dispose();
    _confirmPassCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPhones() async {
    try {
      final res = await _client().get('/users/phones');
      if (!mounted) return;
      final list = res.data['phones'] ?? [];
      setState(() {
        _phones = List<Map<String, dynamic>>.from(
          list.map((p) {
            if (p is Map) return p;
            return {'number': p.toString(), 'primary': false};
          }),
        );
        _loadingPhones = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingPhones = false);
    }
  }

  Future<void> _addPhone() async {
    final phone = _phoneCtrl.text.trim();
    if (phone.isEmpty) return;
    try {
      await _client().post('/users/phones', data: {'number': phone});
      _phoneCtrl.clear();
      _loadPhones();
    } catch (_) {}
  }

  Future<void> _removePhone(String number) async {
    try {
      await _client().delete('/users/phones', data: {'number': number});
      _loadPhones();
    } catch (_) {}
  }

  Future<void> _setPrimaryPhone(String number) async {
    try {
      await _client().put('/users/phones/primary', data: {'number': number});
      _loadPhones();
    } catch (_) {}
  }

  Future<void> _saveName() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) return;
    try {
      final dio = _client();
      await dio.put('/users/profile', data: {'fullName': name});
      if (!mounted) return;
      AppFeedback.success(context, 'تم تحديث الاسم');
    } catch (e) {
      if (!mounted) return;
      AppFeedback.error(context, e.toString());
    }
  }

  Future<String?> _promptCurrentPasswordForEmailChange() async {
    final controller = TextEditingController();

    try {
      return await showDialog<String>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('تأكيد تغيير البريد'),
          content: TextField(
            controller: controller,
            obscureText: true,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'كلمة المرور الحالية',
              border: OutlineInputBorder(),
            ),
            onSubmitted: (value) {
              if (value.isNotEmpty) {
                Navigator.of(dialogContext).pop(value);
              }
            },
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('إلغاء'),
            ),
            ElevatedButton(
              onPressed: () {
                final value = controller.text;

                if (value.isNotEmpty) {
                  Navigator.of(dialogContext).pop(value);
                }
              },
              child: const Text('تأكيد'),
            ),
          ],
        ),
      );
    } finally {
      controller.dispose();
    }
  }

  Future<void> _saveEmail() async {
    final email = _emailCtrl.text.trim().toLowerCase();

    final validationError = Validators.email(email);

    if (validationError != null) {
      AppFeedback.error(context, validationError);
      return;
    }

    if (email == _currentUser.email.trim().toLowerCase()) {
      AppFeedback.info(context, 'البريد لم يتغير');
      return;
    }

    final currentPassword = await _promptCurrentPasswordForEmailChange();

    if (!mounted || currentPassword == null) {
      return;
    }

    try {
      final dio = _client();

      await dio.put(
        '/users/email',
        data: {
          'currentPassword': currentPassword,
          'newEmail': email,
          'confirmEmail': email,
        },
      );

      // The server rotates sessionVersion and may disconnect
      // this screen before the HTTP response returns.
      if (!mounted) return;

      AppFeedback.success(
        context,
        'تم تحديث البريد. سجّل الدخول مجدداً بالبريد الجديد.',
      );

      context.read<AuthBloc>().add(LogoutEvent());
    } catch (e) {
      if (!mounted) return;

      AppFeedback.error(context, e.toString());
    }
  }

  Future<void> _changePassword() async {
    final currentPassword = _currentPassCtrl.text;
    final newPassword = _newPassCtrl.text;
    final confirmPassword = _confirmPassCtrl.text;

    if (currentPassword.isEmpty) {
      AppFeedback.error(context, 'أدخل كلمة المرور الحالية');
      return;
    }

    final validationError = Validators.password(newPassword);

    if (validationError != null) {
      AppFeedback.error(context, validationError);
      return;
    }

    if (newPassword != confirmPassword) {
      AppFeedback.error(context, 'كلمتا المرور غير متطابقتين');
      return;
    }

    try {
      final dio = _client();

      await dio.put(
        '/users/password',
        data: {
          'currentPassword': currentPassword,
          'newPassword': newPassword,
          'confirmPassword': confirmPassword,
        },
      );

      // Socket revocation may remove this screen before
      // the HTTP password-change request returns.
      if (!mounted) return;

      _currentPassCtrl.clear();
      _newPassCtrl.clear();
      _confirmPassCtrl.clear();

      if (!mounted) return;

      AppFeedback.success(context, 'تم تغيير كلمة المرور');
    } catch (e) {
      if (!mounted) return;

      AppFeedback.error(context, e.toString());
    }
  }

  Dio _client() => MobileApiClient.create(
    baseUrl: ApiConfig.apiUrl,
    headers: {
      'Authorization': 'Bearer ${widget.token}',
      'Content-Type': 'application/json',
    },
    connectTimeout: const Duration(seconds: 8),
    receiveTimeout: null,
  );

  @override
  Widget build(BuildContext context) {
    final isProvider = widget.user.role == 'provider';
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('الملف الشخصي'), centerTitle: true),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: EdgeInsets.symmetric(
            horizontal: Responsive.paddingHorizontal(context),
            vertical: 20,
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 500),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 45,
                  backgroundColor: isProvider
                      ? scheme.secondaryContainer
                      : scheme.primaryContainer,
                  child: Text(
                    _currentUser.fullName[0].toUpperCase(),
                    style: TextStyle(
                      color: isProvider
                          ? scheme.onSecondaryContainer
                          : scheme.onPrimaryContainer,
                      fontSize: 30,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _currentUser.fullName,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  _currentUser.email,
                  textDirection: TextDirection.ltr,
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
                Text(
                  '#${_currentUser.publicId}',
                  textDirection: TextDirection.ltr,
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 24),
                _buildSection('الاسم', _nameCtrl, onSave: _saveName),
                _buildSection(
                  'البريد الإلكتروني',
                  _emailCtrl,
                  onSave: _saveEmail,
                  latin: true,
                ),
                const SizedBox(height: 12),
                _buildLocationSection(context),
                const SizedBox(height: 12),
                const Text(
                  'أرقام الهاتف',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _phoneCtrl,
                        textDirection: TextDirection.ltr,
                        decoration: const InputDecoration(
                          hintText: 'أضف رقم هاتف',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.phone,
                        onSubmitted: (_) => _addPhone(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      tooltip: AppLocalization.get(context, 'add_phone'),
                      onPressed: _addPhone,
                      icon: Icon(Icons.add_circle, color: scheme.primary),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (_loadingPhones)
                  const Padding(
                    padding: EdgeInsetsDirectional.symmetric(vertical: 16),
                    child: Center(
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                else
                  ..._phones.map((p) {
                    final number = (p['number'] ?? '').toString();
                    final isPrimary = p['primary'] == true;
                    return ListTile(
                      dense: true,
                      leading: isPrimary
                          ? Icon(
                              Icons.star,
                              color: Theme.of(context).colorScheme.primary,
                              size: 20,
                            )
                          : const SizedBox(width: 20),
                      title: Text(number, style: const TextStyle(fontSize: 14)),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (!isPrimary)
                            TextButton(
                              onPressed: () => _setPrimaryPhone(number),
                              child: const Text(
                                'أساسي',
                                style: TextStyle(fontSize: 11),
                              ),
                            ),
                          if (!isPrimary)
                            IconButton(
                              tooltip: AppLocalization.get(context, 'delete'),
                              icon: Icon(
                                Icons.delete_outline,
                                size: 18,
                                color: scheme.error,
                              ),
                              onPressed: () => _removePhone(number),
                            ),
                        ],
                      ),
                    );
                  }),
                const SizedBox(height: 12),
                const Text(
                  'تغيير كلمة المرور',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _currentPassCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'كلمة المرور الحالية',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _newPassCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'كلمة مرور جديدة',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _confirmPassCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'تأكيد كلمة المرور',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _changePassword,
                    child: const Text('تغيير كلمة المرور'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLocationSection(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final governorate = _currentGovernorate;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.location_on_outlined, color: scheme.primary),
              const SizedBox(width: 8),
              const Text(
                'المحافظة والقرية / المدينة',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'تُستخدم هذه المنطقة في إرسال واستقبال الطلبات داخل التطبيق.',
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 12,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          if (_loadingLocation)
            const Center(
              child: Padding(
                padding: EdgeInsetsDirectional.symmetric(vertical: 12),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else if (_governorates.isEmpty)
            Text(
              'تعذر تحميل قائمة المناطق. حاول فتح الصفحة مرة أخرى.',
              style: TextStyle(color: scheme.error, fontSize: 13),
            )
          else ...[
            DropdownButtonFormField<String>(
              key: const Key('profileGovernorateDropdown'),
              initialValue: _selectedGovernorate,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'المحافظة',
                border: OutlineInputBorder(),
              ),
              items: _governorates
                  .map(
                    (option) => DropdownMenuItem(
                      value: option.name,
                      child: Text(_governorateLabel(option)),
                    ),
                  )
                  .toList(),
              onChanged: _savingLocation
                  ? null
                  : (value) {
                      _cityFieldKey.currentState?.didChange(null);
                      setState(() {
                        _selectedGovernorate = value;
                        _selectedArea = null;
                      });
                    },
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              key: _cityFieldKey,
              initialValue: _selectedArea,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'القرية / المدينة',
                border: OutlineInputBorder(),
              ),
              items: governorate == null
                  ? const <DropdownMenuItem<String>>[]
                  : [
                      DropdownMenuItem(
                        value: governorate.areaValue,
                        child: Text('من ${governorate.nativeName} نفسها'),
                      ),
                      ...governorate.cities.map(
                        (city) =>
                            DropdownMenuItem(value: city, child: Text(city)),
                      ),
                    ],
              onChanged: governorate == null || _savingLocation
                  ? null
                  : (value) => setState(() => _selectedArea = value),
            ),
            if (_currentUser.governorateLevel) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: scheme.secondaryContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.public,
                      size: 18,
                      color: scheme.onSecondaryContainer,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'خيار العمل على مستوى المحافظة مفعّل، وسيُطبّق تلقائياً على المحافظة الجديدة.',
                        style: TextStyle(
                          color: scheme.onSecondaryContainer,
                          fontSize: 12,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 8),
            Text(
              'تغيير المنطقة يؤثر على الطلبات الجديدة فقط. الطلبات الحالية تبقى في منطقتها الأصلية.',
              style: TextStyle(
                color: scheme.onSurfaceVariant,
                fontSize: 11.5,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 10),
            ElevatedButton.icon(
              key: const Key('profileSaveLocation'),
              onPressed: _savingLocation ? null : _saveLocation,
              icon: const Icon(Icons.save_outlined, size: 18),
              label: Text(
                _savingLocation ? 'جاري الحفظ...' : 'حفظ المحافظة والقرية',
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSection(
    String label,
    TextEditingController ctrl, {
    VoidCallback? onSave,
    bool latin = false,
  }) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: ctrl,
              textDirection: latin ? TextDirection.ltr : null,
              decoration: InputDecoration(
                labelText: label,
                border: const OutlineInputBorder(),
              ),
            ),
          ),
          if (onSave != null) ...[
            const SizedBox(width: 8),
            IconButton(
              tooltip: AppLocalization.get(context, 'save'),
              onPressed: onSave,
              icon: Icon(
                Icons.check_circle,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
