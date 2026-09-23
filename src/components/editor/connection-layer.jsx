import React, { memo, useMemo } from 'react';
import { Unlink } from 'lucide-react';
import { connectionPort } from '@/lib/node-io';

export const ConnectionLayer = memo(({
        connections,
        nodesMap,
        connectionsByNode,
        connectingSource,
        connectingTarget,
        connectingInputType,
        mousePos,
        getApiConfigByKey,
        selectedNodeId,
        onDisconnectConnection,
        visibleNodes
    }) => {
        // 连接线虚拟化：只渲染可见节点的连接线
        const visibleNodeIds = useMemo(() => {
            return new Set(visibleNodes.map(n => n.id));
        }, [visibleNodes]);

        const visibleConnections = useMemo(() => {
            return connections.filter(conn =>
                visibleNodeIds.has(conn.from) || visibleNodeIds.has(conn.to)
            );
        }, [connections, visibleNodeIds]);

        return (
            <div className="absolute inset-0 pointer-events-none overflow-visible w-full h-full">
                <svg data-connection-layer className="absolute inset-0 overflow-visible w-full h-full pointer-events-none">
                    {visibleConnections.map((conn) => {
                        // 使用 nodesMap 快速查找，O(1) 复杂度
                        const fromNode = nodesMap.get(conn.from);
                        const toNode = nodesMap.get(conn.to);
                        if (!fromNode || !toNode) return null;

                        // 检查连接线是否与选中节点相关
                        const isRelatedToSelected = selectedNodeId && (
                            fromNode.id === selectedNodeId ||
                            toNode.id === selectedNodeId
                        );
                        // 设置透明度：选中节点相关为100%，其他为35%
                        const opacity = isRelatedToSelected ? 1 : 0.35;

                        const startX = fromNode.x + fromNode.width - 4;
                        const startY = fromNode.y + fromNode.height / 2;

                        const endX = toNode.x + 4;
                        let endY = toNode.y + toNode.height / 2;

                        // 处理image-compare节点的多个输入点
                        if (toNode.type === 'image-compare') {
                            // 使用缓存的 connectionsByNode，避免重复 filter
                            const relevantConns = connectionsByNode.to.get(toNode.id) || [];
                            const idx = connectionPort(conn, relevantConns, toNode) === 'imageB' ? 1 : 0;
                            if (idx === 0) endY = toNode.y + toNode.height * 0.33;
                            else if (idx >= 1) endY = toNode.y + toNode.height * 0.66;
                        }

                        if (['oref', 'sref'].includes(conn.inputType)) endY = toNode.y + toNode.height * (conn.inputType === 'oref' ? 0.3 : 0.7);

                        if (['veo_start', 'veo_end'].includes(conn.inputType)) endY = toNode.y + toNode.height * (conn.inputType === 'veo_start' ? 0.3 : 0.7);


                        const dist = Math.abs(endX - startX);
                        const cp1X = startX + dist * 0.5;
                        const cp2X = endX - dist * 0.5;
                        const midX = (startX + endX) / 2;
                        const midY = (startY + endY) / 2;

                        return (
                            <g key={conn.id} data-connection-id={conn.id} className="connection-group" style={{ opacity }}>
                                {/* 透明路径用于点击检测连接线 */}
                                <path
                                    d={`M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`}
                                    stroke="transparent"
                                    strokeWidth="20"
                                    fill="none"
                                    style={{ pointerEvents: 'stroke' }}
                                />
                                <path d={`M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`} stroke="#18181b" strokeWidth="4" fill="none" />
                                <path d={`M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`} stroke="#71717a" strokeWidth="2" fill="none" />
                                <circle cx={startX} cy={startY} r="2" fill="#71717a" />
                                <circle cx={endX} cy={endY} r="2" fill="#71717a" />
                                {/* 删除按钮：使用更大的透明热区确保可点击，必须在最后渲染以覆盖透明 path */}
                                <g
                                    className="connection-delete cursor-pointer"
                                    style={{
                                        pointerEvents: 'auto',
                                        cursor: 'pointer'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onDisconnectConnection(conn.id);
                                    }}
                                    onMouseDown={(e) => {
                                        // 阻止事件冒泡，防止触发画布拖动
                                        e.stopPropagation();
                                        e.preventDefault();

                                    }}
                                >
                                    {/* 大的透明点击热区（半径25），确保完全覆盖透明 path 的 stroke（宽度20） */}
                                    <circle
                                        cx={midX}
                                        cy={midY}
                                        r="25"
                                        fill="transparent"
                                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                    />
                                    {/* 视觉元素 */}
                                    <circle cx={midX} cy={midY} r="12" fill="#ef4444" opacity="0.8" style={{ pointerEvents: 'none' }} />
                                    <circle cx={midX} cy={midY} r="8" fill="#ef4444" style={{ pointerEvents: 'none' }} />
                                    <Unlink size={10} className="text-white" x={midX - 5} y={midY - 5} style={{ pointerEvents: 'none' }} />
                                </g>
                            </g>
                        );
                    })}
                    {connectingSource && (() => {
                        // 使用 nodesMap 快速查找
                        const node = nodesMap.get(connectingSource);
                        if (!node) return null;
                        return <path d={`M ${node.x + node.width - 4} ${node.y + node.height / 2} C ${node.x + node.width + 100} ${node.y + node.height / 2}, ${mousePos.x - 100} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`} stroke="#60a5fa" strokeWidth="2" fill="none" strokeDasharray="4,4" />;
                    })()}
                    {connectingTarget && (() => {
                        // 使用 nodesMap 快速查找
                        const node = nodesMap.get(connectingTarget);
                        if (!node) return null;
                        // 从输入端口向左拖拽，连接线从左侧开始
                        const startX = node.x + 4;
                        let startY = node.y + node.height / 2;

                        // 处理Midjourney节点的oref和sref输入点
                        if (node.type === 'gen-image' && connectingInputType) {
                            const currentModel = getApiConfigByKey(node.settings?.model);
                            const isMidjourney = currentModel && (currentModel.id.includes('mj') || currentModel.provider.toLowerCase().includes('midjourney'));

                            if (isMidjourney) {
                                // 使用与连接线渲染相同的计算逻辑
                                const paddingTop = 12;
                                const timerHeight = 28;
                                const timerMarginBottom = 8;
                                const titleHeight = 16; // 标题高度 (text-xs ≈ 12px + line-height ≈ 16px)
                                const titleMarginBottom = 8;
                                const refAreaHeight = 60;
                                const refAreaMarginBottom = 8;
                                const promptAreaHeight = 100;
                                const promptAreaMarginBottom = 8;
                                const instructionGap = 6;
                                const instructionItemHeight = 16; // 每个指令项的实际高度（text-[10px] + flex items-center ≈ 16px）
                                const owInputHeight = 28; // ow输入框高度（px-2 py-1 + text-[10px] ≈ 28px）

                                const hasTimer = false; // 计时器是动态的，这里简化处理
                                // 使用缓存的 connectionsByNode，避免重复 some 计算
                                const toNodeConns = connectionsByNode.to.get(node.id) || [];
                                const hasRefArea = toNodeConns.some(c => !c.inputType || c.inputType === 'default');

                                let baseOffset = paddingTop;
                                if (hasTimer) {
                                    baseOffset += timerHeight + timerMarginBottom;
                                }
                                baseOffset += titleHeight + titleMarginBottom;
                                if (hasRefArea) {
                                    baseOffset += refAreaHeight + refAreaMarginBottom;
                                }
                                baseOffset += promptAreaHeight + promptAreaMarginBottom;

                                if (connectingInputType === 'oref') {
                                    startY = node.y + baseOffset + instructionItemHeight * 0.5;
                                } else if (connectingInputType === 'sref') {
                                    // sref在第三个指令位置：oref项(16px) + gap(6px) + ow项(owInputHeight ≈ 28px) + gap(6px) + sref项的中心(8px)
                                    startY = node.y + baseOffset + instructionItemHeight + instructionGap + owInputHeight + instructionGap + instructionItemHeight * 0.5;
                                }
                            }
                        }
                        else if (node.type === 'gen-video' && (connectingInputType === 'veo_start' || connectingInputType === 'veo_end')) {
                            const paddingTop = 12;
                            const timerHeight = 28;
                            const timerMarginBottom = 8;
                            const titleHeight = 16;
                            const titleMarginBottom = 8;
                            const refAreaHeight = 60;
                            const refAreaMarginBottom = 8;
                            const promptAreaHeight = Math.max(110, Math.min(180, node.height * 0.4));
                            const promptAreaMarginBottom = 8;
                            const panelPaddingTop = 12;
                            const panelTitleHeight = 14;
                            const panelDescHeight = 12;
                            const panelGap = 8;
                            const panelRowHeight = 18;
                            const panelRowGap = 8;

                            const hasTimer = false;
                            const toNodeConns = connectionsByNode.to.get(node.id) || [];
                            const hasRefArea = toNodeConns.some(c => !c.inputType || c.inputType === 'default');

                            let baseOffset = paddingTop;
                            if (hasTimer) {
                                baseOffset += timerHeight + timerMarginBottom;
                            }
                            baseOffset += titleHeight + titleMarginBottom;
                            if (hasRefArea) {
                                baseOffset += refAreaHeight + refAreaMarginBottom;
                            }
                            baseOffset += promptAreaHeight + promptAreaMarginBottom;

                            const panelTop = baseOffset;
                            const firstRowCenter = panelTop + panelPaddingTop + panelTitleHeight + panelGap + panelDescHeight + panelGap + panelRowHeight * 0.5;
                            const secondRowCenter = firstRowCenter + panelRowHeight + panelRowGap;

                            startY = node.y + (connectingInputType === 'veo_start' ? firstRowCenter : secondRowCenter);
                        }
                        // 处理image-compare节点的多个输入点
                        else if (node.type === 'image-compare') {
                            // 这里可以根据鼠标位置判断是哪个输入点，暂时使用中间位置
                            startY = node.y + node.height / 2;
                        }

                        return <path d={`M ${startX} ${startY} C ${startX - 100} ${startY}, ${mousePos.x + 100} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`} stroke="#60a5fa" strokeWidth="2" fill="none" strokeDasharray="4,4" />;
                    })()}
                </svg>
            </div>
        );
    });
