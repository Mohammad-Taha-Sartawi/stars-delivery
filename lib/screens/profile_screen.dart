import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/auth/auth_event.dart';
import '../models/user_model.dart';
import '../services/api_config.dart';
import '../services/mobile_api_client.dart';
import '../services/validators.dart';
import '../services/responsive.dart';

class ProfileScreen extends StatefulWidget {
  final UserModel user;
  final String token;
  const ProfileScreen({super.key, required this.user, required this.token});

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

  @override
  void initState() {
    super.initState();
    _nameCtrl.text = widget.user.fullName;
    _emailCtrl.text = widget.user.email;
    _loadPhones();
  }

  @override
  void dispose() {
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
        _phones = List<Map<String, dynamic>>.from(list.map((p) {
          if (p is Map) return p;
          return {'number': p.toString(), 'primary': false};
        }));
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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم تحديث الاسم'), backgroundColor: Colors.green));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: Colors.red));
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
    final email =
        _emailCtrl.text.trim().toLowerCase();

    final validationError =
        Validators.email(email);

    if (validationError != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(validationError),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (
      email
      == widget.user.email.trim().toLowerCase()
    ) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('البريد لم يتغير'),
        ),
      );
      return;
    }

    final currentPassword =
        await _promptCurrentPasswordForEmailChange();

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

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'تم تحديث البريد. سجّل الدخول مجدداً بالبريد الجديد.',
          ),
          backgroundColor: Colors.green,
        ),
      );

      context.read<AuthBloc>().add(
        LogoutEvent(),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString()),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _changePassword() async {
    final currentPassword = _currentPassCtrl.text;
    final newPassword = _newPassCtrl.text;
    final confirmPassword = _confirmPassCtrl.text;

    if (currentPassword.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('أدخل كلمة المرور الحالية'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final validationError = Validators.password(newPassword);

    if (validationError != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(validationError),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (newPassword != confirmPassword) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('كلمتا المرور غير متطابقتين'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    try {
      final dio = _client();

      await dio.put('/users/password', data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
        'confirmPassword': confirmPassword,
      });

      // Socket revocation may remove this screen before
      // the HTTP password-change request returns.
      if (!mounted) return;

      _currentPassCtrl.clear();
      _newPassCtrl.clear();
      _confirmPassCtrl.clear();

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم تغيير كلمة المرور'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString()),
          backgroundColor: Colors.red,
        ),
      );
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
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('الملف الشخصي', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold)),
        centerTitle: true,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.black87), onPressed: () => Navigator.pop(context)),
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.symmetric(horizontal: Responsive.paddingHorizontal(context), vertical: 20),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 500),
          child: Column(
            children: [
              CircleAvatar(radius: 45, backgroundColor: isProvider ? Colors.orange : Colors.blue, child: Text(widget.user.fullName[0].toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.bold))),
              const SizedBox(height: 12),
              Text(widget.user.fullName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              Text(widget.user.email, style: TextStyle(color: Colors.grey[600])),
              Text('#${widget.user.publicId}', style: TextStyle(color: Colors.grey[500], fontSize: 13)),
              const SizedBox(height: 24),
              _buildSection('الاسم', _nameCtrl, onSave: _saveName),
              _buildSection('البريد الإلكتروني', _emailCtrl, onSave: _saveEmail),
              const SizedBox(height: 12),
              const Text('أرقام الهاتف', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: TextField(controller: _phoneCtrl, decoration: const InputDecoration(hintText: 'أضف رقم هاتف', border: OutlineInputBorder()), keyboardType: TextInputType.phone, onSubmitted: (_) => _addPhone())),
                const SizedBox(width: 8),
                IconButton(onPressed: _addPhone, icon: const Icon(Icons.add_circle, color: Colors.green)),
              ]),
              const SizedBox(height: 8),
              if (_loadingPhones) const SizedBox(height: 20, child: Center(child: CircularProgressIndicator(strokeWidth: 2))) else ..._phones.map((p) {
                final number = (p['number'] ?? '').toString();
                final isPrimary = p['primary'] == true;
                return ListTile(
                  dense: true,
                  leading: isPrimary ? const Icon(Icons.star, color: Colors.amber, size: 20) : const SizedBox(width: 20),
                  title: Text(number, style: const TextStyle(fontSize: 14)),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (!isPrimary) TextButton(onPressed: () => _setPrimaryPhone(number), child: const Text('أساسي', style: TextStyle(fontSize: 11))),
                      if (!isPrimary) IconButton(icon: const Icon(Icons.delete_outline, size: 18, color: Colors.red), onPressed: () => _removePhone(number)),
                    ],
                  ),
                );
              }),
              const SizedBox(height: 12),
              const Text('تغيير كلمة المرور', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              TextField(controller: _currentPassCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة المرور الحالية', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: _newPassCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'كلمة مرور جديدة', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: _confirmPassCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'تأكيد كلمة المرور', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              SizedBox(width: double.infinity, child: ElevatedButton(onPressed: _changePassword, child: const Text('تغيير كلمة المرور'))),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSection(String label, TextEditingController ctrl, {VoidCallback? onSave}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(child: TextField(controller: ctrl, decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()))),
          if (onSave != null) ...[const SizedBox(width: 8), IconButton(onPressed: onSave, icon: const Icon(Icons.check_circle, color: Colors.green))],
        ],
      ),
    );
  }
}
