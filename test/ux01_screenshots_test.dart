// UX-01 remediation visual-verification captures (gated).
//
// This suite captures genuine screenshots from the real rendered widget
// trees, rasterized with RepaintBoundary.toImage (the actual frame pixels),
// written as PNGs under <Desktop>/UX-01-remediation-screenshots/.
//
// It writes nothing unless explicitly enabled:
//   STARS_UX01_SCREENSHOTS=1 flutter test test/ux01_screenshots_test.dart
// so the normal `flutter test` run stays a pure CI check (this trivial stub
// test runs and passes without touching the capture path).
//
// Font limitation (documented in the report): text is shaped with the Roboto
// family shipped in the Flutter SDK cache loaded via FontLoader, so glyphs
// are real. No Arabic-capable font exists in the engine cache, so Arabic runs
// rasterize as placeholder boxes; layout metrics (RTL/LTR) remain genuine
// because the layout is computed from the real Arabic strings.
import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui show Image, ImageByteFormat;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/bloc/app/app_bloc.dart';
import 'package:stars_delivery/bloc/app/app_event.dart';
import 'package:stars_delivery/bloc/auth/auth_bloc.dart';
import 'package:stars_delivery/bloc/notification/notification_bloc.dart';
import 'package:stars_delivery/bloc/provider/provider_bloc.dart';
import 'package:stars_delivery/models/user_model.dart';
import 'package:stars_delivery/screens/login_screen.dart';
import 'package:stars_delivery/screens/provider_home_screen.dart';
import 'package:stars_delivery/services/api_config.dart';
import 'package:stars_delivery/services/auth_service.dart';
import 'package:stars_delivery/services/mobile_api_client.dart';
import 'package:stars_delivery/services/session_storage.dart';
import 'package:stars_delivery/services/socket_service.dart';
import 'package:stars_delivery/services/theme_service.dart';

import 'mock_api_server.dart';

class _TestVault implements TokenVault {
  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> delete(String key) async {}
}

/// Auth gateway whose login call never completes: the submit button stays in
/// its genuine AuthLoading state for the capture.
class _HangingAuthGateway implements AuthGateway {
  @override
  Future<Map<String, dynamic>> login(
    String email,
    String password,
    String role,
  ) => Completer<Map<String, dynamic>>().future;

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
  }) => Completer<Map<String, dynamic>>().future;

  @override
  Future<Map<String, dynamic>> validateSession(String token) =>
      Completer<Map<String, dynamic>>().future;
}

class _NoopSocketService extends SocketService {
  _NoopSocketService() : super.forTest();

  @override
  void connect({required String token, String? area}) {}

  @override
  void disconnect() {}
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

/// Fonts shipped with the local Flutter SDK cache; override with
/// STARS_FONT_DIR when the SDK lives elsewhere.
String get _fontDir =>
    Platform.environment['STARS_FONT_DIR'] ??
    r'C:\src\flutter\bin\cache\artifacts\material_fonts';

/// Evidence output directory (outside the repository). Override with
/// STARS_UX01_SCREENSHOT_DIR; defaults to the current user's Desktop.
String get _captureDir =>
    Platform.environment['STARS_UX01_SCREENSHOT_DIR'] ??
    '${Platform.environment['USERPROFILE'] ?? Directory.current.path}'
        r'\Desktop\UX-01-remediation-screenshots';

/// Loads the Roboto family from the engine cache so captures show real
/// glyphs; silently skipped when the folder is unavailable.
Future<void> loadRoboto() async {
  final cacheDir = _fontDir;
  final families = <String, List<Future<ByteData>>>{};
  for (final name in <String>[
    'roboto-regular.ttf',
    'roboto-medium.ttf',
    'roboto-bold.ttf',
  ]) {
    final file = File('$cacheDir\\$name');
    if (!file.existsSync()) {
      return;
    }
    (families['Roboto'] ??= <Future<ByteData>>[]).add(
      file.readAsBytes().then(
        (bytes) => Uint8List.fromList(bytes).buffer.asByteData(),
      ),
    );
  }
  final iconFile = File('$cacheDir\\materialicons-regular.otf');
  if (iconFile.existsSync()) {
    (families['MaterialIcons'] ??= <Future<ByteData>>[]).add(
      iconFile.readAsBytes().then(
        (bytes) => Uint8List.fromList(bytes).buffer.asByteData(),
      ),
    );
  }
  for (final entry in families.entries) {
    final loader = FontLoader(entry.key);
    for (final future in entry.value) {
      loader.addFont(future);
    }
    await loader.load();
  }
}

Future<void> capture(
  WidgetTester tester,
  GlobalKey boundaryKey,
  String fileName,
) async {
  final boundary =
      boundaryKey.currentContext!.findRenderObject() as RenderRepaintBoundary;
  final image = (await tester.runAsync<ui.Image>(
    () => boundary.toImage(pixelRatio: 2.0),
  ))!;
  final bytes = (await tester.runAsync(
    () => image.toByteData(format: ui.ImageByteFormat.png),
  ))!;
  final file = File('$_captureDir\\$fileName');
  await tester.runAsync(() => file.writeAsBytes(bytes.buffer.asUint8List()));
  // report("captured: $file (${bytes!.lengthInBytes} bytes)");
}

Future<void> main() async {
  if (Platform.environment['STARS_UX01_SCREENSHOTS'] != '1') {
    // Capture mode is opt-in. Registering a trivial test keeps the suite
    // green in normal `flutter test` runs while writing nothing.
    testWidgets('screenshots capture is disabled unless explicitly enabled', (
      tester,
    ) async {
      expect(Platform.environment['STARS_UX01_SCREENSHOTS'], isNot('1'));
    });
    return;
  }

  TestWidgetsFlutterBinding.ensureInitialized();
  await loadRoboto();

  final mockApi = MockApi();
  MobileApiClient.testAdapter = mockApi.adapter;
  ApiConfig.initForTesting('http://127.0.0.1:1');
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
  SocketService.testInstance = _NoopSocketService();

  Directory(_captureDir).createSync(recursive: true);

  Widget appHarness({
    required ThemeMode themeMode,
    required Locale locale,
    required Widget child,
    GlobalKey? boundaryKey,
  }) {
    final appBloc = AppBloc();
    appBloc.add(SetTheme(themeMode));
    appBloc.add(SetLocale(locale));
    return RepaintBoundary(
      key: boundaryKey ?? GlobalKey(),
      child: MultiBlocProvider(
        providers: [
          BlocProvider(create: (_) => appBloc),
          BlocProvider(
            create: (_) => AuthBloc(
              authService: _HangingAuthGateway(),
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
          home: child,
        ),
      ),
    );
  }

  Future<void> shoot(WidgetTester tester, GlobalKey key, String name) async {
    for (var i = 0; i < 3; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await capture(tester, key, name);
  }

  Future<void> shootProvider(
    WidgetTester tester,
    GlobalKey key,
    String name,
  ) async {
    await tester.pump(const Duration(milliseconds: 100));
    // Let the ProviderBloc's stats/pending/offered HTTP round-trips through the
    // in-memory adapter complete, without advancing fake time far enough for
    // the screen's periodic 15s notification timer to keep frames scheduled.
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await capture(tester, key, name);
  }

  testWidgets('provider home light/en', (tester) async {
    final key = GlobalKey();
    await tester.pumpWidget(
      appHarness(
        themeMode: ThemeMode.light,
        locale: const Locale('en'),
        child: ProviderHomeScreen(user: _mockUser(), token: 'test-token'),
        boundaryKey: key,
      ),
    );
    await shootProvider(tester, key, 'provider_home_light_en.png');
  });

  testWidgets('provider home dark/en', (tester) async {
    final key = GlobalKey();
    await tester.pumpWidget(
      appHarness(
        themeMode: ThemeMode.dark,
        locale: const Locale('en'),
        child: ProviderHomeScreen(user: _mockUser(), token: 'test-token'),
        boundaryKey: key,
      ),
    );
    await shootProvider(tester, key, 'provider_home_dark_en.png');
  });

  testWidgets('provider home light/ar (RTL)', (tester) async {
    final key = GlobalKey();
    await tester.pumpWidget(
      appHarness(
        themeMode: ThemeMode.light,
        locale: const Locale('ar'),
        child: ProviderHomeScreen(user: _mockUser(), token: 'test-token'),
        boundaryKey: key,
      ),
    );
    await shootProvider(tester, key, 'provider_home_light_ar_rtl.png');
  });

  for (final (themeMode, name) in const [
    (ThemeMode.light, 'login_loading_light_en.png'),
    (ThemeMode.dark, 'login_loading_dark_en.png'),
  ]) {
    testWidgets(name, (tester) async {
      final key = GlobalKey();
      await tester.pumpWidget(
        appHarness(
          themeMode: themeMode,
          locale: const Locale('en'),
          child: const LoginScreen(),
          boundaryKey: key,
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));

      // Fill the login form and submit so the button enters the genuine
      // AuthLoading state (the gateway above never completes the call).
      await tester.enterText(find.byType(TextFormField).at(0), 'a@b.com');
      await tester.enterText(find.byType(TextFormField).at(1), 'Password123!');
      await tester.ensureVisible(find.byType(ElevatedButton));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(find.byType(ElevatedButton));
      await shoot(tester, key, name);
    });
  }
}
