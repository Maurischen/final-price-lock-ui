import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default function extension() {
  render(<CollectorFields />, document.body);
}

function CollectorFields() {
  return (
    <s-stack spacing="base">
      <s-text emphasis="bold">Who will collect this order?</s-text>

      <s-text-field
        label="Name of person collecting"
        required
        onChange={async (event) => {
          const value = event?.target?.value ?? '';
          await shopify.applyAttributeChange({
            type: 'updateAttribute',
            key: 'collector_name',
            value,
          });
        }}
      />

      <s-text-field
        label="Collector contact number"
        type="tel"
        required
        onChange={async (event) => {
          const value = event?.target?.value ?? '';
          await shopify.applyAttributeChange({
            type: 'updateAttribute',
            key: 'collector_phone',
            value,
          });
        }}
      />

      <s-divider />

      <s-text size="small" appearance="subdued">
        For store collection, the person collecting may be asked to present valid identification
        (and/or proof of order) before the order is released.
      </s-text>

      <s-checkbox
        required
        onChange={async (event) => {
          const checked = Boolean(event?.target?.checked);
          await shopify.applyAttributeChange({
            type: 'updateAttribute',
            key: 'collector_id_acknowledged',
            value: checked ? 'yes' : 'no',
          });
        }}
      >
        I understand the person collecting will be asked for identification.
      </s-checkbox>
    </s-stack>
  );
}
