import 'package:equatable/equatable.dart';

import '../../services/auth_service.dart';

abstract class AuthEvent extends Equatable {
  const AuthEvent();

  @override
  List<Object?> get props => [];
}

class CheckAuthEvent extends AuthEvent {}

class LoginEvent extends AuthEvent {
  final String email;
  final String password;
  final String role;

  const LoginEvent({
    required this.email,
    required this.password,
    required this.role,
  });

  @override
  List<Object?> get props => [email, password, role];
}

class RegisterEvent extends AuthEvent {
  final String fullName;
  final String email;
  final String phone;
  final String password;
  final String role;
  final String area;
  final String governorate;
  final bool privacyPolicy;
  final List<String> serviceTypes;
  final ProviderRegistrationDocument? driverLicenseDocument;

  const RegisterEvent({
    required this.fullName,
    required this.email,
    required this.phone,
    required this.password,
    required this.role,
    required this.area,
    required this.governorate,
    this.privacyPolicy = true,
    this.serviceTypes = const [],
    this.driverLicenseDocument,
  });

  // Provider document bytes are intentionally omitted
  // from Equatable props to avoid accidental diagnostic
  // serialization or expensive byte-array equality.
  @override
  List<Object?> get props => [
    fullName,
    email,
    phone,
    password,
    role,
    area,
    governorate,
    privacyPolicy,
  ];
}

class ToggleAuthModeEvent extends AuthEvent {
  final bool isLogin;

  const ToggleAuthModeEvent({required this.isLogin});

  @override
  List<Object?> get props => [isLogin];
}

class LogoutEvent extends AuthEvent {}
