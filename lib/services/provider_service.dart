import 'package:dio/dio.dart';
import '../models/provider_stats.dart';
import 'api_config.dart';
import 'mobile_api_client.dart';

class ProviderService {
  late final Dio _dio;

  ProviderService() {
    _dio = MobileApiClient.create(
      baseUrl: ApiConfig.apiUrl,
      headers: {'Content-Type': 'application/json'},
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 8),
    );
  }

  Future<ProviderStats> getStats(String token) async {
    try {
      final response = await _dio.get('/provider/stats',
        options: Options(headers: { 'Authorization': 'Bearer $token' }),
        queryParameters: ApiConfig.detectedArea != null
            ? {'area': ApiConfig.detectedArea} : null,
      );
      return ProviderStats.fromJson(response.data);
    } on DioException catch (e) {
      final msg = e.response?.data?['error']?.toString() ??
          e.response?.statusMessage ??
          'Failed to load stats';
      throw Exception('$msg (${e.type.name})');
    }
  }

  Future<List<Map<String, dynamic>>> getPendingOrders(String token) async {
    try {
      final response = await _dio.get('/provider/pending-orders',
        options: Options(headers: { 'Authorization': 'Bearer $token' }),
        queryParameters: ApiConfig.detectedArea != null
            ? {'area': ApiConfig.detectedArea} : null,
      );
      return List<Map<String, dynamic>>.from(response.data);
    } on DioException catch (e) {
      final msg = e.response?.data?['error']?.toString() ??
          'Failed to load pending orders';
      throw Exception(msg);
    }
  }

  Future<List<Map<String, dynamic>>> getMyOrders(String token) async {
    try {
      final response = await _dio.get('/provider/orders',
        options: Options(headers: { 'Authorization': 'Bearer $token' }),
      );
      return List<Map<String, dynamic>>.from(response.data);
    } on DioException catch (e) {
      throw Exception(e.response?.data?['error'] ?? 'Failed to load orders');
    }
  }

  Future<List<Map<String, dynamic>>> getOfferedOrders(String token) async {
    try {
      final response = await _dio.get('/provider/offered-orders',
        options: Options(headers: { 'Authorization': 'Bearer $token' }),
      );
      return List<Map<String, dynamic>>.from(response.data);
    } on DioException catch (e) {
      throw Exception(e.response?.data?['error'] ?? 'Failed to load offered orders');
    }
  }

  Future<void> rejectOrder(String token, String orderId) async {
    try {
      await _dio.post('/provider/orders/$orderId/reject',
        options: Options(headers: { 'Authorization': 'Bearer $token' }),
      );
    } on DioException catch (e) {
      throw Exception(e.response?.data?['error'] ?? 'Failed to reject order');
    }
  }

  Future<List<Map<String, dynamic>>> getRejectedOrders(String token) async {
    try {
      final response = await _dio.get('/provider/rejected-orders',
        options: Options(headers: { 'Authorization': 'Bearer $token' }),
      );
      return List<Map<String, dynamic>>.from(response.data);
    } on DioException catch (e) {
      throw Exception(e.response?.data?['error'] ?? 'Failed to load rejected orders');
    }
  }

  Future<void> setAvailability(String token, bool available) async {
    try {
      await _dio.put('/provider/availability',
        data: {'available': available},
        options: Options(headers: { 'Authorization': 'Bearer $token' }),
      );
    } on DioException catch (e) {
      throw Exception(
        e.response?.data?['error'] ?? 'Failed to update availability',
      );
    }
  }

  Future<void> markFulfilling(String token, String orderId) async {
    try {
      await _dio.put('/orders/$orderId/fulfilling',
        options: Options(headers: { 'Authorization': 'Bearer $token' }),
      );
    } on DioException catch (e) {
      throw Exception(e.response?.data?['error'] ?? 'Failed to update');
    }
  }

  Future<void> markComplete(String token, String orderId) async {
    try {
      await _dio.put('/orders/$orderId/complete',
        options: Options(headers: { 'Authorization': 'Bearer $token' }),
      );
    } on DioException catch (e) {
      throw Exception(e.response?.data?['error'] ?? 'Failed to complete');
    }
  }
}
