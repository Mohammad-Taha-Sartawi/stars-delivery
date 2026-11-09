import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/services/theme_service.dart';
import 'package:stars_delivery/services/user_service.dart';
import 'package:stars_delivery/models/user_model.dart';
import 'package:stars_delivery/screens/create_order_screen.dart';
import 'package:stars_delivery/widgets/governorate_scope_card.dart';
import 'package:stars_delivery/widgets/ui/governorate_scope_warning.dart';

class _FakeUserService extends UserService {
  bool? requested;

  @override
  Future<bool> setGovernorateLevel(String token, bool enabled) async {
    requested = enabled;
    return enabled;
  }
}

Widget _app(Widget home) {
  return MaterialApp(
    theme: AppTheme.light,
    locale: const Locale('en'),
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
  testWidgets('governorate scope card is visible and persists toggles', (
    tester,
  ) async {
    final service = _FakeUserService();

    await tester.pumpWidget(
      _app(
        Scaffold(
          body: GovernorateScopeCard(
            token: 'token',
            initialEnabled: false,
            isProvider: false,
            governorateName: 'Ramallah',
            userService: service,
          ),
        ),
      ),
    );

    expect(find.text('Send orders across the governorate'), findsOneWidget);
    expect(find.byKey(const Key('governorateScopeSwitch')), findsOneWidget);

    await tester.tap(find.byKey(const Key('governorateScopeSwitch')));
    await tester.pumpAndSettle();

    expect(service.requested, isTrue);
    expect(
      tester
          .widget<Switch>(find.byKey(const Key('governorateScopeSwitch')))
          .value,
      isTrue,
    );
  });

  testWidgets('governorate warning blocks continuation for five seconds', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () {
                showGovernorateScopeWarning(
                  context,
                  title: 'Outside your area',
                  message: 'This order is in another village.',
                  note: 'Only shown because governorate mode is enabled.',
                  confirmLabel: 'Continue',
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('Outside your area'), findsOneWidget);
    expect(find.text('You can continue in 5 seconds.'), findsOneWidget);

    FilledButton button = tester.widget<FilledButton>(
      find.byType(FilledButton),
    );
    expect(button.onPressed, isNull);

    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();

    expect(find.text('You can continue in 0 seconds.'), findsOneWidget);
    button = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(button.onPressed, isNotNull);

    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();
    expect(find.text('Outside your area'), findsNothing);
  });

  testWidgets('create order shows the active governorate-level banner', (
    tester,
  ) async {
    final user = UserModel(
      id: 'customer-1',
      fullName: 'Customer',
      email: 'customer@example.com',
      phone: '111',
      role: 'customer',
      area: 'Bethlehem',
      governorate: 'بيت لحم',
      governorateLevel: true,
      publicId: 'CUS-1',
    );

    await tester.pumpWidget(
      _app(
        CreateOrderScreen(user: user, token: 'token', governorateLevel: true),
      ),
    );

    expect(find.byKey(const Key('governorateOrderBanner')), findsOneWidget);
    expect(find.textContaining('Governorate mode is on'), findsOneWidget);
  });
}
