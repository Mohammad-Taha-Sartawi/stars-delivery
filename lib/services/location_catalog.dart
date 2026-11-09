import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// One governorate from the bundled Palestine location asset.
class GovernorateOption {
  const GovernorateOption({
    required this.name,
    required this.nativeName,
    required this.areaValue,
    required this.cities,
  });

  /// English asset name, used as the stable dropdown value.
  final String name;

  /// Arabic display name from the asset (`native`).
  final String nativeName;

  /// Value stored in the account `area` for the "governorate itself" option.
  final String areaValue;

  /// Villages/cities listed under this governorate only.
  final List<String> cities;

  String get displayName => name.replaceFirst(' (Quds)', '').trim();
}

/// Loads the Palestine governorate/city asset once and exposes the same
/// canonical values to registration and profile editing.
abstract final class LocationCatalog {
  static const String assetPath = 'assets/countries+states+cities.json';

  static const Map<String, String> legacyAreaValues = {
    'Jerusalem (Quds)': 'القدس',
    'Ramallah': 'رام الله والبيرة',
    'Hebron': 'الخليل',
    'Nablus': 'نابلس',
    'Bethlehem': 'بيت لحم',
    'Jericho': 'أريحا',
    'Salfit': 'سلفيت',
    'Jenin': 'جنين',
    'Tulkarm': 'طولكرم',
    'Qalqilya': 'قلقيلية',
    'Tubas': 'طوباس',
    'Gaza': 'غزة',
    'Khan Yunis': 'خان يونس',
    'Rafah': 'رفح',
    'Deir El Balah': 'دير البلح',
    'North Gaza': 'شمال غزة',
  };

  static final Map<String, String> _legacyAreaValuesTrimmed = {
    for (final entry in legacyAreaValues.entries) entry.key.trim(): entry.value,
  };

  static List<GovernorateOption>? _cache;

  @visibleForTesting
  static void clearCache() {
    _cache = null;
  }

  static Future<List<GovernorateOption>> load() async {
    final cached = _cache;
    if (cached != null) {
      return cached;
    }

    final json = await rootBundle.loadString(assetPath);
    final list = jsonDecode(json) as List;
    final palestine = list.cast<Map<String, dynamic>>().firstWhere(
      (country) => country['iso2'] == 'PS',
    );
    final states = palestine['states'] as List;

    final governorates = states.cast<Map<String, dynamic>>().map((state) {
      final name = state['name'].toString().trim();
      final native = state['native']?.toString().trim() ?? '';
      final nativeName = native.isEmpty ? name : native;
      final cities = ((state['cities'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map((city) => city['name'].toString().trim())
          .where((city) => city.isNotEmpty)
          .toList();

      return GovernorateOption(
        name: name,
        nativeName: nativeName,
        areaValue: _legacyAreaValuesTrimmed[name] ?? nativeName,
        cities: cities,
      );
    }).toList();

    _cache = governorates;
    return governorates;
  }

  /// Finds the governorate/current village for an existing account, including
  /// legacy accounts that only stored the governorate name in `area`.
  static GovernorateOption? findForUser(
    List<GovernorateOption> governorates, {
    required String governorate,
    required String area,
  }) {
    final governorateValue = governorate.trim();
    final areaValue = area.trim();

    if (governorateValue.isNotEmpty) {
      for (final option in governorates) {
        if (option.areaValue == governorateValue ||
            option.nativeName == governorateValue ||
            option.name == governorateValue ||
            option.displayName == governorateValue) {
          return option;
        }
      }
    }

    if (areaValue.isNotEmpty) {
      for (final option in governorates) {
        if (option.cities.contains(areaValue) ||
            option.areaValue == areaValue ||
            option.nativeName == areaValue ||
            option.name == areaValue) {
          return option;
        }
      }
    }

    return null;
  }

  static String? cityForUser(GovernorateOption option, String area) {
    final areaValue = area.trim();
    if (areaValue.isEmpty) return null;
    if (option.cities.contains(areaValue)) return areaValue;
    if (areaValue == option.areaValue ||
        areaValue == option.nativeName ||
        areaValue == option.name) {
      return option.areaValue;
    }
    return null;
  }
}
