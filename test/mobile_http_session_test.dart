import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:swifora/services/mobile_api_client.dart';
import 'package:swifora/services/mobile_session_failure.dart';

DioException rejection({
  required int status,
  required String code,
  bool authenticated = true,
  String token = 'test-session-token',
}) {
  final request = RequestOptions(
    path: '/protected',
    headers: authenticated ? {'Authorization': 'Bearer $token'} : {},
  );

  return DioException(
    requestOptions: request,
    response: Response<dynamic>(
      requestOptions: request,
      statusCode: status,
      data: {'error': 'test', 'code': code},
    ),
    type: DioExceptionType.badResponse,
  );
}

void main() {
  test('structured mobile authentication failures revoke bearer sessions', () {
    final failure = MobileSessionFailure();

    for (final code in ['AUTH_REQUIRED', 'SESSION_INVALID', 'TOKEN_EXPIRED']) {
      expect(
        failure.shouldReject(rejection(status: 401, code: code)),
        isTrue,
        reason: code,
      );
    }

    expect(
      failure.shouldReject(rejection(status: 403, code: 'ACCOUNT_INACTIVE')),
      isTrue,
    );
  });

  test('unrelated authorization failures do not revoke session', () {
    final failure = MobileSessionFailure();

    expect(
      failure.shouldReject(rejection(status: 403, code: 'FORBIDDEN')),
      isFalse,
    );

    expect(
      failure.shouldReject(
        rejection(status: 403, code: 'ORDER_STATE_CONFLICT'),
      ),
      isFalse,
    );

    expect(
      failure.shouldReject(rejection(status: 401, code: 'UNRELATED')),
      isFalse,
    );
  });

  test(
    'session classifier ignores responses without bearer authentication',
    () {
      final failure = MobileSessionFailure();

      expect(
        failure.shouldReject(
          rejection(status: 401, code: 'TOKEN_EXPIRED', authenticated: false),
        ),
        isFalse,
      );

      expect(
        failure.shouldReject(
          rejection(
            status: 403,
            code: 'ACCOUNT_INACTIVE',
            authenticated: false,
          ),
        ),
        isFalse,
      );
    },
  );

  test('report publishes only classified session rejection events', () async {
    final failure = MobileSessionFailure();
    final events = <MobileSessionFailureEvent>[];

    final subscription = failure.onRejected.listen(events.add);

    expect(failure.report(rejection(status: 403, code: 'FORBIDDEN')), isFalse);

    expect(events, isEmpty);

    expect(
      failure.report(rejection(status: 401, code: 'TOKEN_EXPIRED')),
      isTrue,
    );

    expect(events, hasLength(1));
    expect(events.single.statusCode, 401);
    expect(events.single.code, 'TOKEN_EXPIRED');
    expect(events.single.belongsTo('test-session-token'), isTrue);
    expect(events.single.belongsTo('new-session-token'), isFalse);

    await subscription.cancel();
  });

  test(
    'rejection event remains scoped to the bearer session that failed',
    () async {
      final failure = MobileSessionFailure();
      final events = <MobileSessionFailureEvent>[];

      final subscription = failure.onRejected.listen(events.add);

      expect(
        failure.report(
          rejection(
            status: 401,
            code: 'TOKEN_EXPIRED',
            token: 'old-session-token',
          ),
        ),
        isTrue,
      );

      expect(events, hasLength(1));
      expect(events.single.belongsTo('old-session-token'), isTrue);
      expect(events.single.belongsTo('new-session-token'), isFalse);

      await subscription.cancel();
    },
  );

  test('mobile API client installs exactly one session interceptor', () {
    final failure = MobileSessionFailure();

    final dio = MobileApiClient.create(
      baseUrl: 'https://example.test/api',
      headers: {'Content-Type': 'application/json'},
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 9),
      sessionFailure: failure,
    );

    expect(dio.options.baseUrl, 'https://example.test/api');

    expect(dio.options.connectTimeout, const Duration(seconds: 8));

    expect(dio.options.receiveTimeout, const Duration(seconds: 9));

    expect(dio.interceptors.whereType<MobileSessionInterceptor>().length, 1);
  });

  test('mobile API client can preserve clients without explicit timeouts', () {
    final dio = MobileApiClient.create(
      baseUrl: 'https://example.test/api',
      connectTimeout: null,
      receiveTimeout: null,
    );

    expect(dio.options.connectTimeout, isNull);
    expect(dio.options.receiveTimeout, isNull);
  });
}
