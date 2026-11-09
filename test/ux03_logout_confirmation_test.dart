// UX-03 logout confirmation: cancel keeps the session screen, confirm runs the
// existing logout path exactly once and lands on the login screen.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/screens/home_screen.dart';
import 'package:stars_delivery/screens/login_screen.dart';
import 'package:stars_delivery/screens/provider_home_screen.dart';

import 'ux03_screen_harness.dart';

void main() {
  late Ux03Harness harness;

  setUp(() {
    harness = Ux03Harness();
    harness.api.reset();
  });

  tearDown(() => harness.dispose());

  testWidgets('customer logout asks for confirmation and cancels safely', (
    tester,
  ) async {
    await harness.pumpCustomerHome(tester);
    expect(find.byType(HomeScreen), findsOneWidget);

    await tester.tap(find.byTooltip('Log out'));
    await tester.pumpAndSettle(const Duration(milliseconds: 50));

    expect(find.text('Log out?'), findsOneWidget);
    expect(
      Directionality.of(tester.element(find.byType(AlertDialog))),
      TextDirection.ltr,
    );

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle(const Duration(milliseconds: 50));

    expect(find.byType(AlertDialog), findsNothing);
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.byType(LoginScreen), findsNothing);

    await tester.tap(find.byTooltip('Log out'));
    await tester.pumpAndSettle(const Duration(milliseconds: 50));
    await tester.tap(find.widgetWithText(ElevatedButton, 'Log out'));
    await tester.pumpAndSettle(const Duration(milliseconds: 50));

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byType(HomeScreen), findsNothing);
  });

  testWidgets('provider logout asks for confirmation and logs out on confirm', (
    tester,
  ) async {
    await harness.pumpProviderHome(tester);
    expect(find.byType(ProviderHomeScreen), findsOneWidget);

    await tester.tap(find.byTooltip('Log out'));
    await tester.pumpAndSettle(const Duration(milliseconds: 50));
    expect(find.text('Log out?'), findsOneWidget);

    await tester.tap(find.widgetWithText(ElevatedButton, 'Log out'));
    await tester.pumpAndSettle(const Duration(milliseconds: 50));

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byType(ProviderHomeScreen), findsNothing);
  });
}
