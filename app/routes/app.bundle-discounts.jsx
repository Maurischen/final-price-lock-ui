async function getCurrentStoreFunctionId(admin) {
  const res = await admin.graphql(GET_APP_DISCOUNT_TYPES_QUERY);
  const json = await res.json();

  const types = json?.data?.appDiscountTypes || [];

  const exactTitleMatch = types.find(
    (item) => item?.title === DISCOUNT_TYPE_TITLE && item?.functionId,
  );

  if (exactTitleMatch?.functionId) {
    return exactTitleMatch.functionId;
  }

  if (types.length === 1 && types[0]?.functionId) {
    return types[0].functionId;
  }

  const anyFunctionMatch = types.find((item) => item?.functionId);
  if (anyFunctionMatch?.functionId) {
    return anyFunctionMatch.functionId;
  }

  throw new Error(
    `Could not find a functionId for this store. Check appDiscountTypes and confirm the title "${DISCOUNT_TYPE_TITLE}".`,
  );
}