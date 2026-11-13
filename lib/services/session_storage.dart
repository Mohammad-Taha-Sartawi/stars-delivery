import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract interface class TokenVault {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class FlutterSecureTokenVault implements TokenVault {
  final FlutterSecureStorage _storage;

  FlutterSecureTokenVault({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  @override
  Future<String?> read(String key) {
    return _storage.read(key: key);
  }

  @override
  Future<void> write(String key, String value) {
    return _storage.write(key: key, value: value);
  }

  @override
  Future<void> delete(String key) {
    return _storage.delete(key: key);
  }
}

class SessionStorage {
  static const secureTokenKey = 'swifora_auth_token';

  /// Secure-storage key used before the Swifora rebrand; moved on read.
  static const preRebrandTokenKey = 'stars_auth_token';

  // Previous STARS releases stored these in SharedPreferences.
  static const legacyTokenKey = 'auth_token';
  static const legacyUserKey = 'auth_user';

  final TokenVault _vault;

  SessionStorage({TokenVault? vault})
    : _vault = vault ?? FlutterSecureTokenVault();

  Future<String?> readToken() async {
    final secureToken = await _vault.read(secureTokenKey);

    if (secureToken != null && secureToken.trim().isNotEmpty) {
      await _clearLegacyPreferences();
      return secureToken;
    }

    final preRebrandToken = await _vault.read(preRebrandTokenKey);
    if (preRebrandToken != null && preRebrandToken.trim().isNotEmpty) {
      // Write first. Never delete the old token if the write fails.
      await _vault.write(secureTokenKey, preRebrandToken);
      await _vault.delete(preRebrandTokenKey);
      await _clearLegacyPreferences();
      return preRebrandToken;
    }

    final prefs = await SharedPreferences.getInstance();
    final legacyToken = prefs.getString(legacyTokenKey);

    if (legacyToken == null || legacyToken.trim().isEmpty) {
      await prefs.remove(legacyTokenKey);
      await prefs.remove(legacyUserKey);
      return null;
    }

    // Write first. Never delete the old token if secure storage fails.
    await _vault.write(secureTokenKey, legacyToken);

    await prefs.remove(legacyTokenKey);
    await prefs.remove(legacyUserKey);

    return legacyToken;
  }

  Future<void> writeToken(String token) async {
    if (token.trim().isEmpty) {
      throw ArgumentError.value(
        token,
        'token',
        'Session token must not be empty',
      );
    }

    await _vault.write(secureTokenKey, token);
    await _clearLegacyPreferences();
  }

  Future<void> clear() async {
    await _vault.delete(secureTokenKey);
    await _vault.delete(preRebrandTokenKey);

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(legacyTokenKey);
    await prefs.remove(legacyUserKey);
  }

  Future<void> _clearLegacyPreferences() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(legacyTokenKey);
    await prefs.remove(legacyUserKey);
  }
}
