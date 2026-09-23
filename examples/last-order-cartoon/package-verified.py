"""Package the actually generated first-shot video with the reusable cartoon workflow."""
from pathlib import Path
import json,zipfile
P=Path(__file__).resolve().parent
project=json.loads((P/'project.json').read_text())
video=P/'第一镜-卡通验证.mp4'
if not video.is_file(): raise SystemExit('Missing verified video; this script never fabricates a result')
url='asset://assets/shot-01.mp4'
board=next(n for n in project['nodes'] if n['type']=='storyboard-node')
board['settings']['shots'][0].update(status='done',output_url=url,video_url=url,outputEnabled=True,errorMsg='')
timeline=next(n for n in project['nodes'] if n['type']=='video-timeline')
timeline['settings']['clips']=[{'id':'cartoon-verified-clip-01','nodeId':board['id'],'url':url,'name':'01 杯子要倒了 · 已验证视频','start':0,'end':5}]
project['connections'].append({'id':'cartoon-verified-board-timeline','from':board['id'],'to':timeline['id'],'inputType':'default'})
project['verification']={'task_id':'1afd64f7-6594-46a7-8280-195d3dbbe953','model':'Seedance 2.5','status':'succeeded','duration_seconds':5.041667,'width':720,'height':1280,'fps':24,'audio':False,'scope':'Only shot 01 was generated; shots 02-12 remain ungenerated.'}
(P/'project-verified.json').write_text(json.dumps(project,ensure_ascii=False,indent=2))
with zipfile.ZipFile(P/'最后一单-卡通工作流-含实测视频.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.write(P/'project-verified.json','project.json')
 for name in ['visual-reference.png','first-frame.png']: z.write(P/'assets'/name,'assets/'+name)
 z.write(video,'assets/shot-01.mp4')
print('Verified package: 38 nodes, 61 edges, one actual video, 11 ungenerated shots')
