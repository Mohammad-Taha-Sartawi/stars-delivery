import 'dart:math' as math;

import 'package:flutter/material.dart';
import '../../services/theme_service.dart';

/// A network image thumbnail with a guaranteed minimum touch target, an
/// accessible name and a consistent error presentation.
///
/// Used by notification cards and every order-image gallery (pending, offered,
/// active, detail) instead of the four duplicated GestureDetector/ClipRRect
/// implementations.
class AppImageThumbnail extends StatelessWidget {
  const AppImageThumbnail({
    super.key,
    required this.imageUrl,
    required this.semanticLabel,
    this.onTap,
    this.size = 72,
    this.borderRadius,
  });

  final String imageUrl;
  final String semanticLabel;
  final VoidCallback? onTap;

  /// Visible image size. The interactive hit area is expanded to at least
  /// [AppSizes.minTouchTarget] without enlarging the image itself.
  final double size;
  final double? borderRadius;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final radius = borderRadius ?? AppRadius.sm;
    final targetSize = math.max(size, AppSizes.minTouchTarget);

    final image = ClipRRect(
      borderRadius: BorderRadiusDirectional.circular(radius),
      child: Image.network(
        imageUrl,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Container(
          width: size,
          height: size,
          color: scheme.surfaceContainerHighest,
          child: Icon(
            Icons.image_not_supported_outlined,
            color: scheme.onSurfaceVariant,
          ),
        ),
      ),
    );

    return Semantics(
      button: onTap != null,
      image: true,
      label: semanticLabel,
      excludeSemantics: true,
      child: SizedBox(
        width: targetSize,
        height: targetSize,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(radius),
          child: Center(child: image),
        ),
      ),
    );
  }
}
