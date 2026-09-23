# Title

function main(config) {

config = config || {};

const proxies = Array.isArray(config.proxies) ? config.proxies : [];



const options = config.__options || {};

const parseBool = (v) =>

typeof v === "boolean"

? v

: typeof v === "string"

? v.toLowerCase() === "true" || v === "1"

: false;



/**

* 方案 A：不依赖 __options.loadbalance

* 

  - 地区分组（除“🇺🇸 美国节点”外）默认启用负载均衡（round-robin）

* 

  - 如需临时关闭，把这里改成 false

*/

const LOAD_BALANCE = true;



const IPV6 = parseBool(options.ipv6) || false;

const FULL = parseBool(options.full) || false;

const KEEPALIVE = parseBool(options.keepalive) || false;



// 【关键设置】强制开启 Fake-IP

const FAKEIP = true;



// —— 主力代理组名称（全局统一使用） ——

const MAIN_PROXY = "🚀 主力代理";



// —— 测速参数 ——

const TEST_URL = "https://www.gstatic.com/generate_204";

// 注意：Clash/Mihomo 的 interval 单位是「秒」

const TEST_INTERVAL = 250;

const TEST_TOLERANCE = 50;



// —— LB 组健康检查参数（避免随机打到“半死不活”的节点）——

const LB_TIMEOUT = 5000; // ms

const LB_MAX_FAILED_TIMES = 3;



const allNodeNames = (proxies || []).map((p) => p?.name).filter(Boolean);



// —— 添加落地机节点（家宽代理，用于链式代理）——

// 普通落地机节点（直连，用于测试）

const RESIDENTIAL_NODE = {

name: "🏠 落地机",

type: "socks5",

server: "69.17.96.196",

port: 443,

username: "erhJiJPGMGhT",

password: "gscBF7DEXe",

tls: false,

"skip-cert-verify": true,

};



// 链式代理节点（通过链式首跳连接落地机）

// 使用 dialer-proxy 实现链式代理：流量先走链式首跳组，再通过落地机访问目标

// 当前实测优先级：美国 -> 日本 -> 香港；不再把美国写死成唯一第一跳

const CHAIN_PROXY_NODE = {

name: "🔗 链式代理",

type: "socks5",

server: "69.17.96.196",

port: 443,

username: "erhJiJPGMGhT",

password: "gscBF7DEXe",

tls: false,

"skip-cert-verify": true,

"dialer-proxy": "🪜 链式首跳",

};



config.proxies = config.proxies || [];

config.proxies.push(RESIDENTIAL_NODE);

config.proxies.push(CHAIN_PROXY_NODE);



// —— 0) 地区正则匹配 ——

const REGION_PATTERNS = {

"🇭🇰 香港节点": /(港|HK|Hong\s*Kong|HongKong|hongkong|深港)/i,

"🇺🇸 美国节点":

/(美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|\bUS\b|United\s*States|UnitedStates)/i,

"🇯🇵 日本节点": /(日本|川日|东京|大阪|泉日|埼玉|沪日|深日|\bJP\b|Japan|🇯🇵)/i,

"🇸🇬 新加坡节点": /(新加坡|坡|狮城|\bSG\b|Singapore)/i,

"🇼🇸 台湾节点": /(台|新北|彰化|\bTW\b|Taiwan|台灣|臺灣)/i,

"🇰🇷 韩国节点": /(KR|Korea|KOR|首尔|韩|韓|Korea)/i,

"🇨🇦 加拿大节点": /(加拿大|Canada|渥太华|温哥华|卡尔加里)/i,

"🇬🇧 英国节点": /(英国|Britain|United\s*Kingdom|England|伦敦)/i,

"🇫🇷 法国节点": /(法国|France|巴黎)/i,

"🇩🇪 德国节点": /(德国|Germany|柏林|法兰克福)/i,

"🇳🇱 荷兰节点": /(荷兰|Netherlands|阿姆斯特丹)/i,

"🇹🇷 土耳其节点": /(土耳其|Turkey|Türkiye)/i,

"🇷🇺 俄罗斯节点":

/(俄罗斯|俄国|Russia|RU|莫斯科|圣彼得堡|西伯利亚|KHV|Rossiya|🇷🇺)/i,

"🇮🇳 印度节点":

/(印度|India|IND|孟买|Mumbai|新德里|New\s*Delhi|🇮🇳)/i,

"🏠 家宽节点": /(家宽|家庭宽带|住宅)/i,

};



const REGION_KEYWORD_UNION = new RegExp(

Object.values(REGION_PATTERNS)

.map((re) => re.source)

.join("|"),

"i"

);



// —— 构造分组函数：url-test / load-balance / fallback / select ——

const buildUrlTest = (name, list) => {

if (!list || !list.length) return null;

return {

name,

type: "url-test",

url: TEST_URL,

interval: TEST_INTERVAL,

tolerance: TEST_TOLERANCE,

proxies: list,

};

};



const buildLoadBalance = (name, list) => {

if (!list || !list.length) return null;

return {

name,

type: "load-balance",

strategy: "round-robin",

// 关键：补齐健康检查，避免随机分发到不可用节点造成“间歇性失败”

url: TEST_URL,

interval: TEST_INTERVAL,

timeout: LB_TIMEOUT,

"max-failed-times": LB_MAX_FAILED_TIMES,

proxies: list,

};

};



const buildSelect = (name, list) => {

if (!list || !list.length) return null;

return {

name,

type: "select",

proxies: list,

};

};



const buildFallback = (name, list) => {

if (!list || !list.length) return null;

return {

name,

type: "fallback",

url: TEST_URL,

interval: TEST_INTERVAL,

proxies: list,

};

};



// —— 1) 地区分组生成（每个地区一个组，不再区分 VIP/普通）——

// 你的要求：

// - 地区分组：除“🇺🇸 美国节点”外，全部启用负载均衡（round-robin）

// - “🇺🇸 美国节点”不启用 LB（保留 url-test，偏稳定）

const regionGroups = [];

Object.entries(REGION_PATTERNS).forEach(([baseName, re]) => {

const all = allNodeNames.filter((n) => re.test(n));

if (!all.length) return;



const group =

baseName === "🇺🇸 美国节点"

? buildUrlTest(baseName, all)

: LOAD_BALANCE

? buildLoadBalance(baseName, all)

: buildUrlTest(baseName, all);



if (group) regionGroups.push(group);

});

const REGION_GROUP_NAMES = regionGroups.map((g) => g.name);



// 香港/美国分组兜底（避免规则引用不存在的分组）

const HK_GROUP = "🇭🇰 香港节点";

const hkGroupName = REGION_GROUP_NAMES.includes(HK_GROUP)

? HK_GROUP

: MAIN_PROXY;

const US_GROUP = "🇺🇸 美国节点";

const usGroupName = REGION_GROUP_NAMES.includes(US_GROUP)

? US_GROUP

: MAIN_PROXY;

const JP_GROUP = "🇯🇵 日本节点";

const jpGroupName = REGION_GROUP_NAMES.includes(JP_GROUP)

? JP_GROUP

: MAIN_PROXY;



// 链式首跳使用显式优先级，而不是单纯按地理名称硬编码

// 当前默认顺序来自实测：美国 -> 日本 -> 香港

const chainFirstHopCandidates = [

...new Set([usGroupName, jpGroupName, hkGroupName]),

];

const chainFirstHopGroup = buildFallback(

"🪜 链式首跳",

chainFirstHopCandidates

);



// —— 2) 其他地区分组（非任一地区关键词命中的节点）——

// 你的要求：其它地区节点改为 select（不用 url-test）

const othersAll = allNodeNames.filter((n) => !REGION_KEYWORD_UNION.test(n));

const othersGroup = buildSelect("🌐 其他地区", othersAll);

const OTHER_GROUP_NAMES = othersGroup ? [othersGroup.name] : [];



// —— 3) 自动与主力代理 ——

const autoSelectGroup =

allNodeNames.length > 0

? {

name: "♻️ 自动选择",

type: "url-test",

url: TEST_URL,

interval: TEST_INTERVAL,

tolerance: TEST_TOLERANCE,

proxies: allNodeNames,

}

: {

name: "♻️ 自动选择",

type: "select",

proxies: ["DIRECT"],

};



const manualSelectGroup = {

name: MAIN_PROXY,

type: "select",

proxies: [

"♻️ 自动选择",

...REGION_GROUP_NAMES,

...OTHER_GROUP_NAMES,

...allNodeNames,

],

};



const directGroup = {

name: "🎯 全球直连",

type: "select",

proxies: ["DIRECT"],

};



// —— 链式代理（使用 dialer-proxy 实现）——

// 链式代理工作原理：

// 你的设备 → 机场节点(出国) → 落地机(家宽IP) → 目标网站

// ↑ ↑

// 第一跳 第二跳

// (🪜 链式首跳) (🏠 落地机)

// 注意：链式代理节点 "🔗 链式代理" 已在上方通过 dialer-proxy 方式定义

const CHAIN_PROXY_NAME = "🔗 链式代理";



// —— 4) 功能策略组 ——

// 普通功能组：可选项包括 各地区组 / 其他地区 / 主力代理 / 自动 / 全球直连

// AI/谷歌相关功能组：额外添加链式代理选项，禁止直连

const FEATURE_GROUPS = [

{ name: "💬 即时通讯" },

{ name: "🌐 社交媒体" },

{ name: "₿ 加密交易所", forbidDirect: true },

// —— AI 相关：添加链式代理选项，禁止直连 ——

{ name: "🤖 ChatGPT", useChain: true, forbidDirect: true },

{ name: "🤖 Copilot", useChain: true, forbidDirect: true },

{ name: "🤖 Claude / Anthropic", useChain: true, forbidDirect: true },

{ name: "🤖 Grok", useChain: true, forbidDirect: true },

{ name: "🤖 AI服务", useChain: true, forbidDirect: true },



{ name: "🎶 TikTok", extra: ["🎯 全球直连"] },

{ name: "📹 YouTube" },

{ name: "🏀 NBA" },

{ name: "🍎 苹果服务", extra: ["🎯 全球直连"] },

{ name: "Ⓜ️ 微软服务", extra: ["🎯 全球直连"] },

{ name: "📢 谷歌FCM", useChain: true, extra: ["🎯 全球直连"] },

// —— 谷歌服务：添加链式代理选项 ——

{ name: "🇬 谷歌服务", useChain: true },

{ name: "💾 OneDrive" },

{ name: "🎻 Spotify" },

{ name: "🎥 Emby" },

{ name: "🎮 Steam" },

{ name: "🎮 游戏平台" },

{ name: "🌎 国外媒体" },

{ name: "⏬ PT站点", extra: ["🎯 全球直连"] },

{ name: "💳 PayPal", extra: ["🎯 全球直连"] },

{ name: "🛒 国外电商" },

{ name: "🚀 测速工具", extra: ["🎯 全球直连"] },

];



const featureGroups = FEATURE_GROUPS.map(

({ name, extra = [], forbidDirect = false, useChain = false }) => {

const baseList = [

// 如果启用链式代理，将其放在第一位

...(useChain ? [CHAIN_PROXY_NAME] : []),

...REGION_GROUP_NAMES,

...OTHER_GROUP_NAMES,

MAIN_PROXY,

"♻️ 自动选择",

...extra,

];

const proxiesList = forbidDirect

? baseList

: [...baseList, "🎯 全球直连"];

return {

name,

type: "select",

proxies: [...new Set(proxiesList)],

};

}

);



// 固定分组补充

const nonStdPortGroup = {

name: "🔀 非标端口",

type: "select",

proxies: ["🎯 全球直连", MAIN_PROXY],

};

const fallbackGroup = {

name: "🐟 漏网之鱼",

type: "select",

proxies: [MAIN_PROXY, "🎯 全球直连"],

};



// —— GitHub 专用组 ——

// Git/网页/API 共用稳定出口，避免 round-robin 导致出口 IP 频繁变化。

// 不放 DIRECT：GitHub 连接失败时只在代理节点之间切换。

const githubGroup = {

name: "🚀 GitHub",

type: "url-test",

url: "https://github.com/",

interval: 180,

tolerance: 100,

proxies: [...new Set([

usGroupName,

jpGroupName,

hkGroupName,

"♻️ 自动选择",

MAIN_PROXY,

])],

};



// —— SpacetimeAI：专用稳定出口，按目标站点检查后顺序回退 ——

const SPACETIME_GROUP = "🖼️ SpacetimeAI";

const spacetimePreferred = [

"🇺🇸美国圣何塞06-0.1倍",

"🇭🇰香港HKT | 高速专线-hy2",

"🇸🇬新加坡3 | 高速专线-hy2",

].filter((name) => allNodeNames.includes(name));

const spacetimeCandidates = spacetimePreferred.length

? spacetimePreferred

: allNodeNames.filter((name) =>

REGION_PATTERNS["🇺🇸 美国节点"].test(name) ||

REGION_PATTERNS["🇭🇰 香港节点"].test(name) ||

REGION_PATTERNS["🇸🇬 新加坡节点"].test(name)

);

const spacetimeGroup = spacetimeCandidates.length

? {

name: SPACETIME_GROUP,

type: "fallback",

proxies: [...new Set(spacetimeCandidates)],

url: "https://spacetimeai.cc/",

"expected-status": 200,

interval: 180,

timeout: 8000,

"max-failed-times": 2,

lazy: false,

}

: { name: SPACETIME_GROUP, type: "select", proxies: [MAIN_PROXY] };



// —— 汇总 proxy-groups ——

config["proxy-groups"] = [

manualSelectGroup,

autoSelectGroup,

...(chainFirstHopGroup ? [chainFirstHopGroup] : []),

githubGroup,

spacetimeGroup,

...featureGroups,

...regionGroups,

...(othersGroup ? [othersGroup] : []),

directGroup,

nonStdPortGroup,

fallbackGroup,

];



// —— rule-providers ——

config["rule-providers"] = {

Custom_Direct_Classical: {

type: "http",

behavior: "classical",

path: "ruleset/Custom_Direct_Classical.yaml",

url: "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Classical.yaml",

interval: 28800,

},

Custom_Proxy_Classical: {

type: "http",

behavior: "classical",

path: "ruleset/Custom_Proxy_Classical.yaml",

url: "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Proxy_Classical.yaml",

interval: 28800,

},

Steam_CDN_Classical: {

type: "http",

behavior: "classical",

path: "ruleset/Steam_CDN_Classical.yaml",

url: "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Steam_CDN_Classical.yaml",

interval: 2880,

},

Custom_Port_Direct: {

type: "http",

behavior: "classical",

path: "ruleset/Custom_Port_Direct.yaml",

url: "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Port_Direct.yaml",

interval: 28800,

},

};



// —— 5) 规则配置 ——

const R = [];



// SpacetimeAI API 与站点固定进入专用组，优先于通用分流规则。

R.push(`DOMAIN-SUFFIX,spacetimeai.cc,\${SPACETIME_GROUP}`);



// —— 自建 DeepSeek OCR / OpenAI-compatible 中转站：强制直连 ——

R.push("DOMAIN,api.deepseek-ocr.com.cn,🎯 全球直连");

R.push("DOMAIN-SUFFIX,deepseek-ocr.com.cn,🎯 全球直连");



// 数字客：强制不经代理

R.push("DOMAIN-SUFFIX,shuzike.com,🎯 全球直连");



// —— 自建测试/生产服务器（jianweigo.com）：强制直连，别绕出国 —— ← 新增

R.push("DOMAIN-SUFFIX,jianweigo.com,🎯 全球直连");

R.push("IP-CIDR,114.80.39.113/32,🎯 全球直连,no-resolve");

// —— dxkp AI 中转站：强制直连 ——

R.push("DOMAIN,ai.dxkp.com,🎯 全球直连");

R.push("DOMAIN,zhaoshang.liyeyun.com,🎯 全球直连");

R.push("DOMAIN,lyy-gov-api.liyeyun.com,🎯 全球直连");

// —— AutoDL / AutoDL Art：全部强制直连 ——

R.push("DOMAIN-SUFFIX,autodl.art,🎯 全球直连");

R.push("DOMAIN-SUFFIX,autodl.com,🎯 全球直连");

// ========================================

// ⛔ 固定屏蔽规则（最高优先级）

// 用于确保指定软件域名始终被阻断，不受后续分流规则影响

// ========================================

const BLOCKED_DOMAINS = ["api.lemonsqueezy.com", "screen.studio"];

BLOCKED_DOMAINS.forEach((domain) => {

R.push(`DOMAIN,\${domain},REJECT`);

R.push(`DOMAIN-SUFFIX,\${domain},REJECT`);

});



// —— GitHub 显式规则 ——

// 不依赖 GEOSITE 数据是否已成功更新；必须放在自定义直连和端口规则之前。

[

"github.com",

"githubusercontent.com",

"githubassets.com",

"github.io",

"github.dev",

"ghcr.io",

].forEach((domain) => R.push(`DOMAIN-SUFFIX,\${domain},🚀 GitHub`));



R.push("GEOSITE,private,🎯 全球直连");

R.push("GEOIP,private,🎯 全球直连,no-resolve");

R.push("RULE-SET,Custom_Direct_Classical,🎯 全球直连");

// SSH / VS Code Remote 统一直连

// GitHub SSH 默认使用 22 端口，不能直连；2222/22333 保留给内网服务器。

R.push("DST-PORT,22,🚀 GitHub");

R.push("DST-PORT,2222,🎯 全球直连");

R.push("DST-PORT,22333,🎯 全球直连");



// === 🔥 [可选] 拦截 QUIC (UDP 443) 🔥 ===

// R.push("AND,((NETWORK,UDP),(DST-PORT,443)),REJECT");



// ========================================

// 🕵️ IP & 欺诈分数检测（强制走链式落地机）

// ========================================

R.push("DOMAIN-SUFFIX,ping0.cc,🔗 链式代理");



// ========================================

// 🤖 AI 服务分流规则（高优先级，放在最前面）

// ========================================



// —— ChatGPT / OpenAI 完整域名覆盖（解决区域错误问题）——

// 关键：这些域名必须统一走同一出口，避免混着走导致区域判断错误

R.push("DOMAIN,ab.chatgpt.com,🤖 ChatGPT"); // A/B 测试/配置分发，决定区域的关键域名

R.push("DOMAIN,android.chat.openai.com,🤖 ChatGPT"); // 安卓客户端

R.push("DOMAIN,ios.chat.openai.com,🤖 ChatGPT"); // iOS 客户端

R.push("DOMAIN,chat.openai.com,🤖 ChatGPT");

R.push("DOMAIN,api.openai.com,🤖 ChatGPT");

R.push("DOMAIN,auth.openai.com,🤖 ChatGPT");

R.push("DOMAIN,auth0.openai.com,🤖 ChatGPT");

R.push("DOMAIN,cdn.oaistatic.com,🤖 ChatGPT");

R.push("DOMAIN,chat.openai.com.cdn.cloudflare.net,🤖 ChatGPT");

R.push("DOMAIN-SUFFIX,chatgpt.com,🤖 ChatGPT");

R.push("DOMAIN-SUFFIX,openai.com,🤖 ChatGPT");

R.push("DOMAIN-SUFFIX,oaistatic.com,🤖 ChatGPT");

R.push("DOMAIN-SUFFIX,oaiusercontent.com,🤖 ChatGPT");

R.push("DOMAIN-SUFFIX,openaiapi-site.azureedge.net,🤖 ChatGPT");



// —— Grok / xAI ——

// 强制走静态 CIP：🤖 Grok 组默认首选 🔗 链式代理

R.push("DOMAIN,grok.com,🤖 AI服务");

R.push("DOMAIN,www.grok.com,🤖 AI服务");

R.push("DOMAIN,api.grok.com,🤖 AI服务");

R.push("DOMAIN-SUFFIX,grok.com,🤖 AI服务");

R.push("DOMAIN,x.ai,🤖 AI服务");

R.push("DOMAIN,www.x.ai,🤖 AI服务");

R.push("DOMAIN,api.x.ai,🤖 AI服务");

R.push("DOMAIN-SUFFIX,x.ai,🤖 AI服务");

R.push("DOMAIN-SUFFIX,grok.x.com,🤖 AI服务");

R.push("DOMAIN-KEYWORD,grok,🤖 AI服务");



// Grok 可能会用到 X 登录 / 资源链路，先精确补充，不把整个 x.com 都劫到 Grok

R.push("DOMAIN-SUFFIX,grok.x.com,🤖 Grok");

R.push("DOMAIN-KEYWORD,grok,🤖 Grok");



// —— Claude / Anthropic 登录链（必须在 Google / Gemini 规则之前）——

// 绑定 Claude 第一方域名 + Google Workspace / WorkOS 认证控制面

R.push("DOMAIN,accounts.google.com,🤖 Claude / Anthropic"); // Google Workspace 登录页面

R.push("DOMAIN,oauth2.googleapis.com,🤖 Claude / Anthropic"); // Token 交换

R.push("DOMAIN-SUFFIX,apis.google.com,🤖 Claude / Anthropic"); // Google APIs 控制面

R.push("DOMAIN,storage.googleapis.com,🤖 Claude / Anthropic"); // Claude Code 旧下载桶

R.push("DOMAIN-SUFFIX,workos.com,🤖 Claude / Anthropic"); // Anthropic SSO / 域验证流程

R.push("DOMAIN,downloads.claude.ai,🤖 Claude / Anthropic"); // Claude Code 安装与更新

R.push("DOMAIN,mail.anthropic.com,🤖 Claude / Anthropic"); // 登录魔术链接邮件发送域

R.push("DOMAIN,statsig.anthropic.com,🤖 Claude / Anthropic"); // Claude Code 特性控制面

R.push("DOMAIN,claude.ai,🤖 Claude / Anthropic");

R.push("DOMAIN,platform.claude.com,🤖 Claude / Anthropic");

R.push("DOMAIN,support.claude.com,🤖 Claude / Anthropic");

R.push("DOMAIN,status.claude.com,🤖 Claude / Anthropic");

R.push("DOMAIN,code.claude.com,🤖 Claude / Anthropic");

R.push("DOMAIN,api.anthropic.com,🤖 Claude / Anthropic");

R.push("DOMAIN,console.anthropic.com,🤖 Claude / Anthropic");

R.push("DOMAIN,docs.anthropic.com,🤖 Claude / Anthropic");

R.push("DOMAIN,docs.claude.com,🤖 Claude / Anthropic");

R.push("DOMAIN,servd-anthropic-website.b-cdn.net,🤖 Claude / Anthropic");

R.push("DOMAIN,claude.md,🤖 Claude / Anthropic");

R.push("DOMAIN,claude.new,🤖 Claude / Anthropic");

R.push("DOMAIN-SUFFIX,clau.de,🤖 Claude / Anthropic");

R.push("DOMAIN-SUFFIX,claude.site,🤖 Claude / Anthropic");

R.push("DOMAIN-SUFFIX,claudemcpclient.com,🤖 Claude / Anthropic");

R.push("DOMAIN-SUFFIX,claudeusercontent.com,🤖 Claude / Anthropic");

R.push("DOMAIN-SUFFIX,claude.com,🤖 Claude / Anthropic");

R.push("DOMAIN-SUFFIX,claude.ai,🤖 Claude / Anthropic");

R.push("DOMAIN-SUFFIX,anthropic.com,🤖 Claude / Anthropic");



// —— Gemini / Google AI 后端 ——

R.push("DOMAIN,cloudcode-pa.googleapis.com,🤖 AI服务"); // Code Assist 主 API

R.push("DOMAIN,cloudaicompanion.googleapis.com,🤖 AI服务"); // Gemini for Google Cloud

R.push("DOMAIN,serviceusage.googleapis.com,🤖 AI服务"); // 检查项目配置

R.push("DOMAIN,cloudresourcemanager.googleapis.com,🤖 AI服务"); // 项目选择器

R.push("DOMAIN,people.googleapis.com,🤖 AI服务"); // 个人资料信息

R.push("DOMAIN,firebaselogging-pa.googleapis.com,🤖 AI服务"); // 遥测日志



// —— Gemini API (AI Studio / Developer API) ——

R.push("DOMAIN,generativelanguage.googleapis.com,🤖 AI服务"); // Gemini API 主域名



// —— Vertex AI (GCP 企业用户) ——

R.push("DOMAIN,aiplatform.googleapis.com,🤖 AI服务"); // Vertex AI API



// —— Gemini / Google AI 其他相关域名 ——

R.push("DOMAIN-SUFFIX,gemini.google.com,🤖 AI服务");

R.push("DOMAIN-SUFFIX,aistudio.google.com,🤖 AI服务");

R.push("DOMAIN-SUFFIX,makersuite.google.com,🤖 AI服务");

R.push("DOMAIN-SUFFIX,alkalimakersuite-pa.clients6.google.com,🤖 AI服务");

R.push("DOMAIN-SUFFIX,proactivebackend-pa.googleapis.com,🤖 AI服务");

R.push("DOMAIN-SUFFIX,bard.google.com,🤖 AI服务");



// —— 🔥 Gemini 遗漏域名补全（基于 GitHub Issue #1600 + blackmatrix7 规则）——

// 来源: https://github.com/blackmatrix7/ios_rule_script/issues/1600

R.push("DOMAIN-SUFFIX,geller-pa.googleapis.com,🤖 AI服务"); // 🔥 Issue明确指出，Gemini 内部 API

R.push("DOMAIN,alkalicore-pa.clients6.google.com,🤖 AI服务"); // 🔥 Issue明确指出，Gemini 核心服务

R.push("DOMAIN,ai.google.dev,🤖 AI服务"); // Gemini API 开发者门户

R.push("DOMAIN-SUFFIX,generativeai.google,🤖 AI服务"); // Generative AI 主域

R.push("DOMAIN-SUFFIX,gemini.google,🤖 AI服务"); // Gemini 短域名（无 .com）

R.push("DOMAIN-SUFFIX,deepmind.com,🤖 AI服务"); // DeepMind 相关

R.push("DOMAIN-SUFFIX,deepmind.google,🤖 AI服务"); // DeepMind Google 域

R.push("DOMAIN,play.googleapis.com,🤖 AI服务"); // Play 服务验证



R.push("DOMAIN-SUFFIX,manus.im,🤖 AI服务");

R.push("DOMAIN-SUFFIX,manus.ai,🤖 AI服务");

R.push("DOMAIN-SUFFIX,manus.com,🤖 AI服务");

R.push("DOMAIN-SUFFIX,manus.space,🤖 AI服务");

R.push("DOMAIN-SUFFIX,manuscdn.com,🤖 AI服务");

R.push("DOMAIN-SUFFIX,butterfly-effect.dev,🤖 AI服务");

R.push("DOMAIN-KEYWORD,manus,🤖 AI服务");



// —— GEOSITE 规则兜底 ——

R.push("GEOSITE,openai,🤖 ChatGPT");

R.push("GEOSITE,bing,🤖 Copilot");

R.push("GEOSITE,category-ai-!cn,🤖 AI服务");



// ========================================

// 📹 YouTube 分流规则（必须先于通用 Google 规则）

// ========================================



R.push("DOMAIN-SUFFIX,youtube.com,📹 YouTube");

R.push("DOMAIN-SUFFIX,ytimg.com,📹 YouTube");

R.push("DOMAIN-SUFFIX,youtu.be,📹 YouTube");

R.push("DOMAIN-SUFFIX,yt.be,📹 YouTube");

R.push("DOMAIN-SUFFIX,youtube-nocookie.com,📹 YouTube");

R.push("DOMAIN-SUFFIX,youtubei.googleapis.com,📹 YouTube");

R.push("DOMAIN-SUFFIX,googlevideo.com,📹 YouTube");

R.push("GEOSITE,youtube,📹 YouTube");



// ========================================

// 🇬 谷歌服务分流规则（高优先级，仅次于 AI / YouTube）

// ========================================



// —— Google 通讯/推送服务 ——

R.push("DOMAIN,mtalk.google.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,talk.google.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,xmpp.google.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,gcm.googleapis.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,fcm.googleapis.com,🇬 谷歌服务");



// —— Google 核心域名 ——

R.push("DOMAIN-SUFFIX,google.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,google.com.hk,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,google.co.jp,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,googleapis.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,googleusercontent.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,gstatic.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,ggpht.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,gvt1.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,gvt2.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,gvt3.com,🇬 谷歌服务");



// —— Google 广告/分析 ——

R.push("DOMAIN-SUFFIX,googlesyndication.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,googleadservices.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,googletagmanager.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,googletagservices.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,google-analytics.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,doubleclick.net,🇬 谷歌服务");



// —— Google 其他服务 ——

R.push("DOMAIN-SUFFIX,withgoogle.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,appspot.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,android.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,chromium.org,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,chrome.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,googlesource.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,googlecode.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,blogger.com,🇬 谷歌服务");

R.push("DOMAIN-SUFFIX,blogspot.com,🇬 谷歌服务");



// —— GEOSITE 兜底 ——

R.push("GEOSITE,googlefcm,🇬 谷歌服务");

R.push("GEOSITE,google,🇬 谷歌服务");

R.push("DOMAIN-KEYWORD,google,🇬 谷歌服务");



// ========================================



// 自定义需要代理的域名

R.push("RULE-SET,Custom_Proxy_Classical," + MAIN_PROXY);



// Google CN / 国服游戏 / Steam CDN 等直连

R.push("GEOSITE,google-cn,🎯 全球直连");

R.push("GEOSITE,category-games@cn,🎯 全球直连");

R.push("RULE-SET,Steam_CDN_Classical,🎯 全球直连");

R.push("GEOSITE,category-game-platforms-download,🎯 全球直连");

R.push("GEOSITE,category-public-tracker,🎯 全球直连");



// 社交 / 通讯

R.push("GEOSITE,category-communication,💬 即时通讯");

R.push("GEOSITE,category-social-media-!cn,🌐 社交媒体");



// Twitter / X 精细分流

R.push("DOMAIN-SUFFIX,x.com,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,twitter.com,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,twimg.com,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,t.co,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,tweetdeck.com,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,periscope.tv,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,pscp.tv,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,twimg.co,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,twimg.org,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,twitpic.com,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,twitter.biz,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,twitter.jp,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,twittercommunity.com,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,twitterinc.com,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,twttr.com,🌐 社交媒体");

R.push("DOMAIN-SUFFIX,vine.co,🌐 社交媒体");

R.push("DOMAIN-KEYWORD,twitter,🌐 社交媒体");

R.push("IP-CIDR,199.16.156.0/22,🌐 社交媒体,no-resolve");

R.push("IP-CIDR,199.59.148.0/22,🌐 社交媒体,no-resolve");

R.push("IP-CIDR,104.244.42.0/21,🌐 社交媒体,no-resolve");

R.push("IP-CIDR,192.133.76.0/22,🌐 社交媒体,no-resolve");

R.push("IP-CIDR,199.96.56.0/21,🌐 社交媒体,no-resolve");

R.push("IP-CIDR,209.237.192.0/19,🌐 社交媒体,no-resolve");

R.push("IP-CIDR,69.195.160.0/19,🌐 社交媒体,no-resolve");



// 加密货币交易所 / 行情站点

R.push("DOMAIN-SUFFIX,binance.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,binance.cloud,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,bnappzh.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,bnbstatic.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,okx.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,okex.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,oklink.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,okx-dns.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,bybit.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,bitget.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,bitget.top,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,bitget.vip,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,aicoin.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,blockchair.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,blockchain.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,bscscan.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,coinglass.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,etherscan.io,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,gate.io,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,mexc.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,tradingview.com,₿ 加密交易所");

R.push("DOMAIN-SUFFIX,tokenpocket.pro,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,binance,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,bitcoin,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,bitget,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,bybit,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,coinbase,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,coingecko,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,coinmarketcap,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,crypto,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,ethereum,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,huobi,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,kucoin,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,okx,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,okex,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,tronscan,₿ 加密交易所");

R.push("DOMAIN-KEYWORD,uniswap,₿ 加密交易所");



// 云盘 / 开发 / 测速 / 游戏

R.push("GEOSITE,onedrive,💾 OneDrive");

R.push("GEOSITE,github,🚀 GitHub");

R.push("GEOSITE,category-speedtest,🚀 测速工具");

R.push("GEOSITE,steam,🎮 Steam");



// NBA & 特殊站点

R.push("DOMAIN,watch.nba.com,🏀 NBA");

R.push("DOMAIN-SUFFIX,nba.com,🏀 NBA");

R.push("DOMAIN-SUFFIX,18comic.vip," + hkGroupName);

// GamsGo 强制走美国节点

R.push("DOMAIN-SUFFIX,gamsgo.com," + usGroupName);

R.push("DOMAIN-SUFFIX,gamsgo.net," + usGroupName);

R.push("DOMAIN-SUFFIX,gamsgo2.com," + usGroupName);

R.push("DOMAIN-SUFFIX,gamsgocdn.com," + usGroupName);



// 大厂服务

R.push("GEOSITE,apple,🍎 苹果服务");

R.push("GEOSITE,microsoft,Ⓜ️ 微软服务");

R.push("GEOSITE,tiktok,🎶 TikTok");



// 影音 / 游戏 / 国外媒体 / PT / 支付 / 电商

R.push("GEOSITE,category-emby,🎥 Emby");

R.push("GEOSITE,spotify,🎻 Spotify");

R.push("GEOSITE,category-games,🎮 游戏平台");

R.push("GEOSITE,category-entertainment,🌎 国外媒体");

R.push("GEOSITE,category-pt,⏬ PT站点");

R.push("GEOSITE,paypal,💳 PayPal");

R.push("GEOSITE,category-ecommerce,🛒 国外电商");



// 自定义域名 → 主力代理

R.push("DOMAIN-KEYWORD,codesome," + MAIN_PROXY);



// GFW 列表 → 主力代理（常规翻墙流量）

R.push("GEOSITE,gfw," + MAIN_PROXY);



// 一些 GEOIP 精细分流（注意：这里刻意移除了 GEOIP,google，避免 AI IP 被错误分到 🔗 链式出口）

R.push("GEOIP,telegram,💬 即时通讯,no-resolve");

R.push("GEOIP,twitter,🌐 社交媒体,no-resolve");

R.push("GEOIP,facebook,🌐 社交媒体,no-resolve");

// R.push("GEOIP,google,🔗 链式出口,no-resolve"); // 已移除



// 中国直连 / 非标端口 / 漏网之鱼

R.push("GEOSITE,cn,🎯 全球直连");

R.push("GEOIP,cn,🎯 全球直连,no-resolve");

R.push("RULE-SET,Custom_Port_Direct,🔀 非标端口");



// 最终兜底

R.push("MATCH,🐟 漏网之鱼");

config.rules = R;



// —— 嗅探配置 ——

config.sniffer = {

sniff: {

TLS: { ports: [443, 8443] },

HTTP: { ports: [80, 8080, 8880] },

QUIC: { ports: [443, 8443] },

},

"override-destination": false,

enable: true,

"force-dns-mapping": true,

"skip-domain": ["Mijia Cloud", "dlg.io.mi.com", "+.push.apple.com"],

};



// —— 【核心】DNS 配置：Fake-IP 真正生效 + 合理 fallback ——

const dnsBase = {

enable: true,

ipv6: IPV6,

// 某些网络对 QUIC/HTTP3 不稳定，DNS 优先走 TCP/HTTP 更稳。

"prefer-h3": false,



// Bootstrap DNS：必须为纯 IP

"default-nameserver": ["223.5.5.5", "119.29.29.29"],



// 主 DNS：国内为主，辅以 8.8.8.8

nameserver: ["223.5.5.5", "119.29.29.29", "8.8.8.8"],



"nameserver-policy": {

// 目标域名经已验证的专用代理查询 DoH，保留 TLS 证书校验。

"+.spacetimeai.cc": [

`https://1.1.1.1/dns-query#\${SPACETIME_GROUP}`,

`https://8.8.8.8/dns-query#\${SPACETIME_GROUP}`,

],

"api.deepseek-ocr.com.cn": [

"223.5.5.5",

"119.29.29.29",

"https://dns.cloudflare.com/dns-query",

"https://dns.google/dns-query"

],

"+.deepseek-ocr.com.cn": [

"223.5.5.5",

"119.29.29.29",

"https://dns.cloudflare.com/dns-query",

"https://dns.google/dns-query"

],

"+.shuzike.com": [

"223.5.5.5",

"119.29.29.29"

],

// GitHub 使用可信 DoH，避免国内 DNS 返回污染或不一致地址。

"+.github.com": [

"https://dns.cloudflare.com/dns-query",

"https://dns.google/dns-query"

],

"+.githubusercontent.com": [

"https://dns.cloudflare.com/dns-query",

"https://dns.google/dns-query"

],

"+.githubassets.com": [

"https://dns.cloudflare.com/dns-query",

"https://dns.google/dns-query"

],

"+.ghcr.io": [

"https://dns.cloudflare.com/dns-query",

"https://dns.google/dns-query"

]

},

// Fallback：主要负责国外/被污染域名的解析

fallback: [

"https://dns.cloudflare.com/dns-query",

"https://dns.google/dns-query",

],



// 代理节点域名解析：仅用国内 IP，避免节点解析本身被墙

"proxy-server-nameserver": ["223.5.5.5", "119.29.29.29"],



// fallback-filter：精细控制哪些域名使用 fallback（DoH）

"fallback-filter": {

geoip: true,

"geoip-code": "CN",

geosite: ["gfw", "geolocation-!cn"],

domain: [

"+.google.com",

"+.googleapis.com",

"+.gvt1.com",

"+.ggpht.com",

"+.googlevideo.com",

],

ipcidr: ["240.0.0.0/4"],

},

};



config.dns = FAKEIP

? {

...dnsBase,

"enhanced-mode": "fake-ip",

"fake-ip-filter": [

"api.deepseek.com", // Elren official API requires real public DNS

"+.spacetimeai.cc", // Worker 需解析真实公网地址，流量仍走上面的专用代理规则

"+.volces.com", // Ark API and output media use real public DNS

"+.shnid.com",

"+.deepseek-ocr.com.cn",

"+.jianweigo.com",

"+.lan",

"+.local",

"time.*.com",

"ntp.*.com",

"+.market.xiaomi.com",

"+.msftconnecttest.com",

"+.msftncsi.com",

],

}

: { ...dnsBase, "enhanced-mode": "redir-host" };



// —— Geo 数据 ——

config["geodata-mode"] = true;

config["geox-url"] = {

geoip:

"https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip-lite.dat",

geosite:

"https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",

mmdb:

"https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb",

asn: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb",

};



// —— FULL 模式：补全为完整主配置 ——

if (FULL) {

Object.assign(config, {

"mixed-port": 7890,

"redir-port": 7892,

"tproxy-port": 7893,

"routing-mark": 7894,

"allow-lan": true,

ipv6: IPV6,

mode: "rule",

"unified-delay": true,

"tcp-concurrent": true,

"find-process-mode": "off",

"log-level": "info",

"geodata-loader": "standard",

"external-controller": ":9999",

"disable-keep-alive": !KEEPALIVE,

profile: { "store-selected": true },

});

}



return config;

}
