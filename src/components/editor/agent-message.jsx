import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import './agent-message.css';

export function normalizeAgentMarkdown(content = '') {
    let text = String(content).replace(/\r\n/g, '\n');
    const wrapped = text.match(/^\s*```(?:markdown|md)\s*\n([\s\S]*?)\n```\s*$/i);
    if (wrapped) text = wrapped[1];
    // Some providers escape presentation markup twice. Repair paired emphasis
    // only outside code; literal asterisks in code/examples must remain intact.
    return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index) => index % 2 ? part
        : part.replace(/\\\*\\\*([^*\n]+?)\\\*\\\*/g, '**$1**')).join('');
}

export function agentMessageHtml(content) {
    return DOMPurify.sanitize(marked.parse(normalizeAgentMarkdown(content), { gfm:true, breaks:true }), {
        ALLOWED_TAGS:['p','br','strong','em','del','s','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code','table','thead','tbody','tr','th','td','a','hr'],
        ALLOWED_ATTR:['href','title','start','align'],
    });
}

export default function AgentMessage({ content }) {
    const html = useMemo(() => agentMessageHtml(content), [content]);
    return <div className="agent-message" dangerouslySetInnerHTML={{__html:html}} />;
}
