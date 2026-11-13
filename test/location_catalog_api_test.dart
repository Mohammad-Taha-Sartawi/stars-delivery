// LocationCatalog now loads Palestine governorates from the backend
// (GET /api/locations/governorates) instead of a bundled 46.5 MB asset.
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/services/api_config.dart';
import 'package:stars_delivery/services/location_catalog.dart';
import 'package:stars_delivery/services/mobile_api_client.dart';

class _CountingAdapter implements HttpClientAdapter {
  int requests = 0;
  int failuresLeft = 0;
  bool citiesAsObjects = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests += 1;
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      return ResponseBody.fromString(
        '{"error":"down"}',
        503,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    return ResponseBody.fromString(
      jsonEncode([
        {
          'name': 'Ramallah',
          'native': 'رام الله',
          'cities': citiesAsObjects
              ? [
                  {'name': 'Al-Bireh', 'native': 'البيرة'},
                  {'name': 'Birzeit', 'native': 'بيرزيت'},
                ]
              : ['Al-Bireh', 'Birzeit'],
        },
        {
          'name': 'Bethlehem',
          'native': 'بيت لحم',
          'cities': ['Beit Jala'],
        },
      ]),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late _CountingAdapter adapter;

  setUpAll(() => ApiConfig.initForTesting('http://127.0.0.1:1'));

  setUp(() {
    adapter = _CountingAdapter();
    MobileApiClient.testAdapter = adapter;
    LocationCatalog.clearCache();
  });

  tearDown(() => MobileApiClient.testAdapter = null);

  test('parse keeps order, trims, and maps canonical area values', () {
    final options = LocationCatalog.parse([
      {
        'name': 'Ramallah ',
        'native': ' رام الله',
        'cities': [' Al-Bireh', ''],
      },
      {'name': 'Jenin', 'native': '', 'cities': []},
      {'name': '', 'native': 'x'},
      'not a map',
    ]);
    expect(options.map((o) => o.name), ['Ramallah', 'Jenin']);
    expect(options[0].nativeName, 'رام الله');
    // Legacy canonical value stored on accounts.
    expect(options[0].areaValue, 'رام الله والبيرة');
    expect(options[0].cities, ['Al-Bireh']);
    // Missing native falls back to the English name.
    expect(options[1].nativeName, 'Jenin');
    expect(LocationCatalog.parse({'not': 'a list'}), isEmpty);
  });

  test('load fetches once and serves later calls from the cache', () async {
    final results = await Future.wait([
      LocationCatalog.load(),
      LocationCatalog.load(),
    ]);
    expect(results[0], hasLength(2));
    expect(identical(results[0], results[1]), isTrue);
    await LocationCatalog.load();
    expect(adapter.requests, 1);
  });

  test('a failed load is not cached and the next call retries', () async {
    adapter.failuresLeft = 1;
    await expectLater(LocationCatalog.load(), throwsA(isA<DioException>()));
    final governorates = await LocationCatalog.load();
    expect(governorates.first.cities, contains('Al-Bireh'));
    expect(adapter.requests, 2);
  });

  test('version 2 payload: Arabic city labels and locale-aware sorting', () {
    final ramallah = LocationCatalog.parse([
      {
        'name': 'Ramallah',
        'native': 'رام الله',
        'cities': [
          {'name': 'Bir Zeit', 'native': 'بيرزيت'},
          {'name': 'Al-Bireh', 'native': 'البيرة'},
          {'name': 'Silwad', 'native': ''},
        ],
      },
    ]).single;
    // Stored values stay English.
    expect(ramallah.cities, ['Bir Zeit', 'Al-Bireh', 'Silwad']);
    expect(ramallah.cityLabel('Al-Bireh', arabic: true), 'البيرة');
    expect(ramallah.cityLabel('Al-Bireh', arabic: false), 'Al-Bireh');
    // Missing Arabic name falls back to the stored value.
    expect(ramallah.cityLabel('Silwad', arabic: true), 'Silwad');
    expect(ramallah.citiesSortedFor(arabic: false), [
      'Al-Bireh',
      'Bir Zeit',
      'Silwad',
    ]);
    expect(ramallah.citiesSortedFor(arabic: true).first, 'Silwad');
  });

  testWidgets('localize shows Arabic names only in the Arabic locale', (
    tester,
  ) async {
    adapter.citiesAsObjects = true;
    await tester.runAsync(LocationCatalog.load);
    String? ar;
    String? en;
    Widget probe(Locale locale, void Function(String) out) => Localizations(
      locale: locale,
      delegates: const [DefaultWidgetsLocalizations.delegate],
      child: Builder(
        builder: (context) {
          out(LocationCatalog.localize(context, 'Al-Bireh'));
          return const SizedBox();
        },
      ),
    );
    await tester.pumpWidget(probe(const Locale('ar'), (v) => ar = v));
    expect(ar, 'البيرة');
    await tester.pumpWidget(probe(const Locale('en'), (v) => en = v));
    expect(en, 'Al-Bireh');
    await tester.pumpWidget(probe(const Locale('ar'), (v) => ar = v));
    expect(
      LocationCatalog.localize(
        tester.element(find.byType(SizedBox)),
        'Unknown Place',
      ),
      'Unknown Place',
    );
  });
}
