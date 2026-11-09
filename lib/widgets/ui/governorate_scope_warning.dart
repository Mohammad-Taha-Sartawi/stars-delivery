import 'dart:async';
import 'package:flutter/material.dart';
import '../../services/localization_service.dart';
import '../../services/theme_service.dart';
import 'app_tone.dart';

/// Shows a clear warning that requires the user to wait five seconds before
/// continuing. Used when a governorate-level order crosses the registered
/// village/city boundary.
Future<bool> showGovernorateScopeWarning(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  String? note,
}) async {
  final result = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _GovernorateScopeWarningDialog(
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      note: note,
    ),
  );
  return result == true;
}

class _GovernorateScopeWarningDialog extends StatefulWidget {
  final String title;
  final String message;
  final String confirmLabel;
  final String? note;

  const _GovernorateScopeWarningDialog({
    required this.title,
    required this.message,
    required this.confirmLabel,
    this.note,
  });

  @override
  State<_GovernorateScopeWarningDialog> createState() =>
      _GovernorateScopeWarningDialogState();
}

class _GovernorateScopeWarningDialogState
    extends State<_GovernorateScopeWarningDialog> {
  static const _waitSeconds = 5;
  int _remaining = _waitSeconds;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _remaining -= 1;
        if (_remaining <= 0) {
          _remaining = 0;
          timer.cancel();
        }
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tone = appToneStyle(context, AppTone.warning);
    final canContinue = _remaining == 0;

    return AlertDialog(
      icon: Icon(Icons.warning_amber_rounded, color: tone.foreground, size: 34),
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.message, style: const TextStyle(height: 1.5)),
          if (widget.note != null && widget.note!.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: tone.background,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: tone.border),
              ),
              child: Text(
                widget.note!,
                style: TextStyle(
                  color: tone.foreground,
                  fontSize: 13,
                  height: 1.5,
                ),
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          Text(
            AppLocalization.get(
              context,
              'governorate_warning_wait',
            ).replaceAll('%d', '$_remaining'),
            style: TextStyle(
              color: tone.foreground,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: Text(AppLocalization.get(context, 'cancel')),
        ),
        FilledButton(
          onPressed: canContinue ? () => Navigator.pop(context, true) : null,
          style: FilledButton.styleFrom(
            backgroundColor: tone.solid,
            foregroundColor: tone.onSolid,
          ),
          child: Text(
            canContinue
                ? widget.confirmLabel
                : '${widget.confirmLabel} ($_remaining)',
          ),
        ),
      ],
    );
  }
}
