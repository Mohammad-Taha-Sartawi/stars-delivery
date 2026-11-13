import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'bloc/auth/auth_bloc.dart';
import 'bloc/app/app_bloc.dart';
import 'bloc/app/app_state.dart';
import 'bloc/notification/notification_bloc.dart';
import 'services/theme_service.dart';
import 'services/theme_preferences.dart';
import 'services/locale_preferences.dart';
import 'package:stars_delivery/services/api_config.dart';
import 'services/location_service.dart';
import 'screens/login_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiConfig.init();
  // Location permission, the GPS fix (up to 10 s) and the nearest-area
  // lookup run in the background instead of delaying the first frame. The
  // detected area is advisory: the server uses the account's saved area.
  unawaited(LocationService.initialize());
  final initialTheme = await ThemePreferences.load();
  final initialLocale = await LocalePreferences.load();
  runApp(
    StarsDeliveryApp(initialTheme: initialTheme, initialLocale: initialLocale),
  );
}

class StarsDeliveryApp extends StatelessWidget {
  final AuthBloc Function()? authBlocFactory;
  final ThemeMode initialTheme;
  final Locale initialLocale;

  const StarsDeliveryApp({
    super.key,
    this.authBlocFactory,
    this.initialTheme = ThemeMode.light,
    this.initialLocale = const Locale('ar'),
  });

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<AuthBloc>(
          create: (_) => authBlocFactory?.call() ?? AuthBloc(),
        ),
        BlocProvider(
          create: (_) =>
              AppBloc(initialTheme: initialTheme, initialLocale: initialLocale),
        ),
        BlocProvider(create: (_) => NotificationBloc()),
      ],
      child: BlocBuilder<AppBloc, AppState>(
        builder: (context, appState) {
          return MaterialApp(
            title: 'Stars Delivery',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light,
            darkTheme: AppTheme.dark,
            themeMode: appState.themeMode,
            locale: appState.locale,
            supportedLocales: const [Locale('ar'), Locale('en')],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: const LoginScreen(),
          );
        },
      ),
    );
  }
}
