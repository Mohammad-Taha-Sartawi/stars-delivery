import 'package:dio/dio.dart';
import '../models/offer_model.dart';
import 'api_config.dart';
import 'mobile_api_client.dart';

class OfferSubmitException implements Exception {
  final String? code;
  final String message;
  final int? retryAfterSeconds;

  const OfferSubmitException(
    this.message, {
    this.code,
    this.retryAfterSeconds,
  });

  @override
  String toString() => message;
}

class OfferService {
  /// Lowest price a driver may offer, in shekels. The server enforces the
  /// same figure (`swifora_backend/src/services/offerPricing.js`).
  static const int minOfferPrice = 9;

  /// Quick-pick prices on the offer screen; all at or above [minOfferPrice].
  static const List<int> quickPrices = [9, 12, 15, 20];

  late final Dio _dio;
  OfferService() {
    _dio = MobileApiClient.create(
      baseUrl: ApiConfig.apiUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
    );
  }

  Future<void> submitOffer(String token, String orderId, double price, int estimatedTime) async {
    try {
      await _dio.post('/offers', data: {'orderId': orderId, 'price': price, 'estimatedTime': estimatedTime},
        options: Options(headers: {'Authorization': 'Bearer $token'}));
    } on DioException catch (e) {
      final data = e.response?.data;

      if (data is Map && data['conflict'] == true) {
        throw OfferSubmitException(
          (data['message'] ?? 'Failed to submit offer').toString(),
          code: data['code']?.toString(),
          retryAfterSeconds: (data['retryAfterSeconds'] as num?)?.toInt(),
        );
      }

      throw OfferSubmitException(
        (data is Map ? data['error'] ?? data['message'] : null)?.toString()
            ?? 'Failed to submit offer',
      );
    }
  }

  Future<List<OfferModel>> getOffers(String token, String orderId) async {
    final r = await _dio.get('/offers/order/$orderId',
      options: Options(headers: {'Authorization': 'Bearer $token'}));
    return (r.data as List).map((j) => OfferModel.fromJson(j)).toList();
  }

  Future<Map<String, dynamic>> acceptOffer(String token, String offerId) async {
    try {
      final res = await _dio.post('/offers/$offerId/accept',
        options: Options(headers: {'Authorization': 'Bearer $token'}));
      return res.data;
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data != null && data['conflict'] == true) return Map<String, dynamic>.from(data);
      throw Exception(data?['error'] ?? 'Failed to accept');
    }
  }

  Future<void> resendOrder(String token, String orderId) async {
    try {
      await _dio.post('/offers/$orderId/resend',
        options: Options(headers: {'Authorization': 'Bearer $token'}));
    } on DioException catch (e) {
      final data = e.response?.data;
      throw Exception(
        (data is Map ? data['message'] ?? data['error'] : null)?.toString()
            ?? 'Failed to resend order',
      );
    }
  }

  Future<void> cancelOrder(String token, String orderId) async {
    try {
      await _dio.post('/offers/$orderId/cancel',
        options: Options(headers: {'Authorization': 'Bearer $token'}));
    } on DioException catch (e) {
      final data = e.response?.data;
      throw Exception(
        (data is Map ? data['message'] ?? data['error'] : null)?.toString()
            ?? 'Failed to cancel order',
      );
    }
  }
}
