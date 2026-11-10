class AdModel {
  final String id;
  final String title;
  final String body;
  final String imageUrl;

  const AdModel({
    required this.id,
    required this.title,
    required this.body,
    required this.imageUrl,
  });

  factory AdModel.fromJson(Map<String, dynamic> json) {
    return AdModel(
      id: json['_id']?.toString() ?? '',
      title: (json['title'] ?? '').toString(),
      body: (json['body'] ?? '').toString(),
      imageUrl: (json['imageUrl'] ?? '').toString(),
    );
  }
}
