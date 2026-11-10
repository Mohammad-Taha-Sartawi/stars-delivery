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
  final String rejectionReason;
  final String createdAt;
  final DateTime? expiresAt;
  final String orderDescription;
  final String orderArea;
  final String orderType;
  final bool outsideArea;
  final String providerArea;
  final String providerCity;
  final String providerGovernorate;
  final double providerRatingAverage;
  final int providerRatingCount;
  final int providerPositiveRatingCount;

  OfferModel({
    required this.id,
    required this.orderId,
    required this.providerId,
    required this.providerName,
    required this.providerPhone,
    required this.providerPublicId,
    required this.price,
    required this.estimatedTime,
    required this.status,
    this.rejectionReason = '',
    required this.createdAt,
    this.expiresAt,
    required this.orderDescription,
    required this.orderArea,
    this.orderType = '',
    this.outsideArea = false,
    this.providerArea = '',
    this.providerCity = '',
    this.providerGovernorate = '',
    this.providerRatingAverage = 0,
    this.providerRatingCount = 0,
    this.providerPositiveRatingCount = 0,
  });

  factory OfferModel.fromJson(Map<String, dynamic> json) {
    final p = json['providerId'];
    final o = json['orderId'];
    final provider = p is Map ? p : const {};
    final rating = json['providerRating'];
    final providerRating = rating is Map ? rating : const {};
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
      rejectionReason: json['rejectionReason']?.toString() ?? '',
      createdAt: json['createdAt']?.toString() ?? '',
      expiresAt: DateTime.tryParse(json['expiresAt']?.toString() ?? ''),
      orderDescription: o is Map ? (o['description'] ?? '') : '',
      orderArea: o is Map ? (o['area'] ?? '') : '',
      orderType: o is Map ? (o['type'] ?? '') : '',
      outsideArea: json['outsideArea'] == true,
      providerArea: (json['providerArea'] ?? provider['area'] ?? '').toString(),
      providerCity: (json['providerCity'] ?? '').toString(),
      providerGovernorate:
          (json['providerGovernorate'] ?? provider['governorate'] ?? '')
              .toString(),
      providerRatingAverage:
          (providerRating['average'] as num?)?.toDouble() ?? 0,
      providerRatingCount: (providerRating['count'] as num?)?.toInt() ?? 0,
      providerPositiveRatingCount:
          (providerRating['positiveCount'] as num?)?.toInt() ?? 0,
    );
  }
}
