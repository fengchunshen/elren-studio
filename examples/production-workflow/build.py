"""Build a script/asset/storyboard/editorial project without calling models."""
from pathlib import Path
from copy import deepcopy
import json
import zipfile

P = Path(__file__).resolve().parent
old = json.loads((P.parent / 'last-order-cartoon/project.json').read_text())
clear = json.loads((P.parent / 'clear-cartoon-workflow/project.json').read_text())
source = {n['id']: n for n in old['nodes']}
nodes, edges = [], []

def take(source_node, id, title, x, y, width, height, stage):
    node = deepcopy(source_node)
    node.update(id=id, title=title, x=x, y=y, width=width, height=height,
                workflowGroup={'id': 'production-' + stage[:2], 'name': stage})
    nodes.append(node)
    return node

def link(a, b):
    edges.append({'id': f'production-edge-{len(edges)+1}', 'from': a, 'to': b, 'inputType': 'default'})

script = take(source['cartoon-script'], 'prod-script', '01 剧本 · 别开门', 0, 0, 380, 520, '01 剧本')
brief = take(source['cartoon-brief'], 'prod-brief', '创作简报 · 60秒 / 两人一景', 0, 650, 380, 300, '01 剧本')
link('prod-brief', 'prod-script')
for key, label, y in [('lin', '林夏 · 猫店员', 0), ('chen', '陈默 · 兔顾客', 460), ('scene', '便利店 · 场景与轴线', 920)]:
    take(source['cartoon-' + key], 'prod-' + key, '02 ' + label, 540, y, 360, 340, '02 人设与场景')
    look = take(source['cartoon-look-' + key], 'prod-look-' + key, '03 ' + label + (' · 空镜' if key == 'scene' else ' · 定妆'), 1060, y, 360, 340, '03 视觉资产')
    link('prod-script', 'prod-' + key)
    link('prod-' + key, look['id'])
    link('prod-reference', look['id'])
reference = take(source['cartoon-reference'], 'prod-reference', '风格参考 · 已有概念设定板', 0, 1090, 380, 200, '01 剧本')
images = take(next(n for n in clear['nodes'] if n['id'] == 'clear-images'), 'prod-images', '04 分镜 · 构图与画面确认', 1600, 0, 850, 750, '04 分镜')
videos = take(next(n for n in clear['nodes'] if n['id'] == 'clear-videos'), 'prod-videos', '05 视频 · 逐镜表演与运镜', 2640, 0, 850, 750, '05 生成视频')
for board in (images, videos):
    for shot in board['settings']['shots']:
        # New production starts with drafts: the old take is not an approved new result.
        shot.update(status='draft', outputEnabled=False, output_images=[], selectedImageIndex=-1,
                    image_url='', output_url='', video_url='')
        shot.pop('provenance', None)
        i = int(shot['id']) - 1
        original = source['cartoon-board']['settings']['shots'][i]
        shot.update(dialogue=original['dialogue'], sound=original['sound'], duration='5s')
        if board is videos:
            shot['imageSource'] = {'nodeId': 'prod-images', 'shotId': shot['id']}
for id in ['prod-script', 'prod-lin', 'prod-chen', 'prod-scene', 'prod-look-lin', 'prod-look-chen', 'prod-look-scene']:
    link(id, 'prod-images')
link('prod-images', 'prod-videos')
timeline = take(next(n for n in clear['nodes'] if n['id'] == 'clear-timeline'), 'prod-timeline', '06 剪辑 · 选片 / 排序 / 裁切', 3680, 0, 620, 430, '06 剪辑与声音交付')
link('prod-videos', 'prod-timeline')
audio = take(source['cartoon-audio'], 'prod-audio', '声音与字幕 · 后期交接单', 3680, 580, 620, 520, '06 剪辑与声音交付')
project = dict(version='3.8.7', type='project', projectName='最后一单｜标准短剧制作工作流',
               nodes=nodes, connections=edges, history=[], annotations=[], assetManifest={},
               view={'x':100, 'y':110, 'zoom':.26})
(P/'project.json').write_text(json.dumps(project, ensure_ascii=False, indent=2) + '\n')
with zipfile.ZipFile(P/'最后一单-标准短剧制作工作流.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(P/'project.json', 'project.json')
    z.write(P.parent/'clear-cartoon-workflow/assets/visual-reference.png', 'assets/visual-reference.png')
print(f'{len(nodes)} nodes / {len(edges)} connections / 12 paired draft shots')
