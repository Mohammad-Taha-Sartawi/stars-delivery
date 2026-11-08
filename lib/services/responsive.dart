import 'package:flutter/material.dart';
import 'theme_service.dart';

class Responsive extends StatelessWidget {
  final Widget mobile;
  final Widget? tablet;
  final Widget? desktop;

  const Responsive({
    super.key,
    required this.mobile,
    this.tablet,
    this.desktop,
  });

  static bool isMobile(BuildContext context) =>
      MediaQuery.of(context).size.width < 600;

  static bool isTablet(BuildContext context) =>
      MediaQuery.of(context).size.width >= 600 &&
      MediaQuery.of(context).size.width < 1024;

  static bool isDesktop(BuildContext context) =>
      MediaQuery.of(context).size.width >= 1024;

  static double width(BuildContext context) =>
      MediaQuery.of(context).size.width;

  static double height(BuildContext context) =>
      MediaQuery.of(context).size.height;

  static double paddingHorizontal(BuildContext context) =>
      isMobile(context) ? 16 : (isTablet(context) ? 32 : 48);

  static double paddingVertical(BuildContext context) =>
      isMobile(context) ? 16 : 24;

  /// Max content width for large screens (centered layout)
  static const double maxContentWidth = 1200;

  /// Auth forms stay narrow; content pages can use the full readable width.
  static const double maxAuthWidth = AppSizes.authMaxWidth;
  static const double maxReadableContentWidth = AppSizes.contentMaxWidth;
  static const double wideBreakpoint = AppSizes.wideBreakpoint;

  static EdgeInsetsDirectional pageInsets(BuildContext context) {
    return EdgeInsetsDirectional.symmetric(
      horizontal: paddingHorizontal(context),
      vertical: paddingVertical(context),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 1024 && desktop != null) {
          return desktop!;
        }
        if (constraints.maxWidth >= 600 && tablet != null) {
          return tablet!;
        }
        return mobile;
      },
    );
  }
}

/// Extension to easily constrain content width on large screens
extension ResponsivePadding on Widget {
  Widget withMaxWidth({double maxWidth = Responsive.maxContentWidth}) {
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: this,
      ),
    );
  }
}
