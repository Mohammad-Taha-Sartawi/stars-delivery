import 'package:flutter_bloc/flutter_bloc.dart';
import 'order_event.dart';
import 'order_state.dart';
import '../../services/order_service.dart';
import '../../models/order_model.dart';

class OrderBloc extends Bloc<OrderEvent, OrderState> {
  final OrderService _orderService = OrderService();

  OrderBloc() : super(OrderInitial()) {
    on<CreateOrderEvent>(_onCreateOrder);
  }

  Future<void> _onCreateOrder(
    CreateOrderEvent event,
    Emitter<OrderState> emit,
  ) async {
    emit(OrderLoading());
    try {
      final data = await _orderService.createOrder(
        event.token,
        event.type,
        event.description,
        event.phone,
        area: event.area,
        location: event.location,
      );
      emit(OrderSuccess(order: OrderModel.fromJson(data)));
    } catch (e) {
      emit(OrderError(message: e.toString().replaceFirst('Exception: ', '')));
    }
  }
}
