import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_config.dart';
import 'mobile_api_client.dart';

/// A support conversation started by someone who is not signed in. The
/// access token is kept only on this device and opens the conversation.
class GuestSupportThread {
  final String id;
  final String token;

  const GuestSupportThread({required this.id, required this.token});

  Map<String, String> toJson() => {'id': id, 'token': token};

  static GuestSupportThread? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['id']?.toString() ?? '';
    final token = raw['token']?.toString() ?? '';
    if (id.isEmpty || token.isEmpty) return null;
    return GuestSupportThread(id: id, token: token);
  }
}

/// Saves the guest's support conversation on the device.
abstract interface class GuestSupportStore {
  Future<GuestSupportThread?> read();
  Future<void> write(GuestSupportThread thread);
}

class SecureGuestSupportStore implements GuestSupportStore {
  static const String storageKey = 'swifora_guest_support_thread';
  final FlutterSecureStorage _storage;

  SecureGuestSupportStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  @override
  Future<GuestSupportThread?> read() async {
    try {
      final raw = await _storage.read(key: storageKey);
      if (raw == null || raw.isEmpty) return null;
      return GuestSupportThread.fromJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(GuestSupportThread thread) =>
      _storage.write(key: storageKey, value: jsonEncode(thread.toJson()));
}

class GuestSupportException implements Exception {
  final String message;
  final String? code;
  const GuestSupportException(this.message, {this.code});

  @override
  String toString() => message;
}

/// Support for guests: send the first message, read our replies, answer.
class GuestSupportService {
  final GuestSupportStore store;
  final Dio? _injectedDio;

  // Built on first use: the sign-in screen creates this service before the
  // server address is known in tests and on very early frames.
  late final Dio _dio =
      _injectedDio ??
      MobileApiClient.create(
        baseUrl: ApiConfig.apiUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 15),
      );

  GuestSupportService({GuestSupportStore? store, Dio? dio})
    : store = store ?? SecureGuestSupportStore(),
      _injectedDio = dio;

  Future<GuestSupportThread?> savedThread() => store.read();

  /// Sends a new request to support and remembers the conversation.
  Future<GuestSupportThread?> start({
    required String name,
    required String email,
    required String phone,
    required String text,
  }) async {
    final response = await _dio.post(
      '/chat/contact',
      data: {'name': name, 'email': email, 'phone': phone, 'text': text},
    );
    final data = response.data;
    final thread = data is Map
        ? GuestSupportThread.fromJson({
            'id': data['contactId'],
            'token': data['accessToken'],
          })
        : null;
    if (thread != null) await store.write(thread);
    return thread;
  }

  /// The conversation, oldest first: `{sender: guest|admin, text, createdAt}`.
  Future<List<Map<String, dynamic>>> messages(GuestSupportThread thread) async {
    try {
      final response = await _dio.get(
        '/chat/contact/${thread.id}/messages',
        options: Options(headers: {'X-Contact-Token': thread.token}),
      );
      final list = response.data is Map ? response.data['messages'] : null;
      return [
        for (final message in (list as List? ?? const []))
          if (message is Map) Map<String, dynamic>.from(message),
      ];
    } on DioException catch (e) {
      throw _failure(e);
    }
  }

  Future<void> reply(GuestSupportThread thread, String text) async {
    try {
      await _dio.post(
        '/chat/contact/${thread.id}/messages',
        data: {'text': text},
        options: Options(headers: {'X-Contact-Token': thread.token}),
      );
    } on DioException catch (e) {
      throw _failure(e);
    }
  }

  GuestSupportException _failure(DioException e) {
    final data = e.response?.data;
    final message = data is Map ? data['error']?.toString() : null;
    final code = data is Map ? data['code']?.toString() : null;
    return GuestSupportException(message ?? 'Request failed', code: code);
  }
}
