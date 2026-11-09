// UX-03 AppBar migration: every audited screen must inherit the theme AppBar
// instead of forcing a hard-coded light surface, in both themes.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'ux03_screen_harness.dart';

const _migratedScreens = [
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

void main() {
  late Ux03Harness harness;

  setUp(() {
    harness = Ux03Harness();
    harness.api.reset();
  });

  tearDown(() => harness.dispose());

  for (final screen in _migratedScreens) {
    testWidgets('${screen.name} AppBar follows the theme in light and dark', (
      tester,
    ) async {
      for (final themeMode in [ThemeMode.light, ThemeMode.dark]) {
        await harness.pumpScreen(tester, screen, themeMode: themeMode);
        await tester.pump(const Duration(milliseconds: 300));

        expect(
          find.byType(AppBar),
          findsOneWidget,
          reason: '${screen.name} must expose exactly one AppBar',
        );

        final appBar = tester.widget<AppBar>(find.byType(AppBar));
        expect(
          appBar.backgroundColor,
          isNull,
          reason:
              '${screen.name} must not hard-code an AppBar background '
              '(${themeMode.name})',
        );
        expect(appBar.foregroundColor, isNull);
        expect(appBar.elevation, isNull);

        final theme = Theme.of(tester.element(find.byType(Scaffold).first));
        expect(theme.appBarTheme.backgroundColor, theme.colorScheme.surface);
        expect(theme.appBarTheme.foregroundColor, theme.colorScheme.onSurface);
        expect(
          theme.brightness,
          themeMode == ThemeMode.dark ? Brightness.dark : Brightness.light,
        );
        expect(tester.takeException(), isNull);
      }
    });
  }
}
