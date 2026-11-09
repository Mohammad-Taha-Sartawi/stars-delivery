import 'package:flutter/material.dart';
import '../../services/localization_service.dart';

/// A localized, direction-aware confirmation dialog used for destructive and
/// irreversible UI actions.
///
/// Returns `true` only when the user explicitly confirms. Direction follows the
/// app locale (no forced `TextDirection.rtl` on ordinary UI).
Future<bool> showAppConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String? confirmLabel,
  String? cancelLabel,
  bool destructive = false,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) {
      final scheme = Theme.of(dialogContext).colorScheme;

      return AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(
              cancelLabel ?? AppLocalization.get(dialogContext, 'cancel'),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: destructive
                ? ElevatedButton.styleFrom(
                    backgroundColor: scheme.error,
                    foregroundColor: scheme.onError,
                  )
                : null,
            child: Text(
              confirmLabel ?? AppLocalization.get(dialogContext, 'confirm'),
            ),
          ),
        ],
      );
    },
  );

  return confirmed == true;
}

/// Confirmation gate for the existing logout action.
///
/// This is presentation-only: on confirmation the caller still runs its
/// existing logout routine exactly once.
Future<bool> showLogoutConfirmation(BuildContext context) {
  return showAppConfirmDialog(
    context,
    title: AppLocalization.get(context, 'logout_confirm_title'),
    message: AppLocalization.get(context, 'logout_confirm_message'),
    confirmLabel: AppLocalization.get(context, 'logout'),
    destructive: true,
  );
}
