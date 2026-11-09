import 'package:flutter/material.dart';
import '../../services/theme_service.dart';
import 'app_tone.dart';

/// A compact, semantically announced status chip used across order screens.
///
/// Replaces the six ad-hoc status containers (My Orders, Order Detail,
/// Provider Active Orders, Order Report, Report, Rejected Orders) with one
/// tone-driven implementation. The label is the single source of meaning, so
/// status is never communicated by color alone.
class AppStatusChip extends StatelessWidget {
  const AppStatusChip({
    super.key,
    required this.label,
    this.tone = AppTone.neutral,
    this.icon,
  });

  final String label;
  final AppTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final toneStyle = appToneStyle(context, tone);

    return Semantics(
      container: true,
      label: label,
      excludeSemantics: true,
      child: Container(
        constraints: const BoxConstraints(minHeight: 28),
        padding: const EdgeInsetsDirectional.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: toneStyle.background,
          borderRadius: BorderRadiusDirectional.circular(AppRadius.pill),
          border: Border.all(color: toneStyle.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: AppSizes.iconSm, color: toneStyle.foreground),
              const SizedBox(width: AppSpacing.xxs),
            ],
            Flexible(
              child: Text(
                label,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: toneStyle.foreground,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
