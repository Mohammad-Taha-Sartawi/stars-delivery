// Shared, test-only harness for UX-03 screen-level verification.
//
// It wires the real screens to real blocs, an in-memory API adapter and a
// no-op socket double, so no production API, authentication, database, socket
// or device resource is touched. Nothing here is compiled into the app.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:swifora/bloc/app/app_bloc.dart';
import 'package:swifora/bloc/app/app_event.dart';
import 'package:swifora/bloc/auth/auth_bloc.dart';
import 'package:swifora/bloc/notification/notification_bloc.dart';
import 'package:swifora/bloc/offer/offer_bloc.dart';
import 'package:swifora/bloc/order/order_bloc.dart';
import 'package:swifora/bloc/provider/provider_bloc.dart';
import 'package:swifora/models/user_model.dart';
import 'package:swifora/screens/create_order_screen.dart';
import 'package:swifora/screens/home_screen.dart';
import 'package:swifora/screens/my_orders_screen.dart';
import 'package:swifora/screens/notifications_screen.dart';
import 'package:swifora/screens/offered_orders_screen.dart';
import 'package:swifora/screens/order_detail_screen.dart';
import 'package:swifora/screens/order_offers_screen.dart';
import 'package:swifora/screens/order_report_screen.dart';
import 'package:swifora/screens/pending_orders_screen.dart';
import 'package:swifora/screens/profile_screen.dart';
import 'package:swifora/screens/provider_active_orders_screen.dart';
import 'package:swifora/screens/provider_home_screen.dart';
import 'package:swifora/screens/rejected_orders_screen.dart';
import 'package:swifora/screens/report_screen.dart';
import 'package:swifora/screens/submit_offer_screen.dart';
import 'package:swifora/screens/support_chat_screen.dart';
import 'package:swifora/services/api_config.dart';
import 'package:swifora/services/auth_service.dart';
import 'package:swifora/services/mobile_api_client.dart';
import 'package:swifora/services/session_storage.dart';
import 'package:swifora/services/socket_service.dart';
import 'package:swifora/services/theme_service.dart';

import 'mock_api_server.dart';

enum Ux03Screen {
  createOrder,
  myOrders,
  notifications,
  orderDetail,
  orderOffers,
  orderReport,
  profile,
  providerActive,
  rejectedOrders,
  report,
  submitOffer,
  supportChat,
  pendingOrders,
  offeredOrders,
}

class _MemoryVault implements TokenVault {
  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> delete(String key) async {}
}

class _StubGateway implements AuthGateway {
  @override
  Future<Map<String, dynamic>> login(
    String email,
    String password,
    String role,
  ) async => {'error': 'unused'};

  @override
  Future<Map<String, dynamic>> register(
    String fullName,
    String email,
    String phone,
    String password,
    String role,
    String area, {
    String governorate = '',
    bool privacyPolicy = true,
    List<String> serviceTypes = const [],
  }) async => {'error': 'unused'};

  @override
  Future<Map<String, dynamic>> validateSession(String token) async => {
    'error': 'unused',
  };
}

class _NoopSocketService extends SocketService {
  _NoopSocketService() : super.forTest();

  @override
  void connect({required String token, String? area}) {}

  @override
  void disconnect() {}
}

class Ux03Harness {
  Ux03Harness() {
    MobileApiClient.testAdapter = api.adapter;
    ApiConfig.initForTesting('http://127.0.0.1:1');
    SocketService.testInstance = _socket;
  }

  final MockApi api = MockApi();
  final _NoopSocketService _socket = _NoopSocketService();

  static final UserModel customer = UserModel(
    id: '1',
    fullName: 'Customer One',
    email: 'customer@example.test',
    phone: '0501234567',
    role: 'customer',
    area: 'Jerusalem',
    publicId: 'CUS-1',
  );

  static final UserModel provider = UserModel(
    id: '2',
    fullName: 'Provider One',
    email: 'provider@example.test',
    phone: '0507654321',
    role: 'provider',
    area: 'Jerusalem',
    publicId: 'PRV-2',
  );

  void dispose() {
    SocketService.testInstance = null;
    MobileApiClient.testAdapter = null;
  }

  Widget app(
    Widget home, {
    required ThemeMode themeMode,
    required Locale locale,
    GlobalKey? boundaryKey,
  }) {
    final appBloc = AppBloc()
      ..add(SetTheme(themeMode))
      ..add(SetLocale(locale));

    return RepaintBoundary(
      key: boundaryKey,
      child: MultiBlocProvider(
        providers: [
          BlocProvider(create: (_) => appBloc),
          BlocProvider(
            create: (_) => AuthBloc(
              authService: _StubGateway(),
              sessionStorage: SessionStorage(vault: _MemoryVault()),
              checkOnStart: false,
            ),
          ),
          BlocProvider(create: (_) => NotificationBloc()),
          BlocProvider(create: (_) => OrderBloc()),
          BlocProvider(create: (_) => OfferBloc()),
          BlocProvider(create: (_) => ProviderBloc()),
        ],
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: themeMode,
          locale: locale,
          supportedLocales: const [Locale('ar'), Locale('en')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: home,
        ),
      ),
    );
  }

  Widget buildScreen(Ux03Screen screen) {
    switch (screen) {
      case Ux03Screen.createOrder:
        return CreateOrderScreen(user: customer, token: 'test-token');
      case Ux03Screen.myOrders:
        return const MyOrdersScreen(token: 'test-token');
      case Ux03Screen.notifications:
        return const NotificationsScreen(token: 'test-token');
      case Ux03Screen.orderDetail:
        return const OrderDetailScreen(token: 'test-token', orderId: 'order-1');
      case Ux03Screen.orderOffers:
        return const OrderOffersScreen(token: 'test-token', orderId: 'order-1');
      case Ux03Screen.orderReport:
        return const OrderReportScreen(token: 'test-token', orderId: 'order-1');
      case Ux03Screen.profile:
        return ProfileScreen(user: customer, token: 'test-token');
      case Ux03Screen.providerActive:
        return const ProviderActiveOrdersScreen(token: 'test-token');
      case Ux03Screen.rejectedOrders:
        return const RejectedOrdersScreen(token: 'test-token');
      case Ux03Screen.report:
        return const ReportScreen(
          token: 'test-token',
          reportType: 'driver',
          title: 'Report driver',
        );
      case Ux03Screen.submitOffer:
        return const SubmitOfferScreen(token: 'test-token', orderId: 'order-1');
      case Ux03Screen.supportChat:
        return const SupportChatScreen(token: 'test-token');
      case Ux03Screen.pendingOrders:
        return const PendingOrdersScreen(orders: [], token: 'test-token');
      case Ux03Screen.offeredOrders:
        return const OfferedOrdersScreen(orders: [], token: 'test-token');
    }
  }

  Future<void> pumpScreen(
    WidgetTester tester,
    Ux03Screen screen, {
    ThemeMode themeMode = ThemeMode.light,
    Locale locale = const Locale('en'),
    GlobalKey? boundaryKey,
  }) async {
    await tester.pumpWidget(
      app(
        buildScreen(screen),
        themeMode: themeMode,
        locale: locale,
        boundaryKey: boundaryKey,
      ),
    );
    // Flush bloc locale/theme events and initial service futures.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  Future<void> pumpCustomerHome(
    WidgetTester tester, {
    ThemeMode themeMode = ThemeMode.light,
    Locale locale = const Locale('en'),
    GlobalKey? boundaryKey,
  }) async {
    await tester.pumpWidget(
      app(
        HomeScreen(user: customer, role: customer.role, token: 'test-token'),
        themeMode: themeMode,
        locale: locale,
        boundaryKey: boundaryKey,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  Future<void> pumpProviderHome(
    WidgetTester tester, {
    ThemeMode themeMode = ThemeMode.light,
    Locale locale = const Locale('en'),
    GlobalKey? boundaryKey,
  }) async {
    await tester.pumpWidget(
      app(
        ProviderHomeScreen(user: provider, token: 'test-token'),
        themeMode: themeMode,
        locale: locale,
        boundaryKey: boundaryKey,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }
}
