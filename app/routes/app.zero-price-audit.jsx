import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { runZeroPriceAudit } from "../services/zero-price-audit.server.js";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  return await runZeroPriceAudit(admin);
}

export default function ZeroPriceAuditPage() {
  const data = useLoaderData();

  return (
    <s-page heading="Zero Price Audit">
      <s-section>
        <s-stack direction="block" gap="base">
          <s-text fontWeight="bold">Audit Summary</s-text>
          <s-paragraph>
            Active products checked: <strong>{data.checkedProducts}</strong>
          </s-paragraph>
          <s-paragraph>
            Variants checked: <strong>{data.checkedVariants}</strong>
          </s-paragraph>
          <s-paragraph>
            Zero-priced published variants found:{" "}
            <strong>{data.flaggedCount}</strong>
          </s-paragraph>

          <div>
            <Link to="/app/zero-price-audit.csv">
              <s-button variant="primary">Download CSV</s-button>
            </Link>
          </div>
        </s-stack>
      </s-section>

      <s-section>
        <s-paragraph>
          This tool scans for <strong>active and published products</strong> with
          <strong> zero-priced variants</strong>.
        </s-paragraph>
      </s-section>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-text fontWeight="bold">Preview</s-text>

          {data.flaggedRows.length === 0 ? (
            <s-paragraph>
              No active and published zero-priced products were found.
            </s-paragraph>
          ) : (
            data.flaggedRows.slice(0, 25).map((row) => (
              <s-box
                key={row.variantId}
                padding="base"
                border="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="tight">
                  <s-paragraph>
                    <strong>{row.productTitle}</strong>
                  </s-paragraph>
                  <s-paragraph>Variant: {row.variantTitle}</s-paragraph>
                  <s-paragraph>SKU: {row.sku || "-"}</s-paragraph>
                  <s-paragraph>Price: {row.price}</s-paragraph>
                  <s-paragraph>Handle: {row.handle}</s-paragraph>
                  <s-paragraph>
                    Published Count: {row.publishedCount}
                  </s-paragraph>
                </s-stack>
              </s-box>
            ))
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}