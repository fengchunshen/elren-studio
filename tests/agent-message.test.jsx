import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AgentMessage, { normalizeAgentMarkdown } from '@/components/editor/agent-message';
afterEach(cleanup);

it('renders headings, emphasis, lists and tables instead of raw formatting tokens', () => {
    const {container}=render(<AgentMessage content={'## 制作方向\n\n**保持产品**\n\n- 冷色\n- 柔光\n\n| 镜头 | 时长 |\n| --- | --- |\n| 特写 | 5 秒 |'} />);
    expect(screen.getByRole('heading',{name:'制作方向'})).toBeTruthy();
    expect(container.querySelector('strong').textContent).toBe('保持产品');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(container.textContent).not.toContain('**');
});

it('repairs a whole markdown wrapper and escaped emphasis while preserving code literals', () => {
    const content='```markdown\n\\*\\*结果\\*\\*\n\n`**literal**`\n```';
    const {container}=render(<AgentMessage content={content} />);
    expect(container.querySelector('strong').textContent).toBe('结果');
    expect(container.querySelector('code').textContent).toBe('**literal**');
    expect(normalizeAgentMarkdown('```js\nconst value = "**x**";\n```')).toContain('const value = "**x**";');
});

it('removes scripts, media requests, unsafe links and layout injection', () => {
    const {container}=render(<AgentMessage content={'<script>alert(1)</script><img src="https://tracker.invalid/pixel"><p style="position:fixed">正文</p>\n\n[坏链接](javascript:alert(1))'} />);
    expect(container.querySelector('script,img,style,[style]')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
});
