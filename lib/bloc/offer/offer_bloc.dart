import 'package:flutter_bloc/flutter_bloc.dart';
import 'offer_event.dart';
import 'offer_state.dart';
import '../../services/offer_service.dart';

class OfferBloc extends Bloc<OfferEvent, OfferState> {
  final OfferService _s = OfferService();
  OfferBloc() : super(OfferInitial()) {
    on<SubmitOfferEvent>(_onSubmit);
    on<LoadOffersEvent>(_onLoad);
    on<AcceptOfferEvent>(_onAccept);
    on<ResendOrderEvent>(_onResendOrder);
    on<CancelOrderEvent>(_onCancelOrder);
  }
  Future<void> _onSubmit(SubmitOfferEvent e, Emitter<OfferState> emit) async {
    emit(OfferLoading()); try {
      await _s.submitOffer(e.token, e.orderId, e.price, e.estimatedTime); emit(OfferSuccess());
    } on OfferSubmitException catch (ex) {
      if (ex.code == 'OFFER_NOT_AVAILABLE') {
        emit(OfferAlreadySubmitted());
        return;
      }
      if (ex.code == 'PROVIDER_BUSY') {
        emit(OfferProviderBusy());
        return;
      }
      if (ex.code == 'PROVIDER_UNAVAILABLE') {
        emit(OfferProviderUnavailable());
        return;
      }
      if (ex.code == 'OFFER_COOLDOWN') {
        emit(OfferCooldown(seconds: ex.retryAfterSeconds ?? 60));
        return;
      }
      emit(OfferError(message: ex.message));
    } catch (ex) { emit(OfferError(message: ex.toString().replaceFirst('Exception: ', ''))); }
  }
  Future<void> _onLoad(LoadOffersEvent e, Emitter<OfferState> emit) async {
    emit(OfferLoading()); try {
      final o = await _s.getOffers(e.token, e.orderId); emit(OffersLoaded(offers: o));
    } catch (ex) { emit(OfferError(message: ex.toString().replaceFirst('Exception: ', ''))); }
  }
  Future<void> _onAccept(AcceptOfferEvent e, Emitter<OfferState> emit) async {
    emit(OfferLoading()); try {
      final result = await _s.acceptOffer(e.token, e.offerId);
      if (result['conflict'] == true) {
        emit(OfferConflict(message: result['message'] ?? '', orderId: e.orderId));
        return;
      }
      final offers = await _s.getOffers(e.token, e.orderId);
      emit(OffersLoaded(offers: offers));
    } catch (ex) { emit(OfferError(message: ex.toString().replaceFirst('Exception: ', ''))); }
  }

  Future<void> _onResendOrder(ResendOrderEvent e, Emitter<OfferState> emit) async {
    emit(OfferLoading()); try {
      await _s.resendOrder(e.token, e.orderId);
      final offers = await _s.getOffers(e.token, e.orderId);
      emit(OffersLoaded(offers: offers));
    } catch (ex) { emit(OfferError(message: ex.toString().replaceFirst('Exception: ', ''))); }
  }

  Future<void> _onCancelOrder(CancelOrderEvent e, Emitter<OfferState> emit) async {
    emit(OfferLoading()); try {
      await _s.cancelOrder(e.token, e.orderId);
      final offers = await _s.getOffers(e.token, e.orderId);
      emit(OffersLoaded(offers: offers));
    } catch (ex) { emit(OfferError(message: ex.toString().replaceFirst('Exception: ', ''))); }
  }
}