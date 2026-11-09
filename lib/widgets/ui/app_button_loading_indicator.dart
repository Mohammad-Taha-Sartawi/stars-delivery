import 'package:flutter/material.dart';
import '../../services/localization_service.dart';

/// A loading indicator for disabled action buttons.
///
/// It deliberately uses the theme's [ColorScheme.onSurface] foreground rather
/// than `onPrimary`: while loading, the button is disabled and therefore uses
/// the disabled background, so `onPrimary` would disappear in both themes.
class AppButtonLoadingIndicator extends StatelessWidget {
  const AppButtonLoadingIndicator({
    super.key,
    this.size = 20,
    this.strokeWidth = 2,
    this.semanticsLabel,
  });

  final double size;
  final double strokeWidth;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Semantics(
      label: semanticsLabel ?? AppLocalization.get(context, 'loading'),
      liveRegion: true,
      child: ExcludeSemantics(
        child: SizedBox(
          width: size,
          height: size,
          child: CircularProgressIndicator(
            strokeWidth: strokeWidth,
            color: scheme.onSurface,
          ),
        ),
      ),
    );
  }
}
