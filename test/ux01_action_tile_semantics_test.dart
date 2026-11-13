// UX-01 remediation tests: accessible action-tile labels.
//
// UX01-002: provider tiles display order counts through AppActionTile's
// `trailingLabel`. The semantics label now announces it; these tests inspect
// the actual semantics tree (labels, directions, duplication) rather than
// widget text.
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:swifora/services/theme_service.dart';
import 'package:swifora/widgets/ui/app_action_tile.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget tileHarness({
    required String title,
    String? subtitle,
    String? trailingLabel,
    int badgeCount = 0,
    required TextDirection direction,
    bool dark = false,
  }) {
    return MaterialApp(
      theme: dark ? AppTheme.dark : AppTheme.light,
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Directionality(
        textDirection: direction,
        child: Scaffold(
          body: Center(
            child: SizedBox(
              width: 380,
              child: AppActionTile(
                icon: Icons.pending_actions_outlined,
                title: title,
                subtitle: subtitle,
                trailingLabel: trailingLabel,
                badgeCount: badgeCount,
                onTap: () {},
              ),
            ),
          ),
        ),
      ),
    );
  }

  SemanticsData tileSemanticsFor(WidgetTester tester, RegExp labelPattern) {
    final finder = find.bySemanticsLabel(labelPattern);
    expect(finder, findsOneWidget);
    return tester.getSemantics(finder).getSemanticsData();
  }

  group('UX01-002 provider count semantics', () {
    testWidgets('announces title plus a non-zero count exactly once', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        tileHarness(
          title: 'New Orders Awaiting Your Offer',
          subtitle: 'Tap to review',
          trailingLabel: '3',
          direction: TextDirection.ltr,
        ),
      );

      final data = tileSemanticsFor(
        tester,
        RegExp(r'^New Orders Awaiting Your Offer\. Tap to review\. 3$'),
      );
      expect(data.textDirection, TextDirection.ltr);

      // The visible count "3" must not announce itself as a separate node.
      expect(find.bySemanticsLabel(RegExp(r'^3$')), findsNothing);
      semantics.dispose();
    });

    testWidgets('announces a zero count clearly', (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        tileHarness(
          title: 'New Orders Awaiting Your Offer',
          trailingLabel: '0',
          direction: TextDirection.ltr,
        ),
      );

      final data = tileSemanticsFor(
        tester,
        RegExp(r'^New Orders Awaiting Your Offer\. 0$'),
      );
      expect(data.textDirection, TextDirection.ltr);
      semantics.dispose();
    });

    testWidgets('keeps the badgeCount announcement on support tiles', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        tileHarness(
          title: 'Contact support',
          badgeCount: 2,
          direction: TextDirection.ltr,
        ),
      );

      final data = tileSemanticsFor(tester, RegExp(r'^Contact support\. 2$'));
      expect(data.textDirection, TextDirection.ltr);
      semantics.dispose();
    });

    testWidgets('announces counts in Arabic RTL without duplication', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        tileHarness(
          title: 'طلبات جديدة تنتظر تقديم عرض سعر',
          trailingLabel: '5',
          direction: TextDirection.rtl,
        ),
      );

      final data = tileSemanticsFor(
        tester,
        RegExp(r'^طلبات جديدة تنتظر تقديم عرض سعر\. 5$'),
      );
      expect(data.textDirection, TextDirection.rtl);

      // The only semantics node carrying "5" is the merged tile label.
      expect(find.bySemanticsLabel(RegExp(r'^5$')), findsNothing);
      semantics.dispose();
    });

    testWidgets('works in dark theme identically', (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        tileHarness(
          title: 'My Active Orders - Delivery',
          trailingLabel: '2',
          direction: TextDirection.ltr,
          dark: true,
        ),
      );

      final data = tileSemanticsFor(
        tester,
        RegExp(r'^My Active Orders - Delivery\. 2$'),
      );
      expect(data.textDirection, TextDirection.ltr);
      semantics.dispose();
    });
  });
}
