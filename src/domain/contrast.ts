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
  row("暖按钮", "赤陶按钮", "常态", CREAM, "#E76F51", 22, 400, "有 #3B2A20 5px"),
  row("暖按钮", "赤陶按钮", "悬停", CREAM, "#EB8467", 22, 400, "有 #3B2A20 5px"),
  row("暖按钮", "赤陶按钮", "按下", CREAM, "#D66B54", 22, 400, "有 #3B2A20 5px"),
  row("暖按钮", "赤陶按钮", "禁用", DIS, "#CFC4B2", 22, 400),
  row("暖按钮", "深青按钮", "常态", CREAM, "#2A9D8F", 22, 400, "有 #3B2A20 5px"),
  row("暖按钮", "深青按钮", "悬停", CREAM, "#4CAB9B", 22, 400, "有 #3B2A20 5px"),
  row("暖按钮", "深青按钮", "按下", CREAM, "#30938B", 22, 400, "有 #3B2A20 5px"),
  row("暖按钮", "深青按钮", "禁用", DIS, "#CFC4B2", 22, 400),
  row("暖按钮", "天蓝按钮", "常态", INK, "#8ECAE6", 22, 400),
  row("暖按钮", "天蓝按钮", "悬停", INK, "#A0D1E4", 22, 400),
  row("暖按钮", "天蓝按钮", "按下", INK, "#88BBD7", 22, 400),
  row("暖按钮", "天蓝按钮", "禁用", DIS, "#CFC4B2", 22, 400),
  row("暖芯片", "选中", "常态", CREAM, "#30938B", 24, 400, "有 #3B2A20 4px"),
  row("暖芯片", "选中", "悬停", CREAM, "#30938B", 24, 400, "有 #3B2A20 4px"),
  row("暖芯片", "选中", "按下", CREAM, "#30938B", 24, 400, "有 #3B2A20 4px"),
  row("暖芯片", "选中", "禁用", DIS, "#B6BEAD", 24, 400),
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
  row("选项", "序号", "答对", INK, "#2A9D8F", 28, 900),
  row("选项", "序号", "答错", INK, "#E76F51", 28, 900),
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
  row("学堂", "标题", "常态", INK, "#BCC0B8", 32, 400),
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
  row("标题页", "词境冒险", "常态", INK2, PAPER, 72, 400),
  row("标题页", "英文名", "常态", LEAF, PAPER, 28, 400),
  row("标题页", "副标题", "常态", MOSS, PAPER, 22, 400),
  row("标题页", "样例说明", "常态", AMBER, PAPER, 16, 400),
  row("标题页", "桌面说明", "常态", MOSS, PAPER, 16, 400),
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
  row("词卡册", "徽章", "变灰", "#8A7560", PAPER, 14, 400),
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
  row("技能", "名称", "未解锁", "#8A918C", PAPER, 24, 400),
  row("技能", "描述", "常态", MOSS, PAPER, 16, 400),
  row("称号条", "称号", "常态", LEAF, PAPER, 22, 400),
  row("旧按钮", "确认", "常态", CREAM2, "#1F7A4D", 22, 400),
  row("旧按钮", "确认", "悬停", CREAM2, "#2F9A63", 22, 400),
  row("旧按钮", "确认", "禁用", MOSS, "#D7E0DA", 22, 400),
  row("旧按钮", "返回", "常态", CREAM2, "#5C6B62", 22, 400),
  row("旧按钮", "格挡", "常态", CREAM2, "#3D6EA8", 22, 400),
  row("旧按钮", "治疗", "常态", CREAM2, "#6D5BD0", 22, 400),
  row("旧按钮", "基础技能", "常态", CREAM2, "#8A5A12", 22, 400),
  row("旧按钮", "技能", "常态", CREAM2, "#C4533A", 22, 400),
  row("战斗", "名字与血量", "常态", INK2, "#C9E6D4", 22, 400),
  row("战斗", "备注", "常态", INK2, "#C9E6D4", 20, 400),
  row("战斗", "能量", "常态", LEAF, "#C9E6D4", 18, 400),
  row("战斗", "外形说明", "常态", MOSS, "#C9E6D4", 16, 400),
  row("战斗", "题目", "常态", INK2, PAPER, 24, 400),
  row("战斗", "拼写说明", "常态", MOSS, PAPER, 18, 400),
  row("村子", "任务", "常态", INK2, "#F8F5EE", 20, 400),
  row("村子", "今日目标", "常态", LEAF, "#FBF6EE", 18, 400),
  row("村子", "提醒", "常态", INK2, "#FBF6EE", 16, 400),
  row("村子", "学堂", "常态", CREAM2, "#C9843A", 18, 400),
  row("村子", "对战", "常态", CREAM2, "#8C4A3A", 18, 400),
  row("村子", "词卡册", "常态", CREAM2, "#3D6EA8", 18, 400),
  row("村子", "复习桌", "常态", CREAM2, "#6D5BD0", 18, 400),
  row("村子", "技能", "常态", CREAM2, "#1F7A4D", 18, 400),
  row("村子", "衣柜", "常态", CREAM2, "#B08968", 18, 400),
  row("村子", "同机练习", "常态", CREAM2, "#2F6F9F", 18, 400),
  row("村子", "给家长", "常态", CREAM2, "#8A5A12", 18, 400),
  row("村子", "页脚", "常态", "#E8F5EE", "#36783E", 16, 400),
  row("村子", "奖励", "常态", CREAM2, "#214139", 18, 400),
  row("村子", "收下", "常态", "#D7ECDF", "#214139", 16, 400),
  row("页面", "缺少 WebGL", "常态", CREAM, "#143D2C", 28, 400),
  row("家长密码", "标题", "常态", INK2, PAPER, 16, 400),
  row("家长密码", "说明", "常态", MOSS, PAPER, 14, 400),
  row("家长密码", "错误", "常态", "#A33B24", PAPER, 16, 400),
  row("家长密码", "确认", "常态", CREAM2, "#1F7A4D", 16, 400),
  row("家长密码", "确认", "禁用", CREAM2, "#B7C4BC", 16, 400),
  row("家长密码", "忘记密码", "常态", AMBER, PAPER, 16, 400),
  row("起名与拼写", "错误", "常态", "#A33B24", PAPER, 16, 400),
  row("起名与拼写", "拼写提示", "常态", AMBER, PAPER, 16, 400),
];

export function contrastRows(): TextContrastRow[] {
  return TEXT_CONTRAST.map((item) => {
    const ratio = contrastRatio(item.fg, item.bg);
    const large = isLargeText(item.sizePx, item.weight);
    const pass = ratio >= (large ? 3 : 4.5);
    return { ...item, ratio, large, pass };
  });
}

export function renderContrastDoc(): string {
  const lines = contrastRows().map((item) => {
    const ratio = item.ratio.toFixed(2);
    const need = item.large ? "3:1" : "4.5:1";
    const mark = item.pass ? `达到 ${need}` : `未达到 ${need}`;
    return `| ${item.screen} | ${item.control} | ${item.state} | \`${item.fg}\` | \`${item.bg}\` | ${item.sizePx}px | ${item.weight} | ${item.stroke} | ${ratio}:1 | ${mark} |`;
  });
  const failed = contrastRows().filter((item) => !item.pass).length;
  return `# 文字对比度

方法是 WCAG 2.x 相对亮度：文字填充色对它后面的填充色。描边单独列出，不计入比值。控件底色取该状态图集帧的中心色，或代码里画出的纯色。家长页和学堂标题直接铺在插画上，底色是文字锚点处的插画像素。村子任务条、目标条和奖励条是半透明矩形，底色是纸色或墨色按透明度叠在村子画面上之后的颜色。

大字按 WCAG：18pt 及以上，或加粗且 14pt 及以上。这里按 96dpi 把 1pt 记为 4/3 px，所以 24px 及以上是大字，加粗且不小于 18.67px 也是大字。大字门槛是 3:1，其余是 4.5:1。字重是代码里写的字重；标题字体没有另写字重时按 400。

没有改颜色。下表是当前画面。${contrastRows().length} 行里有 ${failed} 行未达到对应门槛。

| 屏幕 | 控件 | 状态 | 文字色 | 底色 | 字号 | 字重 | 描边 | 对比度 | 是否达到 |
|---|---|---|---|---|---|---:|---:|---|---:|---|
${lines.join("\n")}
`;
}
