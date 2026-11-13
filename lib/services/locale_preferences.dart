import 'dart:ui';

import 'package:shared_preferences/shared_preferences.dart';

/// Persists the user's language choice between application launches.
abstract final class LocalePreferences {
  static const String storageKey = 'swifora_locale';

  /// Key used before the Swifora rebrand; moved to [storageKey] on load.
  static const String legacyStorageKey = 'stars_locale';
  static const String arabicValue = 'ar';
  static const String englishValue = 'en';

  static Locale decode(String? value) {
    return value == englishValue ? const Locale('en') : const Locale('ar');
  }

  static String encode(Locale locale) {
    return locale.languageCode == 'en' ? englishValue : arabicValue;
  }

  static Future<Locale> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(storageKey);
      if (stored != null) return decode(stored);
      final legacy = prefs.getString(legacyStorageKey);
      if (legacy != null) {
        await prefs.setString(storageKey, legacy);
        await prefs.remove(legacyStorageKey);
      }
      return decode(legacy);
    } catch (_) {
      return const Locale('ar');
    }
  }

  static Future<void> save(Locale locale) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(storageKey, encode(locale));
    } catch (_) {
      // Persistence must never break locale switching.
    }
  }
}
