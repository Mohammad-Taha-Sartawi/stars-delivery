import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';

import 'api_config.dart';

enum ProviderDocumentValidationFailure { empty, tooLarge, unsupportedType }

class ProviderDocumentValidationException implements Exception {
  final ProviderDocumentValidationFailure failure;

  const ProviderDocumentValidationException(this.failure);
}

class ProviderRegistrationDocument {
  static const int maxSizeBytes = 5 * 1024 * 1024;

  final Uint8List bytes;
  final String contentType;
  final String fileName;

  const ProviderRegistrationDocument._({
    required this.bytes,
    required this.contentType,
    required this.fileName,
  });

  static Future<ProviderRegistrationDocument> fromXFile(
    XFile file, {
    required String safeBaseName,
  }) async {
    final length = await file.length();

    if (length <= 0) {
      throw const ProviderDocumentValidationException(
        ProviderDocumentValidationFailure.empty,
      );
    }

    if (length > maxSizeBytes) {
      throw const ProviderDocumentValidationException(
        ProviderDocumentValidationFailure.tooLarge,
      );
    }

    final bytes = await file.readAsBytes();

    return ProviderRegistrationDocument.fromBytes(
      bytes: bytes,
      safeBaseName: safeBaseName,
    );
  }

  factory ProviderRegistrationDocument.fromBytes({
    required List<int> bytes,
    required String safeBaseName,
  }) {
    if (bytes.isEmpty) {
      throw const ProviderDocumentValidationException(
        ProviderDocumentValidationFailure.empty,
      );
    }

    if (bytes.length > maxSizeBytes) {
      throw const ProviderDocumentValidationException(
        ProviderDocumentValidationFailure.tooLarge,
      );
    }

    final copy = Uint8List.fromList(bytes);

    final isJpeg =
        copy.length >= 3 &&
        copy[0] == 0xff &&
        copy[1] == 0xd8 &&
        copy[2] == 0xff;

    const pngSignature = <int>[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

    final isPng =
        copy.length >= pngSignature.length &&
        List.generate(
          pngSignature.length,
          (index) => copy[index] == pngSignature[index],
        ).every((matches) => matches);

    if (!isJpeg && !isPng) {
      throw const ProviderDocumentValidationException(
        ProviderDocumentValidationFailure.unsupportedType,
      );
    }

    final contentType = isPng ? 'image/png' : 'image/jpeg';

    final extension = isPng ? 'png' : 'jpg';

    final sanitizedBase = safeBaseName
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9_-]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');

    final baseName = sanitizedBase.isEmpty
        ? 'provider-document'
        : sanitizedBase;

    return ProviderRegistrationDocument._(
      bytes: copy,
      contentType: contentType,
      fileName: '$baseName.$extension',
    );
  }
}

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
    ProviderRegistrationDocument? driverLicenseDocument,
    bool licenseNotAvailable = false,
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
      final message = _serverMessage(e) ?? _dioErrorMessage(e);
      throw Exception(message);
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
    ProviderRegistrationDocument? driverLicenseDocument,
    bool licenseNotAvailable = false,
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

      if (role != 'provider') {
        final response = await _dio.post('/auth/register', data: fields);

        return _asMap(response.data);
      }

      if (!licenseNotAvailable && driverLicenseDocument == null) {
        throw Exception('Provider driver-license document is required.');
      }

      final formData = FormData.fromMap({
        ...fields.map((key, value) => MapEntry(key, value.toString())),
        'serviceTypes': serviceTypes.join(','),
        'licenseNotAvailable': licenseNotAvailable.toString(),
        if (!licenseNotAvailable && driverLicenseDocument != null)
          'driverLicenseDocument': _multipartProviderDocument(
            driverLicenseDocument,
          ),
      });

      final response = await _dio.post(
        '/auth/register',
        data: formData,
        options: Options(contentType: Headers.multipartFormDataContentType),
      );

      return _asMap(response.data);
    } on DioException catch (e) {
      final message = _serverMessage(e) ?? _dioErrorMessage(e);

      throw Exception(message);
    }
  }

  MultipartFile _multipartProviderDocument(
    ProviderRegistrationDocument document,
  ) {
    final subtype = document.contentType == 'image/png' ? 'png' : 'jpeg';

    return MultipartFile.fromBytes(
      document.bytes,
      filename: document.fileName,
      contentType: DioMediaType('image', subtype),
    );
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
