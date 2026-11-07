import 'package:equatable/equatable.dart';
import '../../models/offer_model.dart';

abstract class OfferState extends Equatable {
  @override List<Object?> get props => [];
}
class OfferInitial extends OfferState {}
class OfferLoading extends OfferState {}
class OfferSuccess extends OfferState {}
class OfferAlreadySubmitted extends OfferState {}
class OfferProviderBusy extends OfferState {}
class OfferCooldown extends OfferState {
  final int seconds;
  OfferCooldown({required this.seconds});
  @override List<Object?> get props => [seconds];
}
class OffersLoaded extends OfferState {
  final List<OfferModel> offers;
  OffersLoaded({required this.offers});
  @override List<Object?> get props => [offers];
}
class OfferError extends OfferState {
  final String message;
  OfferError({required this.message});
  @override List<Object?> get props => [message];
}
class OfferConflict extends OfferState {
  final String message;
  final String orderId;
  OfferConflict({required this.message, required this.orderId});
  @override List<Object?> get props => [message, orderId];
}