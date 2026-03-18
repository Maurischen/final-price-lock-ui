import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const deliveryGroups = shopify.deliveryGroups?.value || [];
  const deliverySelectionGroups = shopify.deliverySelectionGroups?.value || [];
  const appMetafields = shopify.appMetafields?.value || [];
  const lines = shopify.lines?.value || [];

  if (!deliveryGroups.length) {
    return null;
  }

  const getAmount = (item) => {
    const discounted = Number(item?.costAfterDiscounts?.amount ?? NaN);
    if (!Number.isNaN(discounted)) return discounted;

    const base = Number(item?.cost?.amount ?? NaN);
    if (!Number.isNaN(base)) return base;

    return 0;
  };

  const getNumericProductId = (gid) => {
    const match = String(gid || '').match(/(\d+)$/);
    return match ? match[1] : null;
  };

  const bulkyProductIds = new Set(
    appMetafields
      .filter((entry) => {
        return (
          entry?.target?.type === 'product' &&
          entry?.metafield?.namespace === 'custom' &&
          entry?.metafield?.key === 'is_bulky_shipping_item' &&
          String(entry?.metafield?.value).toLowerCase() === 'true'
        );
      })
      .map((entry) => String(entry?.target?.id))
      .filter(Boolean),
  );

  const hasBulkyItem = lines.some((line) => {
    const productGid = line?.merchandise?.product?.id;
    const numericProductId = getNumericProductId(productGid);
    return numericProductId && bulkyProductIds.has(numericProductId);
  });

  const hasSplitShipping = deliveryGroups.length > 1;

  const selectedSelectionGroups = deliverySelectionGroups.filter(
    (group) => group?.selected,
  );

  const groupsToEvaluate =
    selectedSelectionGroups.length > 0
      ? selectedSelectionGroups
      : deliverySelectionGroups;

  const hasPaidSelection = groupsToEvaluate.some(
    (group) => getAmount(group) > 0.01,
  );

  const hasFreeSelection = groupsToEvaluate.some(
    (group) => getAmount(group) <= 0.01,
  );

  if (!hasSplitShipping && !hasPaidSelection && !hasBulkyItem) {
    return null;
  }

  let heading = 'Shipping notice';
  let message =
    'Shipping charges apply based on the selected delivery methods for this order.';

  if (hasBulkyItem && hasFreeSelection && hasPaidSelection) {
    heading = 'Why am I still being charged shipping?';
    message =
      'Your order qualifies for free shipping, but oversized or bulky items require separate courier handling. Because of this, an oversize shipping fee still applies to part of the order.';
  } else if (hasSplitShipping && hasBulkyItem) {
    heading = 'Split shipping and oversized-item notice';
    message =
      'Your order is being shipped in separate consignments, and oversized or bulky items require separate courier handling. This is why multiple shipping charges may apply.';
  } else if (hasSplitShipping && hasFreeSelection && hasPaidSelection) {
    heading = 'Why am I still being charged shipping?';
    message =
      'Part of your order qualifies for free shipping, but other items are being shipped separately and still incur a courier charge. This is why an additional shipping fee appears at checkout.';
  } else if (hasSplitShipping) {
    heading = 'Split shipping notice';
    message =
      'Your order is being fulfilled in separate shipments, which is why more than one shipping charge may apply at checkout.';
  } else if (hasBulkyItem && hasPaidSelection) {
    heading = 'Oversized-item courier notice';
    message =
      'This order includes an oversized or bulky item that requires separate courier handling, so a shipping fee applies.';
  } else {
    return null;
  }

  return (
    <s-banner heading={heading} tone="info">
      <s-stack gap="base">
        <s-text>{message}</s-text>
      </s-stack>
    </s-banner>
  );
}