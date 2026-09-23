"""Shared image resolution tiers; each provider translates adaptive sizes separately."""
import math

# Official common sizes; 5:4 and 4:5 use valid exact-ratio dimensions in each tier.
IMAGE_RATIOS = ['auto', '1:1', '9:16', '16:9', '3:4', '4:3', '3:2', '2:3', '5:4', '4:5', '21:9']
IMAGE_SIZES = {
    '1K': ['1024x1024', '800x1424', '1424x800', '864x1152', '1152x864', '1248x832', '832x1248', '1120x896', '896x1120', '1568x672'],
    '1.5K': ['1536x1536', '1152x2048', '2048x1152', '1344x1792', '1792x1344', '1872x1248', '1248x1872', '1760x1408', '1408x1760', '2352x1008'],
    '2K': ['2048x2048', '1584x2816', '2816x1584', '1776x2368', '2368x1776', '2496x1664', '1664x2496', '2240x1792', '1792x2240', '3136x1344'],
}


def gpt_image_size(parameters, reference_size=None):
    tier = parameters.get('size', '2K')
    ratio = parameters.get('ratio', 'auto')
    if tier not in IMAGE_SIZES or ratio not in IMAGE_RATIOS:
        raise ValueError('图片画质或比例不在支持范围')
    if ratio != 'auto':
        size = IMAGE_SIZES[tier][IMAGE_RATIOS.index(ratio) - 1]
    else:
        # Keep the chosen pixel budget. Text-only adaptive requests default to square;
        # reference edits follow the first input image, within OpenAI's 3:1 limit.
        aspect = reference_size[0] / reference_size[1] if reference_size else 1
        aspect = max(1 / 3, min(3, aspect))
        edge = {'1K': 1024, '1.5K': 1536, '2K': 2048}[tier]
        width = round(edge * math.sqrt(aspect) / 16) * 16
        height = round(edge / math.sqrt(aspect) / 16) * 16
        # Rounding can push the aspect just beyond 3:1.
        if width > 3 * height:
            width = 3 * height
        if height > 3 * width:
            height = 3 * width
        size = f'{width}x{height}'
    width, height = map(int, size.split('x'))
    if (width % 16 or height % 16 or max(width, height) > 3840
            or max(width, height) > 3 * min(width, height)
            or not 655360 <= width * height <= 8294400):
        raise ValueError('GPT Image 图片尺寸超出允许范围')
    return size
