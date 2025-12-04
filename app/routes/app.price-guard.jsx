import {
  Form,
  useLoaderData,
  useActionData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// 🔹 Loader: fetch PriceGuard rules ONLY for the current store
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const rules = await db.priceGuard.findMany({
    where: { shop },
    orderBy: { sku: "asc" },
  });

  return { rules };
}

// 🔹 Action: create / update / delete rules for the current store
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("_action");

  try {
    if (intent === "create") {
      const sku = String(formData.get("sku") || "").trim();
      const minPriceRaw = String(formData.get("minPrice") || "").trim();

      if (!sku || !minPriceRaw) {
        return { ok: false, error: "SKU and minimum price are required." };
      }

      const minPrice = parseFloat(minPriceRaw.replace(",", "."));
      if (Number.isNaN(minPrice) || minPrice <= 0) {
        return { ok: false, error: "Minimum price must be a positive number." };
      }

      await db.priceGuard.upsert({
        where: {
          shop_sku: { shop, sku },
        },
        update: { minPrice },
        create: { shop, sku, minPrice },
      });

      return { ok: true };
    }

    if (intent === "update") {
      const sku = String(formData.get("sku") || "").trim();
      const minPriceRaw = String(formData.get("minPrice") || "").trim();

      if (!sku || !minPriceRaw) {
        return { ok: false, error: "SKU and minimum price are required." };
      }

      const minPrice = parseFloat(minPriceRaw.replace(",", "."));
      if (Number.isNaN(minPrice) || minPrice <= 0) {
        return { ok: false, error: "Minimum price must be positive." };
      }

      await db.priceGuard.update({
        where: {
          shop_sku: { shop, sku },
        },
        data: { minPrice },
      });

      return { ok: true };
    }

    if (intent === "delete") {
      const sku = String(formData.get("sku") || "").trim();

      if (!sku) {
        return { ok: false, error: "SKU is required to delete." };
      }

      await db.priceGuard.delete({
        where: {
          shop_sku: { shop, sku },
        },
      });

      return { ok: true };
    }

    return { ok: false, error: "Unknown action." };
  } catch (err) {
    console.error("PriceGuard admin error", err);
    return { ok: false, error: err.message || "Unexpected server error." };
  }
}

export default function PriceGuardPage() {
  const { rules } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <s-page heading="Price Guard Rules">
      {actionData?.error && (
        <s-section>
          <s-box padding="base" background="bg-critical-strong" borderRadius="loose">
            <s-text as="p">Error: {actionData.error}</s-text>
          </s-box>
        </s-section>
      )}

      {actionData?.ok && !actionData.error && (
        <s-section>
          <s-box padding="base" background="bg-success-strong" borderRadius="loose">
            <s-text as="p">Price Guard rule saved successfully.</s-text>
          </s-box>
        </s-section>
      )}

      {/* Add / Update rule */}
      <s-section>
        <s-paragraph>
          Add a new SKU or update the minimum allowed price for an existing one.
        </s-paragraph>

        <Form method="post">
          <s-box display="flex" flexDirection="row" gap="base" marginBlockEnd="base">
            <s-box flex="2">
              <label>
                <s-text as="p" fontWeight="medium">SKU</s-text>
                <input
                  name="sku"
                  placeholder="e.g. 49B2U5900CH"
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #c4cdd5",
                  }}
                />
              </label>
            </s-box>

            <s-box flex="1">
              <label>
                <s-text as="p" fontWeight="medium">Minimum price (incl. VAT)</s-text>
                <input
                  name="minPrice"
                  placeholder="e.g. 19950"
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #c4cdd5",
                  }}
                />
              </label>
            </s-box>
          </s-box>

          <input type="hidden" name="_action" value="create" />
          <s-button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save rule"}
          </s-button>
        </Form>
      </s-section>

      {/* Render rules */}
      <s-section>
        <s-paragraph as="h2" fontWeight="bold">Existing rules</s-paragraph>

        {rules.length === 0 ? (
          <s-paragraph>No rules yet. Add your first SKU above.</s-paragraph>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "12px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e1e3e5" }}>SKU</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e1e3e5" }}>Min price</th>
                <th style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid #e1e3e5" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td style={{ padding: "8px" }}><code>{rule.sku}</code></td>
                  <td style={{ padding: "8px" }}>
                    <Form method="post" style={{ display: "inline-flex", alignItems: "center" }}>
                      <input type="hidden" name="_action" value="update" />
                      <input type="hidden" name="sku" value={rule.sku} />

                      <input
                        name="minPrice"
                        defaultValue={rule.minPrice?.toString()}
                        style={{
                          width: "120px",
                          padding: "4px 6px",
                          borderRadius: "4px",
                          border: "1px solid #c4cdd5",
                          marginRight: "8px",
                        }}
                      />

                      <s-button variant="plain" tone="success" type="submit">Update</s-button>
                    </Form>
                  </td>
                  <td style={{ padding: "8px", textAlign: "right" }}>
                    <Form method="post" style={{ display: "inline" }}>
                      <input type="hidden" name="_action" value="delete" />
                      <input type="hidden" name="sku" value={rule.sku} />
                      <s-button variant="plain" tone="critical" type="submit">Delete</s-button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>
    </s-page>
  );
}
