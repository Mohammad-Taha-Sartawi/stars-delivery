import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api_config.dart';
import 'firebase_bootstrap.dart';
import 'mobile_api_client.dart';

@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  await FirebaseBootstrap.initialize();
}

class PushNotificationService {
  static final PushNotificationService instance = PushNotificationService._();

  PushNotificationService._();

  bool _started = false;
  String? _authToken;
  String? _deviceToken;
  StreamSubscription<String>? _refreshSub;

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

      // ignore: deprecated_member_use
      _refreshSub = messaging.onTokenRefresh.listen((token) {
        _deviceToken = token;
        unawaited(_register(token));
      });

      FirebaseMessaging.onMessage.listen((message) {
        debugPrint('Foreground push: ${message.messageId ?? ''}');
      });
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

  Future<void> stop() async {
    await _refreshSub?.cancel();
    _refreshSub = null;

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
