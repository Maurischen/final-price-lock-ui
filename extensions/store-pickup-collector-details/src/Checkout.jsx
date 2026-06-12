import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default function extension() {
  render(<CollectorFields />, document.body);
}

function CollectorFields() {
  /**
   * @param {string} key
   * @param {string} value
   */
  async function updateAttribute(key, value) {
    await shopify.applyAttributeChange({
      type: 'updateAttribute',
      key,
      value,
    });
  }

  return (
    <s-stack gap="base">
      <s-text>Who will collect this order?</s-text>

      <s-text-field
        label="Name of person collecting"
        required
        onInput={async (value) => {
          await updateAttribute('collector_name', String(value || ''));
        }}
      />

      <s-text-field
        label="Collector contact number"
        required
        onInput={async (value) => {
          await updateAttribute('collector_phone', String(value || ''));
        }}
      />

      <s-divider />

      <s-text color="subdued">
        For store collection, the person collecting may be asked to present valid identification
        and/or proof of order before the order is released.
      </s-text>

      <s-checkbox
        label="I understand the person collecting will be asked for identification."
        onChange={async () => {
          await updateAttribute('collector_id_acknowledged', 'yes');
        }}
      />
    </s-stack>
  );
}