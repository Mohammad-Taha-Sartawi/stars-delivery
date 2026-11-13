import 'package:dio/dio.dart';

import 'api_config.dart';

class SessionRejectedException implements Exception {
  final int? statusCode;
  final String message;

  const SessionRejectedException({
    required this.statusCode,
    required this.message,
  });

  @override
  String toString() => message;
}

/// A login or sign-up request the server refused, with its machine-readable
/// code when the server sent one (for example `INVALID_CREDENTIALS`).
class AuthRequestException implements Exception {
  final String message;
  final String? code;

  const AuthRequestException(this.message, {this.code});

  @override
  String toString() => message;
}

abstract interface class AuthGateway {
  Future<Map<String, dynamic>> login(
    String email,
    String password,
    String role,
  );

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
  });

  Future<Map<String, dynamic>> validateSession(String token);
}

class AuthService implements AuthGateway {
  late final Dio _dio;

  AuthService({Dio? dio}) {
    _dio =
        dio ??
        Dio(
          BaseOptions(
            baseUrl: ApiConfig.apiUrl,
            headers: {'Content-Type': 'application/json'},
            connectTimeout: const Duration(seconds: 30),
            receiveTimeout: const Duration(seconds: 30),
          ),
        );
  }

  @override
  Future<Map<String, dynamic>> login(
    String email,
    String password,
    String role,
  ) async {
    try {
      final response = await _dio.post(
        '/auth/login',
        data: {'email': email, 'password': password, 'role': role},
      );

      return _asMap(response.data);
    } on DioException catch (e) {
      throw AuthRequestException(
        _serverMessage(e) ?? _dioErrorMessage(e),
        code: _serverCode(e),
      );
    }
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
  }) async {
    try {
      final fields = <String, dynamic>{
        'fullName': fullName,
        'email': email,
        'phone': phone,
        'password': password,
        'role': role,
        'area': area,
        'governorate': governorate,
        'privacyPolicy': privacyPolicy,
      };

      final response = await _dio.post(
        '/auth/register',
        data: {...fields, 'serviceTypes': serviceTypes},
      );

      return _asMap(response.data);
    } on DioException catch (e) {
      throw AuthRequestException(
        _serverMessage(e) ?? _dioErrorMessage(e),
        code: _serverCode(e),
      );
    }
  }

  @override
  Future<Map<String, dynamic>> validateSession(String token) async {
    try {
      final response = await _dio.get(
        '/auth/me',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      return _asMap(response.data);
    } on DioException catch (e) {
      final status = e.response?.statusCode;

      if (status == 401 || status == 403) {
        throw SessionRejectedException(
          statusCode: status,
          message: _serverMessage(e) ?? 'Session is no longer valid.',
        );
      }

      throw Exception(_serverMessage(e) ?? _dioErrorMessage(e));
    }
  }

  Future<void> revokeSession(String token) async {
    try {
      await _dio.post(
        '/auth/logout',
        options: Options(
          headers: {'Authorization': 'Bearer $token'},
          sendTimeout: const Duration(seconds: 3),
          receiveTimeout: const Duration(seconds: 3),
        ),
      );
    } catch (_) {
      // Local logout must still complete when the device is offline.
    }
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map) {
      return Map<String, dynamic>.from(value);
    }

    throw const FormatException('Unexpected server response');
  }

  String? _serverMessage(DioException e) {
    final data = e.response?.data;

    if (data is Map) {
      final value = data['error'] ?? data['message'];
      if (value is String && value.trim().isNotEmpty) {
        return value;
      }
    }

    return null;
  }

  String? _serverCode(DioException e) {
    final data = e.response?.data;
    final code = data is Map ? data['code'] : null;
    return code is String && code.isNotEmpty ? code : null;
  }

  String _dioErrorMessage(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Connection timed out. Check your network.';
      case DioExceptionType.connectionError:
        return 'Cannot connect to server. Make sure the backend is running.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
