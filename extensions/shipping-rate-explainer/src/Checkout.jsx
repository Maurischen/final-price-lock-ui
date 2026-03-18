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

  const bulkyMetafields = appMetafields.filter((entry) => {
    return (
      entry?.metafield?.namespace === 'custom' &&
      entry?.metafield?.key === 'is_bulky_shipping_item'
    );
  });

  const bulkyProductIds = new Set(
    bulkyMetafields
      .filter((entry) => String(entry?.metafield?.value).toLowerCase() === 'true')
      .map((entry) => String(entry?.target?.id))
      .filter(Boolean),
  );

  const cartProductIds = lines
    .map((line) => getNumericProductId(line?.merchandise?.product?.id))
    .filter(Boolean);

  const hasBulkyItem = cartProductIds.some((id) => bulkyProductIds.has(id));

  const selectedSelectionGroups = deliverySelectionGroups.filter(
    (group) => group?.selected,
  );

  const groupsToEvaluate =
    selectedSelectionGroups.length > 0
      ? selectedSelectionGroups
      : deliverySelectionGroups;

  const amounts = groupsToEvaluate.map((group) => getAmount(group));
  const hasSplitShipping = deliveryGroups.length > 1;
  const hasPaidSelection = groupsToEvaluate.some((group) => getAmount(group) > 0.01);
  const hasFreeSelection = groupsToEvaluate.some((group) => getAmount(group) <= 0.01);

  return (
    <s-banner heading="Shipping Debug" tone="warning">
      <s-stack gap="base">
        <s-text>deliveryGroups: {String(deliveryGroups.length)}</s-text>
        <s-text>deliverySelectionGroups: {String(deliverySelectionGroups.length)}</s-text>
        <s-text>selectedGroups: {String(selectedSelectionGroups.length)}</s-text>
        <s-text>amounts: {JSON.stringify(amounts)}</s-text>
        <s-text>hasSplitShipping: {String(hasSplitShipping)}</s-text>
        <s-text>hasPaidSelection: {String(hasPaidSelection)}</s-text>
        <s-text>hasFreeSelection: {String(hasFreeSelection)}</s-text>
        <s-text>cartProductIds: {JSON.stringify(cartProductIds)}</s-text>
        <s-text>bulkyProductIds: {JSON.stringify([...bulkyProductIds])}</s-text>
        <s-text>bulkyMetafieldCount: {String(bulkyMetafields.length)}</s-text>
        <s-text>hasBulkyItem: {String(hasBulkyItem)}</s-text>
      </s-stack>
    </s-banner>
  );
}