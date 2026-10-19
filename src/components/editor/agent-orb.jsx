import React from 'react';
import { ElrenColorField } from '@/components/brand/elren-color-field';

export default function AgentOrb() {
    return <span className="agent-orb" aria-hidden="true">
        <ElrenColorField variant="mark" className="agent-orb-field" />
        <span className="agent-orb-sheen" />
    </span>;
}
