class OrderModel {
  final String id;
  final String customerId;
  final String type;
  final String description;
  final String phone;
  final String status;
  final String createdAt;

  OrderModel({
    required this.id,
    required this.customerId,
    required this.type,
    required this.description,
    required this.phone,
    required this.status,
    required this.createdAt,
  });

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    final cid = json['customerId'];
    final customerId = cid is Map
        ? (cid['_id']?.toString() ?? '')
        : (cid?.toString() ?? '');
    return OrderModel(
      id: json['_id']?.toString() ?? '',
      customerId: customerId,
      type: json['type'] ?? '',
      description: json['description'] ?? '',
      phone: json['phone'] ?? '',
      status: json['status'] ?? '',
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }
}
