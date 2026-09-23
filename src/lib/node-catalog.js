// Public entry points are independent of persisted node types.
export const CONTENT_NODES = [['text-node', '文本'], ['gen-image', '图片'], ['gen-video', '视频'], ['gen-audio', '音频'], ['gen-model', '3D']];
export const AUXILIARY_NODES = [['video-timeline', '剪辑时间线'], ['image-editor', '图片编辑器'], ['three-studio', '3D 片场']];
export const EXTENSION_NODES = [['storyboard-node', '智能分镜'], ['extract-characters-scenes', '脚本提取'], ['video-analyze', '视频拆解'], ['image-compare', '图像对比']];
export const DERIVED_NODES = [['video-avatar', '数字人视频'], ['image-process', '图片处理'], ['video-process', '视频处理']];
export const ADVANCED_NODES = [['preview', '结果监看'], ['local-save', '自动归档']];
