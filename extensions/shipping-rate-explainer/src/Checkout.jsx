import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const deliverySelectionGroups = shopify.deliverySelectionGroups?.value || [];
  const appMetafields = shopify.appMetafields?.value || [];
  const lines = shopify.lines?.value || [];

  if (!deliverySelectionGroups.length) {
    return null;
  }

  const getAmount = (group) => {
    const discounted = Number(group?.costAfterDiscounts?.amount ?? NaN);
    if (!Number.isNaN(discounted)) return discounted;

    const base = Number(group?.cost?.amount ?? NaN);
    if (!Number.isNaN(base)) return base;

    return 0;
  };

  const getNumericProductId = (gid) => {
    const match = String(gid || '').match(/(\d+)$/);
    return match ? match[1] : null;
  };

  const hasSplitShipping = deliverySelectionGroups.length > 1;
  const hasPaidGroup = deliverySelectionGroups.some(
    (group) => getAmount(group) > 0.01,
  );
  const hasFreeGroup = deliverySelectionGroups.some(
    (group) => getAmount(group) <= 0.01,
  );

  if (!hasPaidGroup) {
    return null;
  }

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

  let heading = 'Shipping notice';
  let message =
    'Shipping charges apply based on the selected delivery methods for this order.';

  if (hasSplitShipping && hasFreeGroup && hasBulkyItem) {
    heading = 'Why am I still being charged shipping?';
    message =
      'Part of your order qualifies for free shipping. However, bulky items require separate courier handling, so an additional shipping charge still applies.';
  } else if (hasSplitShipping && hasBulkyItem) {
    heading = 'Split shipping and bulky-item notice';
    message =
      'Your order is being shipped in separate consignments, and bulky items require separate courier handling. This is why multiple shipping charges may apply.';
  } else if (hasSplitShipping) {
    heading = 'Split shipping notice';
    message =
      'Your order is being fulfilled in separate shipments, which is why more than one shipping charge may apply at checkout.';
  } else if (hasBulkyItem) {
    heading = 'Bulky-item courier notice';
    message =
      'This order includes an item that requires separate courier handling due to its size or handling requirements, so a shipping fee applies.';
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