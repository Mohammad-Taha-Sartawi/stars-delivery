import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'dart:async';
import '../bloc/offer/offer_bloc.dart';
import '../bloc/offer/offer_event.dart';
import '../bloc/offer/offer_state.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../bloc/app/app_bloc.dart';

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
    final times = [5, 10, 15, 20];
    // Arabic: right-to-left button order (5 left, 20 right), English: left-to-right
    final orderedTimes = isAr ? times.reversed.toList() : times;
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          title: Text(
            AppLocalization.get(context, 'submit_offer'),
            style: const TextStyle(color: Colors.black87, fontWeight: FontWeight.bold),
          ),
          centerTitle: true,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.black87),
            onPressed: () => Navigator.pop(context),
          ),
        ),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: Padding(
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
                          color: Colors.red[50],
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.red[200]!),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.timer_off_outlined,
                              color: Colors.red,
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
                                    style: const TextStyle(
                                      color: Colors.red,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    AppLocalization.get(
                                      context,
                                      'cooldown_remaining',
                                    ).replaceAll('%d', '$_cooldownSeconds'),
                                    style: const TextStyle(
                                      color: Colors.red,
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
                    // Quick price buttons
                    Row(
                      children: [5, 10, 15, 20].map((p) => Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 3),
                          child: OutlinedButton(
                            onPressed: () => _setPrice(p),
                            style: OutlinedButton.styleFrom(
                              backgroundColor: _quickPrice == p ? Colors.green : null,
                              foregroundColor: _quickPrice == p ? Colors.white : Colors.green,
                              side: const BorderSide(color: Colors.green),
                              padding: const EdgeInsets.symmetric(vertical: 10),
                            ),
                            child: Text('$p ILS', style: const TextStyle(fontSize: 13)),
                          ),
                        ),
                      )).toList(),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _priceController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: AppLocalization.get(context, 'delivery_price'),
                        prefixIcon: const Icon(Icons.monetization_on_outlined),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) return AppLocalization.get(context, 'price_required');
                        final p = double.tryParse(v);
                        if (p == null || p <= 0) return AppLocalization.get(context, 'invalid_price');
                        return null;
                      },
                    ),
                    const SizedBox(height: 20),
                    Text(
                      AppLocalization.get(context, 'delivery_time'),
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.grey[800]),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: orderedTimes.map((t) => Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 3),
                          child: OutlinedButton(
                            onPressed: () => _setTime(t),
                            style: OutlinedButton.styleFrom(
                              backgroundColor: _estimatedTime == t ? Colors.orange : null,
                              foregroundColor: _estimatedTime == t ? Colors.white : Colors.orange,
                              side: const BorderSide(color: Colors.orange),
                              padding: const EdgeInsets.symmetric(vertical: 10),
                            ),
                            child: Text('${t}د', style: const TextStyle(fontSize: 13)),
                          ),
                        ),
                      )).toList(),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _timeController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: AppLocalization.get(context, 'custom_time'),
                        prefixIcon: const Icon(Icons.timer_outlined),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onChanged: (v) {
                        final t = int.tryParse(v);
                        if (t != null) setState(() => _estimatedTime = t);
                      },
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return AppLocalization.get(context, 'time_required');
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
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                AppLocalization.get(
                                  context,
                                  'provider_busy_offer',
                                ),
                              ),
                              backgroundColor: Colors.red,
                            ),
                          );
                        }
                        if (state is OfferAlreadySubmitted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                AppLocalization.get(
                                  context,
                                  'offer_already_submitted',
                                ),
                              ),
                              backgroundColor: Colors.orange,
                            ),
                          );
                          Navigator.pop(context, true);
                        }
                        if (state is OfferSuccess) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(AppLocalization.get(context, 'offer_sent')), backgroundColor: Colors.green),
                          );
                          Navigator.pop(context, true);
                        }
                        if (state is OfferError) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(state.message), backgroundColor: Colors.red),
                          );
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
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              backgroundColor: Colors.orange,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: loading
                                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : Text(AppLocalization.get(context, 'send_offer'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
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
