import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/services/theme_service.dart';
import 'package:stars_delivery/services/user_service.dart';
import 'package:stars_delivery/services/location_catalog.dart';
import 'package:stars_delivery/models/user_model.dart';
import 'package:stars_delivery/models/offer_model.dart';
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
  test('new users default to governorate-level mode off', () {
    final user = UserModel.fromJson({
      'id': 'user-1',
      'fullName': 'Customer',
      'email': 'customer@example.com',
      'phone': '111',
      'role': 'customer',
      'area': 'Bethlehem',
      'governorate': 'بيت لحم',
      'publicId': 'CUS-1',
    });

    expect(user.governorateLevel, isFalse);
  });

  test('location catalog resolves legacy and city accounts', () {
    const bethlehem = GovernorateOption(
      name: 'Bethlehem',
      nativeName: 'بيت لحم',
      areaValue: 'بيت لحم',
      cities: ['Beit Jala', 'Bethlehem'],
    );
    const ramallah = GovernorateOption(
      name: 'Ramallah',
      nativeName: 'رام الله',
      areaValue: 'رام الله والبيرة',
      cities: ['Al-Bireh', 'Bir Zeit'],
    );
    const governorates = [bethlehem, ramallah];

    expect(
      LocationCatalog.findForUser(
        governorates,
        governorate: '',
        area: 'بيت لحم',
      )?.name,
      'Bethlehem',
    );
    expect(
      LocationCatalog.findForUser(
        governorates,
        governorate: 'الخليل',
        area: 'Al-Bireh',
      )?.name,
      'Ramallah',
    );
    expect(LocationCatalog.cityForUser(bethlehem, 'بيت لحم'), 'بيت لحم');
    expect(LocationCatalog.cityForUser(bethlehem, 'Beit Jala'), 'Beit Jala');
    expect(LocationCatalog.cityForUser(bethlehem, 'Al-Bireh'), isNull);
  });

  test('offer model exposes outside-area driver metadata', () {
    final offer = OfferModel.fromJson({
      '_id': 'offer-1',
      'price': 20,
      'estimatedTime': 10,
      'status': 'pending',
      'providerId': {
        '_id': 'provider-1',
        'fullName': 'Driver One',
        'area': 'Beit Jala',
        'governorate': 'بيت لحم',
        'publicId': 'DRV-1',
      },
      'orderId': {
        'description': 'Test order',
        'area': 'Bethlehem',
        'type': 'product',
      },
      'outsideArea': true,
      'providerArea': 'Beit Jala',
      'providerCity': 'Beit Jala',
      'providerGovernorate': 'بيت لحم',
    });

    expect(offer.outsideArea, isTrue);
    expect(offer.providerCity, 'Beit Jala');
    expect(offer.providerGovernorate, 'بيت لحم');
    expect(offer.orderArea, 'Bethlehem');
  });

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

  testWidgets(
    'customers have no governorate scope: create order shows no banner',
    (tester) async {
      // Even an account that enabled the old customer setting gets no
      // governorate banner or warning; the scope is the driver's choice.
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
        _app(CreateOrderScreen(user: user, token: 'token')),
      );

      expect(find.byKey(const Key('governorateOrderBanner')), findsNothing);
      expect(find.textContaining('Governorate mode is on'), findsNothing);
    },
  );
}
