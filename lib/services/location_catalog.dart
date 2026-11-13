import 'package:flutter/widgets.dart';

import 'api_config.dart';
import 'mobile_api_client.dart';

/// One Palestine governorate, served by the backend's location catalog
/// (`GET /api/locations/governorates`, stored in MongoDB).
class GovernorateOption {
  const GovernorateOption({
    required this.name,
    required this.nativeName,
    required this.areaValue,
    required this.cities,
    this.cityNatives = const {},
  });

  /// English asset name, used as the stable dropdown value.
  final String name;

  /// Arabic display name from the asset (`native`).
  final String nativeName;

  /// Value stored in the account `area` for the "governorate itself" option.
  final String areaValue;

  /// Villages/cities listed under this governorate only. These English
  /// names are the values stored on accounts and orders.
  final List<String> cities;

  /// Arabic display name for each city in [cities].
  final Map<String, String> cityNatives;

  String get displayName => name.replaceFirst(' (Quds)', '').trim();

  /// The label to show for [city]: Arabic when [arabic], else the stored
  /// English name.
  String cityLabel(String city, {required bool arabic}) {
    if (!arabic) return city;
    final native = cityNatives[city];
    return native == null || native.isEmpty ? city : native;
  }

  /// [cities] ordered alphabetically by their displayed label.
  List<String> citiesSortedFor({required bool arabic}) {
    final sorted = [...cities];
    sorted.sort(
      (a, b) =>
          cityLabel(a, arabic: arabic).compareTo(cityLabel(b, arabic: arabic)),
    );
    return sorted;
  }
}

/// Loads the Palestine governorates/cities from the backend once and exposes
/// the same canonical values to registration and profile editing.
///
/// The app used to bundle and decode a 46.5 MB worldwide JSON asset for this
/// on the UI thread; the backend now serves only Palestine from MongoDB.
abstract final class LocationCatalog {
  static const String governoratesPath = '/locations/governorates';

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
  static Future<List<GovernorateOption>>? _inFlight;

  /// English city/governorate value -> Arabic display name, built from the
  /// cached catalog.
  static Map<String, String> _arabicNames = const {};

  @visibleForTesting
  static void clearCache() {
    _cache = null;
    _inFlight = null;
    _arabicNames = const {};
  }

  /// Fetches the catalog in the background so [localize] can show Arabic
  /// names; failures are ignored (labels then stay as stored).
  static void warmUp() {
    load().then((_) {}, onError: (Object _) {});
  }

  /// Whether [context] is showing Arabic.
  static bool isArabic(BuildContext context) =>
      Localizations.maybeLocaleOf(context)?.languageCode == 'ar';

  /// Display form of a stored city/area/governorate value for the current
  /// locale: Arabic names in Arabic, the stored value otherwise. Unknown
  /// values (or a catalog that is not loaded yet) are returned unchanged.
  static String localize(BuildContext context, String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty || !isArabic(context)) return trimmed;
    return _arabicNames[trimmed] ?? trimmed;
  }

  static void _index(List<GovernorateOption> governorates) {
    final names = <String, String>{};
    for (final g in governorates) {
      names[g.name] = g.nativeName;
      names[g.displayName] = g.nativeName;
      for (final city in g.cities) {
        final native = g.cityNatives[city];
        if (native != null && native.isNotEmpty) names[city] = native;
      }
    }
    _arabicNames = names;
  }

  /// Returns the cached catalog, or fetches it. Concurrent callers share one
  /// request. A failure is not cached, so a later call retries.
  static Future<List<GovernorateOption>> load() {
    final cached = _cache;
    if (cached != null) {
      return Future.value(cached);
    }
    return _inFlight ??= _fetch().whenComplete(() => _inFlight = null);
  }

  static Future<List<GovernorateOption>> _fetch() async {
    final dio = MobileApiClient.create(
      baseUrl: ApiConfig.apiUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    );
    final response = await dio.get(governoratesPath);
    final governorates = parse(response.data);
    if (governorates.isEmpty) {
      throw StateError('Location catalog is empty');
    }
    _cache = governorates;
    _index(governorates);
    return governorates;
  }

  /// Parses the `GET /api/locations/governorates` payload:
  /// `[{name, native, cities: [{name, native}]}]`. Plain string cities (the
  /// version 1 payload) are still accepted.
  @visibleForTesting
  static List<GovernorateOption> parse(Object? data) {
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((raw) {
          final name = raw['name']?.toString().trim() ?? '';
          final native = raw['native']?.toString().trim() ?? '';
          final nativeName = native.isEmpty ? name : native;
          final cities = <String>[];
          final cityNatives = <String, String>{};
          for (final city in (raw['cities'] as List?) ?? const []) {
            final cityName = (city is Map ? city['name'] : city)
                ?.toString()
                .trim();
            if (cityName == null || cityName.isEmpty) continue;
            cities.add(cityName);
            final cityNative = city is Map
                ? city['native']?.toString().trim() ?? ''
                : '';
            if (cityNative.isNotEmpty) cityNatives[cityName] = cityNative;
          }
          return GovernorateOption(
            name: name,
            nativeName: nativeName,
            areaValue: _legacyAreaValuesTrimmed[name] ?? nativeName,
            cities: cities,
            cityNatives: cityNatives,
          );
        })
        .where((option) => option.name.isNotEmpty)
        .toList();
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
