import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/bloc/app/app_bloc.dart';
import 'package:stars_delivery/bloc/auth/auth_bloc.dart';
import 'package:stars_delivery/screens/login_screen.dart';
import 'package:stars_delivery/services/auth_service.dart';
import 'package:stars_delivery/services/responsive.dart';
import 'package:stars_delivery/services/session_storage.dart';
import 'package:stars_delivery/services/theme_service.dart';
import 'package:stars_delivery/widgets/ui/app_action_tile.dart';
import 'package:stars_delivery/widgets/ui/app_status_badge.dart';
import 'package:stars_delivery/widgets/ui/app_tone.dart';

class _TestVault implements TokenVault {
  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> delete(String key) async {}
}

class _TestAuthGateway implements AuthGateway {
  int loginCalls = 0;

  @override
  Future<Map<String, dynamic>> login(
    String email,
    String password,
    String role,
  ) async {
    loginCalls += 1;
    throw Exception('test stop');
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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('design tokens and themes', () {
    test('spacing, radius, and size scales are ordered and usable', () {
      expect(AppSpacing.xxs, lessThan(AppSpacing.xs));
      expect(AppSpacing.xs, lessThan(AppSpacing.sm));
      expect(AppSpacing.sm, lessThan(AppSpacing.md));
      expect(AppSpacing.md, lessThan(AppSpacing.lg));
      expect(AppSpacing.lg, lessThan(AppSpacing.xl));
      expect(AppSpacing.xl, lessThan(AppSpacing.xxl));

      expect(AppRadius.xs, lessThan(AppRadius.md));
      expect(AppRadius.md, lessThan(AppRadius.lg));
      expect(AppRadius.lg, lessThan(AppRadius.xl));
      expect(AppSizes.minTouchTarget, greaterThanOrEqualTo(48));
      expect(AppSizes.buttonHeight, greaterThanOrEqualTo(48));
    });

    test('light and dark themes expose coherent Material 3 roles', () {
      for (final theme in [AppTheme.light, AppTheme.dark]) {
        expect(theme.useMaterial3, isTrue);
        expect(theme.colorScheme.brightness, theme.brightness);
        expect(
          theme.textTheme.bodyMedium?.color,
          theme.colorScheme.onSurfaceVariant,
        );
        expect(theme.textTheme.titleLarge?.color, theme.colorScheme.onSurface);
        expect(theme.extension<AppSemanticColors>(), isNotNull);
        expect(theme.appBarTheme.backgroundColor, theme.colorScheme.surface);
        expect(theme.cardTheme.shape, isA<RoundedRectangleBorder>());
        expect(theme.inputDecorationTheme.filled, isTrue);
        expect(theme.dialogTheme.backgroundColor, isNotNull);
        expect(theme.bottomSheetTheme.backgroundColor, isNotNull);
        expect(theme.snackBarTheme.contentTextStyle, isNotNull);
        expect(theme.chipTheme.shape, isA<RoundedRectangleBorder>());
        expect(theme.dividerTheme.color, theme.colorScheme.outlineVariant);
        expect(theme.progressIndicatorTheme.color, theme.colorScheme.primary);
        expect(theme.floatingActionButtonTheme.backgroundColor, isNotNull);
      }

      expect(AppTheme.light.colorScheme.primary, AppColors.primary);
      expect(AppTheme.dark.colorScheme.secondary, AppColors.darkAccent);
      expect(AppTheme.light.brightness, Brightness.light);
      expect(AppTheme.dark.brightness, Brightness.dark);
    });

    test('button and input themes meet minimum touch target guidance', () {
      for (final theme in [AppTheme.light, AppTheme.dark]) {
        final elevated = theme.elevatedButtonTheme.style?.minimumSize?.resolve(
          <WidgetState>{},
        );
        final outlined = theme.outlinedButtonTheme.style?.minimumSize?.resolve(
          <WidgetState>{},
        );
        final text = theme.textButtonTheme.style?.minimumSize?.resolve(
          <WidgetState>{},
        );

        expect(elevated?.height, greaterThanOrEqualTo(48));
        expect(outlined?.height, greaterThanOrEqualTo(48));
        expect(text?.height, greaterThanOrEqualTo(48));
        expect(theme.inputDecorationTheme.contentPadding, isNotNull);
      }
    });

    test('semantic text pairs keep readable contrast in both themes', () {
      for (final theme in [AppTheme.light, AppTheme.dark]) {
        final scheme = theme.colorScheme;
        final semantics = theme.extension<AppSemanticColors>()!;

        _expectContrast(scheme.onPrimary, scheme.primary);
        _expectContrast(scheme.onPrimaryContainer, scheme.primaryContainer);
        _expectContrast(scheme.onSecondary, scheme.secondary);
        _expectContrast(scheme.onSecondaryContainer, scheme.secondaryContainer);
        _expectContrast(scheme.onSurface, scheme.surface);
        _expectContrast(scheme.onSurfaceVariant, scheme.surface);
        _expectContrast(scheme.onError, scheme.error);
        _expectContrast(scheme.onErrorContainer, scheme.errorContainer);
        _expectContrast(
          semantics.onSuccessContainer,
          semantics.successContainer,
        );
        _expectContrast(
          semantics.onWarningContainer,
          semantics.warningContainer,
        );
        _expectContrast(semantics.onInfoContainer, semantics.infoContainer);
        _expectContrast(
          semantics.onNeutralContainer,
          semantics.neutralContainer,
        );
      }
    });
  });

  group('shared components', () {
    testWidgets('action tile supports taps, badges, RTL, and dark theme', (
      tester,
    ) async {
      var tapped = false;

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: Center(
                child: SizedBox(
                  width: 340,
                  child: AppActionTile(
                    icon: Icons.local_offer_outlined,
                    title: 'Offers',
                    subtitle: '3 new offers',
                    tone: AppTone.warning,
                    badgeCount: 3,
                    onTap: () => tapped = true,
                  ),
                ),
              ),
            ),
          ),
        ),
      );

      expect(find.text('Offers'), findsOneWidget);
      expect(find.text('3 new offers'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
      expect(find.byIcon(Icons.chevron_left), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(find.byType(AppActionTile));
      expect(tapped, isTrue);

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(
            body: AppStatusBadge(
              label: 'Available',
              tone: AppTone.success,
              icon: Icons.check_circle_outline,
            ),
          ),
        ),
      );

      expect(find.text('Available'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('action tile tolerates larger system text scaling', (
      tester,
    ) async {
      tester.platformDispatcher.textScaleFactorTestValue = 1.5;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await tester.binding.setSurfaceSize(const Size(320, 640));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: AppActionTile(
                icon: Icons.local_offer_outlined,
                title: 'Offers awaiting a response',
                subtitle: 'Tap to review submitted price offers',
                tone: AppTone.warning,
                badgeCount: 12,
                onTap: () {},
              ),
            ),
          ),
        ),
      );

      expect(find.text('Offers awaiting a response'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'action wrap uses one column on phones and two on wide layouts',
      (tester) async {
        Widget buildWrap() {
          return MaterialApp(
            theme: AppTheme.light,
            home: Scaffold(
              body: Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: AppActionWrap(
                  children: [
                    AppActionTile(
                      icon: Icons.add,
                      title: 'First',
                      onTap: () {},
                    ),
                    AppActionTile(
                      icon: Icons.remove,
                      title: 'Second',
                      onTap: () {},
                    ),
                  ],
                ),
              ),
            ),
          );
        }

        await tester.binding.setSurfaceSize(const Size(390, 800));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(buildWrap());

        final firstPhone = tester.getTopLeft(find.text('First'));
        final secondPhone = tester.getTopLeft(find.text('Second'));
        expect(secondPhone.dy, greaterThan(firstPhone.dy));

        await tester.binding.setSurfaceSize(const Size(1000, 800));
        await tester.pumpWidget(buildWrap());

        final firstWide = tester.getTopLeft(find.text('First'));
        final secondWide = tester.getTopLeft(find.text('Second'));
        expect(secondWide.dy, equals(firstWide.dy));
        expect(secondWide.dx, greaterThan(firstWide.dx));
      },
    );
  });

  group('login foundation', () {
    testWidgets('login renders in light and dark, RTL and LTR', (tester) async {
      addTearDown(() => tester.binding.setSurfaceSize(null));

      for (final scenario in [
        (ThemeMode.light, const Locale('ar'), const Size(360, 800)),
        (ThemeMode.dark, const Locale('ar'), const Size(360, 800)),
        (ThemeMode.light, const Locale('en'), const Size(900, 1000)),
        (ThemeMode.dark, const Locale('en'), const Size(900, 1000)),
      ]) {
        final gateway = _TestAuthGateway();
        await tester.binding.setSurfaceSize(scenario.$3);
        await tester.pumpWidget(
          MultiBlocProvider(
            providers: [
              BlocProvider(create: (_) => AppBloc()),
              BlocProvider(
                create: (_) => AuthBloc(
                  authService: gateway,
                  sessionStorage: SessionStorage(vault: _TestVault()),
                  checkOnStart: false,
                ),
              ),
            ],
            child: MaterialApp(
              theme: AppTheme.light,
              darkTheme: AppTheme.dark,
              themeMode: scenario.$1,
              locale: scenario.$2,
              supportedLocales: const [Locale('ar'), Locale('en')],
              localizationsDelegates: const [
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: const LoginScreen(),
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 100));

        final context = tester.element(find.byType(LoginScreen));
        expect(
          Theme.of(context).brightness,
          scenario.$1 == ThemeMode.dark ? Brightness.dark : Brightness.light,
        );
        expect(
          Directionality.of(context),
          scenario.$2.languageCode == 'ar'
              ? TextDirection.rtl
              : TextDirection.ltr,
        );
        expect(tester.takeException(), isNull);

        if (scenario.$2.languageCode == 'ar') {
          expect(find.text('ستارز دليفري'), findsOneWidget);
        } else {
          expect(find.text('Stars Delivery'), findsOneWidget);
        }

        if (scenario.$3.width >= 900) {
          final card = tester.getSize(find.byType(Card).first);
          expect(card.width, lessThanOrEqualTo(Responsive.maxAuthWidth));
        }
      }
    });

    testWidgets('login submit still dispatches the existing auth event', (
      tester,
    ) async {
      final gateway = _TestAuthGateway();
      await tester.pumpWidget(
        MultiBlocProvider(
          providers: [
            BlocProvider(create: (_) => AppBloc()),
            BlocProvider(
              create: (_) => AuthBloc(
                authService: gateway,
                sessionStorage: SessionStorage(vault: _TestVault()),
                checkOnStart: false,
              ),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light,
            locale: const Locale('ar'),
            supportedLocales: const [Locale('ar'), Locale('en')],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: const LoginScreen(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      await tester.enterText(
        find.byType(TextFormField).at(0),
        'user@example.com',
      );
      await tester.enterText(find.byType(TextFormField).at(1), 'Password123!');
      await tester.ensureVisible(find.byType(ElevatedButton));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(find.byType(ElevatedButton));
      await tester.pump(const Duration(milliseconds: 100));

      expect(gateway.loginCalls, 1);
      expect(tester.takeException(), isNull);
    });
  });

  test('migrated screens avoid hardcoded palette colors', () {
    for (final path in [
      'lib/screens/login_screen.dart',
      'lib/screens/home_screen.dart',
      'lib/screens/provider_home_screen.dart',
    ]) {
      final source = File(path).readAsStringSync();
      for (final pattern in [
        'Colors.white',
        'Colors.black',
        'Colors.grey',
        'Colors.orange',
        'Colors.blue',
        'Colors.red',
        'Colors.green',
      ]) {
        expect(
          source,
          isNot(contains(pattern)),
          reason: '$path still contains $pattern',
        );
      }
    }
  });

  test('migrated screens keep their existing navigation and event hooks', () {
    final login = File('lib/screens/login_screen.dart').readAsStringSync();
    final home = File('lib/screens/home_screen.dart').readAsStringSync();
    final provider = File(
      'lib/screens/provider_home_screen.dart',
    ).readAsStringSync();

    expect(login, contains('LoginEvent('));
    expect(login, contains('ForgotPasswordScreen('));
    expect(home, contains('CreateOrderScreen('));
    expect(home, contains('MyOrdersScreen('));
    expect(home, contains('LogoutEvent()'));
    expect(home, contains('SupportChatScreen('));
    expect(provider, contains('PendingOrdersScreen('));
    expect(provider, contains('OfferedOrdersScreen('));
    expect(provider, contains('RejectedOrdersScreen('));
    expect(provider, contains('_scheduleUnblockRefresh'));
    expect(provider, contains('SwitchListTile'));
  });

  test(
    'migrated screens and shared components use directional layout APIs',
    () {
      final home = File('lib/screens/home_screen.dart').readAsStringSync();
      final provider = File(
        'lib/screens/provider_home_screen.dart',
      ).readAsStringSync();
      final components = File(
        'lib/widgets/ui/app_action_tile.dart',
      ).readAsStringSync();

      expect(home, contains('PositionedDirectional'));
      expect(provider, contains('EdgeInsetsDirectional'));
      expect(components, contains('BorderRadiusDirectional'));
    },
  );

  test('new localization keys exist for both languages', () {
    final source = File(
      'lib/services/localization_service.dart',
    ).readAsStringSync();

    for (final key in [
      'home_quick_actions',
      'retry',
      'profile',
      'logout',
      'send',
      'support_contact_title',
      'contact_support',
      'agree',
      'decline',
    ]) {
      expect(source, contains("'$key'"));
    }
  });
}

void _expectContrast(Color foreground, Color background) {
  final ratio = _contrastRatio(foreground, background);
  expect(
    ratio,
    greaterThanOrEqualTo(4.5),
    reason:
        'contrast ${ratio.toStringAsFixed(2)} for '
        '${foreground.toString()} on ${background.toString()}',
  );
}

double _contrastRatio(Color a, Color b) {
  final luminanceA = a.computeLuminance();
  final luminanceB = b.computeLuminance();
  final lighter = math.max(luminanceA, luminanceB);
  final darker = math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}
