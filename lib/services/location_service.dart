import 'package:geolocator/geolocator.dart';
import 'package:dio/dio.dart';
import 'api_config.dart';
import 'mobile_api_client.dart';

class LocationService {
  static bool _initialized = false;

  static Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    if (!await _requestLocationPermission()) return;

    final pos = await _safeGetCurrentPosition();
    if (pos == null) return;

    final area = await _findNearestArea(pos.latitude, pos.longitude);
    if (area != null) {
      ApiConfig.detectedArea = area;
    }
  }

  static Future<bool> _requestLocationPermission() async {
    final permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      final result = await Geolocator.requestPermission();
      if (result == LocationPermission.denied ||
          result == LocationPermission.deniedForever) {
        return false;
      }
    }
    if (permission == LocationPermission.deniedForever) return false;
    return true;
  }

  static Future<Position?> _safeGetCurrentPosition() async {
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) return null;
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
    } catch (_) {
      return null;
    }
  }

  /// Asks the backend for the nearest Palestine governorate
  /// (`GET /api/locations/nearest`). The lookup used to decode a 46.5 MB
  /// bundled JSON asset on the UI thread every time it ran.
  static Future<String?> _findNearestArea(double lat, double lng) async {
    try {
      final dio = MobileApiClient.create(
        baseUrl: ApiConfig.apiUrl,
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 5),
      );
      final response = await dio.get(
        '/locations/nearest',
        queryParameters: {'lat': '$lat', 'lng': '$lng'},
      );
      final data = response.data;
      final area = data is Map ? data['area'] : null;
      return area is String && area.trim().isNotEmpty ? area.trim() : null;
    } catch (_) {
      return null;
    }
  }

  static Future<void> syncToBackend(String token) async {
    final pos = await _safeGetCurrentPosition();
    if (pos == null) return;

    final area = await _findNearestArea(pos.latitude, pos.longitude);
    if (area != null) {
      ApiConfig.detectedArea = area;
    }

    try {
      final dio = MobileApiClient.create(
        baseUrl: ApiConfig.apiUrl,
        connectTimeout: null,
        receiveTimeout: null,
      );

      await dio.put(
        '/users/location',
        data: {
          'latitude': pos.latitude,
          'longitude': pos.longitude,
          'area': area,
          'isMocked': pos.isMocked,
          'accuracy': pos.accuracy,
        },
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
    } catch (_) {}
  }
}
