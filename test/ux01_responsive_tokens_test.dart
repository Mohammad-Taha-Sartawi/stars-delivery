// UX-01 remediation test: responsive token roles and ordering.
//
// UX01-006: the audit flagged six numeric concepts (560, 600, 840, 1024, 1040,
// 1200) as potentially contradictory. Source inspection established each
// value's distinct role:
//
//   560  AppSizes.authMaxWidth        → authentication form width (login)
//   600  Responsive.isMobile/Tablet  → responsive column breakpoint 1
//   840  AppSizes.wideBreakpoint     → AppActionTile component wide-layout switch
//   1024 Responsive.isDesktop        → responsive column breakpoint 2
//   1040 AppSizes.contentMaxWidth     → readable-content width (home/provider
//        dashboards via Responsive.maxReadableContentWidth)
//   1200 Responsive.maxContentWidth   → legacy value retained with the unused
//        `withMaxWidth` extension; documented as deferred technical debt
//        (UX01-008), not removed.
//
// This test keeps those facts true: the roles stay mapped as documented and
// the landscape ordering 560 < 600 < 840 < 1024 < 1040 < 1200 holds so future
// tokens cannot silently collapse two roles into the same number.
import 'package:flutter_test/flutter_test.dart';
import 'package:swifora/services/responsive.dart';
import 'package:swifora/services/theme_service.dart';

void main() {
  test('UX01-006 token roles keep their documented ordering', () {
    final values = <double>[
      AppSizes.authMaxWidth,
      600.0, // Responsive.isMobile upper bound (Responsive.isTablet lower bound).
      AppSizes.wideBreakpoint,
      1024.0, // Responsive.isDesktop lower bound.
      AppSizes.contentMaxWidth,
      Responsive.maxContentWidth,
    ];
    for (var i = 1; i < values.length; i++) {
      expect(
        values[i],
        greaterThan(values[i - 1]),
        reason:
            'tokens must stay distinct in the documented order '
            '560 < 600 < 840 < 1024 < 1040 < 1200 at index $i',
      );
    }
  });

  test('UX01-006 role aliases point at the documented tokens', () {
    expect(Responsive.maxAuthWidth, AppSizes.authMaxWidth);
    expect(Responsive.maxReadableContentWidth, AppSizes.contentMaxWidth);
  });
}
