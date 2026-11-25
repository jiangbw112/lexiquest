/**
 * 原来：没有小程序分享。
 * 现在：只准备 onShareAppMessage 的返回形状。不实现朋友圈，也不在 app.json 里打开强制分享。
 * 为什么：分享是否合规要等人看文案。这里不注册、不宣称已经分享成功。
 */

export function shareMessage(): { title: string; path: string } {
  return { title: "词境练习家", path: "/pages/game/index" };
}
