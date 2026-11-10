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
  Timer? _timer;
  List<AdModel> _ads = const [];
  int _page = 0;

  @override
  void initState() {
    super.initState();
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
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final ads = await _service.getAds(widget.token);

      if (!mounted) return;

      setState(() {
        _ads = ads;
        _page = 0;
      });

      if (_controller.hasClients) {
        _controller.jumpToPage(0);
      }

      _restartTimer();
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _ads = const [];
        _page = 0;
      });
      _timer?.cancel();
    }
  }

  void _restartTimer() {
    _timer?.cancel();

    if (_ads.length <= 1) return;

    _timer = Timer.periodic(const Duration(seconds: 6), (_) {
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
                    height: 132,
                    child: PageView.builder(
                      controller: _controller,
                      itemCount: _ads.length,
                      onPageChanged: (index) {
                        if (!mounted) return;
                        setState(() => _page = index);
                        _restartTimer();
                      },
                      itemBuilder: (context, index) =>
                          _buildBanner(context, _ads[index]),
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
                          width: selected ? 18 : 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: selected
                                ? Theme.of(context).colorScheme.primary
                                : Theme.of(context).colorScheme.outlineVariant,
                            borderRadius: BorderRadius.circular(999),
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

  Widget _buildBanner(BuildContext context, AdModel ad) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final hasImage = ad.imageUrl.trim().isNotEmpty;
    final imageUrl = ApiConfig.resolveMediaUrl(ad.imageUrl);

    return Semantics(
      container: true,
      label: '${ad.title} ${ad.body}'.trim(),
      child: ClipRRect(
        borderRadius: BorderRadiusDirectional.circular(AppRadius.lg),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (hasImage)
              Image.network(
                imageUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const SizedBox.shrink(),
              ),
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: AlignmentDirectional.centerStart,
                  end: AlignmentDirectional.centerEnd,
                  colors: hasImage
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
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
