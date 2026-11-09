import 'package:dio/dio.dart';
import 'api_config.dart';
import 'mobile_api_client.dart';

class OrderService {
  late final Dio _dio;

  OrderService() {
    _dio = MobileApiClient.create(
      baseUrl: ApiConfig.apiUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
    );
  }

  Future<Map<String, dynamic>> createOrder(
    String token,
    String type,
    String description,
    String phone,
    List<String> imagePaths, {
    String? area,
    String? location,
  }) async {
    try {
      final formData = FormData();
      formData.fields.addAll([
        MapEntry('type', type),
        MapEntry('description', description),
        MapEntry('phone', phone),
        if (area != null) MapEntry('area', area),
        if (location != null) MapEntry('location', location),
      ]);
      for (final path in imagePaths) {
        formData.files.add(
          MapEntry('images', await MultipartFile.fromFile(path)),
        );
      }

      final response = await _dio.post(
        '/orders',
        data: formData,
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      return response.data;
    } on DioException catch (e) {
      final message = e.response?.data?['error'] ?? 'Failed to create order';
      throw Exception(message);
    }
  }

  Future<List<Map<String, dynamic>>> getMyOrders(String token) async {
    try {
      final response = await _dio.get(
        '/orders',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      return List<Map<String, dynamic>>.from(response.data);
    } on DioException catch (e) {
      throw Exception(e.response?.data?['error'] ?? 'Failed to load orders');
    }
  }

  Future<Map<String, dynamic>> getOrder(String token, String orderId) async {
    try {
      final response = await _dio.get(
        '/orders/$orderId',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      return Map<String, dynamic>.from(response.data);
    } on DioException catch (e) {
      throw Exception(e.response?.data?['error'] ?? 'Failed to load order');
    }
  }

  Future<Map<String, dynamic>> confirmDelivery(
    String token,
    String orderId,
  ) async {
    try {
      final response = await _dio.put(
        '/orders/$orderId/confirm-delivery',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      return Map<String, dynamic>.from(response.data);
    } on DioException catch (e) {
      throw Exception(
        e.response?.data?['error'] ?? 'Failed to confirm delivery',
      );
    }
  }

  Future<Map<String, dynamic>> rejectDelivery(
    String token,
    String orderId, {
    String reason = '',
  }) async {
    try {
      final response = await _dio.put(
        '/orders/$orderId/reject-delivery',
        data: {'reason': reason},
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      return Map<String, dynamic>.from(response.data);
    } on DioException catch (e) {
      throw Exception(
        e.response?.data?['error'] ?? 'Failed to reject delivery',
      );
    }
  }

  Future<int> getAvailableDriversCount(String token) async {
    try {
      final response = await _dio.get(
        '/users/available-providers',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      final data = response.data;

      return data is Map ? (data['count'] as num?)?.toInt() ?? 0 : 0;
    } on DioException catch (e) {
      throw Exception(
        e.response?.data?['error'] ?? 'Failed to load available drivers',
      );
    }
  }
}
