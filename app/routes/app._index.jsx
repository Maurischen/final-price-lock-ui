import { Form, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// ⚠️ FIX: Use the specific UID from your Partner Dashboard to construct the GID
const FUNCTION_UID = "a2cd8c4e-24e4-7d7f-899a-e853838dcfc5"; // From Partner Dashboard
const FUNCTION_ID = `gid://shopify/Function/${FUNCTION_UID}`;

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
      // Throwing an error here will land in the final catch block below
      throw new Error(`GraphQL API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const result = data.data.discountAutomaticAppCreate;

    if (result.userErrors && result.userErrors.length > 0) {
      // The discount mutation failed with user errors (e.g., function not found)
      return { ok: false, errors: result.userErrors };
    }

    return { ok: true, discount: result.automaticAppDiscount };

  } catch (error) {
    // This catches the original 500 error or any new error thrown above
    console.error("Discount creation action failed:", error);
    // Return a generic error to the client UI
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

        <Form method="post">
          <s-button variant="primary">Create SKU Price Lock Discount</s-button>
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

        {/* Display error message (for userErrors or the new try/catch error) */}
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