import { useState } from "react";
import { Form, redirect, useLoaderData, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Checkbox,
  Divider,
  Badge,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const { listBundlerRules } = await import(
    "../services/bundler-rules.server"
  );

  const rules = await listBundlerRules(session.shop);

  return { rules };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  const {
    createBundlerRule,
    updateBundlerRule,
    deleteBundlerRule,
    parseSkuList,
  } = await import("../services/bundler-rules.server");

  const formData = await request.formData();

  const intent = formData.get("_intent");
  const id = formData.get("id");

  if (intent === "delete") {
    await deleteBundlerRule({ id, shop: session.shop });
    return redirect("/app/bundler-rules");
  }

  const name = String(formData.get("name") || "").trim();
  const triggerSkus = parseSkuList(formData.get("triggerSkus"));
  const offerSkus = parseSkuList(formData.get("offerSkus"));
  const badgeText = String(formData.get("badgeText") || "").trim();
  const headlineText = String(formData.get("headlineText") || "").trim();
  const isActive = formData.get("isActive") === "true";
  const priority = Number(formData.get("priority") || 100);

  if (!name || triggerSkus.length === 0 || offerSkus.length === 0) {
    return {
      error:
        "Rule name, at least one trigger SKU, and at least one offer SKU are required.",
    };
  }

  if (intent === "update") {
    await updateBundlerRule({
      id,
      shop: session.shop,
      name,
      triggerSkus,
      offerSkus,
      badgeText,
      headlineText,
      isActive,
      priority,
    });

    return redirect("/app/bundler-rules");
  }

  await createBundlerRule({
    shop: session.shop,
    name,
    triggerSkus,
    offerSkus,
    badgeText,
    headlineText,
    isActive,
    priority,
  });

  return redirect("/app/bundler-rules");
}

function CreateBundlerRuleForm({ isSubmitting }) {
  const [name, setName] = useState("");
  const [triggerSkus, setTriggerSkus] = useState("");
  const [offerSkus, setOfferSkus] = useState("");
  const [badgeText, setBadgeText] = useState("Bundle & save");
  const [headlineText, setHeadlineText] = useState(
    "Bundle these essentials and save instantly",
  );
  const [priority, setPriority] = useState("100");
  const [isActive, setIsActive] = useState(true);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Create Bundler Rule
        </Text>

        <Form method="post">
          <input type="hidden" name="_intent" value="create" />
          <input type="hidden" name="isActive" value={String(isActive)} />

          <BlockStack gap="300">
            <TextField
              label="Rule Name"
              name="name"
              value={name}
              onChange={setName}
              autoComplete="off"
              placeholder="Example: T54 Laptop Accessory Bundle"
            />

            <TextField
              label="Bundle Badge Text"
              name="badgeText"
              value={badgeText}
              onChange={setBadgeText}
              autoComplete="off"
            />

            <TextField
              label="Bundle Headline"
              name="headlineText"
              value={headlineText}
              onChange={setHeadlineText}
              autoComplete="off"
            />

            <TextField
              label="Trigger SKUs"
              name="triggerSkus"
              value={triggerSkus}
              onChange={setTriggerSkus}
              multiline={4}
              autoComplete="off"
              helpText="Comma separated or one SKU per line. Any one of these products will trigger the bundle."
              placeholder={"LAPTOP-SKU-1\nLAPTOP-SKU-2\nLAPTOP-SKU-3"}
            />

            <TextField
              label="Offer SKUs"
              name="offerSkus"
              value={offerSkus}
              onChange={setOfferSkus}
              multiline={4}
              autoComplete="off"
              helpText="Comma separated or one SKU per line. These products will show in the bundle."
              placeholder={"BAG-001\nMOUSE-001\nT54"}
            />

            <TextField
              label="Priority"
              name="priority"
              type="number"
              value={priority}
              onChange={setPriority}
              autoComplete="off"
            />

            <Checkbox
              label="Active"
              checked={isActive}
              onChange={setIsActive}
            />

            <InlineStack>
              <Button submit variant="primary" loading={isSubmitting}>
                Save Bundler Rule
              </Button>
            </InlineStack>
          </BlockStack>
        </Form>
      </BlockStack>
    </Card>
  );
}

function EditBundlerRuleForm({
  rule,
  isSubmitting,
  isCollapsed,
  onToggleCollapse,
}) {
  const initialTriggerSkus = safeJsonArray(rule.triggerSkusJson).join("\n");
  const initialOfferSkus = safeJsonArray(rule.offerSkusJson).join("\n");

  const [name, setName] = useState(rule.name || "");
  const [triggerSkus, setTriggerSkus] = useState(initialTriggerSkus);
  const [offerSkus, setOfferSkus] = useState(initialOfferSkus);
  const [badgeText, setBadgeText] = useState(rule.badgeText || "Bundle & save");
  const [headlineText, setHeadlineText] = useState(
    rule.headlineText || "Bundle these essentials and save instantly",
  );
  const [priority, setPriority] = useState(String(rule.priority || 100));
  const [isActive, setIsActive] = useState(Boolean(rule.isActive));

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h3" variant="headingMd">
              {name || rule.name}
            </Text>

            <InlineStack gap="200">
              <Badge tone={isActive ? "success" : "critical"}>
                {isActive ? "Active" : "Inactive"}
              </Badge>
              <Badge>Priority {priority}</Badge>
            </InlineStack>
          </BlockStack>

          <Button onClick={onToggleCollapse}>
            {isCollapsed ? "Expand" : "Collapse"}
          </Button>
        </InlineStack>

        {!isCollapsed && (
          <>
            <Divider />

            <Form method="post">
              <input type="hidden" name="_intent" value="update" />
              <input type="hidden" name="id" value={rule.id} />
              <input type="hidden" name="isActive" value={String(isActive)} />

              <BlockStack gap="300">
                <TextField
                  label="Rule Name"
                  name="name"
                  value={name}
                  onChange={setName}
                  autoComplete="off"
                />

                <TextField
                  label="Bundle Badge Text"
                  name="badgeText"
                  value={badgeText}
                  onChange={setBadgeText}
                  autoComplete="off"
                />

                <TextField
                  label="Bundle Headline"
                  name="headlineText"
                  value={headlineText}
                  onChange={setHeadlineText}
                  autoComplete="off"
                />

                <TextField
                  label="Trigger SKUs"
                  name="triggerSkus"
                  value={triggerSkus}
                  onChange={setTriggerSkus}
                  multiline={4}
                  autoComplete="off"
                />

                <TextField
                  label="Offer SKUs"
                  name="offerSkus"
                  value={offerSkus}
                  onChange={setOfferSkus}
                  multiline={4}
                  autoComplete="off"
                />

                <TextField
                  label="Priority"
                  name="priority"
                  type="number"
                  value={priority}
                  onChange={setPriority}
                  autoComplete="off"
                />

                <Checkbox
                  label="Active"
                  checked={isActive}
                  onChange={setIsActive}
                />

                <InlineStack gap="200">
                  <Button submit loading={isSubmitting}>
                    Update
                  </Button>
                </InlineStack>
              </BlockStack>
            </Form>

            <Form method="post">
              <input type="hidden" name="_intent" value="delete" />
              <input type="hidden" name="id" value={rule.id} />

              <Button submit tone="critical" variant="secondary">
                Delete
              </Button>
            </Form>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

export default function BundlerRulesPage() {
  const { rules = [] } = useLoaderData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [search, setSearch] = useState("");
  const [collapsedIds, setCollapsedIds] = useState(new Set());

  const filteredRules = rules.filter((rule) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;

    return [
      rule.name,
      rule.badgeText,
      rule.headlineText,
      rule.triggerSkusJson,
      rule.offerSkusJson,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  function toggleCollapse(ruleId) {
    setCollapsedIds((current) => {
      const next = new Set(current);

      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }

      return next;
    });
  }

  return (
    <Page title="Bundler Rules">
      <Layout>
        <Layout.Section>
          <CreateBundlerRuleForm isSubmitting={isSubmitting} />
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Existing Bundler Rules
              </Text>

              <TextField
                label="Search rules"
                value={search}
                onChange={setSearch}
                autoComplete="off"
                placeholder="Search by name, trigger SKU, or offer SKU"
              />

              <InlineStack gap="200">
                <Button
                  onClick={() =>
                    setCollapsedIds(
                      new Set(filteredRules.map((rule) => rule.id)),
                    )
                  }
                >
                  Collapse all
                </Button>

                <Button onClick={() => setCollapsedIds(new Set())}>
                  Expand all
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="400">
            {rules.length === 0 && (
              <Card>
                <Text as="p">No bundler rules created yet.</Text>
              </Card>
            )}

            {rules.length > 0 && filteredRules.length === 0 && (
              <Card>
                <Text as="p">No bundler rules match your search.</Text>
              </Card>
            )}

            {filteredRules.map((rule) => (
              <EditBundlerRuleForm
                key={rule.id}
                rule={rule}
                isSubmitting={isSubmitting}
                isCollapsed={collapsedIds.has(rule.id)}
                onToggleCollapse={() => toggleCollapse(rule.id)}
              />
            ))}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}