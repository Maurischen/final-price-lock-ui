import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const deliveryGroups = shopify.deliveryGroups?.value || [];
  const appMetafields = shopify.appMetafields?.value || [];
  const lines = shopify.lines?.value || [];

  if (!deliveryGroups.length) {
    return null;
  }

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

  let heading = '';
  let message = '';

  if (hasSplitShipping && hasBulkyItem) {
    heading = 'Why am I still being charged shipping?';
    message =
      'Your order is being shipped in separate consignments, and oversized or bulky items require separate courier handling. Because of this, additional shipping charges may still apply even when part of the order qualifies for free shipping.';
  } else if (hasSplitShipping) {
    heading = 'Split shipping notice';
    message =
      'Your order is being fulfilled in separate shipments, which is why more than one shipping charge may apply at checkout.';
  } else if (hasBulkyItem) {
    heading = 'Why am I still being charged shipping?';
    message =
      'Although this order may qualify for free shipping, oversized or bulky items require special courier handling and are charged separately.';
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