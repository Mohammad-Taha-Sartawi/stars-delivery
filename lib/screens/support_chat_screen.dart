import 'package:flutter/material.dart';
import 'dart:async';
import '../services/support_chat_service.dart';
import '../services/socket_service.dart';

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

    setState(() => _messages.add({
      'sender': 'user',
      'text': text,
      'createdAt': DateTime.now().toIso8601String(),
      'pending': true,
    }));
    _scrollToBottom();

    try {
      final sent = await _service.sendMessage(text);
      if (!mounted) return;
      setState(() {
        final idx = _messages.indexWhere((m) => m['pending'] == true && m['text'] == text);
        if (idx != -1) {
          _messages[idx] = Map<String, dynamic>.from(sent);
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        final idx = _messages.indexWhere((m) => m['pending'] == true && m['text'] == text);
        if (idx != -1) _messages[idx]['failed'] = true;
      });
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(_scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('التواصل مع الدعم', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold)),
        centerTitle: true,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.black87), onPressed: () => Navigator.pop(context)),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? const Center(child: Text('ابدأ محادثة مع فريق الدعم', style: TextStyle(color: Colors.grey)))
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(16),
                        itemCount: _messages.length,
                        itemBuilder: (_, i) {
                          final m = _messages[i];
                          final isUser = m['sender'] == 'user';
                          final failed = m['failed'] == true;
                          return Align(
                            alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              constraints: const BoxConstraints(maxWidth: 280),
                              decoration: BoxDecoration(
                                color: failed ? Colors.red[50] : (isUser ? Colors.blue[600] : Colors.grey[200]),
                                borderRadius: BorderRadius.only(
                                  topLeft: const Radius.circular(16),
                                  topRight: const Radius.circular(16),
                                  bottomLeft: isUser ? const Radius.circular(16) : Radius.zero,
                                  bottomRight: isUser ? Radius.zero : const Radius.circular(16),
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Flexible(
                                    child: Text(
                                      m['text'] ?? '',
                                      style: TextStyle(color: isUser ? Colors.white : Colors.black87, fontSize: 14),
                                    ),
                                  ),
                                  if (failed) const SizedBox(width: 6),
                                  if (failed) const Icon(Icons.error, size: 16, color: Colors.red),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 4)]),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      decoration: const InputDecoration(
                        hintText: 'اكتب رسالتك...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(24))),
                        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      ),
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  CircleAvatar(
                    backgroundColor: Colors.blue,
                    child: IconButton(icon: const Icon(Icons.send, color: Colors.white, size: 20), onPressed: _send),
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
