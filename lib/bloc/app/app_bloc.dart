import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../services/theme_preferences.dart';
import '../../services/locale_preferences.dart';
import 'app_event.dart';
import 'app_state.dart';

class AppBloc extends Bloc<AppEvent, AppState> {
  AppBloc({
    ThemeMode initialTheme = ThemeMode.light,
    Locale initialLocale = const Locale('ar'),
  }) : super(AppState(themeMode: initialTheme, locale: initialLocale)) {
    on<ToggleTheme>(_onToggleTheme);
    on<SetTheme>(_onSetTheme);
    on<ToggleLocale>(_onToggleLocale);
    on<SetLocale>(_onSetLocale);
  }

  void _onToggleTheme(ToggleTheme event, Emitter<AppState> emit) {
    final nextMode = state.themeMode == ThemeMode.light
        ? ThemeMode.dark
        : ThemeMode.light;
    emit(state.copyWith(themeMode: nextMode));
    _persistTheme(nextMode);
  }

  void _onSetTheme(SetTheme event, Emitter<AppState> emit) {
    emit(state.copyWith(themeMode: event.mode));
    _persistTheme(event.mode);
  }

  void _persistTheme(ThemeMode mode) {
    // Fire-and-forget: a storage failure must not block the theme change.
    unawaited(ThemePreferences.save(mode));
  }

  void _onToggleLocale(ToggleLocale event, Emitter<AppState> emit) {
    final nextLocale = state.locale.languageCode == 'ar'
        ? const Locale('en')
        : const Locale('ar');
    emit(state.copyWith(locale: nextLocale));
    _persistLocale(nextLocale);
  }

  void _onSetLocale(SetLocale event, Emitter<AppState> emit) {
    emit(state.copyWith(locale: event.locale));
    _persistLocale(event.locale);
  }

  void _persistLocale(Locale locale) {
    unawaited(LocalePreferences.save(locale));
  }
}
