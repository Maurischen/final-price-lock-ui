import { Form, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// Shopify Function for SKU Price Lock (Matrix live store)
// ✅ use the raw ID exactly as GraphiQL returns it
const FUNCTION_ID = "019aca46-a224-7d77-a875-7af11c39ff14";


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
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  try {
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
    
    // Check for non-200 responses before attempting to parse JSON
    if (response.status !== 200) {
      const errorText = await response.text();
      throw new Error(`GraphQL API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const result = data.data.discountAutomaticAppCreate;

    if (result.userErrors && result.userErrors.length > 0) {
      return { ok: false, errors: result.userErrors };
    }

    return { ok: true, discount: result.automaticAppDiscount };

  } catch (error) {
    console.error("Discount creation action failed:", error);
    return { ok: false, errors: [{ message: `Server Error: ${error.message || 'An unexpected server error occurred.'}` }] };
  }
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

        {/* Simple POST form to trigger this route's action */}
        <Form method="post">
          <s-button
            variant="primary"
            type="submit"
          >
            Create SKU Price Lock Discount
          </s-button>
        </Form>

        {/* Display success message */}
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

        {/* Display error message */}
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