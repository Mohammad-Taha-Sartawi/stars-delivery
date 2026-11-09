// UX-01 remediation tests: loading indicator contrast and announcements.
//
// UX01-001: the disabled buttons that show a loading spinner previously used
// `onPrimary` as the spinner color while their background is derived from
// `onSurface` at 12% opacity. These tests render the real login screen and the
// real support-contact dialog in their genuine loading states, then measure
// the painted foreground/background contrast in light and dark themes.
//
// Network traffic never leaves the process: the Dio clients under test run on
// an in-memory adapter fixture (see test/mock_api_server.dart), so all delays
// are driven by the test's fake async clock.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/bloc/app/app_bloc.dart';
import 'package:stars_delivery/bloc/auth/auth_bloc.dart';
import 'package:stars_delivery/bloc/auth/auth_state.dart';
import 'package:stars_delivery/services/auth_service.dart';
import 'package:stars_delivery/services/api_config.dart';
import 'package:stars_delivery/services/mobile_api_client.dart';
import 'package:stars_delivery/services/session_storage.dart';
import 'package:stars_delivery/services/theme_service.dart';
import 'package:stars_delivery/screens/login_screen.dart';
import 'package:stars_delivery/widgets/ui/app_button_loading_indicator.dart';

import 'mock_api_server.dart';

class _TestVault implements TokenVault {
  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> delete(String key) async {}
}

/// Auth gateway whose login call never completes, keeping the screen in its
/// genuine AuthLoading state without any network traffic.
class _HangingAuthGateway implements AuthGateway {
  @override
  Future<Map<String, dynamic>> login(
    String email,
    String password,
    String role,
  ) {
    return Completer<Map<String, dynamic>>().future;
  }

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
    ProviderRegistrationDocument? driverLicenseDocument,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Map<String, dynamic>> validateSession(String token) {
    throw UnimplementedError();
  }
}

double _contrastRatio(Color a, Color b) {
  final lighter = math.max(a.computeLuminance(), b.computeLuminance());
  final darker = math.min(a.computeLuminance(), b.computeLuminance());
  return (lighter + 0.05) / (darker + 0.05);
}

Future<void> main() async {
  TestWidgetsFlutterBinding.ensureInitialized();

  final mockApi = MockApi();
  MobileApiClient.testAdapter = mockApi.adapter;
  // The contact dialog resolves its base URL from ApiConfig; give it a stable
  // loopback origin (the adapter ignores it in favor of fixture paths).
  ApiConfig.initForTesting('http://127.0.0.1:1');

  setUp(() {
    mockApi.reset();
    mockApi.contactDelay = const Duration(milliseconds: 400);
  });

  tearDownAll(() {
    MobileApiClient.testAdapter = null;
  });

  Widget loginHarness({required ThemeMode themeMode, required Locale locale}) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => AppBloc()),
        BlocProvider(
          create: (_) => AuthBloc(
            authService: _HangingAuthGateway(),
            sessionStorage: SessionStorage(vault: _TestVault()),
            checkOnStart: false,
          ),
        ),
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
        home: const LoginScreen(),
      ),
    );
  }

  group('UX01-001 submit button loading contrast', () {
    for (final (themeMode, locale, theme) in [
      (ThemeMode.light, const Locale('en'), AppTheme.light),
      (ThemeMode.light, const Locale('ar'), AppTheme.light),
      (ThemeMode.dark, const Locale('en'), AppTheme.dark),
      (ThemeMode.dark, const Locale('ar'), AppTheme.dark),
    ]) {
      testWidgets('renders the spinner legible on the disabled button '
          '(${themeMode.name}, ${locale.languageCode})', (tester) async {
        await tester.pumpWidget(
          loginHarness(themeMode: themeMode, locale: locale),
        );
        await tester.pump(const Duration(milliseconds: 100));

        await tester.enterText(find.byType(TextFormField).at(0), 'a@b.com');
        await tester.enterText(
          find.byType(TextFormField).at(1),
          'Password123!',
        );
        await tester.ensureVisible(find.byType(ElevatedButton));
        await tester.pump(const Duration(milliseconds: 50));
        await tester.tap(find.byType(ElevatedButton));
        await tester.pump(const Duration(milliseconds: 50));

        final bloc = tester.element(find.byType(LoginScreen)).read<AuthBloc>();
        expect(bloc.state, isA<AuthLoading>());

        // The real call site must render the shared indicator widget.
        expect(find.byType(AppButtonLoadingIndicator), findsOneWidget);

        final scheme = theme.colorScheme;
        final indicator = tester.widget<CircularProgressIndicator>(
          find.descendant(
            of: find.byType(AppButtonLoadingIndicator),
            matching: find.byType(CircularProgressIndicator),
          ),
        );

        // Foreground must be the semantic onSurface the disabled button
        // background is derived from, never onPrimary.
        expect(indicator.color, scheme.onSurface);
        expect(indicator.color, isNot(scheme.onPrimary));

        // The disabled Material paints onSurface@12% over the card surface.
        final paintedBackground = Color.alphaBlend(
          scheme.onSurface.withValues(alpha: 0.12),
          scheme.surfaceContainerLow,
        );

        final ratio = _contrastRatio(indicator.color!, paintedBackground);
        expect(
          ratio,
          greaterThanOrEqualTo(3.0),
          reason:
              'spinner contrast $ratio on disabled background in the '
              '${themeMode.name} theme',
        );

        // The label is announced as a live region for screen readers.
        final semantics = tester.ensureSemantics();
        final loadingLabel = locale.languageCode == 'ar'
            ? 'جاري التحميل...'
            : 'Loading...';
        expect(find.bySemanticsLabel(loadingLabel), findsOneWidget);
        semantics.dispose();
      });
    }
  });

  group('UX01-001 contact dialog loading contrast', () {
    for (final (themeMode, _) in [
      (ThemeMode.light, AppTheme.light),
      (ThemeMode.dark, AppTheme.dark),
    ]) {
      testWidgets('sends through the real dialog flow with a legible spinner '
          '(${themeMode.name})', (tester) async {
        await tester.pumpWidget(
          loginHarness(themeMode: themeMode, locale: const Locale('en')),
        );
        await tester.pump(const Duration(milliseconds: 100));

        await tester.ensureVisible(find.text('Contact support'));
        await tester.pumpAndSettle(const Duration(milliseconds: 50));
        await tester.tap(find.text('Contact support'));
        await tester.pumpAndSettle(const Duration(milliseconds: 100));

        final dialogFields = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextFormField),
        );
        expect(dialogFields, findsNWidgets(4));

        await tester.enterText(dialogFields.at(0), 'Ann Smith');
        await tester.enterText(dialogFields.at(1), 'test@example.com');
        await tester.enterText(dialogFields.at(2), '0501234');
        await tester.enterText(
          dialogFields.at(3),
          'Hello from the widget test',
        );
        await tester.pumpAndSettle(const Duration(milliseconds: 100));

        final sendFinder = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.widgetWithText(ElevatedButton, 'Send'),
        );
        expect(sendFinder, findsOneWidget);

        // The mocked endpoint delay keeps the dialog in its sending state.
        await tester.tap(sendFinder, warnIfMissed: true);
        await tester.pump(const Duration(milliseconds: 50));

        final semantics = tester.ensureSemantics();

        // The in-flight send renders the shared indicator.
        expect(
          find.descendant(
            of: find.byType(AlertDialog),
            matching: find.byType(AppButtonLoadingIndicator),
          ),
          findsOneWidget,
        );
        expect(find.bySemanticsLabel('Loading...'), findsOneWidget);

        // Disabled while loading: the dialog has exactly one ElevatedButton
        // (cancel is a TextButton) and it must be disabled.
        final sendButton = tester.widget<ElevatedButton>(
          find.descendant(
            of: find.byType(AlertDialog),
            matching: find.byType(ElevatedButton),
          ),
        );
        expect(sendButton.onPressed, isNull);

        // After the (fake-time) response the dialog closes itself.
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pumpAndSettle();

        expect(find.byType(AlertDialog), findsNothing);
        expect(mockApi.contactCalls, hasLength(1));

        semantics.dispose();
      });
    }
  });
}
