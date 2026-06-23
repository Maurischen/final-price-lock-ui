import {
  Form,
  useLoaderData,
  useActionData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

function formatDateTime(value) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString("en-ZA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

// Loader: fetch PriceGuard rules ONLY for the current store
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();

  const rules = await db.priceGuard.findMany({
    where: {
      shop,
      ...(q
        ? {
            sku: {
              contains: q,
              mode: "insensitive",
            },
          }
        : {}),
    },
    orderBy: { sku: "asc" },
  });

  return { rules, q };
}

// Action: create / update / delete rules for the current store
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("_action");

  try {
    if (intent === "create") {
      const sku = String(formData.get("sku") || "").trim();
      const mode = String(formData.get("mode") || "MIN_ONLY").trim();
      const minPriceRaw = String(formData.get("minPrice") || "").trim();
      const lockedPriceRaw = String(formData.get("lockedPrice") || "").trim();

      if (!sku) {
        return { ok: false, error: "SKU is required." };
      }

      if (mode !== "MIN_ONLY" && mode !== "EXACT_LOCK") {
        return { ok: false, error: "Invalid mode selected." };
      }

      let minPrice = null;
      let lockedPrice = null;

      if (mode === "MIN_ONLY") {
        if (!minPriceRaw) {
          return { ok: false, error: "Minimum price is required for Minimum mode." };
        }

        minPrice = parseFloat(minPriceRaw.replace(",", "."));

        if (Number.isNaN(minPrice) || minPrice <= 0) {
          return { ok: false, error: "Minimum price must be a positive number." };
        }
      }

      if (mode === "EXACT_LOCK") {
        if (!lockedPriceRaw) {
          return { ok: false, error: "Locked price is required for Exact Lock mode." };
        }

        lockedPrice = parseFloat(lockedPriceRaw.replace(",", "."));

        if (Number.isNaN(lockedPrice) || lockedPrice <= 0) {
          return { ok: false, error: "Locked price must be a positive number." };
        }
      }

      await db.priceGuard.upsert({
        where: {
          shop_sku: { shop, sku },
        },
        update: {
          mode,
          minPrice: mode === "MIN_ONLY" ? minPrice : 0,
          lockedPrice: mode === "EXACT_LOCK" ? lockedPrice : null,
          isEnabled: true,
        },
        create: {
          shop,
          sku,
          mode,
          minPrice: mode === "MIN_ONLY" ? minPrice : 0,
          lockedPrice: mode === "EXACT_LOCK" ? lockedPrice : null,
          isEnabled: true,
        },
      });

      return { ok: true };
    }

    if (intent === "update") {
      const sku = String(formData.get("sku") || "").trim();
      const mode = String(formData.get("mode") || "MIN_ONLY").trim();
      const minPriceRaw = String(formData.get("minPrice") || "").trim();
      const lockedPriceRaw = String(formData.get("lockedPrice") || "").trim();

      if (!sku) {
        return { ok: false, error: "SKU is required." };
      }

      if (mode !== "MIN_ONLY" && mode !== "EXACT_LOCK") {
        return { ok: false, error: "Invalid mode selected." };
      }

      let minPrice = null;
      let lockedPrice = null;

      if (mode === "MIN_ONLY") {
        if (!minPriceRaw) {
          return { ok: false, error: "Minimum price is required for Minimum mode." };
        }

        minPrice = parseFloat(minPriceRaw.replace(",", "."));

        if (Number.isNaN(minPrice) || minPrice <= 0) {
          return { ok: false, error: "Minimum price must be a positive number." };
        }
      }

      if (mode === "EXACT_LOCK") {
        if (!lockedPriceRaw) {
          return { ok: false, error: "Locked price is required for Exact Lock mode." };
        }

        lockedPrice = parseFloat(lockedPriceRaw.replace(",", "."));

        if (Number.isNaN(lockedPrice) || lockedPrice <= 0) {
          return { ok: false, error: "Locked price must be a positive number." };
        }
      }

      await db.priceGuard.update({
        where: {
          shop_sku: { shop, sku },
        },
        data: {
          mode,
          minPrice: mode === "MIN_ONLY" ? minPrice : 0,
          lockedPrice: mode === "EXACT_LOCK" ? lockedPrice : null,
          isEnabled: true,
        },
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
  const { rules, q } = useLoaderData();
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

      <s-section>
        <s-paragraph>
          Add a new SKU or update an existing one with either a minimum price or an exact locked price.
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
                <s-text as="p" fontWeight="medium">Mode</s-text>
                <select
                  name="mode"
                  defaultValue="MIN_ONLY"
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #c4cdd5",
                  }}
                >
                  <option value="MIN_ONLY">Minimum Price</option>
                  <option value="EXACT_LOCK">Exact Lock</option>
                </select>
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

            <s-box flex="1">
              <label>
                <s-text as="p" fontWeight="medium">Locked price (incl. VAT)</s-text>
                <input
                  name="lockedPrice"
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

      <s-section>
        <Form method="get">
          <s-box display="flex" flexDirection="row" gap="base" marginBlockEnd="base">
            <s-box flex="2">
              <label>
                <s-text as="p" fontWeight="medium">Search SKU</s-text>
                <input
                  name="q"
                  defaultValue={q || ""}
                  placeholder="Search by SKU..."
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #c4cdd5",
                  }}
                />
              </label>
            </s-box>

            <s-box display="flex" alignItems="end" gap="base">
              <s-button variant="primary" type="submit">
                Search
              </s-button>

              <a href="/app/price-guard" style={{ textDecoration: "none" }}>
                <s-button type="button">
                  Clear
                </s-button>
              </a>
            </s-box>
          </s-box>
        </Form>
      </s-section>            

      <s-section>
        <s-paragraph as="h2" fontWeight="bold">Existing rules ({rules.length})</s-paragraph>
      
        {rules.length === 0 ? (
          <s-paragraph>No rules yet. Add your first SKU above.</s-paragraph>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "12px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e1e3e5" }}>SKU</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e1e3e5" }}>Mode</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e1e3e5" }}>Min price</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e1e3e5" }}>Locked price</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e1e3e5" }}>Last corrected</th>
                <th style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid #e1e3e5" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td style={{ padding: "8px" }}>
                    <code>{rule.sku}</code>
                  </td>

                  <td style={{ padding: "8px" }}>
                    <Form method="post" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      <input type="hidden" name="_action" value="update" />
                      <input type="hidden" name="sku" value={rule.sku} />

                      <select
                        name="mode"
                        defaultValue={rule.mode || "MIN_ONLY"}
                        style={{
                          padding: "4px 6px",
                          borderRadius: "4px",
                          border: "1px solid #c4cdd5",
                        }}
                      >
                        <option value="MIN_ONLY">Minimum Price</option>
                        <option value="EXACT_LOCK">Exact Lock</option>
                      </select>
                  </Form>
                  </td>

                  <td style={{ padding: "8px" }}>
                    <Form method="post" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      <input type="hidden" name="_action" value="update" />
                      <input type="hidden" name="sku" value={rule.sku} />
                      <input type="hidden" name="mode" value={rule.mode || "MIN_ONLY"} />

                      <input
                        name="minPrice"
                        defaultValue={rule.minPrice?.toString() || ""}
                        style={{
                          width: "120px",
                          padding: "4px 6px",
                          borderRadius: "4px",
                          border: "1px solid #c4cdd5",
                        }}
                      />

                      <input
                        type="hidden"
                        name="lockedPrice"
                        value={rule.lockedPrice?.toString() || ""}
                      />

                      <s-button variant="plain" tone="success" type="submit">
                        Update
                      </s-button>
                    </Form>
                  </td>

                  <td style={{ padding: "8px" }}>
                    <Form method="post" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      <input type="hidden" name="_action" value="update" />
                      <input type="hidden" name="sku" value={rule.sku} />
                      <input type="hidden" name="mode" value={rule.mode || "MIN_ONLY"} />

                      <input
                        type="hidden"
                        name="minPrice"
                        value={rule.minPrice?.toString() || ""}
                      />

                      <input
                        name="lockedPrice"
                        defaultValue={rule.lockedPrice?.toString() || ""}
                        style={{
                          width: "120px",
                          padding: "4px 6px",
                          borderRadius: "4px",
                          border: "1px solid #c4cdd5",
                        }}
                      />

                      <s-button variant="plain" tone="success" type="submit">
                        Update
                      </s-button>
                    </Form>
                  </td>

                  <td style={{ padding: "8px" }}>
                    {formatDateTime(rule.lastCorrectedAt)}
                  </td>

                  <td style={{ padding: "8px", textAlign: "right" }}>
                    <Form method="post" style={{ display: "inline" }}>
                      <input type="hidden" name="_action" value="delete" />
                      <input type="hidden" name="sku" value={rule.sku} />
                      <s-button variant="plain" tone="critical" type="submit">
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