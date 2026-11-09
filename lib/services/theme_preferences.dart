import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persists the user's theme choice between application launches.
abstract final class ThemePreferences {
  static const String storageKey = 'stars_theme_mode';

  static const String lightValue = 'light';
  static const String darkValue = 'dark';
  static const String systemValue = 'system';

  static ThemeMode decode(String? value) {
    switch (value) {
      case darkValue:
        return ThemeMode.dark;
      case systemValue:
        return ThemeMode.system;
      default:
        return ThemeMode.light;
    }
  }

  static String encode(ThemeMode mode) {
    switch (mode) {
      case ThemeMode.dark:
        return darkValue;
      case ThemeMode.system:
        return systemValue;
      case ThemeMode.light:
        return lightValue;
    }
  }

  static Future<ThemeMode> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return decode(prefs.getString(storageKey));
    } catch (_) {
      return ThemeMode.light;
    }
  }

  static Future<void> save(ThemeMode mode) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(storageKey, encode(mode));
    } catch (_) {
      // Persistence must never break theme switching.
    }
  }
}
