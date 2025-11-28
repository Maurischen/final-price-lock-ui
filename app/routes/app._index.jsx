import { json } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// ⚠️ This must match the ID from your GraphiQL query
const FUNCTION_ID = "gid://shopify/Function/019aca46-a224-7d77-a875-7af11c39ff14";

const CREATE_SKU_PRICE_LOCK = `
mutation CreateSkuPriceLockDiscount(
  $automaticAppDiscount: DiscountAutomaticAppInput!
) {
  discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
    automaticAppDiscount {
      discountId
      title
      status
    }
    userErrors {
      field
      message
      code
    }
  }
}
`;

export const loader = async ({ request }) => {
  // Make sure the request is authenticated as the app
  await authenticate.admin(request);
  return json(null);
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const variables = {
    automaticAppDiscount: {
      title: "SKU Price Lock",
      functionId: FUNCTION_ID,
      startsAt: new Date().toISOString(),
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: true,
      },
    },
  };

  const response = await admin.graphql(CREATE_SKU_PRICE_LOCK, { variables });
  const data = await response.json();
  const result = data.data.discountAutomaticAppCreate;

  if (result.userErrors && result.userErrors.length > 0) {
    return json({ ok: false, errors: result.userErrors });
  }

  return json({ ok: true, discount: result.automaticAppDiscount });
};

export default function AppIndex() {
  const actionData = useActionData();

  return (
    <s-page heading="Final Price Lock">
      <s-section>
        <s-paragraph>
          Click the button below once to create the{" "}
          <strong>SKU Price Lock</strong> automatic discount in this store.
        </s-paragraph>

        <Form method="post">
          <s-button variant="primary">Create SKU Price Lock Discount</s-button>
        </Form>

        {actionData?.ok && (
          <s-box
            marginBlockStart="base"
            padding="base"
            background="bg-success-strong"
            borderRadius="loose"
          >
            Discount created! Status: {actionData.discount.status}
          </s-box>
        )}

        {actionData?.ok === false && (
          <s-box
            marginBlockStart="base"
            padding="base"
            background="bg-critical-strong"
            borderRadius="loose"
          >
            <s-text as="p">Failed to create discount:</s-text>
            <s-code>
              {JSON.stringify(actionData.errors, null, 2)}
            </s-code>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
