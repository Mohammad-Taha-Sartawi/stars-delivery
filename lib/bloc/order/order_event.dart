import 'package:equatable/equatable.dart';

abstract class OrderEvent extends Equatable {
  const OrderEvent();
  @override
  List<Object?> get props => [];
}

class CreateOrderEvent extends OrderEvent {
  final String token;
  final String type;
  final String description;
  final String phone;
  final String? area;
  final String? location;

  const CreateOrderEvent({
    required this.token,
    required this.type,
    required this.description,
    required this.phone,
    this.area,
    this.location,
  });

  @override
  List<Object?> get props => [token, type, description, phone, area, location];
}
