import 'package:flutter/material.dart';
import '../../services/theme_service.dart';
import 'app_tone.dart';

class AppActionTile extends StatelessWidget {
  const AppActionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.trailingLabel,
    this.badgeCount = 0,
    this.tone = AppTone.primary,
    this.semanticLabel,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final String? trailingLabel;
  final int badgeCount;
  final AppTone tone;
  final VoidCallback? onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final toneStyle = appToneStyle(context, tone);
    final isEnabled = onTap != null;
    final textDirection = Directionality.of(context);
    final chevron = textDirection == TextDirection.rtl
        ? Icons.chevron_left
        : Icons.chevron_right;

    final semanticsLabel =
        semanticLabel ??
        [
          title,
          if (subtitle != null && subtitle!.isNotEmpty) subtitle,
          if (badgeCount > 0) '$badgeCount',
        ].join('. ');

    return Semantics(
      button: isEnabled,
      enabled: isEnabled,
      label: semanticsLabel,
      onTap: onTap,
      excludeSemantics: true,
      child: Opacity(
        opacity: isEnabled ? 1 : 0.55,
        child: Material(
          color: scheme.surfaceContainerLow,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadiusDirectional.circular(AppRadius.lg),
            side: BorderSide(color: scheme.outlineVariant),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppRadius.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                minHeight: AppSizes.minTouchTarget + AppSpacing.lg,
              ),
              child: Padding(
                padding: const EdgeInsetsDirectional.symmetric(
                  horizontal: AppSpacing.lg,
                  vertical: AppSpacing.md,
                ),
                child: Row(
                  children: [
                    Container(
                      width: AppSizes.avatarMd,
                      height: AppSizes.avatarMd,
                      decoration: BoxDecoration(
                        color: toneStyle.background,
                        borderRadius: BorderRadiusDirectional.circular(
                          AppRadius.md,
                        ),
                      ),
                      child: Icon(
                        icon,
                        color: toneStyle.foreground,
                        size: AppSizes.iconMd,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            title,
                            style: theme.textTheme.titleMedium,
                            textAlign: TextAlign.start,
                          ),
                          if (subtitle != null && subtitle!.isNotEmpty) ...[
                            const SizedBox(height: AppSpacing.xxs),
                            Text(subtitle!, style: theme.textTheme.bodySmall),
                          ],
                        ],
                      ),
                    ),
                    if (badgeCount > 0) ...[
                      const SizedBox(width: AppSpacing.sm),
                      _CountBadge(count: badgeCount),
                    ],
                    if (trailingLabel != null && trailingLabel!.isNotEmpty) ...[
                      const SizedBox(width: AppSpacing.sm),
                      Container(
                        padding: const EdgeInsetsDirectional.symmetric(
                          horizontal: AppSpacing.sm,
                          vertical: AppSpacing.xs,
                        ),
                        decoration: BoxDecoration(
                          color: toneStyle.background,
                          borderRadius: BorderRadiusDirectional.circular(
                            AppRadius.pill,
                          ),
                        ),
                        child: Text(
                          trailingLabel!,
                          style: theme.textTheme.labelLarge?.copyWith(
                            color: toneStyle.foreground,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(width: AppSpacing.xs),
                    Icon(
                      chevron,
                      size: AppSizes.iconMd,
                      color: scheme.onSurfaceVariant,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final label = count > 99 ? '99+' : '$count';

    return Semantics(
      label: '$count',
      child: Container(
        constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
        padding: const EdgeInsetsDirectional.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xxs,
        ),
        decoration: BoxDecoration(
          color: scheme.errorContainer,
          borderRadius: BorderRadiusDirectional.circular(AppRadius.pill),
          border: Border.all(color: scheme.error.withValues(alpha: 0.28)),
        ),
        alignment: AlignmentDirectional.center,
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: scheme.onErrorContainer,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class AppActionWrap extends StatelessWidget {
  const AppActionWrap({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth >= AppSizes.wideBreakpoint;
        final itemWidth = isWide
            ? (constraints.maxWidth - AppSpacing.md) / 2
            : constraints.maxWidth;

        return Wrap(
          spacing: AppSpacing.md,
          runSpacing: AppSpacing.md,
          children: children
              .map((child) => SizedBox(width: itemWidth, child: child))
              .toList(),
        );
      },
    );
  }
}
