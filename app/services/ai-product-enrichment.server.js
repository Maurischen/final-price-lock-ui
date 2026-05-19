export const AI_METAFIELD_KEYS = [
  "compatibility",
  "use_case",
  "technical_specs",
  "device_support",
  "connector_type",
  "power_output",
  "application",
  "semantic_category",
  "installation_type",
  "environment",
  "related_devices",
];

const PRODUCT_QUERY = `#graphql
  query AiEnrichmentProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        vendor
        productType
        descriptionHtml
        tags
        handle
        status
        selectedOrFirstAvailableVariant {
          id
          sku
          barcode
          price
        }
        metafields(first: 20, namespace: "custom") {
          nodes {
            namespace
            key
            value
          }
        }
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation SetAiMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export async function fetchProductsForAiEnrichment(admin, {
  first = 5,
  after = null,
  onlyActive = true,
} = {}) {
  const response = await admin.graphql(PRODUCT_QUERY, {
    variables: {
      first,
      after,
      query: onlyActive ? "status:active" : null,
    },
  });

  const json = await response.json();

  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }

  return json.data.products;
}

export function hasExistingAiMetafields(product) {
  const metafields = product.metafields?.nodes || [];

  return metafields.some((field) =>
    field.namespace === "custom" &&
    field.key?.startsWith("ai_") &&
    field.value?.trim()
  );
}

export function getExistingAiMetafields(product) {
  const metafields = product.metafields?.nodes || [];

  return Object.fromEntries(
    metafields
      .filter((field) => field.namespace === "custom" && field.key?.startsWith("ai_"))
      .map((field) => [field.key.replace(/^ai_/, ""), field.value])
  );
}

export async function generateAiProductMetafields(product) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }

  const sku = product.selectedOrFirstAvailableVariant?.sku || "";
  const barcode = product.selectedOrFirstAvailableVariant?.barcode || "";

  const input = `
You are an expert e-commerce product data architect.

Generate structured AI/GEO metafield data for Shopify.

Rules:
- Return ONLY valid JSON.
- Do not include markdown.
- Do not invent specifications.
- If a value is unknown or not applicable, return an empty string.
- Keep values factual, clear, concise and useful for AI search engines.
- Use South African e-commerce terminology where appropriate.
- Do not add sales fluff.
- Do not keyword stuff.

Product data:
Title: ${product.title || ""}
Vendor: ${product.vendor || ""}
Product type: ${product.productType || ""}
SKU: ${sku}
Barcode: ${barcode}
Tags: ${(product.tags || []).join(", ")}
Description HTML: ${product.descriptionHtml || ""}

Required fields:
${AI_METAFIELD_KEYS.join(", ")}
`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      input,
      text: {
        format: {
          type: "json_schema",
          name: "ai_product_metafields",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: Object.fromEntries(
              AI_METAFIELD_KEYS.map((key) => [key, { type: "string" }])
            ),
            required: AI_METAFIELD_KEYS,
          },
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error: ${errorText}`);
  }

  const data = await response.json();

  const outputText =
    data.output_text ||
    data.output?.[0]?.content?.find((item) => item.type === "output_text")?.text;

  if (!outputText) {
    throw new Error("No AI output text returned.");
  }

  return JSON.parse(outputText);
}

export function buildAiMetafieldsForShopify(productId, aiData, {
  overwrite = true,
  existingAiData = {},
} = {}) {
  return Object.entries(aiData)
    .filter(([key, value]) => {
      const cleanValue = String(value || "").trim();

      if (!AI_METAFIELD_KEYS.includes(key)) return false;
      if (!cleanValue) return false;
      if (!overwrite && existingAiData[key]?.trim()) return false;

      return true;
    })
    .map(([key, value]) => ({
      ownerId: productId,
      namespace: "custom",
      key: `ai_${key}`,
      type: "multi_line_text_field",
      value: String(value).trim(),
    }));
}

export async function writeAiMetafields(admin, metafields) {
  if (!metafields.length) {
    return {
      written: 0,
      userErrors: [],
    };
  }

  const response = await admin.graphql(METAFIELDS_SET_MUTATION, {
    variables: {
      metafields,
    },
  });

  const json = await response.json();

  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }

  const result = json.data.metafieldsSet;

  return {
    written: result.metafields?.length || 0,
    userErrors: result.userErrors || [],
  };
}