class ProviderStats {
  final double dailyEarnings;
  final double monthlyEarnings;
  final int totalSuccessful;
  final int dailyOrderCount;
  final double dailyCommission;
  final double monthlyCommission;
  final double totalCommissionDue;
  final int pendingOrdersCount;
  final int offeredOrdersCount;
  final int ordersReportCount;
  final int activeOrdersCount;
  final double averageRating;
  final int ratingCount;
  final String? blockedUntil;
  final String? offerCooldownUntil;
  final bool isAvailable;

  ProviderStats({
    required this.dailyEarnings,
    required this.monthlyEarnings,
    required this.totalSuccessful,
    required this.dailyOrderCount,
    required this.dailyCommission,
    required this.monthlyCommission,
    this.totalCommissionDue = 0,
    required this.pendingOrdersCount,
    required this.offeredOrdersCount,
    this.ordersReportCount = 0,
    required this.activeOrdersCount,
    this.averageRating = 0,
    this.ratingCount = 0,
    this.blockedUntil,
    this.offerCooldownUntil,
    this.isAvailable = true,
  });

  factory ProviderStats.fromJson(Map<String, dynamic> json) {
    return ProviderStats(
      dailyEarnings: (json['dailyEarnings'] ?? 0).toDouble(),
      monthlyEarnings: (json['monthlyEarnings'] ?? 0).toDouble(),
      totalSuccessful: (json['totalSuccessful'] ?? 0).toInt(),
      dailyOrderCount: (json['dailyOrderCount'] ?? 0).toInt(),
      dailyCommission: (json['dailyCommission'] ?? 0).toDouble(),
      monthlyCommission: (json['monthlyCommission'] ?? 0).toDouble(),
      totalCommissionDue: (json['totalCommissionDue'] ?? 0).toDouble(),
      pendingOrdersCount: (json['pendingOrdersCount'] ?? 0).toInt(),
      offeredOrdersCount: (json['offeredOrdersCount'] ?? 0).toInt(),
      ordersReportCount: (json['ordersReportCount'] ?? 0).toInt(),
      activeOrdersCount: (json['activeOrdersCount'] ?? 0).toInt(),
      averageRating: (json['averageRating'] ?? 0).toDouble(),
      ratingCount: (json['ratingCount'] ?? 0).toInt(),
      blockedUntil: json['blockedUntil']?.toString(),
      offerCooldownUntil: json['offerCooldownUntil']?.toString(),
      isAvailable: json['isAvailable'] != false,
    );
  }
}
