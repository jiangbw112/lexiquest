/** Drop a leftover parent-pin message. Validation and cooldown stay where they are. */
export function clearPinErrorText(root: {
  getElementById(id: string): { textContent: string | null } | null;
}): void {
  const error = root.getElementById("pin-error");
  if (error) error.textContent = "";
}
