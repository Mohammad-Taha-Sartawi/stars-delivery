class AdModel {
  final String id;
  final String title;
  final String body;
  final List<String> images;
  final DateTime? startsAt;
  final DateTime? endsAt;

  const AdModel({
    required this.id,
    required this.title,
    required this.body,
    required this.images,
    this.startsAt,
    this.endsAt,
  });

  factory AdModel.fromJson(Map<String, dynamic> json) {
    final rawImages = json['images'];
    final images = rawImages is List
        ? rawImages
              .map((image) => image.toString().trim())
              .where((image) => image.isNotEmpty)
              .toList()
        : <String>[];

    return AdModel(
      id: json['_id']?.toString() ?? '',
      title: (json['title'] ?? '').toString(),
      body: (json['body'] ?? '').toString(),
      images: images,
      startsAt: DateTime.tryParse(json['startsAt']?.toString() ?? ''),
      endsAt: DateTime.tryParse(json['endsAt']?.toString() ?? ''),
    );
  }

  bool isExpiredAt(DateTime now) {
    return endsAt != null && !endsAt!.isAfter(now);
  }

  bool isActiveAt(DateTime now) {
    final starts = startsAt;
    return (starts == null || !starts.isAfter(now)) && !isExpiredAt(now);
  }
}
