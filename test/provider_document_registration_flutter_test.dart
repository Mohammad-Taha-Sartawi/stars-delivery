import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:stars_delivery/services/auth_service.dart';

void main() {
  test(
    'provider document accepts JPEG magic bytes with a safe generic filename',
    () {
      final document = ProviderRegistrationDocument.fromBytes(
        bytes: const [0xff, 0xd8, 0xff, 0xe0, 0x00],
        safeBaseName: 'driver-license',
      );

      expect(document.contentType, 'image/jpeg');

      expect(document.fileName, 'driver-license.jpg');

      expect(document.fileName, isNot(contains('\\')));

      expect(document.fileName, isNot(contains('/')));
    },
  );

  test('provider document accepts PNG magic bytes', () {
    final document = ProviderRegistrationDocument.fromBytes(
      bytes: const [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00],
      safeBaseName: 'driver-license',
    );

    expect(document.contentType, 'image/png');

    expect(document.fileName, 'driver-license.png');
  });

  test('provider document rejects an empty payload', () {
    expect(
      () => ProviderRegistrationDocument.fromBytes(
        bytes: const [],
        safeBaseName: 'driver-license',
      ),
      throwsA(
        isA<ProviderDocumentValidationException>().having(
          (error) => error.failure,
          'failure',
          ProviderDocumentValidationFailure.empty,
        ),
      ),
    );
  });

  test('provider document rejects payload larger than five MiB', () {
    final oversized = List<int>.filled(
      ProviderRegistrationDocument.maxSizeBytes + 1,
      0xff,
    );

    expect(
      () => ProviderRegistrationDocument.fromBytes(
        bytes: oversized,
        safeBaseName: 'driver-license',
      ),
      throwsA(
        isA<ProviderDocumentValidationException>().having(
          (error) => error.failure,
          'failure',
          ProviderDocumentValidationFailure.tooLarge,
        ),
      ),
    );
  });

  test('provider document rejects unsupported bytes', () {
    expect(
      () => ProviderRegistrationDocument.fromBytes(
        bytes: const [0x48, 0x45, 0x49, 0x43],
        safeBaseName: 'driver-license',
      ),
      throwsA(
        isA<ProviderDocumentValidationException>().having(
          (error) => error.failure,
          'failure',
          ProviderDocumentValidationFailure.unsupportedType,
        ),
      ),
    );
  });

  test(
    'provider registration uses multipart exact backend field names while customer remains JSON',
    () {
      final source = File('lib/services/auth_service.dart').readAsStringSync();

      expect(source, contains("if (role != 'provider')"));

      expect(source, isNot(contains("'identityDocument':")));

      expect(source, contains("'driverLicenseDocument':"));

      expect(source, contains('FormData.fromMap'));

      expect(source, contains('Headers.multipartFormDataContentType'));

      expect(source, contains('DioMediaType('));
    },
  );

  test(
    'registration event carries documents but excludes bytes from Equatable props',
    () {
      final source = File('lib/bloc/auth/auth_event.dart').readAsStringSync();

      expect(source, isNot(contains('identityDocument')));

      expect(source, contains('driverLicenseDocument'));

      final propsStart = source.indexOf(
        '// Provider document bytes are intentionally omitted',
      );

      expect(propsStart, greaterThanOrEqualTo(0));

      final propsTail = source.substring(propsStart);

      final propsEnd = propsTail.indexOf('];');

      expect(propsEnd, greaterThanOrEqualTo(0));

      final propsBlock = propsTail.substring(0, propsEnd);

      expect(propsBlock, isNot(contains('driverLicenseDocument,')));
    },
  );

  test(
    'AuthBloc forwards the provider driver-license document to AuthGateway',
    () {
      final source = File('lib/bloc/auth/auth_bloc.dart').readAsStringSync();

      expect(source, isNot(contains('identityDocument')));

      expect(
        source,
        contains('driverLicenseDocument: event.driverLicenseDocument'),
      );
    },
  );

  test(
    'provider signup UI uses gallery-only selection and requires the driver license',
    () {
      final source = File('lib/screens/login_screen.dart').readAsStringSync();

      expect(source, contains("if (_selectedRole == 'provider')"));

      expect(source, isNot(contains("const Key('identityDocumentPicker')")));

      expect(source, contains("const Key('driverLicenseDocumentPicker')"));

      expect(source, contains('source: ImageSource.gallery'));

      expect(source, contains('requestFullMetadata: false'));

      expect(source, isNot(contains('ImageSource.camera')));

      expect(source, isNot(contains('_identityDocument')));

      expect(source, contains("_driverLicenseDocument == null"));
    },
  );

  test(
    'R2 declares iOS photo privacy and reuses existing image_picker dependency and localization',
    () {
      final plist = File('ios/Runner/Info.plist').readAsStringSync();

      final pubspec = File('pubspec.yaml').readAsStringSync();

      final localization = File(
        'lib/services/localization_service.dart',
      ).readAsStringSync();

      expect(plist, contains('NSPhotoLibraryUsageDescription'));

      expect(plist, isNot(contains('NSCameraUsageDescription')));

      expect(pubspec, contains('image_picker: ^1.2.3'));

      expect(localization, contains("'provider_documents_required'"));

      expect(localization, contains("'provider_document_too_large'"));

      expect(localization, contains("'provider_document_unsupported'"));
    },
  );
}
