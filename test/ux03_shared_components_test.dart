// UX-03 shared UI foundation tests: semantic tone contrast, status chips,
// image thumbnails, confirmation dialogs and the shared loading indicator.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/services/theme_service.dart';
import 'package:stars_delivery/widgets/ui/app_button_loading_indicator.dart';
import 'package:stars_delivery/widgets/ui/app_confirm_dialog.dart';
import 'package:stars_delivery/widgets/ui/app_image_thumbnail.dart';
import 'package:stars_delivery/widgets/ui/app_status_chip.dart';
import 'package:stars_delivery/widgets/ui/app_tone.dart';

double _contrastRatio(Color a, Color b) {
  final lighter = math.max(a.computeLuminance(), b.computeLuminance());
  final darker = math.min(a.computeLuminance(), b.computeLuminance());
  return (lighter + 0.05) / (darker + 0.05);
}

Widget _localizedApp({
  required Widget home,
  required ThemeData theme,
  Locale locale = const Locale('en'),
}) {
  return MaterialApp(
    theme: theme,
    locale: locale,
    supportedLocales: const [Locale('ar'), Locale('en')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: home,
  );
}

void main() {
  testWidgets('every tone pair meets AA contrast in light and dark themes', (
    tester,
  ) async {
    for (final theme in [AppTheme.light, AppTheme.dark]) {
      late Map<AppTone, AppToneStyle> styles;

      await tester.pumpWidget(
        MaterialApp(
          theme: theme,
          home: Builder(
            builder: (context) {
              styles = {
                for (final tone in AppTone.values)
                  tone: appToneStyle(context, tone),
              };
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      for (final entry in styles.entries) {
        final style = entry.value;
        expect(
          _contrastRatio(style.foreground, style.background),
          greaterThanOrEqualTo(4.5),
          reason:
              '${entry.key.name} foreground/background in '
              '${theme.brightness.name}',
        );
        expect(
          _contrastRatio(style.onSolid, style.solid),
          greaterThanOrEqualTo(4.5),
          reason: '${entry.key.name} onSolid/solid in ${theme.brightness.name}',
        );
      }
    }
  });

  testWidgets('status chip announces its label exactly once', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(
      _localizedApp(
        theme: AppTheme.light,
        home: const Scaffold(
          body: Center(
            child: AppStatusChip(
              label: 'Expired',
              tone: AppTone.danger,
              icon: Icons.timer_off_outlined,
            ),
          ),
        ),
      ),
    );

    expect(find.bySemanticsLabel('Expired'), findsOneWidget);
    final data = tester
        .getSemantics(find.byType(AppStatusChip))
        .getSemanticsData();
    expect(data.label, 'Expired');
    handle.dispose();
  });

  testWidgets('image thumbnail keeps a 48dp target and an accessible name', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(
      _localizedApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: Center(
            child: AppImageThumbnail(
              imageUrl: 'http://127.0.0.1:1/image.png',
              semanticLabel: 'View image',
              onTap: () {},
              size: 44,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    final size = tester.getSize(find.byType(AppImageThumbnail));
    expect(size.width, greaterThanOrEqualTo(48));
    expect(size.height, greaterThanOrEqualTo(48));

    final data = tester
        .getSemantics(find.byType(AppImageThumbnail))
        .getSemanticsData();
    expect(data.label, 'View image');
    expect(data.flagsCollection.isButton, isTrue);
    expect(data.flagsCollection.isImage, isTrue);
    expect(tester.takeException(), isNull);
    handle.dispose();
  });

  testWidgets('confirmation dialog cancels and confirms (English)', (
    tester,
  ) async {
    bool? result;
    await tester.pumpWidget(
      _localizedApp(
        theme: AppTheme.light,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () async {
                  result = await showAppConfirmDialog(
                    context,
                    title: 'Discard changes?',
                    message: 'This cannot be undone.',
                    destructive: true,
                  );
                },
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('Discard changes?'), findsOneWidget);
    expect(
      Directionality.of(tester.element(find.byType(AlertDialog))),
      TextDirection.ltr,
    );

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(result, isFalse);
    expect(find.byType(AlertDialog), findsNothing);

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();
    expect(result, isTrue);
  });

  testWidgets('logout confirmation is localized and RTL-aware (Arabic)', (
    tester,
  ) async {
    bool? confirmed;
    await tester.pumpWidget(
      _localizedApp(
        theme: AppTheme.dark,
        locale: const Locale('ar'),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () async {
                  confirmed = await showLogoutConfirmation(context);
                },
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('تسجيل الخروج؟'), findsOneWidget);
    expect(
      Directionality.of(tester.element(find.byType(AlertDialog))),
      TextDirection.rtl,
    );
    expect(find.text('إلغاء'), findsOneWidget);

    await tester.tap(find.text('تسجيل الخروج'));
    await tester.pumpAndSettle();
    expect(confirmed, isTrue);
  });

  testWidgets('shared loading indicator uses onSurface and a live region', (
    tester,
  ) async {
    for (final theme in [AppTheme.light, AppTheme.dark]) {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(
        _localizedApp(
          theme: theme,
          home: const Scaffold(
            body: Center(child: AppButtonLoadingIndicator()),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));

      final indicator = tester.widget<CircularProgressIndicator>(
        find.byType(CircularProgressIndicator),
      );
      expect(indicator.color, theme.colorScheme.onSurface);
      expect(find.bySemanticsLabel('Loading...'), findsOneWidget);
      handle.dispose();
    }
  });
}
