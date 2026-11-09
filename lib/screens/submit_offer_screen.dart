import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'dart:async';
import '../bloc/offer/offer_bloc.dart';
import '../bloc/offer/offer_event.dart';
import '../bloc/offer/offer_state.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../services/theme_service.dart';
import '../bloc/app/app_bloc.dart';
import '../widgets/ui/app_button_loading_indicator.dart';
import '../widgets/ui/app_feedback.dart';
import '../widgets/ui/app_tone.dart';

class SubmitOfferScreen extends StatefulWidget {
  final String token, orderId;
  const SubmitOfferScreen({
    super.key,
    required this.token,
    required this.orderId,
  });
  @override
  State<SubmitOfferScreen> createState() => _SubmitOfferScreenState();
}

class _SubmitOfferScreenState extends State<SubmitOfferScreen> {
  final _priceController = TextEditingController();
  final _timeController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  int _estimatedTime = 0;
  int _quickPrice = 0;
  int _cooldownSeconds = 0;
  Timer? _cooldownTimer;

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _priceController.dispose();
    _timeController.dispose();
    super.dispose();
  }

  void _startCooldown(int seconds) {
    _cooldownTimer?.cancel();
    setState(() => _cooldownSeconds = seconds);

    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }

      setState(() {
        _cooldownSeconds -= 1;

        if (_cooldownSeconds <= 0) {
          _cooldownSeconds = 0;
          timer.cancel();
        }
      });
    });
  }

  void _setTime(int minutes) {
    setState(() {
      _estimatedTime = minutes;
      _timeController.text = '$minutes';
    });
  }

  void _setPrice(int price) {
    setState(() {
      _quickPrice = price;
      _priceController.text = '$price';
    });
  }

  @override
  Widget build(BuildContext context) {
    final isAr = context.watch<AppBloc>().state.locale.languageCode == 'ar';
    final scheme = Theme.of(context).colorScheme;
    final dangerTone = appToneStyle(context, AppTone.danger);
    final accentTone = appToneStyle(context, AppTone.accent);
    const times = [5, 10, 15, 20];
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(AppLocalization.get(context, 'submit_offer')),
          centerTitle: true,
        ),
        body: SafeArea(
          top: false,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: SingleChildScrollView(
                padding: EdgeInsets.symmetric(
                  horizontal: Responsive.paddingHorizontal(context),
                  vertical: Responsive.paddingVertical(context),
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_cooldownSeconds > 0) ...[
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            color: dangerTone.background,
                            borderRadius: BorderRadiusDirectional.circular(
                              AppRadius.md,
                            ),
                            border: Border.all(color: dangerTone.border),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.timer_off_outlined,
                                color: dangerTone.foreground,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      AppLocalization.get(
                                        context,
                                        'offer_cooldown_active',
                                      ),
                                      style: TextStyle(
                                        color: dangerTone.foreground,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      AppLocalization.get(
                                        context,
                                        'cooldown_remaining',
                                      ).replaceAll('%d', '$_cooldownSeconds'),
                                      style: TextStyle(
                                        color: dangerTone.foreground,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      // ChoiceChip provides native selected semantics and a
                      // checkmark, so selection is not color-only.
                      Wrap(
                        spacing: AppSpacing.sm,
                        runSpacing: AppSpacing.sm,
                        children: [5, 10, 15, 20]
                            .map(
                              (p) => ChoiceChip(
                                label: Text('$p ILS'),
                                selected: _quickPrice == p,
                                onSelected: (_) => _setPrice(p),
                              ),
                            )
                            .toList(),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _priceController,
                        keyboardType: TextInputType.number,
                        textDirection: TextDirection.ltr,
                        decoration: InputDecoration(
                          labelText: AppLocalization.get(
                            context,
                            'delivery_price',
                          ),
                          prefixIcon: const Icon(
                            Icons.monetization_on_outlined,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        validator: (v) {
                          if (v == null || v.isEmpty) {
                            return AppLocalization.get(
                              context,
                              'price_required',
                            );
                          }
                          final p = double.tryParse(v);
                          if (p == null || p <= 0) {
                            return AppLocalization.get(
                              context,
                              'invalid_price',
                            );
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 20),
                      Text(
                        AppLocalization.get(context, 'delivery_time'),
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: scheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: AppSpacing.sm,
                        runSpacing: AppSpacing.sm,
                        children: times
                            .map(
                              (t) => ChoiceChip(
                                label: Text(
                                  '$t ${AppLocalization.get(context, 'minutes_suffix')}',
                                ),
                                selected: _estimatedTime == t,
                                onSelected: (_) => _setTime(t),
                              ),
                            )
                            .toList(),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _timeController,
                        keyboardType: TextInputType.number,
                        textDirection: TextDirection.ltr,
                        decoration: InputDecoration(
                          labelText: AppLocalization.get(
                            context,
                            'custom_time',
                          ),
                          prefixIcon: const Icon(Icons.timer_outlined),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onChanged: (v) {
                          final t = int.tryParse(v);
                          if (t != null) setState(() => _estimatedTime = t);
                        },
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) {
                            return AppLocalization.get(
                              context,
                              'time_required',
                            );
                          }

                          final t = int.tryParse(v.trim());

                          if (t == null || t <= 0) {
                            return AppLocalization.get(context, 'invalid_time');
                          }

                          return null;
                        },
                      ),
                      const SizedBox(height: 24),
                      BlocConsumer<OfferBloc, OfferState>(
                        listener: (context, state) {
                          if (state is OfferCooldown) {
                            _startCooldown(state.seconds);
                          }
                          if (state is OfferProviderBusy) {
                            AppFeedback.error(
                              context,
                              AppLocalization.get(
                                context,
                                'provider_busy_offer',
                              ),
                            );
                          }
                          if (state is OfferAlreadySubmitted) {
                            AppFeedback.warning(
                              context,
                              AppLocalization.get(
                                context,
                                'offer_already_submitted',
                              ),
                            );
                            Navigator.pop(context, true);
                          }
                          if (state is OfferSuccess) {
                            AppFeedback.success(
                              context,
                              AppLocalization.get(context, 'offer_sent'),
                            );
                            Navigator.pop(context, true);
                          }
                          if (state is OfferError) {
                            AppFeedback.error(context, state.message);
                          }
                        },
                        builder: (context, state) {
                          final loading = state is OfferLoading;
                          return SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: loading || _cooldownSeconds > 0
                                  ? null
                                  : _submit,
                              style: ElevatedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 16,
                                ),
                                backgroundColor: accentTone.solid,
                                foregroundColor: accentTone.onSolid,
                                shape: RoundedRectangleBorder(
                                  borderRadius:
                                      BorderRadiusDirectional.circular(
                                        AppRadius.md,
                                      ),
                                ),
                              ),
                              child: loading
                                  ? const AppButtonLoadingIndicator()
                                  : Text(
                                      AppLocalization.get(
                                        context,
                                        'send_offer',
                                      ),
                                      style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final estimatedTime = int.parse(_timeController.text.trim());
    context.read<OfferBloc>().add(
      SubmitOfferEvent(
        token: widget.token,
        orderId: widget.orderId,
        price: double.parse(_priceController.text.trim()),
        estimatedTime: estimatedTime,
      ),
    );
  }
}
