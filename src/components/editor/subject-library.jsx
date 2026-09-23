import { NativeSelect } from '@/components/ui/native-select';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { nodeText, nodeMedia, NODE_DEFINITIONS } from '@/lib/node-io';

export function SubjectLibrary({ entries, nodes, history, onSave, onInsert, normalizeAsset, charactersOnly = false, onCreateCharacter }) {
    const [draft, setDraft] = useState(null), [query, setQuery] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [filters, setFilters] = useState({});
    const profileFields = [['era', '时代'], ['gender', '性别'], ['age', '年龄'], ['species', '物种'], ['physique', '体格']];
    const catalog = entries.filter(item => item.kind === 'subject' && (!charactersOnly || item.category === 'character'));
    const subjects = catalog.filter(item => `${item.name} ${item.description}`.includes(query) && Object.entries(filters).every(([key, value]) => !value || item.profile?.[key] === value));
    const candidates = nodes.filter(node => node.type !== 'subject-reference').flatMap(node => [
        ...nodeMedia(node, value => value, history).map((media, index) => ({ ...media, id: `${node.id}:${index}`, name: node.title || NODE_DEFINITIONS[node.type]?.name || node.type })),
        ...nodeText(node).map((text, index) => ({ type: 'text', text, id: `${node.id}:text:${index}`, name: node.title || '文字说明' })),
    ]);
    return <div className="space-y-3 p-3">
        <div className="flex gap-2"><Input aria-label="搜索主体" placeholder="搜索角色、产品或主体" value={query} onChange={event => setQuery(event.target.value)} /><Button variant="outline" onClick={() => { setDraft({ name: '', description: '', category: charactersOnly ? 'character' : 'subject', resources: [] }); setError(''); }}>新建</Button></div>
        {charactersOnly && <><div className="grid grid-cols-2 gap-2">{profileFields.map(([key, label]) => <NativeSelect key={key} aria-label={`按${label}筛选角色`} value={filters[key] || ''} onChange={event => setFilters({ ...filters, [key]: event.target.value })}><option value="">{label}不限</option>{[...new Set(catalog.map(item => item.profile?.[key]).filter(Boolean))].map(value => <option key={value}>{value}</option>)}</NativeSelect>)}</div>{onCreateCharacter && <Button type="button" variant="ghost" size="sm" onClick={onCreateCharacter}>从视频创建角色</Button>}<p className="text-xs text-muted-foreground">你的角色资料与参考素材</p></>}
        {draft && <form className="space-y-3 rounded-xl border border-border p-3" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const resources = await Promise.all(draft.resources.map(async item => item.url && normalizeAsset ? { ...item, url: await normalizeAsset(item.url) } : item)); await onSave({ ...draft, resources, name: draft.name.trim(), kind: 'subject' }); setDraft(null); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>
            <Input aria-label="主体名称" placeholder="主体名称" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required />
            <Textarea aria-label="主体描述" placeholder="需要保持一致的外观、声音或产品特征" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} />
            <NativeSelect aria-label="资料类型" value={draft.category || 'subject'} onChange={event => setDraft({ ...draft, category: event.target.value })}><option value="subject">主体</option><option value="character">角色</option></NativeSelect>
            {draft.category === 'character' && <div className="grid grid-cols-2 gap-2">{profileFields.map(([key, label]) => <Input key={key} aria-label={`角色${label}`} placeholder={label} value={draft.profile?.[key] || ''} onChange={event => setDraft({ ...draft, profile: { ...draft.profile, [key]: event.target.value } })} />)}</div>}
            <p className="text-xs text-muted-foreground">选择画布参考素材</p>
            <div className="max-h-48 space-y-2 overflow-y-auto">{candidates.map(resource => <Label key={resource.id} className="flex items-start gap-2 text-xs"><Checkbox checked={draft.resources.some(item => item.id === resource.id)} onCheckedChange={checked => setDraft({ ...draft, resources: checked ? [...draft.resources, resource] : draft.resources.filter(item => item.id !== resource.id) })} /><span className="min-w-0 truncate">{resource.name} · {({ image: '图片', video: '视频', audio: '音频', text: '文字' })[resource.type] || resource.type}</span></Label>)}</div>
            {draft.resources.map((resource, index) => <div key={resource.id} className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate">{index + 1}. {resource.name}</span><Button type="button" variant="ghost" size="sm" disabled={!index} aria-label={`上移参考 ${index + 1}`} onClick={() => { const resources = [...draft.resources]; [resources[index - 1], resources[index]] = [resources[index], resources[index - 1]]; setDraft({ ...draft, resources }); }}>↑</Button></div>)}
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}<div className="flex gap-2"><Button type="submit" disabled={busy || !draft.name.trim()}>保存主体</Button><Button variant="ghost" type="button" onClick={() => setDraft(null)}>取消</Button></div>
        </form>}
        {subjects.map(subject => <article key={subject.id} className="rounded-xl border border-border p-3"><p className="font-medium">{subject.name}</p><p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{subject.description}</p><p className="mt-2 text-xs text-muted-foreground">{subject.resources?.length || 0} 项参考</p><div className="mt-2 flex gap-2"><Button variant="secondary" size="sm" onClick={() => onInsert(subject)}>放入画布</Button><Button variant="ghost" size="sm" onClick={() => setDraft({ ...subject, resources: subject.resources || [] })}>编辑</Button></div></article>)}
        {!subjects.length && !draft && <p className="py-8 text-center text-sm text-muted-foreground">{charactersOnly ? '暂无角色' : '暂无主体'}</p>}
    </div>;
}
