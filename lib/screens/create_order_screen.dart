import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import '../bloc/order/order_bloc.dart';
import '../bloc/order/order_event.dart';
import '../bloc/order/order_state.dart';
import '../models/user_model.dart';
import '../services/responsive.dart';
import '../services/localization_service.dart';
import '../services/api_config.dart';

class CreateOrderScreen extends StatefulWidget {
  final UserModel user;
  final String token;

  const CreateOrderScreen({super.key, required this.user, required this.token});

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  String? _selectedType;
  final _descController = TextEditingController();
  final _phoneController = TextEditingController();
  final _locationController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  final List<File> _images = [];
  final ImagePicker _picker = ImagePicker();

  @override
  void dispose() {
    _descController.dispose();
    _phoneController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    if (_images.length >= 3) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalization.get(context, 'max_3_photos')),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
    );
    if (picked != null) {
      setState(() => _images.add(File(picked.path)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text(
          AppLocalization.get(context, 'new_order'),
          style: const TextStyle(
            color: Colors.black87,
            fontWeight: FontWeight.bold,
          ),
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
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(
              horizontal: Responsive.paddingHorizontal(context),
              vertical: Responsive.paddingVertical(context),
            ),
            child: Column(
              children: [
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
                      color: Colors.grey[50],
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.grey[200]!),
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
                                  ? AppLocalization.get(context, 'people_label')
                                  : AppLocalization.get(context, 'goods_label'),
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
                              labelText: AppLocalization.get(context, 'delivery_location'),
                              hintText: AppLocalization.get(context, 'location_hint'),
                              prefixIcon: const Icon(Icons.location_on_outlined),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                            maxLines: 2,
                            validator: (v) => v!.isEmpty ? AppLocalization.get(context, 'required') : null,
                          ),
                          const SizedBox(height: 14),
                          _buildPhotoPicker(),
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
                            validator: (v) => v!.isEmpty
                                ? AppLocalization.get(context, 'required')
                                : null,
                          ),
                          const SizedBox(height: 20),
                          BlocConsumer<OrderBloc, OrderState>(
                            listener: (context, state) {
                              if (state is OrderSuccess) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(
                                      AppLocalization.get(
                                        context,
                                        'order_sent',
                                      ),
                                    ),
                                    backgroundColor: Colors.green,
                                  ),
                                );
                                Navigator.pop(context);
                              }
                              if (state is OrderError) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(state.message),
                                    backgroundColor: Colors.red,
                                  ),
                                );
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
                                  backgroundColor: Colors.orange,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                ),
                                child: isLoading
                                    ? const SizedBox(
                                        height: 20,
                                        width: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
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
    );
  }

  Widget _buildPhotoPicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_images.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SizedBox(
              height: 80,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _images.length,
                separatorBuilder: (_, i) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  return Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.file(
                          _images[index],
                          width: 80,
                          height: 80,
                          fit: BoxFit.cover,
                        ),
                      ),
                      Positioned(
                        top: 0,
                        right: 0,
                        child: GestureDetector(
                          onTap: () => setState(() => _images.removeAt(index)),
                          child: Container(
                            padding: const EdgeInsets.all(2),
                            decoration: const BoxDecoration(
                              color: Colors.red,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.close,
                              size: 16,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _pickImage,
            icon: const Icon(Icons.camera_alt_outlined, color: Colors.orange),
            label: Text(
              _images.isEmpty
                  ? AppLocalization.get(context, 'add_photos')
                  : '${AppLocalization.get(context, 'add_more_photos')} (${_images.length}/3)',
              style: const TextStyle(color: Colors.orange),
            ),
            style: OutlinedButton.styleFrom(
              side: BorderSide(color: Colors.orange.withValues(alpha: 0.5)),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
      ],
    );
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    context.read<OrderBloc>().add(
      CreateOrderEvent(
        token: widget.token,
        type: _selectedType!,
        description: _descController.text.trim(),
        phone: _phoneController.text.trim(),
        imagePaths: _images.map((f) => f.path).toList(),
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
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 20),
        decoration: BoxDecoration(
          color: isSelected ? Colors.orange : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? Colors.orange : Colors.grey[300]!,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              icon,
              color: isSelected ? Colors.white : Colors.grey[700],
              size: 28,
            ),
            const SizedBox(width: 16),
            Text(
              label,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: isSelected ? Colors.white : Colors.grey[800],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
