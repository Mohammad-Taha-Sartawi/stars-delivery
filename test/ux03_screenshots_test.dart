// UX-03 visual evidence (gated).
//
// Captures genuine rasterized frames of the migrated screens:
//   - the 12 AppBar migrations in light and dark themes,
//   - the shared status-chip tone gallery,
//   - the three loading-indicator call sites,
//   - the localized logout confirmation dialog (English LTR / Arabic RTL).
//
// Enabled only with:
//   STARS_UX03_SCREENSHOTS=1 flutter test test/ux03_screenshots_test.dart
//
// Output: <Desktop>/UX-03-screenshots (override with
// STARS_UX03_SCREENSHOT_DIR). These are widget-test rasterizations, not device
// screenshots. Arabic glyphs require an Arabic-capable font which this test
// renderer does not provide; the Arabic dialog capture verifies direction and
// layout, not glyph fidelity.
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:swifora/services/theme_service.dart';
import 'package:swifora/widgets/ui/app_status_chip.dart';
import 'package:swifora/widgets/ui/app_tone.dart';

import 'ux03_screen_harness.dart';

const _screens = [
  Ux03Screen.createOrder,
  Ux03Screen.myOrders,
  Ux03Screen.notifications,
  Ux03Screen.orderDetail,
  Ux03Screen.orderOffers,
  Ux03Screen.orderReport,
  Ux03Screen.profile,
  Ux03Screen.providerActive,
  Ux03Screen.rejectedOrders,
  Ux03Screen.report,
  Ux03Screen.submitOffer,
  Ux03Screen.supportChat,
];

String get _outDir =>
    Platform.environment['STARS_UX03_SCREENSHOT_DIR'] ??
    '${Platform.environment['USERPROFILE'] ?? Directory.current.path}'
        r'\Desktop\UX-03-screenshots';

String get _fontDir =>
    Platform.environment['STARS_FONT_DIR'] ??
    r'C:\src\flutter\bin\cache\artifacts\material_fonts';

Future<void> _loadFonts() async {
  final families = <String, List<Future<ByteData>>>{};
  for (final name in <String>[
    'roboto-regular.ttf',
    'roboto-medium.ttf',
    'roboto-bold.ttf',
  ]) {
    final file = File('$_fontDir\\$name');
    if (!file.existsSync()) {
      return;
    }
    (families['Roboto'] ??= <Future<ByteData>>[]).add(
      file.readAsBytes().then(
        (bytes) => Uint8List.fromList(bytes).buffer.asByteData(),
      ),
    );
  }
  final iconFile = File('$_fontDir\\materialicons-regular.otf');
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

Future<void> _capture(
  WidgetTester tester,
  GlobalKey key,
  String fileName,
) async {
  final boundary =
      key.currentContext!.findRenderObject() as RenderRepaintBoundary;
  final image = (await tester.runAsync<ui.Image>(
    () => boundary.toImage(pixelRatio: 2.0),
  ))!;
  final bytes = (await tester.runAsync(
    () => image.toByteData(format: ui.ImageByteFormat.png),
  ))!;
  Directory(_outDir).createSync(recursive: true);
  final file = File('$_outDir\\$fileName');
  await tester.runAsync(() => file.writeAsBytes(bytes.buffer.asUint8List()));
}

Future<void> main() async {
  if (Platform.environment['STARS_UX03_SCREENSHOTS'] != '1') {
    testWidgets('UX-03 screenshots are disabled unless enabled', (
      tester,
    ) async {
      expect(Platform.environment['STARS_UX03_SCREENSHOTS'], isNot('1'));
    });
    return;
  }

  TestWidgetsFlutterBinding.ensureInitialized();
  await _loadFonts();

  final harness = Ux03Harness();
  harness.api.reset();

  for (final screen in _screens) {
    for (final themeMode in [ThemeMode.light, ThemeMode.dark]) {
      final themeName = themeMode == ThemeMode.dark ? 'dark' : 'light';
      testWidgets('capture ${screen.name} $themeName', (tester) async {
        final key = GlobalKey();
        await harness.pumpScreen(
          tester,
          screen,
          themeMode: themeMode,
          boundaryKey: key,
        );
        await tester.pump(const Duration(milliseconds: 300));
        await _capture(tester, key, 'ux03_${screen.name}_$themeName.png');
      });
    }
  }

  for (final themeMode in [ThemeMode.light, ThemeMode.dark]) {
    final themeName = themeMode == ThemeMode.dark ? 'dark' : 'light';
    testWidgets('capture status chips $themeName', (tester) async {
      final key = GlobalKey();
      final theme = themeMode == ThemeMode.dark
          ? AppTheme.dark
          : AppTheme.light;
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: theme,
            home: Scaffold(
              body: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      for (final tone in AppTone.values)
                        AppStatusChip(
                          label: tone.name,
                          tone: tone,
                          icon: Icons.circle_outlined,
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await _capture(tester, key, 'ux03_status_chips_$themeName.png');
    });
  }

  testWidgets('capture logout dialog English light', (tester) async {
    final key = GlobalKey();
    await harness.pumpCustomerHome(tester, boundaryKey: key);
    await tester.tap(find.byIcon(Icons.logout));
    await tester.pumpAndSettle(const Duration(milliseconds: 50));
    await _capture(tester, key, 'ux03_logout_dialog_en_light.png');
  });

  testWidgets('capture logout dialog Arabic dark', (tester) async {
    final key = GlobalKey();
    await harness.pumpCustomerHome(
      tester,
      themeMode: ThemeMode.dark,
      locale: const Locale('ar'),
      boundaryKey: key,
    );
    await tester.tap(find.byIcon(Icons.logout));
    await tester.pumpAndSettle(const Duration(milliseconds: 50));
    await _capture(tester, key, 'ux03_logout_dialog_ar_dark.png');
  });

  testWidgets('capture create order loading', (tester) async {
    final key = GlobalKey();
    harness.api.responseDelay = const Duration(milliseconds: 1500);
    await harness.pumpScreen(tester, Ux03Screen.createOrder, boundaryKey: key);
    await tester.tap(find.text('Product Order'));
    await tester.pump();
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Two boxes');
    await tester.enterText(fields.at(1), 'Main street');
    await tester.enterText(fields.at(2), '0501234567');
    await tester.pump(const Duration(milliseconds: 300));
    final submit = find.text('Submit Order');
    await tester.ensureVisible(submit);
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(submit);
    await tester.pump(const Duration(milliseconds: 800));
    await _capture(tester, key, 'ux03_loading_create_order_light.png');
    await tester.pump(const Duration(milliseconds: 1600));
  });

  testWidgets('capture submit offer loading', (tester) async {
    final key = GlobalKey();
    harness.api.responseDelay = const Duration(milliseconds: 1500);
    await harness.pumpScreen(tester, Ux03Screen.submitOffer, boundaryKey: key);
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), '25');
    await tester.enterText(fields.at(1), '10');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Send Offer'));
    await tester.pump(const Duration(milliseconds: 800));
    await _capture(tester, key, 'ux03_loading_submit_offer_light.png');
    await tester.pump(const Duration(milliseconds: 1600));
  });

  testWidgets('capture complaint loading', (tester) async {
    final key = GlobalKey();
    harness.api.responseDelay = const Duration(milliseconds: 1500);
    await harness.pumpScreen(tester, Ux03Screen.report, boundaryKey: key);
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), '123');
    await tester.enterText(fields.at(1), 'Problem description');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('إرسال البلاغ'));
    await tester.pump(const Duration(milliseconds: 800));
    await _capture(tester, key, 'ux03_loading_report_light.png');
    await tester.pump(const Duration(milliseconds: 1600));
  });

  tearDownAll(() {
    harness.dispose();
  });
}
