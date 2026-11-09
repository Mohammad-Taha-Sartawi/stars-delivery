// UX-03 safe-area verification: migrated screens protect their content from
// the bottom system inset without duplicating the AppBar inset.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'ux03_screen_harness.dart';

const _safeAreaScreens = [
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
  Ux03Screen.pendingOrders,
  Ux03Screen.offeredOrders,
];

Finder get _bottomSafeArea => find.byWidgetPredicate(
  (widget) =>
      widget is SafeArea && widget.top == false && widget.bottom == true,
);

double _logicalHeight(WidgetTester tester) =>
    tester.view.physicalSize.height / tester.view.devicePixelRatio;

void main() {
  late Ux03Harness harness;

  setUp(() {
    harness = Ux03Harness();
    harness.api.reset();
  });

  tearDown(() => harness.dispose());

  for (final screen in _safeAreaScreens) {
    testWidgets('${screen.name} keeps content above a 40px bottom inset', (
      tester,
    ) async {
      tester.view.padding = FakeViewPadding(
        bottom: 40 * tester.view.devicePixelRatio,
      );
      tester.view.viewPadding = FakeViewPadding(
        bottom: 40 * tester.view.devicePixelRatio,
      );
      addTearDown(() {
        tester.view.resetPadding();
        tester.view.resetViewPadding();
      });

      await harness.pumpScreen(tester, screen);
      await tester.pump(const Duration(milliseconds: 100));

      expect(
        _bottomSafeArea,
        findsWidgets,
        reason: '${screen.name} must protect content with a bottom SafeArea',
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('create order submit action clears the bottom inset', (
    tester,
  ) async {
    tester.view.padding = FakeViewPadding(
      bottom: 40 * tester.view.devicePixelRatio,
    );
    tester.view.viewPadding = FakeViewPadding(
      bottom: 40 * tester.view.devicePixelRatio,
    );
    addTearDown(() {
      tester.view.resetPadding();
      tester.view.resetViewPadding();
    });

    await harness.pumpScreen(tester, Ux03Screen.createOrder);
    await tester.tap(find.text('Product Order'));
    await tester.pump();

    final submit = find.text('Submit Order');
    await tester.ensureVisible(submit);
    await tester.pump(const Duration(milliseconds: 100));

    final bottom = tester.getRect(submit).bottom;
    expect(
      _logicalHeight(tester) - bottom,
      greaterThanOrEqualTo(39),
      reason: 'the submit action must stay above the gesture inset',
    );
  });

  testWidgets('create order remains usable with a 300px keyboard inset', (
    tester,
  ) async {
    tester.view.viewInsets = FakeViewPadding(
      bottom: 300 * tester.view.devicePixelRatio,
    );
    addTearDown(tester.view.resetViewInsets);

    await harness.pumpScreen(tester, Ux03Screen.createOrder);
    await tester.tap(find.text('Product Order'));
    await tester.pump(const Duration(milliseconds: 100));

    final submit = find.text('Submit Order');
    await tester.ensureVisible(submit);
    await tester.pump(const Duration(milliseconds: 100));

    expect(tester.takeException(), isNull);
    expect(
      _logicalHeight(tester) - tester.getRect(submit).bottom,
      greaterThanOrEqualTo(299),
      reason: 'the scrollable form must keep its action above the keyboard',
    );
  });

  testWidgets('support chat composer clears the bottom inset', (tester) async {
    tester.view.padding = FakeViewPadding(
      bottom: 40 * tester.view.devicePixelRatio,
    );
    tester.view.viewPadding = FakeViewPadding(
      bottom: 40 * tester.view.devicePixelRatio,
    );
    addTearDown(() {
      tester.view.resetPadding();
      tester.view.resetViewPadding();
    });

    await harness.pumpScreen(tester, Ux03Screen.supportChat);
    await tester.pump(const Duration(milliseconds: 100));

    final send = find.byTooltip('Send message');
    expect(send, findsOneWidget);

    final bottom = tester.getRect(send).bottom;
    expect(
      _logicalHeight(tester) - bottom,
      greaterThanOrEqualTo(39),
      reason: 'the chat composer must stay above the gesture inset',
    );
  });
}
