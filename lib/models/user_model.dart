class UserModel {
  final String id;
  final String fullName;
  final String email;
  final String phone;
  final String role;
  final String area;
  final String governorate;
  final bool governorateLevel;
  final String publicId;

  UserModel({
    required this.id,
    required this.fullName,
    required this.email,
    required this.phone,
    required this.role,
    required this.area,
    this.governorate = '',
    this.governorateLevel = false,
    required this.publicId,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] ?? '',
      fullName: json['fullName'] ?? '',
      email: json['email'] ?? '',
      phone: json['phone'] ?? '',
      role: json['role'] ?? '',
      area: json['area'] ?? '',
      governorate: json['governorate'] ?? '',
      governorateLevel: json['governorateLevel'] == true,
      publicId: json['publicId'] ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'fullName': fullName,
    'email': email,
    'phone': phone,
    'role': role,
    'area': area,
    'governorate': governorate,
    'governorateLevel': governorateLevel,
    'publicId': publicId,
  };
}
