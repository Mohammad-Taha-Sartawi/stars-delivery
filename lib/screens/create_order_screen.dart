import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/order/order_bloc.dart';
import '../bloc/order/order_event.dart';
import '../bloc/order/order_state.dart';
import '../models/user_model.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../services/api_config.dart';
import '../services/theme_service.dart';
import '../widgets/ui/app_button_loading_indicator.dart';
import '../widgets/ui/app_feedback.dart';
import '../widgets/ui/app_tone.dart';
import '../widgets/ui/governorate_scope_warning.dart';

class CreateOrderScreen extends StatefulWidget {
  final UserModel user;
  final String token;
  final bool governorateLevel;

  const CreateOrderScreen({
    super.key,
    required this.user,
    required this.token,
    this.governorateLevel = false,
  });

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  String? _selectedType;
  final _descController = TextEditingController();
  final _phoneController = TextEditingController();
  final _locationController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  String get _governorateName {
    final governorate = widget.user.governorate.trim();
    if (governorate.isNotEmpty) return governorate;
    return widget.user.area.trim();
  }

  @override
  void dispose() {
    _descController.dispose();
    _phoneController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tone = appToneStyle(context, AppTone.accent);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalization.get(context, 'new_order')),
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
              child: Column(
                children: [
                  if (widget.governorateLevel) ...[
                    _buildGovernorateBanner(context),
                    const SizedBox(height: 16),
                  ],
                  _OptionCard(
                    icon: Icons.shopping_bag_outlined,
                    label: AppLocalization.get(context, 'product'),
                    isSelected: _selectedType == 'product',
                    onTap: () => setState(() => _selectedType = 'product'),
                  ),
                  const SizedBox(height: 12),
                  _OptionCard(
                    icon: Icons.people_outline,
                    label: AppLocalization.get(context, 'people'),
                    isSelected: _selectedType == 'people',
                    onTap: () => setState(() => _selectedType = 'people'),
                  ),
                  const SizedBox(height: 12),
                  _OptionCard(
                    icon: Icons.inventory_2_outlined,
                    label: AppLocalization.get(context, 'goods'),
                    isSelected: _selectedType == 'goods',
                    onTap: () => setState(() => _selectedType = 'goods'),
                  ),
                  if (_selectedType != null) ...[
                    const SizedBox(height: 24),
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: scheme.surfaceContainerLow,
                        borderRadius: BorderRadiusDirectional.circular(
                          AppRadius.lg,
                        ),
                        border: Border.all(color: scheme.outlineVariant),
                      ),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            TextFormField(
                              controller: _descController,
                              maxLines: 4,
                              decoration: InputDecoration(
                                alignLabelWithHint: true,
                                hint: Text(
                                  AppLocalization.get(context, 'desc_hint'),
                                ),
                                labelText: _selectedType == 'product'
                                    ? AppLocalization.get(
                                        context,
                                        'product_label',
                                      )
                                    : _selectedType == 'people'
                                    ? AppLocalization.get(
                                        context,
                                        'people_label',
                                      )
                                    : AppLocalization.get(
                                        context,
                                        'goods_label',
                                      ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                              validator: (v) => v!.isEmpty
                                  ? AppLocalization.get(context, 'required')
                                  : null,
                            ),
                            const SizedBox(height: 14),
                            TextFormField(
                              controller: _locationController,
                              decoration: InputDecoration(
                                labelText: AppLocalization.get(
                                  context,
                                  'delivery_location',
                                ),
                                hintText: AppLocalization.get(
                                  context,
                                  'location_hint',
                                ),
                                prefixIcon: const Icon(
                                  Icons.location_on_outlined,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                              maxLines: 2,
                              validator: (v) => v!.isEmpty
                                  ? AppLocalization.get(context, 'required')
                                  : null,
                            ),
                            const SizedBox(height: 14),
                            const SizedBox(height: 14),
                            TextFormField(
                              controller: _phoneController,
                              decoration: InputDecoration(
                                hint: Text(
                                  AppLocalization.get(context, 'phone_hint'),
                                ),

                                labelText: AppLocalization.get(
                                  context,
                                  'phone_label',
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                              keyboardType: TextInputType.phone,
                              textDirection: TextDirection.ltr,
                              validator: (v) => v!.isEmpty
                                  ? AppLocalization.get(context, 'required')
                                  : null,
                            ),
                            const SizedBox(height: 20),
                            BlocConsumer<OrderBloc, OrderState>(
                              listener: (context, state) {
                                if (state is OrderSuccess) {
                                  AppFeedback.success(
                                    context,
                                    AppLocalization.get(context, 'order_sent'),
                                  );
                                  Navigator.pop(context);
                                }
                                if (state is OrderError) {
                                  AppFeedback.error(context, state.message);
                                }
                              },
                              builder: (context, state) {
                                final isLoading = state is OrderLoading;
                                return ElevatedButton(
                                  onPressed: isLoading ? null : _submit,
                                  style: ElevatedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 14,
                                    ),
                                    backgroundColor: tone.solid,
                                    foregroundColor: tone.onSolid,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                  ),
                                  child: isLoading
                                      ? const AppButtonLoadingIndicator()
                                      : Text(
                                          AppLocalization.get(
                                            context,
                                            'submit_order',
                                          ),
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                );
                              },
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildGovernorateBanner(BuildContext context) {
    final tone = appToneStyle(context, AppTone.warning);
    final governorate = _governorateName.isNotEmpty
        ? _governorateName
        : AppLocalization.get(context, 'your_governorate');

    return Container(
      key: const Key('governorateOrderBanner'),
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadiusDirectional.circular(AppRadius.md),
        border: Border.all(color: tone.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.map_outlined, color: tone.foreground),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              AppLocalization.get(
                context,
                'governorate_scope_banner_customer',
              ).replaceAll('%s', governorate),
              style: TextStyle(
                color: tone.foreground,
                fontSize: 13,
                height: 1.45,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (widget.governorateLevel) {
      final governorate = _governorateName.isNotEmpty
          ? _governorateName
          : AppLocalization.get(context, 'your_governorate');
      final area = widget.user.area.trim().isEmpty
          ? AppLocalization.get(context, 'area_region')
          : widget.user.area.trim();

      final proceed = await showGovernorateScopeWarning(
        context,
        title: AppLocalization.get(context, 'governorate_order_warning_title'),
        message: AppLocalization.get(
          context,
          'governorate_order_warning_message',
        ).replaceFirst('%s', governorate).replaceFirst('%s', area),
        note: AppLocalization.get(context, 'governorate_order_warning_note'),
        confirmLabel: AppLocalization.get(
          context,
          'governorate_order_warning_confirm',
        ),
      );

      if (!proceed || !mounted) return;
    }

    context.read<OrderBloc>().add(
      CreateOrderEvent(
        token: widget.token,
        type: _selectedType!,
        description: _descController.text.trim(),
        phone: _phoneController.text.trim(),
        area: ApiConfig.detectedArea,
        location: _locationController.text.trim(),
      ),
    );
  }
}

class _OptionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _OptionCard({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final foreground = isSelected
        ? scheme.onSecondaryContainer
        : scheme.onSurface;

    return Semantics(
      button: true,
      selected: isSelected,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: double.infinity,
        decoration: BoxDecoration(
          color: isSelected
              ? scheme.secondaryContainer
              : scheme.surfaceContainerLow,
          borderRadius: BorderRadiusDirectional.circular(AppRadius.md),
          border: Border.all(
            color: isSelected ? scheme.secondary : scheme.outlineVariant,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: Padding(
              padding: const EdgeInsetsDirectional.symmetric(
                vertical: 18,
                horizontal: 20,
              ),
              child: Row(
                children: [
                  Icon(icon, color: foreground, size: AppSizes.iconLg),
                  const SizedBox(width: AppSpacing.lg),
                  Expanded(
                    child: Text(
                      label,
                      style: Theme.of(
                        context,
                      ).textTheme.titleMedium?.copyWith(color: foreground),
                    ),
                  ),
                  if (isSelected)
                    Icon(
                      Icons.check_circle,
                      size: AppSizes.iconMd,
                      color: scheme.secondary,
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
