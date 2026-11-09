import 'package:flutter/material.dart';
import '../services/localization_service.dart';
import '../services/theme_service.dart';
import '../services/user_service.dart';
import 'ui/app_feedback.dart';
import 'ui/app_tone.dart';

/// Clearly visible account switch for governorate-level work/order mode.
class GovernorateScopeCard extends StatefulWidget {
  final String token;
  final bool initialEnabled;
  final bool isProvider;
  final String governorateName;
  final ValueChanged<bool>? onChanged;
  final UserService? userService;

  const GovernorateScopeCard({
    super.key,
    required this.token,
    required this.initialEnabled,
    required this.isProvider,
    required this.governorateName,
    this.onChanged,
    this.userService,
  });

  @override
  State<GovernorateScopeCard> createState() => _GovernorateScopeCardState();
}

class _GovernorateScopeCardState extends State<GovernorateScopeCard> {
  late bool _enabled = widget.initialEnabled;
  late final UserService _userService = widget.userService ?? UserService();
  bool _saving = false;

  @override
  void didUpdateWidget(covariant GovernorateScopeCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialEnabled != widget.initialEnabled && !_saving) {
      _enabled = widget.initialEnabled;
    }
  }

  Future<void> _setEnabled(bool value) async {
    if (_saving) return;
    final previous = _enabled;

    setState(() {
      _enabled = value;
      _saving = true;
    });

    try {
      final saved = await _userService.setGovernorateLevel(widget.token, value);
      if (!mounted) return;

      setState(() => _enabled = saved);
      widget.onChanged?.call(saved);
      AppFeedback.success(
        context,
        AppLocalization.get(
          context,
          saved ? 'governorate_scope_enabled' : 'governorate_scope_disabled',
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _enabled = previous);
      AppFeedback.error(
        context,
        AppLocalization.get(context, 'governorate_scope_update_failed'),
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tone = appToneStyle(
      context,
      _enabled ? AppTone.warning : AppTone.neutral,
    );
    final governorate = widget.governorateName.trim().isEmpty
        ? AppLocalization.get(context, 'your_governorate')
        : widget.governorateName.trim();
    final titleKey = widget.isProvider
        ? 'governorate_scope_provider_title'
        : 'governorate_scope_customer_title';
    final subtitleKey = widget.isProvider
        ? 'governorate_scope_provider_subtitle'
        : 'governorate_scope_customer_subtitle';

    return Semantics(
      container: true,
      label: AppLocalization.get(context, titleKey),
      child: Container(
        key: const Key('governorateScopeCard'),
        padding: const EdgeInsetsDirectional.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: tone.background,
          borderRadius: BorderRadiusDirectional.circular(AppRadius.lg),
          border: Border.all(color: tone.border, width: _enabled ? 1.5 : 1),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              widget.isProvider ? Icons.public : Icons.map_outlined,
              color: tone.foreground,
              size: AppSizes.iconLg,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    AppLocalization.get(context, titleKey),
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: tone.foreground,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    AppLocalization.get(
                      context,
                      subtitleKey,
                    ).replaceAll('%s', governorate),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                      height: 1.45,
                    ),
                  ),
                  if (_saving) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      AppLocalization.get(context, 'governorate_scope_loading'),
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(color: tone.foreground),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Switch(
              key: const Key('governorateScopeSwitch'),
              value: _enabled,
              onChanged: _saving ? null : _setEnabled,
            ),
          ],
        ),
      ),
    );
  }
}
