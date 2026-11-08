class OfferModel {
  final String id;
  final String orderId;
  final String providerId;
  final String providerName;
  final String providerPhone;
  final String providerPublicId;
  final double price;
  final int estimatedTime;
  final String status;
  final String createdAt;
  final DateTime? expiresAt;
  final String orderDescription;
  final String orderArea;
  final String orderType;

  OfferModel({
    required this.id, required this.orderId, required this.providerId,
    required this.providerName, required this.providerPhone,
    required this.providerPublicId,
    required this.price, required this.estimatedTime, required this.status, required this.createdAt,
    this.expiresAt,
    required this.orderDescription, required this.orderArea, this.orderType = '',
  });

  factory OfferModel.fromJson(Map<String, dynamic> json) {
    final p = json['providerId'];
    final o = json['orderId'];
    return OfferModel(
      id: json['_id']?.toString() ?? '',
      orderId: json['orderId']?.toString() ?? '',
      providerId: p is Map ? (p['_id']?.toString() ?? '') : '',
      providerName: p is Map ? (p['fullName'] ?? '') : '',
      providerPhone: p is Map ? (p['phone'] ?? '') : '',
      providerPublicId: p is Map ? (p['publicId'] ?? '') : '',
      price: (json['price'] ?? 0).toDouble(),
      estimatedTime: (json['estimatedTime'] ?? 0).toInt(),
      status: json['status'] ?? 'pending',
      createdAt: json['createdAt']?.toString() ?? '',
      expiresAt: DateTime.tryParse(json['expiresAt']?.toString() ?? ''),
      orderDescription: o is Map ? (o['description'] ?? '') : '',
      orderArea: o is Map ? (o['area'] ?? '') : '',
      orderType: o is Map ? (o['type'] ?? '') : '',
    );
  }
}