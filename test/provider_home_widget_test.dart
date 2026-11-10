// UX-01 remediation tests: ProviderHomeScreen behavioral coverage.
//
// UX01-005: the screen previously had no widget tests or runtime visual
// verification. These tests pump the real screen against the shared in-memory
// API fixture (test/mock_api_server.dart) and a no-op socket double, then
// verify initial rendering, the visible order counts, the availability toggle
// behavior, theme/locale directions, text scaling, and the bottom system
// inset behavior (UX01-007).
//
// Note on ProviderLoading/ProviderError: the ProviderBloc is constructed with
// ProviderStatsLoaded(zeros) and never emits ProviderLoading or ProviderError
// (errors are re-emitted as a loaded state, see lib/bloc/provider/provider_bloc.dart).
// Those branches are unreachable with the production bloc and are documented
// in the acceptance report rather than exercised here.
//
// No production API calls, authentication, or database mutations occur: all
// network traffic runs on the in-memory adapter, and the socket service is a
// no-op double installed through the @visibleForTesting seam.

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/bloc/app/app_bloc.dart';
import 'package:stars_delivery/bloc/app/app_event.dart';
import 'package:stars_delivery/bloc/auth/auth_bloc.dart';
import 'package:stars_delivery/bloc/notification/notification_bloc.dart';
import 'package:stars_delivery/bloc/provider/provider_bloc.dart';
import 'package:stars_delivery/models/user_model.dart';
import 'package:stars_delivery/screens/provider_home_screen.dart';
import 'package:stars_delivery/services/api_config.dart';
import 'package:stars_delivery/services/auth_service.dart';
import 'package:stars_delivery/services/mobile_api_client.dart';
import 'package:stars_delivery/services/session_storage.dart';
import 'package:stars_delivery/services/socket_service.dart';
import 'package:stars_delivery/services/theme_service.dart';
import 'package:stars_delivery/widgets/ui/app_action_tile.dart';
import 'package:stars_delivery/widgets/ui/app_tone.dart';

import 'mock_api_server.dart';

class _TestVault implements TokenVault {
  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> delete(String key) async {}
}

/// Socket double: no real socket; streams stay silent.
class _NoopSocketService extends SocketService {
  _NoopSocketService() : super.forTest();

  int connectCalls = 0;
  int disconnectCalls = 0;

  @override
  void connect({required String token, String? area}) {
    connectCalls++;
  }

  @override
  void disconnect() {
    disconnectCalls++;
  }
}

UserModel _mockUser() {
  return UserModel(
    id: '42',
    fullName: 'Ann Provider',
    email: 'ann@stars.test',
    phone: '0501234567',
    role: 'provider',
    area: 'Jerusalem',
    publicId: 'PRV-42',
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final mockApi = MockApi();
  _NoopSocketService? socket;
  MobileApiClient.testAdapter = mockApi.adapter;
  // The provider screen resolves its base URL via ApiConfig; a stable loopback
  // origin (the adapter ignores it in favor of fixture paths).
  ApiConfig.initForTesting('http://127.0.0.1:1');

  setUp(() {
    mockApi.reset();
    socket = _NoopSocketService();
    SocketService.testInstance = socket;
  });

  tearDownAll(() {
    SocketService.testInstance = null;
    MobileApiClient.testAdapter = null;
  });

  Widget screenHarness({required ThemeMode themeMode, required Locale locale}) {
    final appBloc = AppBloc();
    appBloc.add(SetTheme(themeMode));
    appBloc.add(SetLocale(locale));
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => appBloc),
        BlocProvider(
          create: (_) => AuthBloc(
            authService: _RecordingSessionGateway(),
            sessionStorage: SessionStorage(vault: _TestVault()),
            checkOnStart: false,
          ),
        ),
        BlocProvider(create: (_) => ProviderBloc()),
        BlocProvider(create: (_) => NotificationBloc()),
      ],
      child: MaterialApp(
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
        home: ProviderHomeScreen(user: _mockUser(), token: 'test-token'),
      ),
    );
  }

  group('UX01-005 initial rendering', () {
    testWidgets('shows greeting, tiles with counts, and availability card', (
      tester,
    ) async {
      mockApi.statsJson = <String, dynamic>{
        'dailyEarnings': 120.5,
        'monthlyEarnings': 900.0,
        'totalSuccessful': 12,
        'dailyOrderCount': 3,
        'dailyCommission': 6.0,
        'monthlyCommission': 45.0,
        'pendingOrdersCount': 4,
        'offeredOrdersCount': 2,
        'ordersReportCount': 7,
        'activeOrdersCount': 1,
        'isAvailable': true,
      };

      await tester.pumpWidget(
        screenHarness(themeMode: ThemeMode.light, locale: const Locale('en')),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      // Real providers stats were fetched through the mock adapter.
      expect(mockApi.statsRequests, 1);
      // The user greeting and dashboard header are localized English text.
      expect(find.text('Ann Provider'), findsOneWidget);
      expect(find.text('Available to receive orders'), findsOneWidget);

      // The loaded stats must survive the concurrent pending/offered loads.
      // Bloc 9 runs event handlers concurrently, and a stale pre-await state
      // snapshot previously overwrote the freshly loaded stats with zeros.
      expect(find.text('You have 7 pending order(s)/offer(s)'), findsOneWidget);
      expect(find.text('4'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);

      // Availability card reflects the loaded stats without a small switch.
      expect(
        find.byKey(const Key('providerAvailabilityToggle')),
        findsOneWidget,
      );
      expect(find.byType(SwitchListTile), findsNothing);
    });
  });

  group('UX01-005 availability toggle', () {
    testWidgets(
      'paused availability fades actions but keeps support and live count',
      (tester) async {
        mockApi.statsJson = <String, dynamic>{
          'dailyEarnings': 120.5,
          'monthlyEarnings': 900.0,
          'totalSuccessful': 12,
          'dailyOrderCount': 3,
          'dailyCommission': 6.0,
          'monthlyCommission': 45.0,
          'pendingOrdersCount': 4,
          'offeredOrdersCount': 2,
          'ordersReportCount': 7,
          'activeOrdersCount': 1,
          'isAvailable': false,
        };

        await tester.pumpWidget(
          screenHarness(themeMode: ThemeMode.light, locale: const Locale('en')),
        );
        await tester.pumpAndSettle();

        expect(find.text('Order reception is paused'), findsOneWidget);
        expect(find.text('Unavailable to receive orders'), findsOneWidget);
        expect(find.byType(SwitchListTile), findsNothing);
        expect(
          find.textContaining('4 order(s) are waiting for a price offer'),
          findsOneWidget,
        );

        final disabledArea = find.byKey(
          const Key('providerUnavailableDisabledArea'),
        );
        expect(disabledArea, findsOneWidget);
        expect(
          find.descendant(
            of: disabledArea,
            matching: find.text('New Orders Awaiting Your Offer'),
          ),
          findsOneWidget,
        );

        // Support remains outside the faded, non-interactive area.
        expect(find.text('Contact support'), findsOneWidget);
        expect(
          find.descendant(
            of: disabledArea,
            matching: find.text('Contact support'),
          ),
          findsNothing,
        );
        final opacity = tester.widget<AnimatedOpacity>(
          find
              .descendant(
                of: disabledArea,
                matching: find.byType(AnimatedOpacity),
              )
              .first,
        );
        expect(opacity.opacity, 0.38);

        // The pending counter keeps updating while the rest is paused.
        mockApi.statsJson = <String, dynamic>{
          ...mockApi.statsJson,
          'pendingOrdersCount': 7,
        };
        await tester.pump(const Duration(seconds: 30));
        await tester.pumpAndSettle();
        expect(
          find.textContaining('7 order(s) are waiting for a price offer'),
          findsOneWidget,
        );
      },
    );

    testWidgets('availability card paints its list tile on its own Material', (
      tester,
    ) async {
      mockApi.statsJson = <String, dynamic>{
        'dailyEarnings': 0.0,
        'monthlyEarnings': 0.0,
        'totalSuccessful': 0,
        'dailyOrderCount': 0,
        'dailyCommission': 0.0,
        'monthlyCommission': 0.0,
        'totalCommissionDue': 0.0,
        'pendingOrdersCount': 0,
        'offeredOrdersCount': 0,
        'ordersReportCount': 0,
        'activeOrdersCount': 0,
        'isAvailable': true,
      };

      await tester.pumpWidget(
        screenHarness(themeMode: ThemeMode.light, locale: const Locale('en')),
      );
      await tester.pumpAndSettle();

      final availabilityTile = find.byKey(
        const Key('providerAvailabilityToggle'),
      );
      expect(availabilityTile, findsOneWidget);

      // Regression guard for:
      // "ListTile background color or ink splashes may be invisible."
      // The nearest structural surface must be a Material that owns the
      // availability background, never a decorated Container.
      Element? surface;
      tester.element(availabilityTile).visitAncestorElements((element) {
        if (element.widget is Material || element.widget is DecoratedBox) {
          surface = element;
          return false;
        }
        return true;
      });

      expect(surface, isNotNull);
      expect(
        surface!.widget,
        isA<Material>(),
        reason:
            'the availability card must be a Material, not a DecoratedBox '
            'with a background color',
      );
      expect(
        (surface!.widget as Material).color,
        appToneStyle(
          tester.element(availabilityTile),
          AppTone.success,
        ).background,
      );

      await tester.ensureVisible(availabilityTile);
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      await tester.tap(availabilityTile);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'pay now appears only with due commission and opens instructions',
      (tester) async {
        mockApi.statsJson = <String, dynamic>{
          'dailyEarnings': 0.0,
          'monthlyEarnings': 500.0,
          'totalSuccessful': 3,
          'dailyOrderCount': 0,
          'dailyCommission': 0.0,
          'monthlyCommission': 45.0,
          'totalCommissionDue': 45.0,
          'pendingOrdersCount': 0,
          'offeredOrdersCount': 0,
          'ordersReportCount': 0,
          'activeOrdersCount': 0,
          'isAvailable': true,
        };

        await tester.pumpWidget(
          screenHarness(themeMode: ThemeMode.light, locale: const Locale('en')),
        );
        await tester.pumpAndSettle();

        final payButton = find.byKey(const Key('payCommissionButton'));
        await tester.ensureVisible(payButton);
        await tester.pumpAndSettle(const Duration(milliseconds: 100));
        expect(find.text('Pay now'), findsOneWidget);

        await tester.tap(payButton);
        await tester.pumpAndSettle();

        expect(find.text('Pay platform commission'), findsOneWidget);
        expect(find.text('+970569571995'), findsOneWidget);
        expect(find.text('Copy WhatsApp number'), findsOneWidget);
      },
    );

    testWidgets('pay now is hidden when no commission is due', (tester) async {
      mockApi.statsJson = <String, dynamic>{
        'dailyEarnings': 0.0,
        'monthlyEarnings': 0.0,
        'totalSuccessful': 0,
        'dailyOrderCount': 0,
        'dailyCommission': 0.0,
        'monthlyCommission': 0.0,
        'pendingOrdersCount': 0,
        'offeredOrdersCount': 0,
        'ordersReportCount': 0,
        'activeOrdersCount': 0,
        'isAvailable': true,
      };

      await tester.pumpWidget(
        screenHarness(themeMode: ThemeMode.light, locale: const Locale('en')),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('payCommissionButton')), findsNothing);
      expect(find.text('Pay now'), findsNothing);
    });

    testWidgets('dispatches the service call, refreshes stats and snackbar', (
      tester,
    ) async {
      mockApi.statsJson = <String, dynamic>{
        'dailyEarnings': 0.0,
        'monthlyEarnings': 0.0,
        'totalSuccessful': 0,
        'dailyOrderCount': 0,
        'dailyCommission': 0.0,
        'monthlyCommission': 0.0,
        'pendingOrdersCount': 0,
        'offeredOrdersCount': 0,
        'ordersReportCount': 0,
        'activeOrdersCount': 0,
        'isAvailable': true,
      };

      await tester.pumpWidget(
        screenHarness(themeMode: ThemeMode.light, locale: const Locale('en')),
      );
      await tester.pumpAndSettle();
      final initialStatsRequests = mockApi.statsRequests;

      final availabilityTile = find.byKey(
        const Key('providerAvailabilityToggle'),
      );
      await tester.ensureVisible(availabilityTile);
      await tester.pumpAndSettle(const Duration(milliseconds: 100));

      final beforeCalls = mockApi.availabilityCalls.length;
      await tester.tap(availabilityTile);
      await tester.pumpAndSettle();

      // The provider service PUT becomes exactly one availability call.
      expect(mockApi.availabilityCalls.length, beforeCalls + 1);
      expect(mockApi.availabilityCalls.last, containsPair('available', false));

      // The screen refreshes the stats after a successful update.
      expect(mockApi.statsRequests, greaterThan(initialStatsRequests));

      // Success snackbar:
      expect(find.text('Availability updated'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('UX01-007 bottom system inset', () {
    testWidgets('the last action row clears a simulated navigation inset', (
      tester,
    ) async {
      mockApi.statsJson = <String, dynamic>{
        'dailyEarnings': 0.0,
        'monthlyEarnings': 0.0,
        'totalSuccessful': 0,
        'dailyOrderCount': 0,
        'dailyCommission': 0.0,
        'monthlyCommission': 0.0,
        'pendingOrdersCount': 0,
        'offeredOrdersCount': 0,
        'ordersReportCount': 0,
        'activeOrdersCount': 0,
        'isAvailable': true,
      };

      await tester.pumpWidget(
        screenHarness(themeMode: ThemeMode.light, locale: const Locale('en')),
      );
      await tester.pumpAndSettle();

      // Simulate a system navigation bar inset of 40 logical pixels.
      tester.view.viewPadding = const FakeViewPadding(
        left: 0,
        top: 0,
        right: 0,
        bottom: 40,
      );
      await tester.pumpAndSettle();

      final logicalHeight =
          tester.view.physicalSize.height / tester.view.devicePixelRatio;

      // Scroll to the last tile so the bottom-most row is positioned in-viewport.
      final lastTile = find.byType(AppActionTile).last;
      expect(find.byType(AppActionTile), findsWidgets);
      await tester.ensureVisible(lastTile);
      await tester.pumpAndSettle(const Duration(milliseconds: 150));

      // The SafeArea wrapper keeps the last row above the system inset.
      final lowestBottom = tester.getRect(lastTile).bottom;
      expect(
        logicalHeight - lowestBottom,
        greaterThanOrEqualTo(39),
        reason: 'the provider dashboard must respect the 40px bottom inset',
      );
      tester.view.resetViewPadding();
      expect(tester.takeException(), isNull);
    });
  });

  group('UX01-005 theme/locale matrix', () {
    for (final (themeMode, locale, expectedTitle) in [
      (ThemeMode.dark, const Locale('en'), 'New Orders Awaiting Your Offer'),
      (ThemeMode.light, const Locale('ar'), 'طلبات جديدة تنتظر تقديم عرض سعر'),
      (ThemeMode.dark, const Locale('ar'), 'طلبات جديدة تنتظر تقديم عرض سعر'),
    ]) {
      testWidgets(
        'renders the dashboard in ${themeMode.name}/${locale.languageCode}',
        (tester) async {
          mockApi.statsJson = <String, dynamic>{
            'dailyEarnings': 0.0,
            'monthlyEarnings': 0.0,
            'totalSuccessful': 0,
            'dailyOrderCount': 0,
            'dailyCommission': 0.0,
            'monthlyCommission': 0.0,
            'pendingOrdersCount': 1,
            'offeredOrdersCount': 0,
            'ordersReportCount': 0,
            'activeOrdersCount': 0,
            'isAvailable': true,
          };

          await tester.pumpWidget(
            screenHarness(themeMode: themeMode, locale: locale),
          );
          await tester.pumpAndSettle();

          expect(tester.takeException(), isNull);
          expect(find.text(expectedTitle), findsWidgets);

          if (locale.languageCode == 'ar') {
            expect(
              Directionality.of(tester.element(find.text(expectedTitle).first)),
              TextDirection.rtl,
            );
          }
        },
      );
    }
  });

  group('UX01-005 text scaling', () {
    testWidgets('dashboard renders without errors at 1.5x text scale', (
      tester,
    ) async {
      mockApi.statsJson = <String, dynamic>{
        'dailyEarnings': 0.0,
        'monthlyEarnings': 0.0,
        'totalSuccessful': 0,
        'dailyOrderCount': 0,
        'dailyCommission': 0.0,
        'monthlyCommission': 0.0,
        'pendingOrdersCount': 1,
        'offeredOrdersCount': 0,
        'ordersReportCount': 0,
        'activeOrdersCount': 0,
        'isAvailable': true,
      };

      tester.platformDispatcher.textScaleFactorTestValue = 1.5;
      await tester.pumpWidget(
        screenHarness(themeMode: ThemeMode.light, locale: const Locale('en')),
      );
      try {
        await tester.pumpAndSettle();
        expect(find.text('Available to receive orders'), findsOneWidget);
        expect(tester.takeException(), isNull);
      } finally {
        tester.platformDispatcher.clearAllTestValues();
      }
    });
  });
}

class _RecordingSessionGateway implements AuthGateway {
  @override
  Future<Map<String, dynamic>> login(String a, String b, String c) async => {
    'error': 'unused',
  };

  @override
  Future<Map<String, dynamic>> register(
    String a,
    String b,
    String c,
    String d,
    String e,
    String f, {
    String governorate = '',
    bool privacyPolicy = true,
    List<String> serviceTypes = const [],
  }) async => {'error': 'unused'};

  @override
  Future<Map<String, dynamic>> validateSession(String token) async => {
    'error': 'unused',
  };
}
