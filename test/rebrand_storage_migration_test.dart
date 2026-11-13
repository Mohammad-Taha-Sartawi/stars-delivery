// Swifora rebrand: values saved under the old Stars Delivery keys are moved
// to the new keys on first read, so an update keeps the user signed in and
// keeps their language and theme.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:swifora/services/locale_preferences.dart';
import 'package:swifora/services/session_storage.dart';
import 'package:swifora/services/theme_preferences.dart';

class _MemoryVault implements TokenVault {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

void main() {
  test('session token moves from the pre-rebrand key', () async {
    SharedPreferences.setMockInitialValues({});
    final vault = _MemoryVault()
      ..values[SessionStorage.preRebrandTokenKey] = 'old-token';
    final storage = SessionStorage(vault: vault);

    expect(await storage.readToken(), 'old-token');
    expect(vault.values[SessionStorage.secureTokenKey], 'old-token');
    expect(
      vault.values.containsKey(SessionStorage.preRebrandTokenKey),
      isFalse,
    );
    expect(SessionStorage.secureTokenKey, 'swifora_auth_token');
  });

  test('logout clears both the new and the pre-rebrand token keys', () async {
    SharedPreferences.setMockInitialValues({});
    final vault = _MemoryVault()
      ..values[SessionStorage.secureTokenKey] = 'new'
      ..values[SessionStorage.preRebrandTokenKey] = 'old';
    await SessionStorage(vault: vault).clear();
    expect(vault.values, isEmpty);
  });

  test('language and theme move from the pre-rebrand keys', () async {
    SharedPreferences.setMockInitialValues({
      LocalePreferences.legacyStorageKey: 'en',
      ThemePreferences.legacyStorageKey: 'dark',
    });

    expect(await LocalePreferences.load(), const Locale('en'));
    expect(await ThemePreferences.load(), ThemeMode.dark);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(LocalePreferences.storageKey), 'en');
    expect(prefs.getString(ThemePreferences.storageKey), 'dark');
    expect(prefs.containsKey(LocalePreferences.legacyStorageKey), isFalse);
    expect(prefs.containsKey(ThemePreferences.legacyStorageKey), isFalse);
  });

  test('the new key wins when both exist', () async {
    SharedPreferences.setMockInitialValues({
      LocalePreferences.storageKey: 'ar',
      LocalePreferences.legacyStorageKey: 'en',
    });
    expect(await LocalePreferences.load(), const Locale('ar'));
  });
}
