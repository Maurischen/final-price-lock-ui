import { useActionData, useSubmit } from "react-router"; // 👈 CHANGE 1: Import useSubmit, remove Form
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// ⚠️ FIXED: Updated UID from Version 8 config
const FUNCTION_UID = "a2cd8c4e-24a4-7d7f-899a-e053038dcfc59ba5d2b3"; 
// ⚠️ FIXED: Changed GID path from 'Function' to 'DiscountFunction'
const FUNCTION_ID = `gid://shopify/DiscountFunction/${FUNCTION_UID}`;

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
  const submit = useSubmit(); // 👈 CHANGE 2: Initialize the hook

  const handleClick = () => {
    // CHANGE 3: Manually trigger the form submission (POST request)
    submit({}, { method: "post" });
  };

  return (
    <s-page heading="Final Price Lock">
      <s-section>
        <s-paragraph>
          Click the button below once to create the{" "}
          <strong>SKU Price Lock</strong> automatic discount in this store.
        </s-paragraph>

        {/* ❌ REMOVED: <Form method="post"> */}
        
        <s-button 
          variant="primary"
          onClick={handleClick} // 👈 CHANGE 4: Add the custom click handler
        >
          Create SKU Price Lock Discount
        </s-button>
        
        {/* ❌ REMOVED: </Form> */}

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

export const headers = (headersArgs) => boundary.headers(headersArgs);