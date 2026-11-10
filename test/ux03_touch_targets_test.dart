// UX-03 touch-target verification for the support chat send control.
import 'package:flutter_test/flutter_test.dart';

import 'ux03_screen_harness.dart';

void main() {
  late Ux03Harness harness;

  setUp(() {
    harness = Ux03Harness();
    harness.api.reset();
  });

  tearDown(() {
    harness.dispose();
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
}
