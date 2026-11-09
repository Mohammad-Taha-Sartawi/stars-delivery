import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'bloc/auth/auth_bloc.dart';
import 'bloc/app/app_bloc.dart';
import 'bloc/app/app_state.dart';
import 'bloc/notification/notification_bloc.dart';
import 'services/theme_service.dart';
import 'services/theme_preferences.dart';
import 'package:stars_delivery/services/api_config.dart';
import 'services/location_service.dart';
import 'screens/login_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiConfig.init();
  await LocationService.initialize();
  final initialTheme = await ThemePreferences.load();
  runApp(StarsDeliveryApp(initialTheme: initialTheme));
}

class StarsDeliveryApp extends StatelessWidget {
  final AuthBloc Function()? authBlocFactory;
  final ThemeMode initialTheme;

  const StarsDeliveryApp({
    super.key,
    this.authBlocFactory,
    this.initialTheme = ThemeMode.light,
  });

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<AuthBloc>(
          create: (_) => authBlocFactory?.call() ?? AuthBloc(),
        ),
        BlocProvider(create: (_) => AppBloc(initialTheme: initialTheme)),
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
