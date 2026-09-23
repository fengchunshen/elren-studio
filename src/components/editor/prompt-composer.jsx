import React, { useId, useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useEditor, EditorContent } from '@tiptap/react';
import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { GenerationChoice } from './generation-controls';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverAnchor, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { libraryScope, listLibraryEntries } from '@/services/workspaceLibrary';
import { activePromptReferences, promptToken, PROMPT_COMMANDS } from '@/lib/prompt-references';

const ReferenceToken = Node.create({
    name: 'promptReference', group: 'inline', inline: true, atom: true,
    addAttributes: () => ({ id: { default: '' }, label: { default: '' } }),
    parseHTML: () => [{ tag: 'span[data-prompt-reference]', getAttrs: element => ({ id: element.getAttribute('data-prompt-reference'), label: element.textContent.replace(/^@/, '') }) }],
    renderHTML: ({ node }) => ['span', { 'data-prompt-reference': node.attrs.id, class: 'rounded bg-muted px-1 text-foreground' }, `@${node.attrs.label}`],
    renderText: ({ node }) => promptToken(node.attrs),
});
function promptDocument(value) {
    return { type: 'doc', content: String(value || '').split('\n').map(line => {
        const content = []; let end = 0;
        for (const match of line.matchAll(/@\[([^\]]*)\]\(ref:([a-zA-Z0-9-]+)\)/g)) {
            if (match.index > end) content.push({ type: 'text', text: line.slice(end, match.index) });
            content.push({ type: 'promptReference', attrs: { id: match[2], label: match[1] } }); end = match.index + match[0].length;
        }
        if (end < line.length) content.push({ type: 'text', text: line.slice(end) });
        return { type: 'paragraph', content };
    }) };
}

export function PromptComposer({ value, references = [], candidates = [], kind = 'image', hasImageReference = false, onChange, normalizeAsset, compact = false, className, ...props }) {
    const sequence = useRef(0), listId = useId(), handlers = useRef({}), inserting = useRef(false), input = useRef(null), suggestions = useRef(null);
    const [trigger, setTrigger] = useState(null), [active, setActive] = useState(0), [library, setLibrary] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    let selected = [];
    try { selected = activePromptReferences(value, references); } catch (e) { /* Report when submitted; keep malformed text editable. */ }
    const entries = [...candidates, ...library];
    const imageReady = hasImageReference || selected.some(ref => ref.resources?.some(item => item.type === 'image'));
    const options = (trigger?.symbol === '/' ? PROMPT_COMMANDS.filter(item => item.kinds.includes(kind)) : entries)
        .filter(item => item.label.toLowerCase().includes((trigger?.query || '').toLowerCase()));
    const detect = editor => {
        if (!editor.state.selection.empty) { setTrigger(null); return; }
        const { $from, from } = editor.state.selection;
        const before = editor.state.doc.textBetween($from.start(), from, '\n', '\ufffc');
        const match = before.match(/(?:^|\s)([@/])([^\s@/\[\]]*)$/);
        setTrigger(match ? { symbol: match[1], query: match[2], start: from - match[2].length - 1, end: from } : null); setActive(0);
    };
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, bulletList: false, orderedList: false, horizontalRule: false, link: false }), ReferenceToken],
        content: promptDocument(value),
        editorProps: { attributes: { role: 'textbox', 'aria-label': props['aria-label'], 'aria-multiline': 'true', class: cn('min-h-20 whitespace-pre-wrap outline-none text-sm', className) }, handleKeyDown: (_, event) => handlers.current.key?.(event) || false },
        onUpdate: ({ editor }) => { if (!inserting.current) handlers.current.update(editor); },
        onFocus: () => handlers.current.focus?.(),
        onBlur: ({ event }) => handlers.current.blur?.(event),
        onSelectionUpdate: ({ editor }) => { if (!inserting.current) handlers.current.detect?.(editor); },
    });
    handlers.current.detect = current => { if (current.isFocused) detect(current); };
    handlers.current.blur = event => { if (!suggestions.current?.contains(event.relatedTarget)) setTrigger(null); };
    handlers.current.update = current => { sequence.current++; onChange(current.getText({ blockSeparator: '\n' }), references); detect(current); };
    useEffect(() => { if (editor && !editor.isDestroyed && editor.schema && editor.getText({ blockSeparator: '\n' }) !== value) editor.commands.setContent(promptDocument(value), { emitUpdate: false }); }, [editor, value]);
    useEffect(() => { if (editor && !editor.isDestroyed && editor.schema) editor.setEditable(!busy, false); }, [editor, busy]);
    useEffect(() => () => { sequence.current++; }, []);
    useEffect(() => {
        suggestions.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [active, trigger?.query]);
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const element = editor.view.dom;
        element.setAttribute('aria-expanded', String(Boolean(trigger)));
        element.setAttribute('aria-autocomplete', 'list');
        if (trigger) {
            element.setAttribute('aria-controls', listId);
            if (options[active]) element.setAttribute('aria-activedescendant', `${listId}-${active}`);
            else element.removeAttribute('aria-activedescendant');
        } else {
            element.removeAttribute('aria-controls');
            element.removeAttribute('aria-activedescendant');
        }
    }, [editor, trigger, active, listId, options.length]);
    const choose = async option => {
        if (busy || !editor || !trigger || (option.requiresImage && !imageReady)) return;
        setBusy(true); setError('');
        const pending = ++sequence.current;
        try {
            let insertion = [{ type: 'text', text: option.text + ' ' }], next = references;
            if (trigger.symbol === '@') {
                const scope = libraryScope();
                const resources = await Promise.all(option.resources.map(async resource => resource.url && normalizeAsset ? { ...resource, url: await normalizeAsset(resource.url) } : resource));
                if (scope !== libraryScope()) throw new Error('账号已切换，请重新选择参考');
                const ref = { id: crypto.randomUUID(), label: option.label, sourceNodeId: option.sourceNodeId, role: 'reference', resources };
                insertion = [{ type: 'promptReference', attrs: { id: ref.id, label: ref.label } }, { type: 'text', text: ' ' }]; next = [...references, ref];
            }
            if (pending !== sequence.current || editor.isDestroyed) return;
            inserting.current = true;
            editor.chain().focus().insertContentAt({ from: trigger.start, to: trigger.end }, insertion).run();
            inserting.current = false;
            onChange(editor.getText({ blockSeparator: '\n' }), next); setTrigger(null);
        } catch (e) { setError(e.message); } finally { inserting.current = false; setBusy(false); }
    };
    handlers.current.key = event => {
        if (event.isComposing || event.keyCode === 229 || !trigger) return false;
        if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return false;
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Escape') setTrigger(null);
        else if (event.key === 'ArrowDown') setActive(index => Math.min(index + 1, options.length - 1));
        else if (event.key === 'ArrowUp') setActive(index => Math.max(index - 1, 0));
        else if (['Enter', 'Tab'].includes(event.key) && options[active]) choose(options[active]);
        return true;
    };
    const loadLibrary = async () => {
        try {
            const scope = libraryScope(), items = await listLibraryEntries(scope);
            if (scope !== libraryScope()) return;
            setLibrary(items.filter(item => ['subject', 'asset'].includes(item.kind)).map(item => ({ id: item.id, label: item.name, resources: item.kind === 'subject' ? [...(item.description ? [{ type: 'text', text: item.description }] : []), ...(item.resources || [])] : [item] })).filter(item => item.resources.length));
        } catch (e) { setError(e.message); }
    };
    handlers.current.focus = loadLibrary;
    return <div>
        <Popover open={Boolean(trigger)} onOpenChange={open => { if (!open) setTrigger(null); }} modal={false}>
            <PopoverAnchor asChild><div ref={input} className="relative px-1 py-2">
                {!value && <p className="pointer-events-none absolute text-sm text-muted-foreground">{props.placeholder}</p>}
                <EditorContent editor={editor} />
            </div></PopoverAnchor>
            {trigger && <PopoverContent side="top" align="start" sideOffset={8} aria-label={trigger?.symbol === '@' ? '引用素材建议' : '快捷指令建议'}
                className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-24px)] rounded-2xl bg-popover p-1.5"
                onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
                onInteractOutside={event => { if (input.current?.contains(event.target)) event.preventDefault(); }}
                onEscapeKeyDown={() => setTrigger(null)} onMouseDown={event => event.preventDefault()}
                onMouseUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
                <ScrollArea className="max-h-[min(224px,var(--radix-popover-content-available-height))]" viewportClassName="max-h-[min(224px,var(--radix-popover-content-available-height))]">
                    <div ref={suggestions} role="listbox" id={listId} aria-label={trigger?.symbol === '@' ? '引用素材' : '快捷指令'}>
                        {options.map((option, index) => <Button type="button" role="option" id={`${listId}-${index}`} aria-selected={index === active} key={option.id} variant={index === active ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start truncate rounded-lg" disabled={busy || (option.requiresImage && !imageReady)} onClick={() => choose(option)}>{option.label}{option.requiresImage && !imageReady && <span className="ml-auto text-xs text-muted-foreground">请先添加参考图</span>}</Button>)}
                        {!options.length && <p className="p-2 text-xs text-muted-foreground">没有匹配的{trigger?.symbol === '@' ? '参考素材' : '指令'}</p>}
                    </div>
                </ScrollArea>
            </PopoverContent>}
        </Popover>
        <div className={cn("flex flex-wrap gap-1", selected.length > 0 && "mt-1")}>
            {selected.map(reference => <Popover key={reference.id}><PopoverTrigger asChild><Button type="button" variant="secondary" size="sm" className="h-7 max-w-48 truncate text-xs">@{reference.label}</Button></PopoverTrigger>
                <PopoverContent className="w-64 space-y-2" onMouseDown={e => e.stopPropagation()}><p className="text-xs">本次引用 · {reference.resources.length} 项内容</p><div className="flex max-h-28 gap-1 overflow-auto">{reference.resources.map((resource, index) => resource.type === 'image' ? <img key={index} src={resource.url} alt={reference.label} className="h-20 w-20 rounded object-contain" /> : <span key={index} className="text-xs">{resource.text || ({ video: '视频', audio: '音频' })[resource.type]}</span>)}</div>
                    {reference.resources.every(item => item.type === 'image') && kind === 'video' && <GenerationChoice label={`${reference.label} 用途`} value={reference.role} options={[{ value: 'reference', label: '内容参考' }, { value: 'first_frame', label: '首帧' }, { value: 'last_frame', label: '尾帧' }]} onChange={role => onChange(value, references.map(item => item.id === reference.id ? { ...item, role } : item))} />}
                    {reference.sourceNodeId && <p className="text-xs text-muted-foreground">移除时同时断开该来源的参考连线。</p>}
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange(value.replaceAll(promptToken(reference), ''), references.filter(item => item.id !== reference.id))}>移除引用</Button>
                </PopoverContent>
            </Popover>)}
        </div>
        {compact ? <p className="sr-only">输入 @ 引用画布或素材库，输入 / 使用快捷指令。</p> : <p className="mt-1 text-[11px] text-muted-foreground">@ 引用画布或素材库 · / 快捷指令</p>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>;
}
