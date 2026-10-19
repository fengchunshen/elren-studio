"""Evaluate recorded facts; do not equate process exit or assistant prose with success."""
import argparse
import hashlib
import json
from pathlib import Path


def evaluate(root):
    data=json.loads((root/'result.json').read_text())
    wire=json.loads((root/'model.json').read_text())
    nodes=data['snapshot']['nodes']; tasks=data['snapshot']['tasks']; audit=data['audit']
    name=data['case']; checks={}; observations=[]
    if data['mode']=='live' or name=='chain':
        checks['only_second_changed']=all(n['version']==1 and n['ratio']=='1:1' for n in [nodes[0],nodes[2]]) and nodes[1]['version']==2
        checks['second_portrait_cold']=nodes[1]['ratio']=='9:16' and '冷' in nodes[1]['prompt'] and '银色水杯' in nodes[1]['prompt']
        checks['references_preserved']=all(n['reference_ids']==['asset-cup-v1'] for n in nodes)
        checks['one_generation_for_second']=len(tasks)==1 and tasks[0]['node_id']=='shot-b'
        checks['queried_real_task']=any(a['tool']=='get_task' and a['result'].get('task_id')==tasks[0]['id'] for a in audit) if tasks else False
        checks['completed_all_turns']=data['execution']['returncode']==0 and all(json.loads(line).get('finish')=='completed' for line in data['execution']['stdout'].splitlines() if line.startswith('{'))
        if data['mode']=='live':
            premature=False; third_turn_regeneration=False
            for entry in wire:
                users=[m for m in entry['request']['messages'] if m.get('role')=='user']
                calls=entry['response']['choices'][0]['message'].get('tool_calls',[])
                submits=any(c['function']['name']=='submit_generation' for c in calls)
                premature|=len(users)==1 and submits
                third_turn_regeneration|=len(users)==3 and submits
            checks['first_turn_did_not_generate']=not premature
            checks['query_turn_did_not_regenerate']=not third_turn_regeneration
            checks['three_user_turns_completed']=len(data['execution']['stdout'].splitlines())==3
    elif name=='conflict':
        checks['stale_write_rejected']=any(a['result'].get('error')=='VERSION_CONFLICT' for a in audit)
        checks['manual_edit_preserved']=nodes[1]['prompt']=='用户手工修改：蓝色背景' and nodes[1]['version']==2
        checks['no_generation']=not tasks
    elif name in ['crash','restart','approval']:
        ex=data['execution']; recovery=ex.get('recovery',{})
        checks['recovery_completed']=recovery.get('returncode')==0
        checks['only_one_task']=len(tasks)==1
        checks['original_context_retained']=checks['recovery_completed'] and len(wire)>2 and any('生成选中的第二张' in str(m.get('content')) for m in wire[-1]['request']['messages'] if m.get('role')=='user')
        if name=='crash': checks['killed_after_commit']=ex.get('killed_after_commit') is True
        if name=='approval':
            checks['no_task_before_approval']=not ex['before_resume']['tasks']
            checks['paused_before_approval']='"waiting"' in ex['first']['stdout']
        if 'already exists' in recovery.get('stderr',''): observations.append('SDK cannot reopen persisted session: already exists')
    elif name=='steer':
        containing=[i for i,e in enumerate(wire) if any('停止后续生成' in str(m.get('content')) for m in e['request']['messages'] if m.get('role')=='user')]
        checks['followup_received']=bool(containing)
        observations.append('followup_first_model_request_index='+str(containing[0] if containing else None))
        checks['followup_before_original_turn_end']=bool(containing) and containing[0]<3
        observations.append('This is queued SDK input, not a demonstrated native cancel API')
    return dict(harness=data['harness'],case=name,mode=data['mode'],
                passed=all(checks.values()),checks=checks,observations=observations,
                seconds=data['seconds'],first_tool_seconds=data['first_tool_seconds'],
                model_requests=data['model_requests'],
                input_tokens=sum(u.get('prompt_tokens',0) for u in data['usage']) if data['mode']=='live' else None,
                output_tokens=sum(u.get('completion_tokens',0) for u in data['usage']) if data['mode']=='live' else None,
                cache_hit_tokens=sum(u.get('prompt_cache_hit_tokens',0) for u in data['usage']) if data['mode']=='live' else None,
                rejected_tool_calls=[a for a in audit if a['result'].get('error')],
                model_tool_names=sorted(t['function']['name'] for t in wire[0]['request'].get('tools',[])),
                evidence_sha256=hashlib.sha256((root/'result.json').read_bytes()).hexdigest())


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('directories',type=Path,nargs='+'); parser.add_argument('--out',type=Path)
    args=parser.parse_args(); results=[]
    for directory in args.directories:
        for root in sorted(directory.iterdir()):
            if (root/'result.json').exists(): results.append(evaluate(root))
    text=json.dumps(results,ensure_ascii=False,indent=2)
    if args.out: args.out.write_text(text+'\n')
    else: print(text)
