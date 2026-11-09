import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/localization_service.dart';
import '../services/responsive.dart';
import '../services/theme_service.dart';
import '../widgets/ui/app_feedback.dart';
import '../widgets/ui/app_tone.dart';

class CommissionPaymentScreen extends StatelessWidget {
  static const String salesWhatsApp = '+970569571995';

  final double dueAmount;

  const CommissionPaymentScreen({super.key, required this.dueAmount});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final warningTone = appToneStyle(context, AppTone.warning);
    final accentTone = appToneStyle(context, AppTone.accent);

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalization.get(context, 'commission_payment_title')),
        centerTitle: true,
      ),
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: SingleChildScrollView(
              padding: EdgeInsets.symmetric(
                horizontal: Responsive.paddingHorizontal(context),
                vertical: Responsive.paddingVertical(context),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.xl),
                    decoration: BoxDecoration(
                      color: warningTone.background,
                      borderRadius: BorderRadiusDirectional.circular(
                        AppRadius.lg,
                      ),
                      border: Border.all(color: warningTone.border),
                    ),
                    child: Column(
                      children: [
                        Icon(
                          Icons.account_balance_wallet_outlined,
                          color: warningTone.foreground,
                          size: AppSizes.iconLg,
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          AppLocalization.get(context, 'commission_due_amount'),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: warningTone.foreground,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          '${dueAmount.toStringAsFixed(0)} '
                          '${AppLocalization.get(context, 'shekel')}',
                          style: theme.textTheme.headlineMedium?.copyWith(
                            color: warningTone.foreground,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerLow,
                      borderRadius: BorderRadiusDirectional.circular(
                        AppRadius.lg,
                      ),
                      border: Border.all(color: scheme.outlineVariant),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.support_agent_outlined,
                              color: accentTone.foreground,
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Text(
                              AppLocalization.get(context, 'payment_method'),
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          AppLocalization.get(
                            context,
                            'payment_contact_sales_whatsapp',
                          ),
                          style: theme.textTheme.bodyMedium?.copyWith(
                            height: 1.5,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        Text(
                          AppLocalization.get(
                            context,
                            'payment_whatsapp_label',
                          ),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        SelectableText(
                          salesWhatsApp,
                          textDirection: TextDirection.ltr,
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: () async {
                              await Clipboard.setData(
                                const ClipboardData(text: salesWhatsApp),
                              );
                              if (!context.mounted) return;
                              AppFeedback.success(
                                context,
                                AppLocalization.get(
                                  context,
                                  'whatsapp_number_copied',
                                ),
                              );
                            },
                            icon: const Icon(Icons.copy_outlined, size: 20),
                            label: Text(
                              AppLocalization.get(
                                context,
                                'copy_whatsapp_number',
                              ),
                            ),
                            style: FilledButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                vertical: AppSpacing.md,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          AppLocalization.get(
                            context,
                            'payment_follow_up_note',
                          ),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                            height: 1.45,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
