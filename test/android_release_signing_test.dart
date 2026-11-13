import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String projectFile(String relativePath) {
  return File(
    '${Directory.current.path}${Platform.pathSeparator}$relativePath',
  ).readAsStringSync();
}

String bracedBlockAfter(
  String source,
  String anchor, {
  int startAt = 0,
}) {
  final anchorIndex =
      source.indexOf(
        anchor,
        startAt,
      );

  expect(
    anchorIndex,
    greaterThanOrEqualTo(0),
    reason: 'Missing anchor: $anchor',
  );

  final braceIndex =
      source.indexOf(
        '{',
        anchorIndex,
      );

  expect(
    braceIndex,
    greaterThanOrEqualTo(0),
    reason:
        'Missing opening brace after: $anchor',
  );

  var depth = 0;

  for (
    var index = braceIndex;
    index < source.length;
    index++
  ) {
    final character =
        source[index];

    if (character == '{') {
      depth++;
    } else if (character == '}') {
      depth--;

      if (depth == 0) {
        return source.substring(
          anchorIndex,
          index + 1,
        );
      }
    }
  }

  fail(
    'Unterminated block after: $anchor',
  );
}

void main() {
  final gradle =
      projectFile(
        'android/app/build.gradle.kts',
      );

  final androidIgnore =
      projectFile(
        'android/.gitignore',
      );

  final signingExample =
      projectFile(
        'android/key.properties.example',
      );

  test(
    'Android release uses dedicated release signing rather than debug signing',
    () {
      final buildTypesIndex =
          gradle.indexOf(
            'buildTypes {',
          );

      expect(
        buildTypesIndex,
        greaterThanOrEqualTo(0),
      );

      final release =
          bracedBlockAfter(
            gradle,
            'release {',
            startAt:
                buildTypesIndex,
          );

      expect(
        release,
        contains(
          'signingConfigs.getByName("release")',
        ),
      );

      expect(
        release,
        isNot(
          contains(
            'signingConfigs.getByName("debug")',
          ),
        ),
      );

      expect(
        gradle,
        isNot(
          contains(
            'debug.keystore',
          ),
        ),
      );

      expect(
        gradle,
        isNot(
          contains(
            'AndroidDebugKey',
          ),
        ),
      );
    },
  );

  test(
    'release signing loads private key.properties and has fail-closed artifact guards',
    () {
      expect(
        gradle,
        contains(
          'rootProject.file("key.properties")',
        ),
      );

      for (final property in <String>[
        'storePassword',
        'keyPassword',
        'keyAlias',
        'storeFile',
      ]) {
        expect(
          gradle,
          contains(
            '"$property"',
          ),
        );
      }

      expect(
        gradle,
        contains(
          'SWIFORA_ANDROID_RELEASE_SIGNING_REQUIRED',
        ),
      );

      for (final taskName in <String>[
        'validateSigningRelease',
        'signReleaseBundle',
        'packageRelease',
        'assembleRelease',
        'bundleRelease',
      ]) {
        expect(
          gradle,
          contains(
            '"$taskName"',
          ),
        );
      }

      expect(
        gradle,
        contains(
          'requireReleaseSigning()',
        ),
      );
    },
  );

  test(
    'release signing source contains no hardcoded passwords',
    () {
      final literalStorePassword =
          RegExp(
            r'''storePassword\s*=\s*["'][^"']+["']''',
          );

      final literalKeyPassword =
          RegExp(
            r'''keyPassword\s*=\s*["'][^"']+["']''',
          );

      expect(
        literalStorePassword.hasMatch(
          gradle,
        ),
        isFalse,
      );

      expect(
        literalKeyPassword.hasMatch(
          gradle,
        ),
        isFalse,
      );
    },
  );

  test(
    'tracked key.properties example is an empty non-secret template',
    () {
      final entries =
          <String, String>{};

      for (
        final rawLine
        in signingExample.split('\n')
      ) {
        final line =
            rawLine.trim();

        if (
          line.isEmpty
          || line.startsWith('#')
          || !line.contains('=')
        ) {
          continue;
        }

        final separator =
            line.indexOf('=');

        entries[
          line.substring(
            0,
            separator,
          )
        ] =
            line.substring(
              separator + 1,
            );
      }

      expect(
        entries.keys.toSet(),
        equals(
          <String>{
            'storePassword',
            'keyPassword',
            'keyAlias',
            'storeFile',
          },
        ),
      );

      expect(
        entries.values.every(
          (value) =>
              value.isEmpty,
        ),
        isTrue,
      );
    },
  );

  test(
    'Android ignore rules protect private signing material',
    () {
      for (final pattern in <String>[
        'key.properties',
        '**/*.keystore',
        '**/*.jks',
        '**/*.p12',
        '**/*.pfx',
      ]) {
        expect(
          androidIgnore,
          contains(pattern),
        );
      }
    },
  );
}
