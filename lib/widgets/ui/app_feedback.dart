import 'package:flutter/material.dart';
import '../../services/theme_service.dart';
import 'app_tone.dart';

abstract final class AppFeedback {
  static void success(BuildContext context, String message) {
    _show(context, message, AppTone.success, Icons.check_circle_outline);
  }

  static void error(BuildContext context, String message) {
    _show(context, message, AppTone.danger, Icons.error_outline);
  }

  static void warning(BuildContext context, String message) {
    _show(context, message, AppTone.warning, Icons.warning_amber_outlined);
  }

  static void info(BuildContext context, String message) {
    _show(context, message, AppTone.info, Icons.info_outline);
  }

  static void _show(
    BuildContext context,
    String message,
    AppTone tone,
    IconData icon,
  ) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) {
      return;
    }

    final toneStyle = appToneStyle(context, tone);
    final textStyle = Theme.of(
      context,
    ).textTheme.bodyMedium?.copyWith(color: toneStyle.foreground);

    messenger.showSnackBar(
      SnackBar(
        backgroundColor: toneStyle.background,
        content: Row(
          children: [
            Icon(icon, color: toneStyle.foreground, size: AppSizes.iconMd),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: Text(message, style: textStyle)),
          ],
        ),
      ),
    );
  }
}
