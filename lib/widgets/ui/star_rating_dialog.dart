import 'package:flutter/material.dart';

import '../../services/localization_service.dart';
import 'app_tone.dart';

/// Asks for a 1-5 star rating; returns the chosen value, or null if the
/// dialog was dismissed. Tapping a star sends it straight away.
Future<int?> showStarRatingDialog(
  BuildContext context, {
  required String title,
  required String body,
}) {
  return showDialog<int>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(body, textAlign: TextAlign.center),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (index) {
              final value = index + 1;
              return IconButton(
                tooltip: '$value / 5',
                iconSize: 36,
                onPressed: () => Navigator.pop(dialogContext, value),
                icon: Icon(
                  Icons.star_border_rounded,
                  color: appToneStyle(dialogContext, AppTone.warning).solid,
                ),
              );
            }),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: Text(AppLocalization.get(dialogContext, 'cancel')),
        ),
      ],
    ),
  );
}

/// Compact "★ 4.5 (12)" label for a rating summary map `{average, count}`;
/// empty when there is no rating yet.
String ratingSummaryLabel(Object? summary) {
  if (summary is! Map) return '';
  final count = (summary['count'] as num?)?.toInt() ?? 0;
  if (count <= 0) return '';
  final average = (summary['average'] as num?)?.toDouble() ?? 0;
  return '★ ${average.toStringAsFixed(1)} ($count)';
}
