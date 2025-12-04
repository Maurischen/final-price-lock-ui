import {
  Form,
  useLoaderData,
  useActionData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// 🔹 Loader: fetch all PriceGuard rows
export async function loader({ request }) {
  await authenticate.admin(request);

  const rules = await db.priceGuard.findMany({
    orderBy: { sku: "asc" },
  });

  return { rules };
}

// 🔹 Action: create / update / delete rules
export async function action({ request }) {
  await authenticate.admin(request);
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
        return {
          ok: false,
          error: "Minimum price must be a positive number.",
        };
      }

      await db.priceGuard.upsert({
        where: { sku },
        update: { minPrice },
        create: { sku, minPrice },
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
        return {
          ok: false,
          error: "Minimum price must be a positive number.",
        };
      }

      await db.priceGuard.update({
        where: { sku },
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
        where: { sku },
      });

      return { ok: true };
    }

    return { ok: false, error: "Unknown action." };
  } catch (err) {
    console.error("PriceGuard admin error", err);
    return {
      ok: false,
      error: err.message || "Something went wrong processing your request.",
    };
  }
}

export default function PriceGuardPage() {
  const { rules } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <s-page heading="Price Guard Rules">
      {/* Feedback from last action */}
      {actionData?.error && (
        <s-section>
          <s-box
            padding="base"
            background="bg-critical-strong"
            borderRadius="loose"
          >
            <s-text as="p">Error: {actionData.error}</s-text>
          </s-box>
        </s-section>
      )}

      {actionData?.ok && !actionData.error && (
        <s-section>
          <s-box
            padding="base"
            background="bg-success-strong"
            borderRadius="loose"
          >
            <s-text as="p">Price Guard rule saved successfully.</s-text>
          </s-box>
        </s-section>
      )}

      {/* Add / upsert rule */}
      <s-section>
        <s-paragraph>
          Add a new SKU or update the minimum allowed price for an existing one.
        </s-paragraph>

        <Form method="post">
          <s-box
            display="flex"
            flexDirection="row"
            gap="base"
            marginBlockEnd="base"
          >
            <s-box flex="2">
              <label>
                <s-text as="p" fontWeight="medium">
                  SKU
                </s-text>
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
                <s-text as="p" fontWeight="medium">
                  Minimum price (incl. VAT)
                </s-text>
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

          <s-paragraph>
            <small>
              If the SKU already exists, this will update its minimum price.
            </small>
          </s-paragraph>
        </Form>
      </s-section>

      {/* Existing rules */}
      <s-section>
        <s-paragraph as="h2" fontWeight="bold">
          Existing rules
        </s-paragraph>

        {rules.length === 0 ? (
          <s-paragraph>No rules yet. Add your first SKU above.</s-paragraph>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
              marginTop: "12px",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px",
                    borderBottom: "1px solid #e1e3e5",
                  }}
                >
                  SKU
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px",
                    borderBottom: "1px solid #e1e3e5",
                  }}
                >
                  Min price
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "8px",
                    borderBottom: "1px solid #e1e3e5",
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td style={{ padding: "8px", verticalAlign: "middle" }}>
                    <code>{rule.sku}</code>
                  </td>
                  <td style={{ padding: "8px", verticalAlign: "middle" }}>
                    <Form
                      method="post"
                      style={{ display: "inline-flex", alignItems: "center" }}
                    >
                      <input type="hidden" name="_action" value="update" />
                      <input type="hidden" name="sku" value={rule.sku} />

                      <input
                        name="minPrice"
                        defaultValue={
                          rule.minPrice != null
                            ? rule.minPrice.toString()
                            : ""
                        }
                        style={{
                          width: "120px",
                          padding: "4px 6px",
                          borderRadius: "4px",
                          border: "1px solid #c4cdd5",
                          marginRight: "8px",
                        }}
                      />

                      <s-button variant="plain" tone="success" type="submit">
                        Update
                      </s-button>
                    </Form>
                  </td>
                  <td
                    style={{
                      padding: "8px",
                      textAlign: "right",
                      verticalAlign: "middle",
                    }}
                  >
                    <Form method="post" style={{ display: "inline" }}>
                      <input type="hidden" name="_action" value="delete" />
                      <input type="hidden" name="sku" value={rule.sku} />
                      <s-button
                        variant="plain"
                        tone="critical"
                        type="submit"
                      >
                        Delete
                      </s-button>
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
