import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/ad_model.dart';
import '../../services/ad_service.dart';
import '../../services/api_config.dart';
import '../../services/localization_service.dart';
import '../../services/theme_service.dart';

class AdBannerCarousel extends StatefulWidget {
  const AdBannerCarousel({
    super.key,
    required this.token,
    this.refreshTick = 0,
  });

  final String token;
  final int refreshTick;

  @override
  State<AdBannerCarousel> createState() => AdBannerCarouselState();
}

class AdBannerCarouselState extends State<AdBannerCarousel> {
  final AdService _service = AdService();
  final PageController _controller = PageController();
  Timer? _slideTimer;
  Timer? _ticker;
  List<AdModel> _ads = const [];
  int _page = 0;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    _load();
  }

  @override
  void didUpdateWidget(covariant AdBannerCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.token != widget.token ||
        oldWidget.refreshTick != widget.refreshTick) {
      _load();
    }
  }

  @override
  void dispose() {
    _slideTimer?.cancel();
    _ticker?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final ads = await _service.getAds(widget.token);
      final now = DateTime.now();

      if (!mounted) return;

      setState(() {
        _now = now;
        _ads = ads.where((ad) => ad.isActiveAt(now)).toList();
        _page = 0;
      });

      if (_controller.hasClients) {
        _controller.jumpToPage(0);
      }

      _restartSlideTimer();
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _ads = const [];
        _page = 0;
      });
      _slideTimer?.cancel();
    }
  }

  void _tick() {
    if (!mounted || _ads.isEmpty) return;

    final now = DateTime.now();
    final activeAds = _ads.where((ad) => ad.isActiveAt(now)).toList();
    final changed = activeAds.length != _ads.length;

    setState(() {
      _now = now;
      if (changed) {
        _ads = activeAds;
        _page = _page.clamp(0, activeAds.isEmpty ? 0 : activeAds.length - 1);
      }
    });

    if (changed) {
      _restartSlideTimer();
    }
  }

  void _restartSlideTimer() {
    _slideTimer?.cancel();

    if (_ads.length <= 1) return;

    _slideTimer = Timer.periodic(const Duration(seconds: 6), (_) {
      if (!mounted || !_controller.hasClients || _ads.isEmpty) return;

      final next = (_page + 1) % _ads.length;
      _controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSize(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: _ads.isEmpty
          ? const SizedBox.shrink()
          : Padding(
              padding: const EdgeInsetsDirectional.only(bottom: AppSpacing.md),
              child: Column(
                children: [
                  SizedBox(
                    height: 154,
                    child: PageView.builder(
                      controller: _controller,
                      itemCount: _ads.length,
                      onPageChanged: (index) {
                        if (!mounted) return;
                        setState(() => _page = index);
                        _restartSlideTimer();
                      },
                      itemBuilder: (context, index) => _AdSlide(
                        key: ValueKey(_ads[index].id),
                        ad: _ads[index],
                        now: _now,
                      ),
                    ),
                  ),
                  if (_ads.length > 1) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(_ads.length, (index) {
                        final selected = index == _page;

                        return AnimatedContainer(
                          duration: const Duration(milliseconds: 220),
                          curve: Curves.easeOut,
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          width: selected ? 22 : 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: selected
                                ? Theme.of(context).colorScheme.primary
                                : Theme.of(context).colorScheme.outlineVariant,
                            borderRadius: BorderRadius.circular(999),
                            boxShadow: selected
                                ? [
                                    BoxShadow(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .primary
                                          .withValues(alpha: 0.25),
                                      blurRadius: 6,
                                    ),
                                  ]
                                : null,
                          ),
                        );
                      }),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}

class _AdSlide extends StatefulWidget {
  const _AdSlide({super.key, required this.ad, required this.now});

  final AdModel ad;
  final DateTime now;

  @override
  State<_AdSlide> createState() => _AdSlideState();
}

class _AdSlideState extends State<_AdSlide> {
  Timer? _imageTimer;
  int _imageIndex = 0;

  @override
  void initState() {
    super.initState();
    _restartImageTimer();
  }

  @override
  void didUpdateWidget(covariant _AdSlide oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.ad.id != widget.ad.id ||
        oldWidget.ad.images.length != widget.ad.images.length) {
      _imageIndex = 0;
      _restartImageTimer();
    }
  }

  @override
  void dispose() {
    _imageTimer?.cancel();
    super.dispose();
  }

  void _restartImageTimer() {
    _imageTimer?.cancel();

    if (widget.ad.images.length <= 1) return;

    _imageTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || widget.ad.images.isEmpty) return;

      setState(() {
        _imageIndex = (_imageIndex + 1) % widget.ad.images.length;
      });
    });
  }

  String _remainingLabel(BuildContext context) {
    final endsAt = widget.ad.endsAt;

    if (endsAt == null) return '';

    final remaining = endsAt.difference(widget.now);

    if (remaining.isNegative || remaining == Duration.zero) {
      return AppLocalization.get(context, 'ad_ended');
    }

    final days = remaining.inDays;
    final hours = remaining.inHours.remainder(24).toString().padLeft(2, '0');
    final minutes = remaining.inMinutes
        .remainder(60)
        .toString()
        .padLeft(2, '0');
    final seconds = remaining.inSeconds
        .remainder(60)
        .toString()
        .padLeft(2, '0');
    final time = days > 0
        ? '${days}d $hours:$minutes:$seconds'
        : '$hours:$minutes:$seconds';

    return '${AppLocalization.get(context, 'ad_ends_in')}: $time';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final ad = widget.ad;
    final hasImages = ad.images.isNotEmpty;
    final imageUrl = hasImages
        ? ApiConfig.resolveMediaUrl(ad.images[_imageIndex % ad.images.length])
        : '';
    final remaining = _remainingLabel(context);

    return Semantics(
      container: true,
      label: '${ad.title} ${ad.body}'.trim(),
      child: ClipRRect(
        borderRadius: BorderRadiusDirectional.circular(AppRadius.lg),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (hasImages)
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 500),
                switchInCurve: Curves.easeOut,
                switchOutCurve: Curves.easeIn,
                child: Image.network(
                  imageUrl,
                  key: ValueKey(imageUrl),
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const SizedBox.shrink(),
                ),
              ),
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: AlignmentDirectional.centerStart,
                  end: AlignmentDirectional.centerEnd,
                  colors: hasImages
                      ? [
                          Colors.black.withValues(alpha: 0.72),
                          Colors.black.withValues(alpha: 0.38),
                        ]
                      : [scheme.primary, scheme.secondary],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsetsDirectional.all(AppSpacing.lg),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsetsDirectional.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      AppLocalization.get(context, 'ad_label'),
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  if (ad.title.trim().isNotEmpty)
                    Text(
                      ad.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        height: 1.25,
                      ),
                    ),
                  if (ad.body.trim().isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      ad.body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.white.withValues(alpha: 0.9),
                        height: 1.3,
                      ),
                    ),
                  ],
                  if (remaining.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.timer_outlined,
                          size: 12,
                          color: Colors.white70,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          remaining,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: Colors.white70,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
