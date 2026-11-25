/**
 * 原来：src/game/pin-error.ts 清掉页面上的 pin-error 文本。
 * 现在：节点不存在就返回。校验和冷却仍由 domain 负责。
 * 为什么：别名只换 DOM 落点，不改失败文案。
 */
export function clearPinErrorText(root: {
  getElementById(id: string): { textContent: string | null } | null;
}): void {
  const error = root.getElementById("pin-error");
  if (error) error.textContent = "";
}
