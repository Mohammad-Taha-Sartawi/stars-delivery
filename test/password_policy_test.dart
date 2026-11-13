import 'package:flutter_test/flutter_test.dart';
import 'package:swifora/services/validators.dart';

void main() {
  group('mobile password policy', () {
    test('rejects passwords shorter than 12 characters', () {
      expect(Validators.password('12345678901'), isNotNull);
    });

    test('accepts password at minimum length', () {
      expect(Validators.password('123456789012'), isNull);
    });

    test('accepts password at maximum length', () {
      expect(Validators.password(List.filled(128, 'x').join()), isNull);
    });

    test('rejects password longer than 128 characters', () {
      expect(Validators.password(List.filled(129, 'x').join()), isNotNull);
    });

    test('rejects whitespace-only password', () {
      expect(Validators.password('            '), isNotNull);
    });

    test('rejects obvious placeholder password', () {
      expect(Validators.password('placeholder-password'), isNotNull);
    });
  });
}
