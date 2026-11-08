import 'package:dio/dio.dart';
import 'api_config.dart';
import 'mobile_api_client.dart';

class ChatService {
  late final Dio _dio;

  ChatService(String token) {
    _dio = MobileApiClient.create(
      baseUrl: ApiConfig.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 8),
    );
  }

  Future<List<Map<String, dynamic>>> getHistory() async {
    final res = await _dio.get('/chat/history');
    return List<Map<String, dynamic>>.from(res.data);
  }

  Future<Map<String, dynamic>> sendMessage(String text) async {
    final res = await _dio.post('/chat/send', data: {'text': text});
    return res.data;
  }

  Future<int> getUnreadCount() async {
    final res = await _dio.get('/chat/unread-count');
    return (res.data is Map ? res.data['count'] as num? : null)?.toInt() ?? 0;
  }

  Future<void> markAdminRead() async {
    await _dio.put('/chat/read');
  }
}
