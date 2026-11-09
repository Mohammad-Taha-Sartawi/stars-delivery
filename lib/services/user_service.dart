import 'package:dio/dio.dart';
import 'api_config.dart';
import 'mobile_api_client.dart';

/// Account-level mobile preferences managed from the app.
class UserService {
  Dio? _client;

  Dio get _dio => _client ??= MobileApiClient.create(
    baseUrl: ApiConfig.apiUrl,
    headers: {'Content-Type': 'application/json'},
    connectTimeout: const Duration(seconds: 8),
    receiveTimeout: const Duration(seconds: 8),
  );

  Future<bool> setGovernorateLevel(String token, bool enabled) async {
    try {
      final response = await _dio.put(
        '/users/governorate-level',
        data: {'enabled': enabled},
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      return response.data is Map && response.data['enabled'] == true;
    } on DioException catch (e) {
      throw Exception(
        e.response?.data?['error'] ?? 'Failed to update governorate setting',
      );
    }
  }
}
