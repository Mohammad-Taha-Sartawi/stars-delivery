import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api_config.dart';
import 'firebase_bootstrap.dart';
import 'mobile_api_client.dart';

/// Runs in a background isolate when a push arrives while the app is in the
/// background or closed. The system tray shows the notification by itself
/// (the server sends a `notification` block on the `swifora_default`
/// channel), so nothing else is needed here.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  await FirebaseBootstrap.initialize();
}

/// A push that arrived while the app was open.
class ForegroundPush {
  const ForegroundPush({
    required this.title,
    required this.body,
    required this.data,
  });

  final String title;
  final String body;
  final Map<String, dynamic> data;
}

class PushNotificationService {
  static final PushNotificationService instance = PushNotificationService._();

  PushNotificationService._();

  bool _started = false;
  String? _authToken;
  String? _deviceToken;
  final List<StreamSubscription<dynamic>> _subs = [];

  final StreamController<Map<String, dynamic>> _openedController =
      StreamController<Map<String, dynamic>>.broadcast();
  final StreamController<ForegroundPush> _foregroundController =
      StreamController<ForegroundPush>.broadcast();

  /// Data of a notification the user tapped. The home screens listen and
  /// open the related screen.
  Stream<Map<String, dynamic>> get onOpened => _openedController.stream;

  /// Pushes received while the app is in the foreground (Android does not
  /// show those in the tray).
  Stream<ForegroundPush> get onForeground => _foregroundController.stream;

  /// A tap that arrived before any home screen was listening (the app was
  /// launched from the notification). Read once with [takePendingOpen].
  Map<String, dynamic>? _pendingOpen;

  /// Returns and clears the notification that launched the app, if any.
  Map<String, dynamic>? takePendingOpen() {
    final pending = _pendingOpen;
    _pendingOpen = null;
    return pending;
  }

  @visibleForTesting
  void handleOpened(Map<String, dynamic> data) {
    if (_openedController.hasListener) {
      _openedController.add(data);
    } else {
      _pendingOpen = data;
    }
  }

  @visibleForTesting
  void handleForeground(ForegroundPush push) {
    _foregroundController.add(push);
  }

  Future<void> start(String authToken) async {
    if (_started) return;
    _started = true;
    _authToken = authToken;

    if (!await FirebaseBootstrap.initialize()) {
      return;
    }

    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);

      // ignore: deprecated_member_use
      _deviceToken = await messaging.getToken();
      if (_deviceToken != null && _deviceToken!.isNotEmpty) {
        await _register(_deviceToken!);
      }

      _subs.add(
        // ignore: deprecated_member_use
        messaging.onTokenRefresh.listen((token) {
          _deviceToken = token;
          unawaited(_register(token));
        }),
      );

      _subs.add(
        FirebaseMessaging.onMessage.listen((message) {
          final notification = message.notification;
          handleForeground(
            ForegroundPush(
              title: notification?.title ?? '',
              body: notification?.body ?? '',
              data: message.data,
            ),
          );
        }),
      );

      // Tapped while the app was in the background.
      _subs.add(
        FirebaseMessaging.onMessageOpenedApp.listen(
          (message) => handleOpened(message.data),
        ),
      );

      // Tapped while the app was closed: delivered once, after login.
      final initial = await messaging.getInitialMessage();
      if (initial != null) {
        handleOpened(initial.data);
      }
    } catch (error) {
      debugPrint('Push notification setup skipped: $error');
    }
  }

  Future<void> _register(String token) async {
    final auth = _authToken;
    if (auth == null || token.isEmpty) return;

    try {
      final dio = _client(auth);
      await dio.post(
        '/users/push-token',
        data: {'token': token, 'platform': Platform.isIOS ? 'ios' : 'android'},
      );
    } catch (_) {
      // Registration retries on the next token refresh or app start.
    }
  }

  /// Stops delivery to this device for the signed-in account. Call it before
  /// revoking the session: the token removal needs a valid session. (The
  /// server also drops the account's tokens on logout.)
  Future<void> stop() async {
    for (final sub in _subs) {
      await sub.cancel();
    }
    _subs.clear();
    _pendingOpen = null;

    final auth = _authToken;
    final deviceToken = _deviceToken;
    _started = false;
    _authToken = null;
    _deviceToken = null;

    if (auth == null) return;

    try {
      final dio = _client(auth);
      final data = <String, dynamic>{};
      if (deviceToken != null) {
        data['token'] = deviceToken;
      }
      await dio.delete('/users/push-token', data: data);
    } catch (_) {}
  }

  Dio _client(String authToken) => MobileApiClient.create(
    baseUrl: ApiConfig.apiUrl,
    headers: {
      'Authorization': 'Bearer $authToken',
      'Content-Type': 'application/json',
    },
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 15),
  );
}
