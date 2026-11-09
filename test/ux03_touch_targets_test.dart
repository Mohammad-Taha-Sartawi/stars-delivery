// UX-03 touch-target verification for the specific controls called out by the
// audit: create-order photo removal, support-chat send and notification
// image thumbnails.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/widgets/ui/app_image_thumbnail.dart';

import 'ux03_screen_harness.dart';

// 1x1 transparent PNG.
const _pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8'
    '/x8AAusB9Wl5Z0kAAAAASUVORK5CYII=';

void main() {
  late Ux03Harness harness;
  late Directory tempDir;
  late File imageFile;

  setUp(() {
    harness = Ux03Harness();
    harness.api.reset();
    tempDir = Directory.systemTemp.createTempSync('ux03_');
    imageFile = File('${tempDir.path}/image.png')
      ..writeAsBytesSync(base64Decode(_pngBase64));
  });

  tearDown(() {
    harness.dispose();
    if (tempDir.existsSync()) {
      tempDir.deleteSync(recursive: true);
    }
  });

  testWidgets('create order photo removal has a 48dp target and label', (
    tester,
  ) async {
    const channel = MethodChannel('plugins.flutter.io/image_picker');
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'pickImage') {
        return imageFile.path;
      }
      return null;
    });
    addTearDown(() => messenger.setMockMethodCallHandler(channel, null));

    await harness.pumpScreen(tester, Ux03Screen.createOrder);
    await tester.tap(find.text('Product Order'));
    await tester.pump();

    final addPhotos = find.byType(OutlinedButton).first;
    await tester.ensureVisible(addPhotos);
    await tester.pump();
    await tester.tap(addPhotos);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    final remove = find.byTooltip('Remove photo');
    expect(remove, findsOneWidget);

    final size = tester.getSize(remove);
    expect(size.width, greaterThanOrEqualTo(48));
    expect(size.height, greaterThanOrEqualTo(48));

    await tester.tap(remove);
    await tester.pump();
    expect(find.byTooltip('Remove photo'), findsNothing);
    // The real decoded image may surface a paint warning only; the control
    // behaviour above is what this test verifies.
    tester.takeException();
  });

  testWidgets('support chat send button has a 48dp target and label', (
    tester,
  ) async {
    await harness.pumpScreen(tester, Ux03Screen.supportChat);

    final send = find.byTooltip('Send message');
    expect(send, findsOneWidget);

    final size = tester.getSize(send);
    expect(size.width, greaterThanOrEqualTo(48));
    expect(size.height, greaterThanOrEqualTo(48));
    expect(tester.takeException(), isNull);
  });

  testWidgets('notification image thumbnail has a 48dp target and name', (
    tester,
  ) async {
    harness.api.notifications = [
      {
        '_id': 'n1',
        'orderId': '',
        'type': 'broadcast',
        'title': 'Delivery update',
        'body': 'Your order is on the way.',
        'read': false,
        'pinned': false,
        'createdAt': '2026-11-09T10:00:00.000Z',
        'image': 'http://127.0.0.1:1/notification.png',
      },
    ];

    final semantics = tester.ensureSemantics();
    await harness.pumpScreen(tester, Ux03Screen.notifications);
    await tester.pump(const Duration(milliseconds: 150));

    final thumbnail = find.byType(AppImageThumbnail);
    expect(thumbnail, findsOneWidget);

    final size = tester.getSize(thumbnail);
    expect(size.width, greaterThanOrEqualTo(48));
    expect(size.height, greaterThanOrEqualTo(48));

    final data = tester.getSemantics(thumbnail).getSemanticsData();
    expect(data.label, 'View image');
    expect(data.flagsCollection.isButton, isTrue);

    semantics.dispose();
    tester.takeException();
  });
}
