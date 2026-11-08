import 'package:flutter/material.dart';
import '../../services/theme_service.dart';

enum AppTone { primary, accent, success, warning, info, danger, neutral }

@immutable
class AppToneStyle {
  const AppToneStyle({
    required this.foreground,
    required this.background,
    required this.border,
    required this.solid,
    required this.onSolid,
  });

  final Color foreground;
  final Color background;
  final Color border;
  final Color solid;
  final Color onSolid;
}

AppToneStyle appToneStyle(BuildContext context, AppTone tone) {
  final scheme = Theme.of(context).colorScheme;
  final semantics = AppSemanticColors.of(context);

  return switch (tone) {
    AppTone.primary => AppToneStyle(
      foreground: scheme.onPrimaryContainer,
      background: scheme.primaryContainer,
      border: scheme.primary.withValues(alpha: 0.32),
      solid: scheme.primary,
      onSolid: scheme.onPrimary,
    ),
    AppTone.accent => AppToneStyle(
      foreground: scheme.onSecondaryContainer,
      background: scheme.secondaryContainer,
      border: scheme.secondary.withValues(alpha: 0.32),
      solid: scheme.secondary,
      onSolid: scheme.onSecondary,
    ),
    AppTone.success => AppToneStyle(
      foreground: semantics.onSuccessContainer,
      background: semantics.successContainer,
      border: semantics.success.withValues(alpha: 0.32),
      solid: semantics.success,
      onSolid: semantics.onSuccess,
    ),
    AppTone.warning => AppToneStyle(
      foreground: semantics.onWarningContainer,
      background: semantics.warningContainer,
      border: semantics.warning.withValues(alpha: 0.32),
      solid: semantics.warning,
      onSolid: semantics.onWarning,
    ),
    AppTone.info => AppToneStyle(
      foreground: semantics.onInfoContainer,
      background: semantics.infoContainer,
      border: semantics.info.withValues(alpha: 0.32),
      solid: semantics.info,
      onSolid: semantics.onInfo,
    ),
    AppTone.danger => AppToneStyle(
      foreground: scheme.onErrorContainer,
      background: scheme.errorContainer,
      border: scheme.error.withValues(alpha: 0.32),
      solid: scheme.error,
      onSolid: scheme.onError,
    ),
    AppTone.neutral => AppToneStyle(
      foreground: semantics.onNeutralContainer,
      background: semantics.neutralContainer,
      border: semantics.neutral.withValues(alpha: 0.28),
      solid: semantics.neutral,
      onSolid: semantics.onNeutral,
    ),
  };
}
