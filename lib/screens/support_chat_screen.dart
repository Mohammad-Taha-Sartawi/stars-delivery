import 'package:flutter/material.dart';
import 'dart:async';
import '../services/support_chat_service.dart';
import '../services/socket_service.dart';
import '../services/localization_service.dart';
import '../services/theme_service.dart';
import '../widgets/ui/app_tone.dart';

class SupportChatScreen extends StatefulWidget {
  final String token;
  const SupportChatScreen({super.key, required this.token});

  @override
  State<SupportChatScreen> createState() => _SupportChatScreenState();
}

class _SupportChatScreenState extends State<SupportChatScreen> {
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  final List<Map<String, dynamic>> _messages = [];
  late final ChatService _service;
  bool _loading = true;
  StreamSubscription? _replySub;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _service = ChatService(widget.token);
    _loadHistory();
    _markAdminRead();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => _refreshHistory(),
    );
    _replySub = SocketService.instance.onSupportReply.listen((msg) {
      if (!mounted) return;
      setState(() => _messages.add(msg));
      _scrollToBottom();
      _markAdminRead();
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    _refreshTimer?.cancel();
    _replySub?.cancel();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    try {
      final list = await _service.getHistory();
      if (!mounted) return;
      setState(() {
        _messages.addAll(list);
        _loading = false;
      });
      _scrollToBottom();
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _refreshHistory() async {
    try {
      final list = await _service.getHistory();
      if (!mounted) return;

      final pending = _messages
          .where((message) => message['pending'] == true)
          .toList();

      setState(() {
        _messages
          ..clear()
          ..addAll(list)
          ..addAll(pending);
      });
      _scrollToBottom();
      _markAdminRead();
    } catch (_) {}
  }

  Future<void> _markAdminRead() async {
    try {
      await _service.markAdminRead();
    } catch (_) {}
  }

  Future<void> _send() async {
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    _textController.clear();

    setState(
      () => _messages.add({
        'sender': 'user',
        'text': text,
        'createdAt': DateTime.now().toIso8601String(),
        'pending': true,
      }),
    );
    _scrollToBottom();

    try {
      final sent = await _service.sendMessage(text);
      if (!mounted) return;
      setState(() {
        final idx = _messages.indexWhere(
          (m) => m['pending'] == true && m['text'] == text,
        );
        if (idx != -1) {
          _messages[idx] = Map<String, dynamic>.from(sent);
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        final idx = _messages.indexWhere(
          (m) => m['pending'] == true && m['text'] == text,
        );
        if (idx != -1) _messages[idx]['failed'] = true;
      });
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final failedTone = appToneStyle(context, AppTone.danger);

    return Scaffold(
      appBar: AppBar(title: const Text('التواصل مع الدعم'), centerTitle: true),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                ? Center(
                    child: Text(
                      'ابدأ محادثة مع فريق الدعم',
                      style: TextStyle(color: scheme.onSurfaceVariant),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) {
                      final m = _messages[i];
                      final isUser = m['sender'] == 'user';
                      final failed = m['failed'] == true;
                      final bubbleColor = failed
                          ? failedTone.background
                          : (isUser
                                ? scheme.primary
                                : scheme.surfaceContainerHigh);
                      final textColor = failed
                          ? failedTone.foreground
                          : (isUser ? scheme.onPrimary : scheme.onSurface);
                      return Align(
                        alignment: isUser
                            ? AlignmentDirectional.centerEnd
                            : AlignmentDirectional.centerStart,
                        child: Container(
                          margin: const EdgeInsetsDirectional.only(
                            bottom: AppSpacing.sm,
                          ),
                          padding: const EdgeInsetsDirectional.symmetric(
                            horizontal: AppSpacing.md,
                            vertical: AppSpacing.sm,
                          ),
                          constraints: const BoxConstraints(maxWidth: 280),
                          decoration: BoxDecoration(
                            color: bubbleColor,
                            borderRadius: BorderRadiusDirectional.only(
                              topStart: Radius.circular(AppRadius.lg),
                              topEnd: Radius.circular(AppRadius.lg),
                              bottomStart: Radius.circular(
                                isUser ? AppRadius.lg : 0,
                              ),
                              bottomEnd: Radius.circular(
                                isUser ? 0 : AppRadius.lg,
                              ),
                            ),
                            border: failed
                                ? Border.all(color: failedTone.border)
                                : null,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Flexible(
                                child: Text(
                                  m['text'] ?? '',
                                  style: TextStyle(
                                    color: textColor,
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                              if (failed) ...[
                                const SizedBox(width: AppSpacing.xs),
                                Semantics(
                                  label: AppLocalization.get(
                                    context,
                                    'message_failed',
                                  ),
                                  child: Icon(
                                    Icons.error_outline,
                                    size: 16,
                                    color: failedTone.foreground,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
          Container(
            padding: const EdgeInsetsDirectional.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              color: scheme.surface,
              boxShadow: [
                BoxShadow(
                  color: scheme.shadow.withValues(alpha: 0.12),
                  blurRadius: 4,
                ),
              ],
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      decoration: const InputDecoration(
                        hintText: 'اكتب رسالتك...',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(24)),
                        ),
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                      ),
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  IconButton.filled(
                    tooltip: AppLocalization.get(context, 'send_message'),
                    onPressed: _send,
                    style: IconButton.styleFrom(
                      minimumSize: const Size(
                        AppSizes.minTouchTarget,
                        AppSizes.minTouchTarget,
                      ),
                      tapTargetSize: MaterialTapTargetSize.padded,
                    ),
                    icon: const Icon(Icons.send, size: 20),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
