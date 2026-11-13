// Sign-in while a driver's sign-up waits for approval, the 9 shekel minimum
// offer, the guest support conversation and the customer rating label.
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:swifora/bloc/auth/auth_bloc.dart';
import 'package:swifora/bloc/auth/auth_event.dart';
import 'package:swifora/bloc/auth/auth_state.dart';
import 'package:swifora/services/auth_service.dart';
import 'package:swifora/services/guest_support_service.dart';
import 'package:swifora/services/offer_service.dart';
import 'package:swifora/services/session_storage.dart';
import 'package:swifora/widgets/ui/star_rating_dialog.dart';

class _MemoryVault implements TokenVault {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

class _Gateway implements AuthGateway {
  Map<String, dynamic>? loginReply;
  Object? loginError;
  Map<String, dynamic>? registerReply;

  @override
  Future<Map<String, dynamic>> login(
    String email,
    String password,
    String role,
  ) async {
    if (loginError != null) throw loginError!;
    return loginReply!;
  }

  @override
  Future<Map<String, dynamic>> register(
    String fullName,
    String email,
    String phone,
    String password,
    String role,
    String area, {
    String governorate = '',
    bool privacyPolicy = true,
    List<String> serviceTypes = const [],
  }) async => registerReply!;

  @override
  Future<Map<String, dynamic>> validateSession(String token) =>
      throw UnimplementedError();
}

class _MemoryGuestStore implements GuestSupportStore {
  GuestSupportThread? saved;

  @override
  Future<GuestSupportThread?> read() async => saved;

  @override
  Future<void> write(GuestSupportThread thread) async => saved = thread;
}

/// Answers guest-support requests like the server does.
class _GuestSupportAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final path = options.path;
    if (path == '/chat/contact') {
      return ResponseBody.fromString(
        '{"success":true,"contactId":"c1","accessToken":"key-1"}',
        201,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    if (path == '/chat/contact/c1/messages' && options.method == 'GET') {
      final ok = options.headers['X-Contact-Token'] == 'key-1';
      return ResponseBody.fromString(
        ok
            ? '{"resolved":false,"messages":[{"sender":"guest","text":"Hi"},{"sender":"admin","text":"Hello!"}]}'
            : '{"error":"Conversation not found","code":"CONTACT_NOT_FOUND"}',
        ok ? 200 : 404,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    return ResponseBody.fromString(
      '{}',
      201,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  AuthBloc blocWith(_Gateway gateway) => AuthBloc(
    authService: gateway,
    sessionStorage: SessionStorage(vault: _MemoryVault()),
    checkOnStart: false,
  );

  test(
    'a driver sign-up waiting for approval is not shown as an error',
    () async {
      final gateway = _Gateway()
        ..registerReply = {'pending': true, 'message': 'under review'};
      final bloc = blocWith(gateway);
      final states = <AuthState>[];
      final sub = bloc.stream.listen(states.add);

      bloc.add(
        RegisterEvent(
          fullName: 'Driver',
          email: 'd@example.test',
          phone: '0599000000',
          password: 'Strong-Pass-123',
          role: 'provider',
          area: 'Al-Bireh',
          governorate: 'رام الله والبيرة',
          serviceTypes: const ['product'],
        ),
      );
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);

      expect(states.last, isA<AuthPendingApproval>());
      expect((states.last as AuthPendingApproval).message, 'under review');
      expect(states.whereType<AuthError>(), isEmpty);
      await sub.cancel();
      await bloc.close();
    },
  );

  test('signing in before approval says "under review"', () async {
    final gateway = _Gateway()
      ..loginReply = {
        'pending': true,
        'code': 'ACCOUNT_PENDING_APPROVAL',
        'message': 'wait',
      };
    final bloc = blocWith(gateway);

    bloc.add(
      LoginEvent(email: 'd@example.test', password: 'x', role: 'provider'),
    );
    await expectLater(bloc.stream, emitsThrough(isA<AuthPendingApproval>()));
    await bloc.close();
  });

  test(
    'wrong credentials keep the server error code for a translated message',
    () async {
      final gateway = _Gateway()
        ..loginError = const AuthRequestException(
          'Invalid credentials',
          code: 'INVALID_CREDENTIALS',
        );
      final bloc = blocWith(gateway);

      bloc.add(
        LoginEvent(email: 'c@example.test', password: 'x', role: 'customer'),
      );
      final error =
          await bloc.stream.firstWhere((s) => s is AuthError) as AuthError;
      expect(error.code, 'INVALID_CREDENTIALS');
      await bloc.close();
    },
  );

  test('offers start at 9 shekels, and every quick price is allowed', () {
    expect(OfferService.minOfferPrice, 9);
    expect(OfferService.quickPrices.first, OfferService.minOfferPrice);
    expect(
      OfferService.quickPrices.every((p) => p >= OfferService.minOfferPrice),
      isTrue,
    );
  });

  test(
    'a guest keeps their support conversation and reads our replies',
    () async {
      final adapter = _GuestSupportAdapter();
      final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1/api'))
        ..httpClientAdapter = adapter;
      final store = _MemoryGuestStore();
      final service = GuestSupportService(store: store, dio: dio);

      final thread = await service.start(
        name: 'Guest',
        email: 'g@example.test',
        phone: '0599',
        text: 'Hi',
      );
      expect(thread?.id, 'c1');
      expect((await service.savedThread())?.token, 'key-1');

      final messages = await service.messages(thread!);
      expect(messages.map((m) => m['sender']), ['guest', 'admin']);
      expect(messages.last['text'], 'Hello!');

      await expectLater(
        service.messages(const GuestSupportThread(id: 'c1', token: 'wrong')),
        throwsA(
          isA<GuestSupportException>().having(
            (e) => e.code,
            'code',
            'CONTACT_NOT_FOUND',
          ),
        ),
      );
    },
  );

  test('customer rating label shows the average and count only when rated', () {
    expect(ratingSummaryLabel(null), '');
    expect(ratingSummaryLabel({'average': 0, 'count': 0}), '');
    expect(ratingSummaryLabel({'average': 4.25, 'count': 12}), '★ 4.3 (12)');
  });
}
