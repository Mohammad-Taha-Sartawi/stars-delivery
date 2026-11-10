import 'package:dio/dio.dart';
import '../models/ad_model.dart';
import 'api_config.dart';
import 'mobile_api_client.dart';

class AdService {
  late final Dio _dio;

  AdService() {
    _dio = MobileApiClient.create(
      baseUrl: ApiConfig.apiUrl,
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 20),
    );
  }

  Future<List<AdModel>> getAds(String token) async {
    final response = await _dio.get(
      '/ads',
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );

    final data = response.data;

    if (data is! List) {
      return const [];
    }

    return data
        .whereType<Map>()
        .map((item) => AdModel.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }
}
