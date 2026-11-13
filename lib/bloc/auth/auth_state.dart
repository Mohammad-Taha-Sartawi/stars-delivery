import 'package:equatable/equatable.dart';
import '../../models/user_model.dart';

abstract class AuthState extends Equatable {
  @override
  List<Object?> get props => [];
}

class AuthInitial extends AuthState {}

class AuthLoading extends AuthState {}

class AuthSuccess extends AuthState {
  final UserModel user;
  final String token;

  AuthSuccess({required this.user, required this.token});

  @override
  List<Object?> get props => [user, token];
}

class AuthError extends AuthState {
  final String message;

  /// Server error code, e.g. `INVALID_CREDENTIALS`, when one was sent.
  final String? code;

  AuthError({required this.message, this.code});

  @override
  List<Object?> get props => [message, code];
}

/// A driver account that exists but still waits for admin approval: after a
/// driver signs up, or when they try to sign in before approval.
class AuthPendingApproval extends AuthState {
  final String message;

  AuthPendingApproval({required this.message});

  @override
  List<Object?> get props => [message];
}