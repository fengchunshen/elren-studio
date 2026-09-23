from pathlib import Path
from copy import deepcopy
import json,zipfile
P=Path(__file__).resolve().parent
old=json.loads((P.parent/'last-order-cartoon/project-verified.json').read_text())
byid={n['id']:n for n in old['nodes']}
shots=byid['cartoon-board']['settings']['shots']
nodes=[]
def add(id,type,title,x,y,w,h,settings,stage,**kw):
 n=dict(id=id,type=type,title=title,x=x,y=y,width=w,height=h,settings=settings,workflowGroup={'id':'clear-stage-'+stage[0:2],'name':stage},**kw);nodes.append(n);return n
script=byid['cartoon-script']['settings']['text']
add('clear-script','text-node','01 剧本 · 12镜60秒',0,0,350,390,{'text':script},'01 故事与视觉设定')
style='\n\n'.join(byid['cartoon-'+s]['settings']['text'] for s in ['lin','chen','scene'])
add('clear-style','text-node','02 人物与场景 · 猫店员 / 兔顾客',0,460,350,310,{'text':style},'01 故事与视觉设定')
add('clear-reference','input-image','03 视觉设定板 · 已绘制',0,840,350,190,{},'01 故事与视觉设定',content='asset://assets/visual-reference.png',dimensions={'w':1774,'h':887})
images=[];videos=[]
for i,shot in enumerate(shots,1):
 sid=f'{i:02}'
 image=dict(id=sid,title=shot['title'],scene_index=i,description=shot['description'],prompt=shot['imagePrompt'],model='77ccf29c-3da2-450c-8631-04c27084ee51',ratio='9:16',resolution='1K',status='draft',image_url='',referenceImages=[],output_images=[],selectedImageIndex=-1,outputEnabled=False)
 video=dict(id=sid,title=shot['title'],scene_index=i,description=shot['description'],prompt=shot['prompt'],model='9b76ae96-c1e4-4dc6-aa65-9e3b9a0e230c',ratio='9:16',resolution='720p',duration='5s',status='draft',image_url='',output_url='',video_url='',outputEnabled=False,customParams={'generate_audio':False},imageSource={'nodeId':'clear-images','shotId':sid})
 if i==1:
  image.update(status='done',output_images=['asset://assets/first-frame.png'],selectedImageIndex=0,outputEnabled=True,provenance='已绘制卡通首帧 · Codex imagegen')
  video.update(status='done',output_url='asset://assets/shot-01.mp4',video_url='asset://assets/shot-01.mp4',outputEnabled=True,provenance='Seedance 2.5 已实测；任务1afd64f7-6594-46a7-8280-195d3dbbe953')
 images.append(image);videos.append(video)
add('clear-images','storyboard-node','04 分镜画面 · 先出图，再确认',480,0,850,750,{'projectTitle':'最后一单｜分镜画面','mode':'image','workflowStage':'image','viewMode':'cards','shots':images,'scriptText':script},'02 分镜画面')
add('clear-videos','storyboard-node','05 镜头动画 · 自动使用对应首帧',1450,0,850,750,{'projectTitle':'最后一单｜镜头动画','mode':'video','workflowStage':'video','viewMode':'cards','shots':videos},'03 镜头动画')
add('clear-timeline','video-timeline','06 剪辑交付 · 同步确认的镜头',2420,0,600,420,{'size':'720x1280','clips':[]},'04 剪辑交付')
pairs=[('clear-script','clear-images'),('clear-style','clear-images'),('clear-reference','clear-images'),('clear-images','clear-videos'),('clear-videos','clear-timeline')]
connections=[dict(id=f'clear-edge-{i}',**{'from':a,'to':b},inputType='default') for i,(a,b) in enumerate(pairs,1)]
project=dict(version='3.8.7',type='project',projectName='最后一单｜六节点制作流程',nodes=nodes,connections=connections,history=[],annotations=[],assetManifest={},view={'x':100,'y':110,'zoom':.4})
(P/'project.json').write_text(json.dumps(project,ensure_ascii=False,indent=2))
with zipfile.ZipFile(P/'最后一单-清晰制作流程.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.write(P/'project.json','project.json')
 for path in (P/'assets').iterdir():z.write(path,'assets/'+path.name)
print('6 nodes / 5 edges / 12 paired shots / one real verified video')
