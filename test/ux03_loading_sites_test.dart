// UX-03 loading regression: the three call sites that still painted a white
// spinner on a light disabled background now render the shared indicator.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:swifora/widgets/ui/app_button_loading_indicator.dart';

import 'ux03_screen_harness.dart';

void main() {
  late Ux03Harness harness;

  setUp(() {
    harness = Ux03Harness();
    harness.api.reset();
    harness.api.responseDelay = const Duration(milliseconds: 400);
  });

  tearDown(() => harness.dispose());

  testWidgets('create order shows the contrast-safe loading indicator', (
    tester,
  ) async {
    await harness.pumpScreen(tester, Ux03Screen.createOrder);
    await tester.tap(find.text('Product Order'));
    await tester.pump();

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Two boxes');
    await tester.enterText(fields.at(1), 'Main street');
    await tester.enterText(fields.at(2), '0501234567');

    final submit = find.text('Submit Order');
    await tester.ensureVisible(submit);
    await tester.pump();

    final semantics = tester.ensureSemantics();
    await tester.tap(submit);
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byType(AppButtonLoadingIndicator), findsOneWidget);
    expect(find.bySemanticsLabel('Loading...'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 500));
    semantics.dispose();
    expect(tester.takeException(), isNull);
  });

  testWidgets('submit offer shows the contrast-safe loading indicator', (
    tester,
  ) async {
    await harness.pumpScreen(tester, Ux03Screen.submitOffer);

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), '25');
    await tester.enterText(fields.at(1), '10');

    final semantics = tester.ensureSemantics();
    await tester.tap(find.text('Send Offer'));
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byType(AppButtonLoadingIndicator), findsOneWidget);
    expect(find.bySemanticsLabel('Loading...'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 500));
    semantics.dispose();
    expect(tester.takeException(), isNull);
  });

  testWidgets('complaint send shows the contrast-safe loading indicator', (
    tester,
  ) async {
    await harness.pumpScreen(tester, Ux03Screen.report);

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), '123');
    await tester.enterText(fields.at(1), 'Problem description');

    final semantics = tester.ensureSemantics();
    await tester.tap(find.text('إرسال البلاغ'));
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byType(AppButtonLoadingIndicator), findsOneWidget);
    expect(find.bySemanticsLabel('Loading...'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 500));
    semantics.dispose();
    expect(tester.takeException(), isNull);
  });
}
