import 'dart:convert';
import 'package:flutter/services.dart';
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

  static Future<String?> _findNearestArea(double lat, double lng) async {
    try {
      final jsonStr = await rootBundle.loadString(
        'assets/countries+states+cities.json',
      );
      final List countries = jsonDecode(jsonStr);
      final palestine = countries.firstWhere(
        (c) => c['iso2'] == 'PS',
        orElse: () => null,
      );
      if (palestine == null) return null;

      final states = palestine['states'] as List;
      final List<_CityEntry> cities = [];

      for (final state in states) {
        final stateName = state['name'] as String;
        final stateCities = state['cities'] as List? ?? [];
        if (stateCities.isEmpty) {
          // Use state center if no cities
          final sLat = double.tryParse(state['latitude'] ?? '');
          final sLng = double.tryParse(state['longitude'] ?? '');
          if (sLat != null && sLng != null) {
            cities.add(_CityEntry(stateName, sLat, sLng));
          }
        } else {
          for (final city in stateCities) {
            final cLat = double.tryParse(city['latitude'] ?? '');
            final cLng = double.tryParse(city['longitude'] ?? '');
            if (cLat != null && cLng != null) {
              cities.add(_CityEntry(stateName, cLat, cLng));
            }
          }
        }
      }

      if (cities.isEmpty) return null;

      double minDist = double.infinity;
      String? closestArea;

      for (final c in cities) {
        final d = _distanceSq(lat, lng, c.lat, c.lng);
        if (d < minDist) {
          minDist = d;
          closestArea = c.state;
        }
      }

      // 0.5°² ≈ ~50km radius cutoff
      if (minDist > 0.25) return null;
      return closestArea;
    } catch (e) {
      return null;
    }
  }

  static double _distanceSq(
    double lat1,
    double lng1,
    double lat2,
    double lng2,
  ) {
    final dlat = lat1 - lat2;
    final dlng = lng1 - lng2;
    return dlat * dlat + dlng * dlng;
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

class _CityEntry {
  final String state;
  final double lat;
  final double lng;
  _CityEntry(this.state, this.lat, this.lng);
}
