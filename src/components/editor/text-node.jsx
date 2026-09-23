import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { MediaUploadButton } from './media-upload-button';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import DOMPurify from 'dompurify';
import { Bold, Italic, List, ListOrdered, Minus, Copy, Maximize2, ArrowUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { EditorDialog } from './editor-dialog';
import { GenerationPanel, GenerationModelPicker } from './generation-controls';
import { useOverlaysSuspended } from '@/components/ui/overlay-suspension';

const plainDocument = text => ({ type: 'doc', content: String(text || '').split('\n').map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) });
export function RichTextBody({ node, selected, onChange }) {
    const suspended = useOverlaysSuspended();
    const callback = useRef(onChange); callback.current = onChange;
    const [host, setHost] = useState(null), [full, setFull] = useState(false);
    const mount = useCallback(element => setHost(element?.closest('.node-wrapper') || null), []);
    const editor = useEditor({ immediatelyRender: false, extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } })],
        content: node.settings?.richText ? DOMPurify.sanitize(node.settings.richText) : plainDocument(node.settings?.text),
        editorProps: { attributes: { role: 'textbox', 'aria-label': '脚本正文', 'aria-multiline': 'true', 'data-node-type': 'text-node', 'data-node-id': node.id, class: 'cursor-text outline-none' } },
        onUpdate: ({ editor }) => callback.current({ text: editor.getText(), richText: editor.getHTML() }),
    });
    useEditorState({ editor, selector: context => context.editor?.state.selection });
    useEffect(() => {
        if (!editor || editor.isDestroyed || !editor.schema) return;
        const html = node.settings?.richText;
        if (html ? editor.getHTML() !== html : editor.getText() !== (node.settings?.text || '')) editor.commands.setContent(html ? DOMPurify.sanitize(html) : plainDocument(node.settings?.text), { emitUpdate: false });
    }, [editor, node.settings?.text, node.settings?.richText]);
    const toolbar = editor && !editor.isDestroyed && editor.schema && <div className="absolute -top-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-popover p-1" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}>
        {[1, 2, 3].map(level => <Button key={level} variant={editor.isActive('heading', { level }) ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" aria-label={`标题 ${level}`} onClick={() => editor.chain().focus().toggleHeading({ level }).run()}>H{level}</Button>)}
        {[[Bold, '粗体', 'toggleBold'], [Italic, '斜体', 'toggleItalic'], [List, '无序列表', 'toggleBulletList'], [ListOrdered, '有序列表', 'toggleOrderedList'], [Minus, '分割线', 'setHorizontalRule']].map(([Icon, label, command]) => <Button key={command} variant="ghost" size="icon" className="h-7 w-7" aria-label={label} onClick={() => editor.chain().focus()[command]().run()}><Icon size={13} /></Button>)}
        <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-7">样式</Button></PopoverTrigger><PopoverContent className="w-52 space-y-2" onMouseDown={event => event.stopPropagation()}><NativeSelect aria-label="正文字号" value={node.settings?.textSize || 14} onChange={event => onChange({ textSize: Number(event.target.value) })}>{[12, 14, 16, 18, 24].map(size => <option key={size} value={size}>{size} px</option>)}</NativeSelect><NativeSelect aria-label="文字节点背景" value={node.settings?.textSurface || 'default'} onChange={event => onChange({ textSurface: event.target.value })}><option value="default">默认背景</option><option value="muted">柔和背景</option><option value="paper">阅读背景</option></NativeSelect></PopoverContent></Popover>
        <MediaUploadButton accept=".txt,.md,text/plain,text/markdown" label="导入长文" onFile={async file => { if (file.size > 5 * 1024 * 1024) throw new Error('文本不能超过 5 MB'); editor.commands.setContent(plainDocument(await file.text())); }} />
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="复制全文" onClick={() => navigator.clipboard.writeText(editor.getText())}><Copy size={13} /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="展开文本编辑" onClick={() => setFull(true)}><Maximize2 size={13} /></Button>
    </div>;
    return <div ref={mount} data-text-node-body className={`rich-text-content relative h-full cursor-grab overflow-y-auto p-4 active:cursor-grabbing ${node.settings?.textSurface === 'muted' ? 'bg-muted' : node.settings?.textSurface === 'paper' ? 'bg-background' : ''}`}
        onMouseDown={event => {
            if (event.target.closest('[contenteditable="true"], button, input, textarea, select, a, [role="dialog"]')) event.stopPropagation();
            else if (event.button === 0) event.preventDefault();
        }}>
        {!node.settings?.text && !selected && <p className="pointer-events-none absolute text-sm text-muted-foreground">输入脚本、说明或提示词…</p>}
        {full ? <EditorDialog isOpen onClose={() => setFull(false)} title="编辑文本" className="w-[900px]" bodyClassName="rich-text-content min-h-[50vh] p-6"><EditorContent editor={editor} /></EditorDialog> : <EditorContent editor={editor} style={{ fontSize: [12, 14, 16, 18, 24].includes(node.settings?.textSize) ? node.settings.textSize : 14 }} />}
        {selected && host && !full && !suspended && createPortal(toolbar, host)}
    </div>;
}

export function TextGenerationInspector({ node, models, onChange, onRun, onSettings }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const selected = models.some(item => (item._uid || item.id) === node.settings?.model);
    const generating = busy || node.settings?.textGenerating;
    const edit = patch => { setError(''); onChange(patch); };
    return <GenerationPanel label="文本生成设置">
        <Textarea aria-label="文本创作要求" value={node.settings?.generationPrompt || ''} onChange={event => edit({ generationPrompt: event.target.value })} placeholder="描述要撰写或修改的内容…" className="min-h-24 resize-none border-0 bg-transparent px-1 py-2 text-sm leading-relaxed shadow-none" />
        <div className="mt-3 flex items-center gap-2">
            <GenerationModelPicker kind="text" label="文本模型" settingsLabel="配置文字模型" models={models} value={node.settings?.model} onChange={model => edit({ model })} onSettings={onSettings} />
            <Button type="button" size="icon" className="ml-auto h-9 w-9 shrink-0 rounded-full shadow-none" aria-label={generating ? '正在生成文本' : '生成文本'} disabled={generating || !selected || !node.settings?.generationPrompt?.trim()} onClick={async () => { setBusy(true); setError(''); try { await onRun(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>{generating ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={17} />}</Button>
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </GenerationPanel>;
}
