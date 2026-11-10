/** WCAG 2.x contrast of a declared text color against a declared fill. Not a pixel sample. */

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const hi = Math.max(luminance(foreground), luminance(background));
  const lo = Math.min(luminance(foreground), luminance(background));
  return (hi + 0.05) / (lo + 0.05);
}

/** 18pt, or 14pt when bold. 1pt = 4/3 CSS px. */
export function isLargeText(sizePx: number, weight: number): boolean {
  if (sizePx >= 24) return true;
  return weight >= 700 && sizePx >= 14 * (4 / 3);
}

export interface TextContrast {
  screen: string;
  control: string;
  state: string;
  fg: string;
  bg: string;
  sizePx: number;
  weight: number;
  stroke: string;
}

export interface TextContrastRow extends TextContrast {
  ratio: number;
  large: boolean;
  pass: boolean;
}

const INK = "#3B2A20";
const CREAM = "#FFF4DC";
const MUTED = "#46363A";
const DIS = "#3F2E25";
const ERR = "#834735";
const PAPER = "#FFF8EE";
const INK2 = "#17352A";
const MOSS = "#3D5C4E";
const LEAF = "#1F7A4D";
const AMBER = "#8A5A12";
const CREAM2 = "#FFFAF3";

function row(
  screen: string,
  control: string,
  state: string,
  fg: string,
  bg: string,
  sizePx: number,
  weight: number,
  stroke = "无",
): TextContrast {
  return { screen, control, state, fg, bg, sizePx, weight, stroke };
}

/** One row per text style. Fills are the control face or the solid behind the glyphs. */
const TEXT_CONTRAST: TextContrast[] = [
  row("家长页", "页标题", "常态", INK, "#F3E6C6", 36, 400),
  row("家长页", "本机说明", "常态", MUTED, "#F3E6C6", 14, 400),
  row("家长页", "今日统计", "常态", INK, CREAM, 20, 700),
  row("家长页", "目标行", "常态", INK, "#F0E1C2", 18, 700),
  row("家长页", "补充说明", "常态", MUTED, "#EFE0C0", 16, 400),
  row("家长页", "周统计与年级", "常态", INK, "#F0E1C2", 16, 400),
  row("家长页", "每日目标说明", "常态", MUTED, "#EDDDC0", 14, 400),
  row("家长页", "难词说明", "常态", MUTED, "#EADBBC", 16, 400),
  row("家长页", "难词行", "常态", MUTED, "#E6D4B8", 15, 400),
  row("家长页", "年级说明", "可保存", MUTED, "#F1E4C4", 16, 400),
  row("家长页", "年级说明", "未选年级", ERR, "#F1E4C4", 16, 400),
  row("家长页", "说明正文", "常态", INK, "#EDDDC0", 14, 400),
  row("家长页", "未解锁说明", "常态", INK, CREAM, 20, 400),
  row("暖按钮", "主按钮", "常态", INK, "#E9C46A", 22, 400),
  row("暖按钮", "主按钮", "悬停", INK, "#EDCC7C", 22, 400),
  row("暖按钮", "主按钮", "按下", INK, "#D8B56A", 22, 400),
  row("暖按钮", "主按钮", "禁用", DIS, "#CFC4B2", 22, 400),
  row("暖按钮", "次按钮", "常态", INK, CREAM, 22, 400),
  row("暖按钮", "次按钮", "悬停", INK, CREAM, 22, 400),
  row("暖按钮", "次按钮", "按下", INK, "#EBE0CE", 22, 400),
  row("暖按钮", "次按钮", "禁用", DIS, "#CFC4B2", 22, 400),
  row("战斗与地图", "赤陶按钮", "常态", CREAM, "#A9432B", 22, 400, "有 #3B2A20 5px"),
  row("战斗与地图", "赤陶按钮", "悬停", CREAM, "#AE4E36", 22, 400, "有 #3B2A20 5px"),
  row("战斗与地图", "赤陶按钮", "按下", CREAM, "#A04433", 22, 400, "有 #3B2A20 5px"),
  row("战斗与地图", "赤陶按钮", "禁用", DIS, "#CFC4B2", 22, 400),
  row("战斗", "深青按钮", "常态", CREAM, "#1F6F64", 22, 400, "有 #3B2A20 5px"),
  row("战斗", "深青按钮", "悬停", CREAM, "#2C776B", 22, 400, "有 #3B2A20 5px"),
  row("战斗", "深青按钮", "按下", CREAM, "#266B65", 22, 400, "有 #3B2A20 5px"),
  row("战斗", "深青按钮", "禁用", DIS, "#CFC4B2", 22, 400),
  row("战斗", "天蓝按钮", "常态", INK, "#8ECAE6", 22, 400),
  row("战斗", "天蓝按钮", "悬停", INK, "#A0D1E4", 22, 400),
  row("战斗", "天蓝按钮", "按下", INK, "#88BBD7", 22, 400),
  row("战斗", "天蓝按钮", "禁用", DIS, "#CFC4B2", 22, 400),
  row("年级", "选中芯片", "常态", CREAM, "#266B65", 24, 400, "有 #3B2A20 4px"),
  row("年级", "选中芯片", "悬停", CREAM, "#266B65", 24, 400, "有 #3B2A20 4px"),
  row("年级", "选中芯片", "按下", CREAM, "#266B65", 24, 400, "有 #3B2A20 4px"),
  row("年级", "选中芯片", "禁用", DIS, "#B5B7A6", 24, 400),
  row("暖芯片", "未选", "常态", INK, CREAM, 24, 400),
  row("暖芯片", "未选", "悬停", INK, CREAM, 24, 400),
  row("暖芯片", "未选", "按下", INK, "#EBE0CE", 24, 400),
  row("暖芯片", "未选", "禁用", DIS, "#CFC4B2", 24, 400),
  row("暖页签", "未选", "常态", INK, "#E1CBAF", 22, 400),
  row("暖页签", "未选", "按下", INK, "#DBC3A6", 22, 400),
  row("暖页签", "选中", "常态", INK, CREAM, 22, 400, "有 #3B2A20 3px"),
  row("选项", "答案", "常态", INK, CREAM, 24, 700),
  row("选项", "答案", "悬停", INK, CREAM, 24, 700),
  row("选项", "答案", "按下", INK, "#EBE0CE", 24, 700),
  row("选项", "答案", "答对", INK, "#DDE6D0", 24, 700),
  row("选项", "答案", "答错", INK, "#FBDDC6", 24, 700),
  row("选项", "答案", "禁用", INK, "#CFC4B2", 24, 700),
  row("选项", "序号", "常态", INK, "#F1D592", 28, 900),
  row("选项", "序号", "禁用", INK, "#E2D7C3", 28, 900),
  row("地图", "顶栏计数", "常态", INK, CREAM, 20, 700),
  row("地图", "顶栏还差", "常态", MUTED, CREAM, 14, 400),
  row("地图", "面板标题", "常态", INK, CREAM, 28, 400),
  row("地图", "状态", "常态", MUTED, CREAM, 18, 700),
  row("地图", "目标", "常态", MUTED, CREAM, 15, 400),
  row("地图", "进度", "有可学词", INK, CREAM, 16, 700),
  row("地图", "说明", "常态", INK, CREAM, 16, 400),
  row("地图", "解锁", "常态", INK, CREAM, 15, 700),
  row("地图", "释义", "常态", INK, CREAM, 16, 700),
  row("地图", "词卡英文", "已学", INK, CREAM, 14, 700),
  row("地图", "词卡问号", "未学", MUTED, "#EFDEC4", 18, 800),
  row("地图", "顶栏标题牌", "常态", INK, "#EAD8BD", 28, 400),
  row("学堂", "顶栏标题牌", "常态", INK, "#EAD8BD", 28, 400),
  row("学堂", "收集计数", "常态", INK, "#ACBABA", 22, 800),
  row("学堂", "英文", "学习", INK, CREAM, 88, 900),
  row("学堂", "英文", "入手", INK, CREAM, 64, 900),
  row("学堂", "中文", "常态", INK, CREAM, 46, 700),
  row("学堂", "词性", "常态", INK, "#8ECAE6", 24, 800),
  row("学堂", "答错提示", "常态", ERR, CREAM, 18, 400),
  row("学堂", "词卡说明", "常态", MUTED, CREAM, 18, 400),
  row("学堂", "空状态标题", "常态", INK, CREAM, 28, 400),
  row("学堂", "空状态说明", "常态", MUTED, CREAM, 20, 400),
  row("学堂", "题目", "常态", INK, CREAM, 28, 700),
  row("学堂", "拼写题", "常态", INK, CREAM, 32, 700),
  row("学堂", "拼写说明", "常态", MUTED, CREAM, 20, 400),
  row("年级页", "标题", "常态", INK, CREAM, 40, 400),
  row("年级页", "说明", "常态", INK, CREAM, 20, 400),
  row("年级页", "键盘提示", "常态", MUTED, CREAM, 18, 400),
  row("年级页", "已选", "常态", INK, CREAM, 20, 400),
  row("年级页", "至少选一个", "常态", ERR, CREAM, 20, 400),
  row("年级页", "请家长选年级", "已清空", INK, CREAM, 40, 400),
  row("年级页", "请家长说明", "已清空", INK, CREAM, 20, 400),
  row("标题页", "词境冒险", "贴图", INK, "#FDF0D3", 80, 400),
  row("标题页", "英文名", "贴图", CREAM, "#1F6F64", 30, 900),
  row("标题页", "副标题", "常态", INK, CREAM, 22, 400),
  row("标题页", "样例说明", "常态", MUTED, CREAM, 14, 400),
  row("标题页", "桌面说明", "常态", INK, CREAM, 15, 400),
  row("起名", "标题", "常态", INK2, PAPER, 40, 400),
  row("起名", "说明", "常态", MOSS, PAPER, 18, 400),
  row("起名", "职业", "常态", INK2, PAPER, 18, 400),
  row("起名", "已选年级", "常态", INK2, PAPER, 24, 400),
  row("复习桌", "标题", "常态", INK2, PAPER, 34, 400),
  row("复习桌", "规则", "常态", MOSS, PAPER, 16, 400),
  row("复习桌", "空状态", "常态", MOSS, PAPER, 22, 400),
  row("复习桌", "拨时提示", "常态", AMBER, PAPER, 16, 400),
  row("复习桌", "词条", "常态", INK2, PAPER, 22, 400),
  row("复习桌", "徽章", "常态", AMBER, PAPER, 18, 400),
  row("复习桌", "到期", "常态", MOSS, PAPER, 16, 400),
  row("复习桌", "拼写回执", "常态", LEAF, PAPER, 16, 400),
  row("词卡册", "标题", "常态", INK2, PAPER, 36, 400),
  row("词卡册", "副标题", "常态", MOSS, PAPER, 16, 400),
  row("词卡册", "空状态", "常态", MOSS, PAPER, 22, 400),
  row("词卡册", "英文", "常态", INK2, PAPER, 18, 400),
  row("词卡册", "释义", "常态", MOSS, PAPER, 16, 400),
  row("词卡册", "徽章", "亮或未亮", AMBER, PAPER, 14, 400),
  row("词卡册", "徽章", "变灰", "#5B4B6B", PAPER, 14, 400),
  row("衣柜", "标题", "常态", INK2, PAPER, 36, 400),
  row("衣柜", "说明", "常态", MOSS, PAPER, 16, 400),
  row("衣柜", "名称", "常态", INK2, PAPER, 22, 400),
  row("衣柜", "未得到", "常态", MOSS, PAPER, 18, 400),
  row("衣柜", "分组", "常态", INK2, PAPER, 22, 400),
  row("衣柜", "槽位", "常态", MOSS, PAPER, 14, 400),
  row("结局", "标题", "常态", INK2, PAPER, 42, 400),
  row("结局", "说明", "常态", INK2, PAPER, 18, 400),
  row("结局", "徽章计数", "常态", LEAF, PAPER, 40, 400),
  row("结局", "分组", "常态", INK2, PAPER, 28, 400),
  row("同机练习", "标题", "常态", INK2, PAPER, 36, 400),
  row("同机练习", "规则", "常态", MOSS, PAPER, 16, 400),
  row("同机练习", "交电脑", "常态", INK2, PAPER, 32, 400),
  row("同机练习", "题号", "常态", MOSS, PAPER, 20, 400),
  row("同机练习", "题目", "常态", INK2, PAPER, 32, 400),
  row("同机练习", "比分", "常态", INK2, PAPER, 18, 400),
  row("技能", "标题", "常态", INK2, PAPER, 36, 400),
  row("技能", "规则", "常态", MOSS, PAPER, 16, 400),
  row("技能", "已装备", "常态", INK2, PAPER, 18, 400),
  row("技能", "提示", "常态", "#A33B24", PAPER, 18, 400),
  row("技能", "名称", "已解锁", INK2, PAPER, 24, 400),
  row("技能", "名称", "未解锁", "#5B4B6B", PAPER, 24, 400),
  row("技能", "描述", "常态", MOSS, PAPER, 16, 400),
  row("称号条", "称号", "常态", LEAF, PAPER, 22, 400),
  row("旧按钮", "确认", "常态", CREAM2, "#1F7A4D", 22, 400),
  row("旧按钮", "确认", "悬停", CREAM, "#1F6F64", 22, 400),
  row("旧按钮", "确认", "按下", CREAM, "#266B65", 22, 400),
  row("旧按钮", "确认", "禁用", MOSS, "#D7E0DA", 22, 400),
  row("旧按钮", "返回", "常态", CREAM2, "#5C6B62", 22, 400),
  row("旧按钮", "格挡", "常态", CREAM2, "#3D6EA8", 22, 400),
  row("旧按钮", "治疗", "常态", CREAM2, "#6D5BD0", 22, 400),
  row("旧按钮", "基础技能", "常态", CREAM2, "#8A5A12", 22, 400),
  row("旧按钮", "技能", "常态", CREAM, "#A9432B", 22, 400),
  row("旧按钮", "技能", "悬停", CREAM, "#AE4E36", 22, 400),
  row("旧按钮", "技能", "按下", CREAM, "#A04433", 22, 400),
  row("战斗", "名字与血量", "常态", INK2, "#C9E6D4", 22, 400),
  row("战斗", "备注", "常态", INK2, "#C9E6D4", 20, 400),
  row("战斗", "能量", "常态", "#1F4E3D", "#C9E6D4", 18, 400),
  row("战斗", "外形说明", "常态", MOSS, "#C9E6D4", 16, 400),
  row("战斗", "题目", "常态", INK2, PAPER, 24, 400),
  row("战斗", "拼写说明", "常态", MOSS, PAPER, 18, 400),
  row("村子", "任务", "常态", INK, CREAM, 20, 400),
  row("村子", "今日目标", "常态", "#1F6F64", CREAM, 18, 400),
  row("村子", "提醒", "常态", INK, CREAM, 16, 400),
  row("村子", "招牌", "常态", INK, CREAM, 18, 400),
  row("村子", "页脚", "常态", INK, CREAM, 14, 400),
  row("村子", "奖励", "常态", CREAM2, INK2, 18, 400),
  row("村子", "收下", "常态", "#D7ECDF", INK2, 16, 400),
  row("页面", "缺少 WebGL", "常态", CREAM, "#143D2C", 28, 400),
  row("家长密码", "标题", "常态", INK2, PAPER, 16, 400),
  row("家长密码", "说明", "常态", MOSS, PAPER, 14, 400),
  row("家长密码", "错误", "常态", "#A33B24", PAPER, 16, 400),
  row("家长密码", "确认", "常态", CREAM2, "#1F7A4D", 16, 400),
  row("家长密码", "确认", "禁用", DIS, "#CFC4B2", 16, 400),
  row("家长密码", "忘记密码", "常态", AMBER, PAPER, 16, 400),
  row("起名与拼写", "错误", "常态", "#A33B24", PAPER, 16, 400),
  row("起名与拼写", "拼写提示", "常态", AMBER, PAPER, 16, 400),
];

const DISABLED_FILL = "#3F2E25";

export function contrastRows(): TextContrastRow[] {
  return TEXT_CONTRAST.map((item) => {
    const ratio = contrastRatio(item.fg, item.bg);
    const large = isLargeText(item.sizePx, item.weight);
    const exempt = item.fg.toUpperCase() === DISABLED_FILL;
    const pass = exempt || ratio >= 4.5;
    return { ...item, ratio, large, pass };
  });
}

export function renderContrastDoc(): string {
  const rows = contrastRows();
  const lines = rows.map((item) => {
    const ratio = item.ratio.toFixed(2);
    const exempt = item.fg.toUpperCase() === DISABLED_FILL;
    const mark = exempt ? "禁用豁免" : item.pass ? "达标" : "未达标";
    return `| ${item.screen} | ${item.control} | ${item.state} | \`${item.fg}\` | \`${item.bg}\` | ${item.sizePx}px / ${item.weight} | ${item.stroke} | ${ratio}:1 | ${mark} |`;
  });
  const failed = rows.filter((item) => !item.pass).length;
  return `# 文字对比度

按 WCAG 2.x 相对亮度，只比较文字填充色和它后面的底色。描边写在表里，不拿来算比值，也不能靠描边过关。达标线一律是 4.5:1。禁用标签填充色 \`#3F2E25\` 仍列出，记为禁用豁免。

底色取游戏实际在画的颜色。按钮、芯片和标题牌取该状态图集帧里标签落点的平涂中位色：赤陶 \`#A9432B\` / 悬停 \`#AE4E36\` / 按下 \`#A04433\`，深青 \`#1F6F64\` / 悬停 \`#2C776B\` / 按下 \`#266B65\`，选中芯片 \`#266B65\`，标题牌 \`#EAD8BD\`。珊瑚 \`#E76F51\` 和青绿 \`#2A9D8F\` 只留在血条、节点、图标和选项圆槽的图形上。家长页标题和学堂计数直接铺在插画上，底色是文字锚点处的插画像素。村子任务条和目标条用奶油面板，中心平涂是 \`#FFF4DC\`。招牌和页脚也落在奶油底上。奖励条仍用深色矩形，Part B 才换。旧记录把这些条写成半透明矩形，底色是叠完画面之后的颜色，并按这个来配。新表不再含这一批。标题木牌上的「词境冒险」「LexiQuest」画在 \`logo_title\` 里，底色是贴图平涂。

字重是代码里写的字重。标题字体没有另写字重时按 400。大字（24px 及以上，或加粗且不小于 18.67px）也不降到 3:1。

本表 ${rows.length} 行，未达标 ${failed} 行。表内比值是声明的文字填充色对声明的平涂底色，称为理论比值。画面采样写在文末，和理论分开。

| 屏幕 | 控件 | 状态 | 文字色 | 底色 | 字号和字重 | 描边（不计入） | 对比度 | 是否达标 |
|---|---|---|---|---|---|---|---|---:|---|
${lines.join("\n")}

## 和美术报告不一致的条目

美术 \`preview/contrast_report.json\` 是样稿上 362 处字符串，每处取字形覆盖区里填充色对背景像素的第 5 百分位，最低 4.67，0 处失败。本表是游戏里每种文字样式一行。下面是对得上、但数字或画面不一致的地方。

| 条目 | 美术 | 游戏 | 原因 |
|---|---|---|---|
| 攻击按钮悬停 | 4.81，底色中位 \`#AE4E36\` | 4.88，平涂 \`#AE4E36\` | 美术按字形像素的第 5 百分位，边缘会碰到按钮高光。游戏表用标签区平涂中位色。都超过 4.5。 |
| 攻击按钮常态 | 5.34，\`#A9432B\` | 5.45，\`#A9432B\` | 同上。 |
| 治疗按钮悬停 | 4.78，\`#2C776B\` | 4.86，\`#2C776B\` | 同上。 |
| 治疗按钮常态 | 5.38，\`#1F6F64\` | 5.47，\`#1F6F64\` | 同上。 |
| 顶栏标题牌 | 墨字 \`#3B2A20\` 对 \`#EBD9BE\`，9.88，无描边 | 墨字 \`#3B2A20\` 对 \`#EAD8BD\`，无描边 | 美术样稿的木牌内芯是 \`#EBD9BE\`。游戏用 \`panel_wood\` 九宫格中心，平涂中位色是 \`#EAD8BD\`。都不再用奶油字加描边。 |
| 弹窗「暂停一下」 | 奶油字对 \`#785036\`，4.67，全表最低 | 表里没有这一行 | \`dialog\` 帧的标题带已经换成同一深木，游戏没有画面在 dialog 上画字。 |
| 答对 / 答错序号 | 样稿序号在金色圆槽上 | 出结果后不画序号 | 圆槽图形仍是青绿 \`#2A9D8F\` 和珊瑚 \`#E76F51\`，上面是贴图里的对勾和叉。游戏不再把数字画在这两种颜色上。 |
| 村子招牌 | batch3 first3 墨字对招牌奶油，第 5 百分位最低 10.20（技能 5） | 墨字 \`#3B2A20\` 对 \`#FFF4DC\`，12.50 | 每个入口共用房子贴图里的奶油招牌。游戏表用这块平涂，不把屋顶颜色当文字底。 |

## 画面采样

上面的表是理论比值：声明的文字填充色对声明的平涂底色。下面是 2026-11-09 在 HeadlessChrome 158.0.8127.18、deviceScaleFactor 1、SwiftShader 里截下来的像素。这不是桌面 Chrome、Edge 或 Safari 的结果。

方法：1280×800 时画布位图和 CSS 尺寸都是 1280×800，scale 为 1，截图像素就是游戏像素。在字形覆盖区里，和声明填充色的欧氏距离不大于 26 的像素取中位色，当作文字填充。紧贴这些像素、又不落在「填充色到该区主底色」线段上的颜色（线段容差 16，插值参数 0.06 到 0.94 的算抗锯齿）才算底色。抗锯齿和描边不算文字填充。同一底色按出现次数计，最低的一档和出现最多的一档分开写。平涂中位色只作对照，不拿它盖住更低的一档。

1000×800 是观察窗口，不是最小支持窗口。最小支持窗口没有在规范里定义。FIT 后位图仍是 1280×800，CSS 为 (0, 87) 处的 1000×625，scaleX = scaleY = 0.78125。未解锁技能名逻辑字号 24px、字重 400，显示字号 18.75px。18.75px、字重 400 不是大字，达标线仍是 4.5:1。1280×800 上同一行是 24px、字重 400，尺寸达到大字，达标线同样不降到 3:1。

| 项 | 采样位置 | 文字填充 | 最多的底色 | 最不利底色 | 最小对比度 |
|---|---|---|---|---|---:|
| 词卡册灰徽章 | 1280 截图 (130,155)–(270,210)，第一张卡「熟练·待复习」 | \`#5B4B6B\`，与声明一致 | \`#FFF8EE\`，177 像素，7.48 | \`#F6EEE7\`，3 像素，(161,176) | 6.87 |
| 未解锁技能名 | 1280 截图 (170,310)–(460,370) | \`#5B4B6B\`，与声明一致 | \`#FFF8EE\`，425 像素，7.48 | \`#F6EEE7\`，1 像素，(258,340) | 6.87 |
| 未解锁技能名，1000×800 | 视口截图字形区 (142,347)–(254,503)，CSS 缩放后再采样 | 中位 \`#5F4F6E\`。声明 \`#5B4B6B\` 被 0.78125 缩放重采样拉开 | \`#FFF8EE\`，803 像素，相对重采样填充 7.04 | \`#F7F0E8\`，5 像素，(234,357) | 6.57 |
| 旧确认按钮悬停 | 1280 截图 (500,528)–(780,594)，「开始冒险 Enter」 | \`#FFF4DC\` | \`#1F6F64\`，389 像素，5.47 | \`#2C776B\`，5 像素，(608,557) | 4.86 |
| 旧确认按钮按下 | 同一按钮按下 | \`#FFF4DC\` | \`#266B65\`，389 像素，5.70 | \`#32736B\`，13 像素，(612,558) | 5.06 |
| 旧确认按钮常态 | 同一按钮，悬停规则改完后的常态 | \`#FFFAF3\` | \`#1F7A4D\`，387 像素，5.12 | \`#2C8257\`，5 像素，(608,557) | 4.56 |
| 旧战斗技能按钮常态 | 1280 截图 (665,650)–(820,712)，已装备的赤陶槽 | \`#FFF4DC\` | \`#A9432B\`，97 像素，5.45 | \`#AD4B33\`，1 像素，(743,668) | 5.02 |
| 旧战斗技能按钮悬停 | 同一槽悬停 | \`#FFF4DC\` | \`#AE4E36\`，97 像素，4.88 | \`#B2553E\`，1 像素，(743,668) | 4.51 |
| 旧战斗技能按钮按下 | 同一槽按下 | \`#FFF4DC\` | \`#A04433\`，97 像素，5.71 | \`#A44C3B\`，1 像素，(743,668) | 5.23 |
| 战斗能量 | 1280 截图 (150,95)–(300,145)。底是 (640,300) 处 1100×460 的实心矩形，不是渐变 | \`#1F4E3D\` | \`#C9E6D4\`，186 像素，7.11 | \`#BFDDCB\`，3 像素，(216,113) | 6.51 |
| 村子学堂 | 1280 截图 (280,230)–(400,330)。字在赤陶六边形中心 | \`#FFF4DC\` | \`#A9432B\`，167 像素，5.45 | \`#AD4B33\`，2 像素，(316,263) | 5.02 |
| 村子衣柜 | 1280 截图 (530,560)–(650,670)。字在梅紫色六边形中心 | \`#FFF4DC\` | \`#5B4B6B\`，139 像素，7.22 | \`#635371\`，2 像素，(605,607) | 6.40 |
| 家长 PIN 禁用确认 | DOM 按钮 getBoundingClientRect 为 x=470、y=456.09、宽 340、高 35。字形内部像素在 y=467 与 y=472–478，例如 (627,467) | \`#3F2E25\`，与 computed color rgb(63, 46, 37) 一致 | \`#CFC4B2\`，computed background rgb(207, 196, 178) | 紧邻字形的 \`#AA9E8E\` 是抗锯齿，排除。其外侧底色仍是 \`#CFC4B2\` | 7.48 |

这 13 行的最小对比度都不少于 4.5。家长 PIN 那一行在理论表里仍记禁用豁免，因为填充色是 \`#3F2E25\`；实测比值也过 4.5。按钮保持 disabled、无阴影、cursor 为 default。截这张图时只把已有的 \`:disabled\` 样式显示出来，没有改何时禁用。

未在像素里复测的范围：1000×800 只采样了未解锁技能名。其余项的像素采样在 1280×800、scale 1；FIT 只记录了技能名的显示字号。村子学堂、衣柜这两行是换房子贴图之前的六边形采样，不再当作现状；现在的招牌是上表里的墨字对奶油。返回、格挡、治疗、基础技能这些按钮悬停不再改色，没有逐个重拍。没有用字体引擎量字形盒，字号是逻辑字号乘 CSS scale。
`;
}
