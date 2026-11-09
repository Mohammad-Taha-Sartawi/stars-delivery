// UX-01 remediation tests: login legal/reject dialogs and role selection.
//
// UX01-003/004 (localization): dialog titles and ordinary UI strings must
// follow the app locale; the legal bodies stay Arabic-only per the verified
// product-content policy and keep explicit RTL direction. The rejection
// dialog is ordinary UI and must be fully localized and direction-aware.
//
// UX01-004 (role selection): the selected role card must present a non-color
// indicator (check icon) in addition to its Semantics.selected state.
//
// The area dropdown reads the 46 MB countries/cities asset through the
// flutter/assets platform channel, which never completes inside an automated
// widget test (flutter_test only mocks that channel when the UNIT_TEST_ASSETS
// env var is set). We therefore install a test-only message handler serving a
// minimal faithful fixture: the actual Palestine entry pre-extracted from the
// real asset file once per suite.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/bloc/app/app_bloc.dart';
import 'package:stars_delivery/bloc/auth/auth_bloc.dart';
import 'package:stars_delivery/services/auth_service.dart';
import 'package:stars_delivery/services/session_storage.dart';
import 'package:stars_delivery/services/theme_service.dart';
import 'package:stars_delivery/screens/login_screen.dart';

class _TestVault implements TokenVault {
  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> delete(String key) async {}
}

class _StubGateway implements AuthGateway {
  @override
  Future<Map<String, dynamic>> login(
    String email,
    String password,
    String role,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<Map<String, dynamic>> register(
    String fullName,
    String email,
    String phone,
    String password,
    String role,
    String area, {
    bool privacyPolicy = true,
    List<String> serviceTypes = const [],
    ProviderRegistrationDocument? driverLicenseDocument,
  }) {
    // Reject dialog tests never reach registration.
    throw UnimplementedError();
  }

  @override
  Future<Map<String, dynamic>> validateSession(String token) {
    throw UnimplementedError();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Serve the area asset through the flutter/assets channel inside widget
  // tests. The fixture is the genuine Palestine entry verbatim, extracted from
  // the real asset once (plain IO is allowed at suite level, outside any
  // test's fake-async zone).
  const areaAssetKey = 'assets/countries+states+cities.json';
  final areaFixture = jsonEncode(
    (jsonDecode(File('assets/countries+states+cities.json').readAsStringSync())
            as List)
        .cast<Map<String, dynamic>>()
        .firstWhere((country) => country['iso2'] == 'PS'),
  );

  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMessageHandler('flutter/assets', (ByteData? message) async {
        final key = utf8.decode(message!.buffer.asUint8List());
        if (key == areaAssetKey) {
          return Uint8List.fromList(
            utf8.encode(areaFixture),
          ).buffer.asByteData();
        }
        return null;
      });

  Widget loginHarness({required Locale locale}) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => AppBloc()),
        BlocProvider(
          create: (_) => AuthBloc(
            authService: _StubGateway(),
            sessionStorage: SessionStorage(vault: _TestVault()),
            checkOnStart: false,
          ),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        locale: locale,
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: const LoginScreen(),
      ),
    );
  }

  /// Switches to registration mode, fills the customer form (with area) and
  /// submits, leaving the Terms of Service dialog open.
  Future<void> openTermsDialog(WidgetTester tester, bool isAr) async {
    // Switch to the registration form.
    final signupToggle = find.textContaining(
      isAr ? 'إنشاء حساب' : 'Sign Up',
      findRichText: true,
    );
    await tester.ensureVisible(signupToggle);
    await tester.pumpAndSettle(const Duration(milliseconds: 80));
    await tester.tap(signupToggle);
    await tester.pumpAndSettle(const Duration(milliseconds: 150));

    // Registration fields: name(0), phone(1), area dropdown, email(2),
    // password(3), confirm(4) in customer mode.
    await tester.enterText(find.byType(TextFormField).at(0), 'Test Person');
    await tester.enterText(find.byType(TextFormField).at(1), '0501234');

    // Selecting Jerusalem: opening the dropdown menu route is not possible in
    // the automated widget-test environment (the pointer route it pushes is
    // never built by the test view, independent of tap location). We set the
    // exact value the 'Jerusalem' item carries — item values are the Arabic
    // area names by design (`value: _areasAr[e.key]`) — through the public
    // FormFieldState.didChange seam, which runs the same validation and state
    // update a real selection performs.
    tester
        .state<FormFieldState<String>>(
          find.byType(DropdownButtonFormField<String>),
        )
        .didChange('القدس');
    await tester.pumpAndSettle(const Duration(milliseconds: 200));

    await tester.enterText(find.byType(TextFormField).at(2), 'ann@example.com');
    await tester.enterText(find.byType(TextFormField).at(3), 'Password123!abc');
    await tester.enterText(find.byType(TextFormField).at(4), 'Password123!abc');
    await tester.pump(const Duration(milliseconds: 30));

    await tester.ensureVisible(find.byType(ElevatedButton));
    await tester.tap(find.byType(ElevatedButton));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
  }

  group('UX01-003/004 legal and reject dialog localization', () {
    testWidgets(
      'English: localized titles/actions, Arabic-only legal body, western UI',
      (tester) async {
        await tester.pumpWidget(loginHarness(locale: const Locale('en')));
        await tester.pump(const Duration(milliseconds: 100));

        await openTermsDialog(tester, false);
        expect(tester.takeException(), isNull);

        // Dialog title is localized; body stays Arabic-only, explicitly RTL.
        expect(find.text('Terms of Service'), findsOneWidget);
        final legalBody = tester.widget<Text>(
          find.textContaining('الباب الأول').first,
        );
        expect(legalBody.textDirection, TextDirection.rtl);

        // Ordinary action labels were already localized.
        expect(find.text('Decline'), findsOneWidget);
        expect(find.text('Agree'), findsOneWidget);

        // Declining opens the reject dialog: fully localized, English UI.
        await tester.tap(find.text('Decline'));
        await tester.pumpAndSettle(const Duration(milliseconds: 150));

        expect(find.text('Agreement Required'), findsOneWidget);
        final rejectBodyContext = tester.element(
          find.textContaining('Agreeing to the Terms of Service'),
        );
        expect(Directionality.of(rejectBodyContext), TextDirection.ltr);
        expect(find.text('OK'), findsOneWidget);
      },
    );

    testWidgets('Arabic: Arabic titles and actions, RTL directions preserved', (
      tester,
    ) async {
      await tester.pumpWidget(loginHarness(locale: const Locale('ar')));
      await tester.pump(const Duration(milliseconds: 100));

      await openTermsDialog(tester, true);
      expect(tester.takeException(), isNull);

      expect(find.text('شروط الخدمة'), findsOneWidget);
      final legalBody = tester.widget<Text>(
        find.textContaining('الباب الأول').first,
      );
      expect(legalBody.textDirection, TextDirection.rtl);

      expect(find.text('أرفض'), findsOneWidget);
      expect(find.text('أوافق'), findsOneWidget);

      // Agreeing continues to the privacy dialog (localized title).
      await tester.tap(find.text('أوافق'));
      await tester.pumpAndSettle(const Duration(milliseconds: 150));
      expect(find.text('سياسة الخصوصية'), findsOneWidget);

      // Declining the privacy policy opens the Arabic reject dialog.
      await tester.tap(find.text('أرفض'));
      await tester.pumpAndSettle(const Duration(milliseconds: 150));
      expect(find.text('الشروط مطلوبة'), findsOneWidget);
      final rejectBodyContext = tester.element(
        find.textContaining('الموافقة على شروط الخدمة'),
      );
      expect(Directionality.of(rejectBodyContext), TextDirection.rtl);
      expect(find.text('حسناً'), findsOneWidget);
    });
  });

  group('UX01-004 role selection indicator', () {
    testWidgets(
      'selected and unselected roles: check icon + selected semantics (EN)',
      (tester) async {
        await tester.pumpWidget(loginHarness(locale: const Locale('en')));
        await tester.pump(const Duration(milliseconds: 100));

        // Customer starts selected; exactly one non-color indicator exists.
        expect(find.byIcon(Icons.check_circle), findsOneWidget);

        final customer = find.bySemanticsLabel(
          RegExp(r'^Customer\. Need delivery$'),
        );
        final customerNode = tester.getSemantics(customer).getSemanticsData();
        expect(customerNode.flagsCollection.isSelected, Tristate.isTrue);

        final provider = find.bySemanticsLabel(
          RegExp(r'^Provider\. Offer delivery$'),
        );
        final providerNode = tester.getSemantics(provider).getSemanticsData();
        expect(providerNode.flagsCollection.isSelected, isNot(Tristate.isTrue));

        // Selecting the provider moves the check indicator.
        await tester.tap(find.text('Provider'));
        await tester.pump(const Duration(milliseconds: 100));

        expect(find.byIcon(Icons.check_circle), findsOneWidget);
        final providerAfter = tester.getSemantics(provider).getSemanticsData();
        expect(providerAfter.flagsCollection.isSelected, Tristate.isTrue);
        final customerAfter = tester.getSemantics(customer).getSemanticsData();
        expect(
          customerAfter.flagsCollection.isSelected,
          isNot(Tristate.isTrue),
        );
      },
    );

    testWidgets(
      'selected/unselected rendering is exception-free in Arabic RTL',
      (tester) async {
        await tester.pumpWidget(loginHarness(locale: const Locale('ar')));
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.byIcon(Icons.check_circle), findsOneWidget);
        expect(tester.takeException(), isNull);

        await tester.tap(find.text('سائق'));
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.byIcon(Icons.check_circle), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  });
}
