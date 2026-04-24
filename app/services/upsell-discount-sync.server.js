function buildBundleCandidates(input) {
  const candidates = [];
  const lines = input.cart.lines;
  const rules = getBundleRules(input);

  for (const rule of rules) {
    if (!rule.active) continue;

    const triggerQty = getTotalQtyByRule(lines, rule);

    if (!triggerQty || triggerQty <= 0) continue;

    const maxDiscountable = triggerQty * (Number(rule.ratio || 1) || 1);

    for (const accessory of rule.accessories || []) {
      let remaining = maxDiscountable;

      for (const line of lines) {
        if (remaining <= 0) break;
        if (!lineMatchesAccessory(line, accessory)) continue;

        const lineQty = Number(line.quantity || 0);
        if (!lineQty || lineQty <= 0) continue;

        const qty = Math.min(lineQty, remaining);

        const message =
          accessory.label ||
          rule.message ||
          "Bundle discount";

        const candidate = buildDiscountCandidate(
          line.id,
          qty,
          accessory,
          message,
        );

        candidates.push(candidate);
        remaining -= qty;
      }
    }

    if (
      rule.triggerDiscountMode &&
      rule.triggerDiscountMode !== "NONE" &&
      Number(rule.triggerDiscountValue || 0) > 0
    ) {
      let remainingTriggerQty = triggerQty;

      for (const line of lines) {
        if (remainingTriggerQty <= 0) break;
        if (!lineMatchesTrigger(line, rule)) continue;

        const lineQty = Number(line.quantity || 0);
        if (!lineQty || lineQty <= 0) continue;

        const qty = Math.min(lineQty, remainingTriggerQty);

        const triggerCandidate = buildTriggerDiscountCandidate(
          line.id,
          qty,
          rule,
        );

        if (triggerCandidate) {
          candidates.push(triggerCandidate);
        }

        remainingTriggerQty -= qty;
      }
    }
  }

  return candidates;
}