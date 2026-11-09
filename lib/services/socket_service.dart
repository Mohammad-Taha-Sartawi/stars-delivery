import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'api_config.dart';

class SocketService {
  static SocketService? _instance;
  io.Socket? _socket;

  final _newOrderController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _newOfferController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _offerAcceptedController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _offerNotSelectedController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _offerCancelledController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _orderStatusController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _deliveryConfirmationRequestedController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _deliveryConfirmationResultController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _notifCountController = StreamController<int>.broadcast();
  final _supportReplyController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _broadcastController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _accountDeletedController = StreamController<void>.broadcast();
  final _sessionRevokedController = StreamController<void>.broadcast();

  Stream<Map<String, dynamic>> get onNewOrder => _newOrderController.stream;
  Stream<Map<String, dynamic>> get onNewOffer => _newOfferController.stream;
  Stream<Map<String, dynamic>> get onOfferAccepted =>
      _offerAcceptedController.stream;
  Stream<Map<String, dynamic>> get onOfferNotSelected =>
      _offerNotSelectedController.stream;
  Stream<Map<String, dynamic>> get onOfferCancelled =>
      _offerCancelledController.stream;
  Stream<Map<String, dynamic>> get onOrderStatusChanged =>
      _orderStatusController.stream;
  Stream<Map<String, dynamic>> get onDeliveryConfirmationRequested =>
      _deliveryConfirmationRequestedController.stream;
  Stream<Map<String, dynamic>> get onDeliveryConfirmationResult =>
      _deliveryConfirmationResultController.stream;
  Stream<int> get onNotificationCount => _notifCountController.stream;
  Stream<Map<String, dynamic>> get onSupportReply =>
      _supportReplyController.stream;
  Stream<Map<String, dynamic>> get onBroadcast => _broadcastController.stream;
  Stream<void> get onAccountDeleted => _accountDeletedController.stream;
  Stream<void> get onSessionRevoked => _sessionRevokedController.stream;

  bool get isConnected => _socket?.connected ?? false;

  static SocketService get instance {
    // Widget tests install a no-op override so no real socket is opened.
    final override = _instanceOverride;
    if (override != null) {
      return override;
    }

    _instance ??= SocketService._();
    return _instance!;
  }

  static SocketService? _instanceOverride;

  /// Installs a test double; pass null to restore the real singleton.
  @visibleForTesting
  static set testInstance(SocketService? value) => _instanceOverride = value;

  SocketService._();

  /// Constructor for test doubles only (real code uses the [instance]
  /// singleton and never constructs this class directly).
  @visibleForTesting
  SocketService.forTest();

  void connect({required String token, String? area}) {
    disconnect();

    final uri = ApiConfig.serverUrl;
    _socket = io.io(
      uri,
      io.OptionBuilder()
          .setAuth({'token': token})
          .setQuery({'area': area ?? ''})
          .setTransports(['websocket', 'polling'])
          .enableAutoConnect()
          .build(),
    );

    _socket!.onConnect((_) {
      print('Socket connected');
    });

    _socket!.onDisconnect((reason) {
      print('Socket disconnected');

      if (reason == 'io server disconnect') {
        _sessionRevokedController.add(null);
      }
    });

    _socket!.onConnectError((error) {
      final message = error.toString().toLowerCase();

      if (message.contains('invalid authentication') ||
          message.contains('authentication required')) {
        _sessionRevokedController.add(null);
      }
    });

    _socket!.on('new_order', (data) {
      if (data is Map) {
        _newOrderController.add(Map<String, dynamic>.from(data));
      }
    });

    _socket!.on('new_offer', (data) {
      if (data is Map) {
        _newOfferController.add(Map<String, dynamic>.from(data));
      }
    });

    _socket!.on('offer_accepted', (data) {
      if (data is Map) {
        _offerAcceptedController.add(Map<String, dynamic>.from(data));
      }
    });

    _socket!.on('offer_not_selected', (data) {
      if (data is Map) {
        _offerNotSelectedController.add(Map<String, dynamic>.from(data));
      }
    });

    _socket!.on('offer_cancelled', (data) {
      if (data is Map) {
        _offerCancelledController.add(Map<String, dynamic>.from(data));
      }
    });

    _socket!.on('order_status_changed', (data) {
      if (data is Map) {
        _orderStatusController.add(Map<String, dynamic>.from(data));
      }
    });

    _socket!.on('delivery_confirmation_requested', (data) {
      if (data is Map) {
        _deliveryConfirmationRequestedController.add(
          Map<String, dynamic>.from(data),
        );
      }
    });

    _socket!.on('delivery_confirmation_result', (data) {
      if (data is Map) {
        _deliveryConfirmationResultController.add(
          Map<String, dynamic>.from(data),
        );
      }
    });

    _socket!.on('notification_count', (data) {
      if (data is Map && data['unreadCount'] is int) {
        _notifCountController.add(data['unreadCount'] as int);
      }
    });

    _socket!.on('support_reply', (data) {
      if (data is Map) {
        _supportReplyController.add(Map<String, dynamic>.from(data));
      }
    });

    _socket!.on('broadcast', (data) {
      if (data is Map) {
        _broadcastController.add(Map<String, dynamic>.from(data));
      }
    });

    _socket!.on('account_deleted', (_) {
      _accountDeletedController.add(null);
    });

    _socket!.connect();
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }

  void dispose() {
    disconnect();
    _newOrderController.close();
    _newOfferController.close();
    _offerAcceptedController.close();
    _offerNotSelectedController.close();
    _offerCancelledController.close();
    _orderStatusController.close();
    _deliveryConfirmationRequestedController.close();
    _deliveryConfirmationResultController.close();
    _notifCountController.close();
    _supportReplyController.close();
    _broadcastController.close();
    _accountDeletedController.close();
    _sessionRevokedController.close();
    _instance = null;
  }
}
