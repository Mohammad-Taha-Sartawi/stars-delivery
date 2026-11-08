import 'package:flutter_bloc/flutter_bloc.dart';
import 'auth_event.dart';
import 'auth_state.dart';
import '../../services/auth_service.dart';
import '../../services/jwt_token.dart';
import '../../services/session_storage.dart';
import '../../services/socket_service.dart';
import '../../models/user_model.dart';

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final AuthGateway _authService;
  final SessionStorage _sessionStorage;

  AuthBloc({
    AuthGateway? authService,
    SessionStorage? sessionStorage,
    bool checkOnStart = true,
  }) : _authService = authService ?? AuthService(),
       _sessionStorage = sessionStorage ?? SessionStorage(),
       super(AuthInitial()) {
    on<CheckAuthEvent>(_onCheckAuth);
    on<LoginEvent>(_onLogin);
    on<RegisterEvent>(_onRegister);
    on<ToggleAuthModeEvent>(_onToggle);
    on<LogoutEvent>(_onLogout);

    if (checkOnStart) {
      add(CheckAuthEvent());
    }
  }

  Future<void> _onCheckAuth(
    CheckAuthEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());

    try {
      final savedToken = await _sessionStorage.readToken();

      if (savedToken == null) {
        emit(AuthInitial());
        return;
      }

      if (!JwtToken.isRestorable(savedToken)) {
        await _sessionStorage.clear();
        emit(AuthInitial());
        return;
      }

      final data = await _authService.validateSession(savedToken);

      final rawUser = data['user'];
      if (rawUser is! Map) {
        await _sessionStorage.clear();
        emit(AuthInitial());
        return;
      }

      final user = UserModel.fromJson(Map<String, dynamic>.from(rawUser));

      await _sessionStorage.writeToken(savedToken);

      emit(AuthSuccess(user: user, token: savedToken));
    } on SessionRejectedException {
      await _sessionStorage.clear();
      emit(AuthInitial());
    } catch (e) {
      // Network/server availability is not proof that the token is invalid.
      // Keep the secure token so the next startup can revalidate it.
      emit(AuthError(message: e.toString().replaceFirst('Exception: ', '')));
    }
  }

  Future<void> _onLogin(LoginEvent event, Emitter<AuthState> emit) async {
    emit(AuthLoading());

    try {
      final data = await _authService.login(
        event.email,
        event.password,
        event.role,
      );

      final user = UserModel.fromJson(Map<String, dynamic>.from(data['user']));

      final token = data['token'].toString();

      if (!JwtToken.isRestorable(token)) {
        throw Exception('Server returned an invalid session token.');
      }

      await _sessionStorage.writeToken(token);

      emit(AuthSuccess(user: user, token: token));
    } catch (e) {
      emit(AuthError(message: e.toString().replaceFirst('Exception: ', '')));
    }
  }

  Future<void> _onRegister(RegisterEvent event, Emitter<AuthState> emit) async {
    emit(AuthLoading());

    try {
      final data = await _authService.register(
        event.fullName,
        event.email,
        event.phone,
        event.password,
        event.role,
        event.area,
        privacyPolicy: event.privacyPolicy,
        serviceTypes: event.serviceTypes,
        driverLicenseDocument: event.driverLicenseDocument,
      );

      if (data['pending'] == true) {
        emit(AuthInitial());
        emit(
          AuthError(
            message:
                data['message'] ?? 'تم تقديم الطلب بنجاح، حسابك قيد المراجعة',
          ),
        );
        return;
      }

      final user = UserModel.fromJson(Map<String, dynamic>.from(data['user']));

      final token = data['token'].toString();

      if (!JwtToken.isRestorable(token)) {
        throw Exception('Server returned an invalid session token.');
      }

      await _sessionStorage.writeToken(token);

      emit(AuthSuccess(user: user, token: token));
    } catch (e) {
      emit(AuthError(message: e.toString().replaceFirst('Exception: ', '')));
    }
  }

  void _onToggle(ToggleAuthModeEvent event, Emitter<AuthState> emit) {
    emit(AuthInitial());
  }

  Future<void> _onLogout(LogoutEvent event, Emitter<AuthState> emit) async {
    SocketService.instance.disconnect();
    await _sessionStorage.clear();
    emit(AuthInitial());
  }
}
