import 'dart:async';

import 'package:flutter/material.dart';

import '../services/guest_support_service.dart';
import '../services/localization_service.dart';
import '../widgets/ui/app_feedback.dart';

/// The support conversation of someone who is not signed in: their message,
/// our replies from the dashboard, and a box to answer back.
class GuestSupportScreen extends StatefulWidget {
  final GuestSupportThread thread;
  final GuestSupportService? service;

  const GuestSupportScreen({super.key, required this.thread, this.service});

  @override
  State<GuestSupportScreen> createState() => _GuestSupportScreenState();
}

class _GuestSupportScreenState extends State<GuestSupportScreen> {
  late final GuestSupportService _service =
      widget.service ?? GuestSupportService();
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _sending = false;
  bool _missing = false;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _load();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _load(quiet: true),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) async {
    try {
      final messages = await _service.messages(widget.thread);
      if (!mounted) return;
      final grew = messages.length != _messages.length;
      setState(() {
        _messages = messages;
        _loading = false;
        _missing = false;
      });
      if (grew) _scrollToBottom();
    } on GuestSupportException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _missing = e.code == 'CONTACT_NOT_FOUND';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
      if (!quiet) {
        AppFeedback.error(
          context,
          AppLocalization.get(context, 'contact_failed'),
        );
      }
    }
  }

  Future<void> _send() async {
    final text = _textController.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await _service.reply(widget.thread, text);
      _textController.clear();
      await _load(quiet: true);
    } catch (e) {
      if (mounted) {
        AppFeedback.error(
          context,
          e is GuestSupportException
              ? e.message
              : AppLocalization.get(context, 'contact_failed'),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final waitingForReply =
        _messages.isNotEmpty && _messages.last['sender'] != 'admin';

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalization.get(context, 'support_contact_title')),
        actions: [
          IconButton(
            tooltip: AppLocalization.get(context, 'guest_new_message'),
            icon: const Icon(Icons.add_comment_outlined),
            onPressed: () => Navigator.pop(context, true),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _missing
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              AppLocalization.get(
                                context,
                                'guest_thread_closed',
                              ),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 16),
                            FilledButton.icon(
                              onPressed: () => Navigator.pop(context, true),
                              icon: const Icon(Icons.add_comment_outlined),
                              label: Text(
                                AppLocalization.get(
                                  context,
                                  'guest_new_message',
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(16),
                        itemCount: _messages.length + (waitingForReply ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (index == _messages.length) {
                            return Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                AppLocalization.get(
                                  context,
                                  'guest_waiting_reply',
                                ),
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: scheme.onSurfaceVariant,
                                  fontSize: 12,
                                ),
                              ),
                            );
                          }
                          final message = _messages[index];
                          final fromSupport = message['sender'] == 'admin';
                          return Align(
                            alignment: fromSupport
                                ? AlignmentDirectional.centerEnd
                                : AlignmentDirectional.centerStart,
                            child: Container(
                              constraints: const BoxConstraints(maxWidth: 320),
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: fromSupport
                                    ? scheme.secondaryContainer
                                    : scheme.primaryContainer,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (fromSupport)
                                    Text(
                                      AppLocalization.get(
                                        context,
                                        'support_team',
                                      ),
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                        color: scheme.onSecondaryContainer,
                                      ),
                                    ),
                                  Text(
                                    message['text']?.toString() ?? '',
                                    style: TextStyle(
                                      color: fromSupport
                                          ? scheme.onSecondaryContainer
                                          : scheme.onPrimaryContainer,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
            ),
            if (!_missing)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _textController,
                        minLines: 1,
                        maxLines: 4,
                        maxLength: 2000,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _send(),
                        decoration: InputDecoration(
                          hintText: AppLocalization.get(
                            context,
                            'message_hint',
                          ),
                          counterText: '',
                          border: const OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      tooltip: AppLocalization.get(context, 'send'),
                      onPressed: _sending ? null : _send,
                      icon: const Icon(Icons.send_rounded),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
