import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

class FirebaseBootstrap {
  static const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const _messagingSenderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
  );
  static const _storageBucket = String.fromEnvironment(
    'FIREBASE_STORAGE_BUCKET',
  );
  static const _androidAppId = String.fromEnvironment(
    'FIREBASE_ANDROID_APP_ID',
  );
  static const _iosAppId = String.fromEnvironment('FIREBASE_IOS_APP_ID');
  static const _iosBundleId = String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID');
  static const _measurementId = String.fromEnvironment(
    'FIREBASE_MEASUREMENT_ID',
  );

  static bool _initialized = false;

  static bool get isConfigured =>
      _apiKey.isNotEmpty &&
      _projectId.isNotEmpty &&
      _messagingSenderId.isNotEmpty &&
      (_androidAppId.isNotEmpty || _iosAppId.isNotEmpty);

  static Future<bool> initialize() async {
    if (_initialized) return true;
    if (!isConfigured) return false;

    final appId = Platform.isIOS ? _iosAppId : _androidAppId;
    if (appId.isEmpty) return false;

    try {
      await Firebase.initializeApp(
        options: FirebaseOptions(
          apiKey: _apiKey,
          appId: appId,
          messagingSenderId: _messagingSenderId,
          projectId: _projectId,
          storageBucket: _storageBucket.isEmpty ? null : _storageBucket,
          iosBundleId: Platform.isIOS && _iosBundleId.isNotEmpty
              ? _iosBundleId
              : null,
          measurementId: _measurementId.isEmpty ? null : _measurementId,
        ),
      );
      _initialized = true;
      return true;
    } catch (error) {
      debugPrint('Firebase initialization skipped: $error');
      return false;
    }
  }
}
