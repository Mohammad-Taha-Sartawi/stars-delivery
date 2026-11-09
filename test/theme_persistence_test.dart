import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:stars_delivery/bloc/app/app_bloc.dart';
import 'package:stars_delivery/bloc/app/app_event.dart';
import 'package:stars_delivery/services/theme_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('theme preference round-trips through local storage', () async {
    SharedPreferences.setMockInitialValues({});

    expect(await ThemePreferences.load(), ThemeMode.light);

    await ThemePreferences.save(ThemeMode.dark);
    expect(await ThemePreferences.load(), ThemeMode.dark);

    final prefs = await SharedPreferences.getInstance();
    expect(
      prefs.getString(ThemePreferences.storageKey),
      ThemePreferences.darkValue,
    );
  });

  test('unknown stored theme falls back to light', () async {
    SharedPreferences.setMockInitialValues({
      ThemePreferences.storageKey: 'not-a-theme',
    });

    expect(await ThemePreferences.load(), ThemeMode.light);
  });

  test('AppBloc saves every theme choice for the next launch', () async {
    SharedPreferences.setMockInitialValues({
      ThemePreferences.storageKey: ThemePreferences.darkValue,
    });

    final initialTheme = await ThemePreferences.load();
    final bloc = AppBloc(initialTheme: initialTheme);
    expect(bloc.state.themeMode, ThemeMode.dark);

    bloc.add(ToggleTheme());
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(bloc.state.themeMode, ThemeMode.light);

    final prefs = await SharedPreferences.getInstance();
    expect(
      prefs.getString(ThemePreferences.storageKey),
      ThemePreferences.lightValue,
    );

    await bloc.close();
  });
}
