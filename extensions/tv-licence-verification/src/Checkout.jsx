import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState} from 'preact/hooks';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [tvLicenceNumber, setTvLicenceNumber] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');

  const appMetafields = shopify.appMetafields?.value || [];
  const lines = shopify.lines?.value || [];

  const getValue = (value) => String(value || '');

  const getNumericProductId = (gid) => {
    const match = String(gid || '').match(/(\d+)$/);
    return match ? match[1] : null;
  };

  const tvVerificationProductIds = new Set(
    appMetafields
      .filter((entry) => {
        return (
          entry?.target?.type === 'product' &&
          entry?.metafield?.namespace === 'custom' &&
          entry?.metafield?.key === 'requires_tv_licence_verification' &&
          String(entry?.metafield?.value).toLowerCase() === 'true'
        );
      })
      .map((entry) => String(entry?.target?.id))
      .filter(Boolean),
  );

  const hasTvInCart = lines.some((line) => {
    const productGid = line?.merchandise?.product?.id;
    const numericProductId = getNumericProductId(productGid);
    return numericProductId && tvVerificationProductIds.has(numericProductId);
  });

  if (!hasTvInCart) {
    return null;
  }

  return (
    <s-stack gap="base">
      <s-banner heading="TV licence verification" tone="info">
        <s-text>
          Please complete the details below for TV licence verification when purchasing a television.
        </s-text>
      </s-banner>

      <s-text-field
        label="Full Name and Surname"
        value={fullName}
        onInput={(value) => setFullName(getValue(value))}
      />

      <s-text-field
        label="South African ID Number / Passport Number"
        value={idNumber}
        onInput={(value) => setIdNumber(getValue(value))}
      />

      <s-text-field
        label="TV Licence Number (if available)"
        value={tvLicenceNumber}
        onInput={(value) => setTvLicenceNumber(getValue(value))}
      />

      <s-text-field
        label="Contact Number"
        value={contactNumber}
        onInput={(value) => setContactNumber(getValue(value))}
      />

      <s-text-field
        label="Email Address"
        value={emailAddress}
        onInput={(value) => setEmailAddress(getValue(value))}
      />

      <s-text-field
        label="Residential Address linked to the TV Licence"
        value={residentialAddress}
        onInput={(value) => setResidentialAddress(getValue(value))}
      />

      <s-text color="subdued">
        Copy of TV Licence / Proof of Payment upload will be added next.
      </s-text>
    </s-stack>
  );
}