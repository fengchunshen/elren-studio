from pathlib import Path
import json, zipfile
P=Path(__file__).resolve().parent
style='原创二维赛璐璐卡通，清晰墨线轮廓，扁平色块与分层阴影，夸张而简洁的动物造型，9:16竖屏，雨夜悬疑氛围，深青阴影、琥珀暖光；仅拟人动物角色，不出现人类、真人照片、写实皮肤、真实毛发、3D真人拟真，不加字幕或品牌。'
lin='林夏，成年拟人奶油色猫店员，明确的三角猫耳、大琥珀色椭圆眼、深灰侧卷额发、白色衬衫、森林绿围裙、深灰长裤、圆润猫爪和长猫尾。二维卡通比例，无人类脸孔和人手。外冷内热，先怀疑再求证；弧线：不信→验证→主动锁门。声音清亮略沙哑，短句。'
chen='陈默，成年拟人灰兔顾客，两只修长兔耳，其中一只耳尖微弯，白色小口鼻、简洁椭圆眼、炭灰雨衣夹克、黑色内搭，圆润兔爪持折叠白色小票。二维卡通比例，无人类脸孔和人手。被困在同一夜，焦急而克制；弧线：焦虑→释然→恐惧。声音低沉。'
scene='同一家小便利店。柜台固定在画面左侧，玻璃入口在后方右侧，冰柜冷光、柜台暖光，门外下雨。白色陶瓷杯在柜台靠店员一侧，陈默站顾客一侧；人物视线遵守柜台轴线，不越轴。小票是无品牌白纸，文字后期叠加。全片不出现第三个人。'
shots=[
('杯子要倒了','特写 / 85mm / 固定','柜台上的白杯立在边缘，林夏袖口刚接近杯子，杯子尚未倾倒。','白杯缓慢倾斜，林夏的猫爪及时扶稳，动作一次完成，机位固定。','陈默（画外）：别碰。杯子会倒。','雨声；杯底轻响','lin'),
('你怎么知道','近景 / 50mm / 缓推','林夏站在柜台后，低头看向被扶稳的杯子。','林夏抬眼望向画面右侧顾客，眉头轻皱，镜头缓推。','林夏：你怎么知道？','冰柜低鸣','lin'),
('午夜别开门','中近景 / 50mm / 固定','陈默站在柜台另一侧，雨珠挂在夹克上，握着小票。','陈默看向左侧店员，再把视线转向右后方玻璃门。','陈默：十二点，别开门。','远处闷雷','chen'),
('凭什么信你','过肩 / 50mm / 固定','从陈默右肩后看林夏，柜台和白杯位置不变。','林夏轻轻后退半步，手留在柜台上，警惕看着陈默。','林夏：凭什么信你？','音乐开始低频脉冲','both'),
('灯将熄灭','近景 / 50mm / 固定','陈默抬眼看顶灯，嘴唇紧抿。','陈默轻抬食指提示等待，视线回到店员。','陈默：灯会灭。然后，你的手机会响。','低频声收紧','chen'),
('预言验证','中景 / 35mm / 固定','林夏位于暖光柜台后，冷光冰柜和玻璃门可见。','暖色顶灯熄灭一次，保留冰柜弱冷光；林夏肩膀轻颤，禁止全黑。','无对白','灯管啪一声；随后手机铃声','lin'),
('别接电话','俯拍特写 / 85mm / 固定','柜台上一部黑色手机，屏幕无可读文字，白杯位于画面边缘。','手机轻微振动，林夏猫爪停在屏幕上方，不触屏。','陈默（画外）：也别接。','手机铃声持续后切断','lin'),
('她选择相信','中景 / 35mm / 固定','林夏站在玻璃门内侧，右手靠近门锁，门外仅雨和路灯。','林夏转动门锁，回头看向店内；不打开门，不出现门外人物。','无对白','锁舌咔哒；音乐暂缓','lin'),
('第八次','近景 / 50mm / 缓推','陈默靠着柜台，握小票的手放松一些。','陈默长呼一口气，眼中短暂释然。','陈默：我来过七次。只有这次，你没开门。','雨声短暂变清晰','chen'),
('小票的秘密','极近特写 / 85mm / 固定','陈默手中白色小票摊开，占画面中部，纸面留空，兔爪为简洁圆润动画造型。','兔爪轻轻展开小票后停稳，纸面保持干净可叠字。','无对白；后期小票文字：第八次 / 00:00','纸张摩擦；一次心跳','chen'),
('为什么发抖','近景 / 50mm / 固定','林夏回到柜台附近，皱眉看向陈默，背景玻璃门保持同侧。','林夏察觉异常，目光从陈默的兔爪移到脸上。','林夏：那你为什么还在发抖？','音乐抽空；门外两下敲击','lin'),
('提前的敲门声','近景 / 50mm / 极慢推','陈默侧脸近景，右后方玻璃门虚化，门外没有人形。','陈默骤然望向玻璃门，瞳孔紧张，最后半秒冻结式停顿，不切镜。','陈默：因为这次……敲门提前了。','第三下敲门；尾帧切黑','chen'),
]
script='# 《最后一单·雨夜来客》第一集：别开门\n\n原创二维拟人动物悬疑动画；60秒；9:16；两人一景。\n\n一句话：顾客用预言阻止夜班店员开门，却发现第八次循环已经改变。\n\n'
for i,(title,camera,frame,motion,line,sound,who) in enumerate(shots):
 script+=f'{i*5:02d}–{(i+1)*5:02d}秒｜{title}\n{motion}\n{line}\n声音：{sound}\n\n'
script+='结尾悬念：敲门者是谁，为什么循环会提前？后续集以每次改变一个选择推进；首集不给超自然规则作完整解释。\n'
(P/'剧本.md').write_text(script)
nodes=[]; edges=[]
def add(id,type,title,x,y,settings,group='01 编剧与设定',w=340,h=300,**kw):
 n=dict(id=id,type=type,title=title,x=x,y=y,width=w,height=h,settings=settings,workflowGroup={'id':'cartoon-'+group[:2],'name':group},**kw);nodes.append(n);return n

def link(a,b,port='default'):
 edges.append(dict(id=f'cartoon-edge-{len(edges)+1}',**{'from':a,'to':b},inputType=port))
add('cartoon-brief','text-node','01 创意简报',0,0,{'text':'《最后一单·雨夜来客》\n60秒竖屏都市悬疑｜2人 / 1场景 / 12镜\n3秒钩子：杯子尚未倒，陌生人先提醒。\n中段：预言接连验证，店员主动锁门。\n尾钩：第八次循环，敲门提前。\n目标：先验剧本、定妆、首帧，再逐镜视频与剪辑。','prompt':'基于简报写60秒可拍短剧，严格两人一景，开头3秒有钩子，结尾留悬念；每段给动作、对白、声音。不要添加第三角色。'})
add('cartoon-script','text-node','02 完整剧本 · 60秒',0,390,{'text':script,'prompt':'修订上游剧本，保留两人、一个便利店、12个5秒镜头及循环悬念。对白口语化；输出逐镜动作、对白、声音，不增加角色。'},h=440)
link('cartoon-brief','cartoon-script')
for id,title,txt,y in [('lin','03 人设 · 林夏',lin,0),('chen','04 人设 · 陈默',chen,390),('scene','05 场景与连续性',scene,780)]:
 add('cartoon-'+id,'text-node',title,460,y,{'text':txt+'\n\n'+style},h=300)
 link('cartoon-script','cartoon-'+id)
add('cartoon-reference','input-image','视觉参考板 · imagegen',0,920,{},w=340,h=180,content='asset://assets/visual-reference.png',dimensions={'w':1774,'h':887})
for id,y,desc in [('lin',0,lin),('chen',390,chen),('scene',780,scene)]:
 prompt=(f'依据设定生成{id}的单张'+('空场景全景，不出现人物。' if id=='scene' else '卡通角色设定图，正面全身，完整耳朵、猫尾或兔耳与服装。')+'参考板仅用于对应人物或场景，输出不要拼图。'+desc+style)
 add('cartoon-look-'+id,'gen-image',{'lin':'06 林夏定妆','chen':'07 陈默定妆','scene':'08 便利店空镜'}[id],920,y,{'model':'','ratio':'9:16','resolution':'1K','prompt':prompt,'imageConcurrency':1,'concurrentImages':1},'02 视觉开发',h=310)
 link('cartoon-'+id,'cartoon-look-'+id);link('cartoon-reference','cartoon-look-'+id)
shot_rows=[]
for i,(title,camera,frame,motion,line,sound,who) in enumerate(shots,1):
 sid=f'{i:02}'; x=1440+(i-1)%4*480;y=(i-1)//4*1140
 identity=lin if who=='lin' else chen if who=='chen' else lin+' '+chen
 fp=style+'\n'+scene+'\n'+identity+'\n'+camera+'\n单镜首帧：'+frame+'\n严格使用已连接人物定妆与场景参考，保持猫耳或兔耳、毛色、额发、服装与卡通轮廓。只输出一幅完整画面。'
 if i >= 7: fp+='\n灯光连续性：暖色顶灯已经熄灭，覆盖先前暖光设定，仅保留冰柜冷光与门外路灯。'
 vp=style+'\n'+camera+'\n以参考图为第一帧，5秒单镜头：'+motion+'\n保持猫或兔的卡通脸部、衣服、场景和物体稳定。仅生成画面，对白音效后期加入，不新增对白口型和字幕。'
 if i >= 7: vp+='\n顶灯保持熄灭，仅冰柜冷光和门外路灯，不恢复暖光。'
 add('cartoon-frame-'+sid,'gen-image',sid+' '+title+' · 首帧',x,y,{'model':'','ratio':'9:16','resolution':'1K','prompt':fp,'imageConcurrency':1,'concurrentImages':1},'03 逐镜制作',h=350)
 for person in (['lin','chen'] if who=='both' else [who]):link('cartoon-look-'+person,'cartoon-frame-'+sid)
 link('cartoon-look-scene','cartoon-frame-'+sid)
 add('cartoon-video-'+sid,'gen-video',sid+' '+title+' · 视频',x,y+470,{'model':'','duration':'5s','ratio':'9:16','resolution':'720p','videoPrompt':vp},'03 逐镜制作',h=350)
 link('cartoon-frame-'+sid,'cartoon-video-'+sid,'veo_start')
 shot_rows.append(dict(id='cartoon-shot-'+sid,scene_index=i,sceneIndex=1,shotNumber=i,title=title,description=f'{i*5-5:02d}–{i*5:02d}s｜{camera}｜{line}｜{sound}',prompt=vp,imagePrompt=fp,dialogue=line,sound=sound,duration='5s',ratio='9:16',resolution='720p',model='',status='draft',image_url='',video_url='',output_url='',outputEnabled=False,selectedImageIndex=-1,referenceImages=[],output_images=[]))
add('cartoon-board','storyboard-node','09 总分镜表 · 12镜60秒',0,1300,{'projectTitle':'最后一单｜12镜×5秒','mode':'video','viewMode':'cards','scriptText':script,'shots':shot_rows,'scriptExpanded':False,'tableMarkdownCollapsed':True},'04 分镜与交付',w=1150,h=680)
link('cartoon-script','cartoon-board')
add('cartoon-timeline','video-timeline','10 镜头剪辑 · 01→12',0,2130,{'clips':[],'size':'720x1280'},'04 分镜与交付',w=620,h=300)
for i in range(1,13):link(f'cartoon-video-{i:02}','cartoon-timeline')
add('cartoon-audio','text-node','11 配音与声音清单',720,2130,{'text':'配音脚本：\n'+'\n'.join(f'{(i-1)*5:02d}–{i*5:02d}秒 {s[4]}' for i,s in enumerate(shots,1))+'\n\n林夏：清亮略哑，短句；陈默：低沉压抑。只用授权音色。\n雨声贯穿；杯响、灯灭、铃声、锁舌、纸声、三次敲门按分镜入点。\n对白与字幕需人工对齐，不预设平台已支持多轨配音混音。'},'04 分镜与交付',h=420)
add('cartoon-delivery','text-node','12 执行顺序与验收',0,2640,{'text':'1 读剧本和人设。\n2 选当前可用图片模型，生成06–08三个定妆/场景节点。\n3 先跑01首帧→01视频，再做其余镜头。每个节点只生成1条，失败只重试该节点。\n4 先验脸、服装、白杯位置、门的方向，再执行视频。\n5 视频01–12完成后，选中时间线点击“添加已连接视频”，按编号排序并裁至各5秒。\n6 导出画面，外部剪辑软件配音、叠字幕和小票文字，完成60秒成片。\n总分镜表是审阅用，与右侧逐镜节点不自动双向同步；改剧本时同时更新受影响镜头。\n图像参考是实际imagegen产物；本包未将静图冒充平台视频生成结果。'},'04 分镜与交付',w=1150,h=350)
# A separate imagegen input is ready for an initial image-to-video test.
add('cartoon-first-frame-ready','input-image','01 卡通首帧素材 · imagegen',460,-500,{},'01 编剧与设定',w=300,h=380,content='asset://assets/first-frame.png',dimensions={'w':941,'h':1672})
for edge in edges:
 if edge['from']=='cartoon-frame-01' and edge['to']=='cartoon-video-01': edge['from']='cartoon-first-frame-ready'
first=shot_rows[0]
first.update(image_url='asset://assets/first-frame.png',image_filename='01 卡通首帧素材 · imagegen',image_urlSource={'nodeId':'cartoon-first-frame-ready','name':'01 卡通首帧素材 · imagegen'})
for n in nodes:
 if n['id']=='cartoon-video-01': n['settings']['useFirstLastFrame']=True
 if n['type']=='text-node' and n['id']=='cartoon-delivery': n['settings']['text']='卡通版：先用已提供的01卡通首帧素材验证5秒视频。其余11镜先按卡通参考板生成猫店员、兔顾客和场景，再逐镜出图。所有提示词保持二维赛璐璐拟人动物造型。参考板及01首帧由imagegen生成；视频需由平台模型实际生成。审核以供应商返回为准。'
# Model bindings verified against the local catalog on 2026-09-22.
for n in nodes:
 if n['type']=='gen-image': n['settings']['model']='77ccf29c-3da2-450c-8631-04c27084ee51'
 if n['type']=='gen-video':
  n['settings'].update(model='9b76ae96-c1e4-4dc6-aa65-9e3b9a0e230c',useFirstLastFrame=True,customParams={'generate_audio':False})
for shot in shot_rows:
 shot.update(model='9b76ae96-c1e4-4dc6-aa65-9e3b9a0e230c',customParams={'generate_audio':False})
project=dict(version='3.8.7',type='project',projectName='最后一单｜卡通短剧工作流',nodes=nodes,connections=edges,history=[],annotations=[],assetManifest={},view={'x':110,'y':110,'zoom':0.45})
(P/'project.json').write_text(json.dumps(project,ensure_ascii=False,indent=2))
(P/'shots.json').write_text(json.dumps(shot_rows,ensure_ascii=False,indent=2))
(P/'人设与视觉规范.md').write_text('# 人设与视觉规范\n\n## 林夏\n'+lin+'\n\n## 陈默\n'+chen+'\n\n## 场景与轴线\n'+scene+'\n\n## 统一风格\n'+style+'\n\n## 连续性验收\n固定猫耳、猫尾、兔耳、额发、围裙与夹克；白杯仅在镜头1轻倒并被扶正，此后完好；门到镜头8才锁上，始终未打开。灯只在镜头6熄灭，镜头7–12改用冰柜冷光与门外路灯。小票文字后期叠加，禁止模型生成乱码。\n\n参考板由 Codex imagegen 生成，仅为视觉开发，不是已执行的平台模型任务。\n')
md='# 《最后一单·雨夜来客》分镜设计\n\n12镜×5秒＝60秒。对白可略跨镜，用听者反应镜头衔接。镜头6后只保留冷光与路灯。\n\n|镜头|时间|景别与机位|首帧与动作|对白/叠字|声音|\n|---|---|---|---|---|---|\n'
for i,s in enumerate(shots):md+=f'|{i+1:02}|{i*5:02}–{i*5+5:02}s|{s[1]}|{s[2]} {s[3]}|{s[4]}|{s[5]}|\n'
(P/'分镜设计.md').write_text(md)
with zipfile.ZipFile(P/'最后一单-卡通工作流.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.write(P/'project.json','project.json');z.write(P/'assets/visual-reference.png','assets/visual-reference.png');z.write(P/'assets/first-frame.png','assets/first-frame.png')
print(f'{len(nodes)} nodes / {len(edges)} edges / 12 shots / 60s')
