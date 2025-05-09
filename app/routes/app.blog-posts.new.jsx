import { useState, useCallback } from "react";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  TextField,
  Select,
  Text,
  Banner,
  FormLayout,
  InlineStack,
  Link,
  Box,
  Tag,
  Checkbox,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { proxyPost, proxyGet } from "../utils/proxyClient";

// Loader function to fetch blogs and current theme
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  console.log("Loader: Authenticated session:", session.shop);

  try {
    // Fetch blogs
    const blogResponse = await admin.graphql(
      `#graphql
        query Blogs {
          blogs(first: 25) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
        }`
    );

    const blogResponseJson = await blogResponse.json();

    if (!blogResponse.ok || blogResponseJson.errors || !blogResponseJson.data?.blogs) {
      const errors = blogResponseJson.errors || [{ message: "Failed to fetch blogs or access denied." }];
      console.error("Loader: Failed to fetch blogs:", JSON.stringify(errors, null, 2));
      return json({
        shop: session.shop,
        blogs: [],
        currentThemeId: null,
        themeInfo: null,
        errors: errors.map(e => ({ message: e.message }))
      }, { status: blogResponse.status !== 200 ? blogResponse.status : 500 });
    }

    const blogs = blogResponseJson.data.blogs.edges.map(({ node }) => ({
      label: node.title,
      value: node.id,
      restId: node.id.split('/').pop(),
      handle: node.handle,
    }));

    // Fetch theme ID using REST API via admin API
    let currentThemeId = null;
    let themeInfo = null;

    try {
      // Create a REST client for theme access
      const themesResponse = await fetch(
        `https://${session.shop}/admin/api/2023-07/themes.json`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': session.accessToken
          }
        }
      );

      if (themesResponse.ok) {
        const themesJson = await themesResponse.json();
        if (themesJson.themes && themesJson.themes.length > 0) {
          // Find the main theme
          const mainTheme = themesJson.themes.find(t => t.role === 'main') || themesJson.themes[0];
          currentThemeId = mainTheme.id;
          themeInfo = {
            id: mainTheme.id,
            name: mainTheme.name,
            role: mainTheme.role,
            themeStoreId: mainTheme.theme_store_id
          };
          console.log("Loader: Current theme:", themeInfo);
        }
      } else {
        console.error("Loader: Failed to fetch theme:", themesResponse.status);
      }
    } catch (themeError) {
      console.error("Loader: Error fetching theme:", themeError);
    }

    return json({
      shop: session.shop,
      blogs,
      currentThemeId,
      themeInfo,
      errors: null
    });

  } catch (error) {
    console.error("Loader: Unexpected error:", error);
    return json({
      shop: session.shop,
      blogs: [],
      currentThemeId: null,
      themeInfo: null,
      errors: [{ message: `An unexpected error occurred in loader: ${error.message}` }]
    }, { status: 500 });
  }
};

// Default export - React component
export default function BlogPostNew() {
  const { shop, blogs, currentThemeId, themeInfo, errors: loaderErrors } = useLoaderData();
  const navigation = useNavigation();

  const blogOptions = blogs?.map(b => ({ label: b.label, value: b.value })) || [];

  // API versions available in Shopify
  const apiVersionOptions = [
    { label: '2023-07 (Recommended)', value: '2023-07' },
    { label: '2023-04', value: '2023-04' },
    { label: '2023-01', value: '2023-01' },
    { label: '2022-10', value: '2022-10' },
    { label: '2022-07', value: '2022-07' },
  ];

  const [selectedBlogId, setSelectedBlogId] = useState(blogOptions.length > 0 ? blogOptions[0].value : "");
  const [title, setTitle] = useState("");
  const [useJsonTemplate, setUseJsonTemplate] = useState(false);
  const [apiVersion, setApiVersion] = useState('2023-07');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [testingServer, setTestingServer] = useState(false);
  const [serverStatus, setServerStatus] = useState(null);
  const [templateStatus, setTemplateStatus] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);

  // PHP server URLs (these will now be accessed via proxy)
  const phpServerUrl = "https://v4.droplet.weboptichosting.co.uk/shopify/case-studies/index.php";
  const phpTestUrl = "https://v4.droplet.weboptichosting.co.uk/shopify/case-studies/test.php";

  // Determine if the theme is likely a modern theme
  const isModernTheme = themeInfo && (
    themeInfo.themeStoreId === 887 || // Dawn theme ID
    themeInfo.name.toLowerCase().includes('dawn') ||
    themeInfo.name.toLowerCase().includes('refresh')
  );

  const handleBlogChange = useCallback(
    (value) => setSelectedBlogId(value),
    []
  );

  const handleApiVersionChange = useCallback(
    (value) => setApiVersion(value),
    []
  );

  // Test server connection function using proxy
  const testServerConnection = useCallback(async () => {
    setTestingServer(true);
    setServerStatus(null);
    setDebugInfo(null);

    try {
      // Use proxy for the test request, but don't throw on HTTP errors so we can see the response
      const data = await proxyGet(phpTestUrl, {}, false);

      setServerStatus({
        success: true,
        message: `Server is available. PHP version: ${data.php_version || 'Unknown'}, Time: ${data.time || 'Unknown'}`
      });

      // Save full response for debugging
      setDebugInfo(data);
    } catch (error) {
      console.error("Server test failed:", error);
      setServerStatus({
        success: false,
        message: `Server test failed: ${error.message}`
      });

      // Save error for debugging
      setDebugInfo({ error: error.message });
    } finally {
      setTestingServer(false);
    }
  }, [phpTestUrl]);

  const handleFormSubmit = useCallback(async (event) => {
    event.preventDefault();

    // Reset messages
    setSuccessMessage("");
    setErrorMessage("");
    setWarningMessage("");
    setTemplateStatus(null);
    setDebugInfo(null);
    setIsLoading(true);

    // Get selected blog info
    const selectedBlog = blogs.find(b => b.value === selectedBlogId) || {};

    try {
      // Prepare data for PHP server
      const formData = {
        blogId: selectedBlog.restId,
        blogHandle: selectedBlog.handle,
        title: title,
        themeId: currentThemeId,
        themeInfo: themeInfo,
        preferJsonTemplate: useJsonTemplate,
        apiVersion: apiVersion, // Send selected API version to the server
        timestamp: new Date().toISOString()
      };

      console.log("Sending data via proxy:", formData);

      // Use the proxy service to make the request, but don't throw on HTTP errors
      // This allows us to handle partial success scenarios
      const result = await proxyPost(phpServerUrl, formData, {}, false);

      // Save full response for debugging
      setDebugInfo(result);

      if (result.success) {
        setSuccessMessage(result.message || "Article created successfully!");

        // Check for warnings
        if (result.warning) {
          setWarningMessage(result.warning);

          // Set template status for UI feedback
          setTemplateStatus({
            success: false,
            message: result.warning
          });
        } else if (result.templatePath) {
          // Template was created successfully
          setTemplateStatus({
            success: true,
            message: `Template created: ${result.templatePath} (${result.templateFormat || 'liquid'})`,
            format: result.templateFormat || 'liquid'
          });
        }

        // Optionally reset form if needed
        if (result.resetForm) {
          setTitle("");
        }
      } else {
        setErrorMessage(result.error || "Something went wrong creating the article");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      setErrorMessage(`Error: ${error.message}`);

      // Save error for debugging
      setDebugInfo({ error: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [blogs, selectedBlogId, title, currentThemeId, themeInfo, phpServerUrl, useJsonTemplate, apiVersion]);

  return (
    <Page>
      <ui-title-bar title="Create New Blog Post" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400" padding="400">
              <Banner
                title="Create Blog Article with Custom Template"
                tone="info"
              >
                <BlockStack gap="200">
                  <Text>
                    This form sends article data to a PHP server via a proxy to avoid CORS issues.
                  </Text>
                  {themeInfo ? (
                    <BlockStack gap="200">
                      <Text>
                        Current theme: {themeInfo.name} (ID: {currentThemeId})
                        {isModernTheme && <Tag>Modern Theme</Tag>}
                      </Text>
                      <Text variant="bodySm">
                        Theme Store ID: {themeInfo.themeStoreId || 'Custom'}, Role: {themeInfo.role}
                      </Text>
                    </BlockStack>
                  ) : (
                    <Text tone="warning">Could not detect current theme. Template creation may fail.</Text>
                  )}
                  <Button onClick={testServerConnection} loading={testingServer} size="slim">
                    Test PHP Server Connection (Via Proxy)
                  </Button>
                  {serverStatus && (
                    <Banner title={serverStatus.success ? "Server Test Successful" : "Server Test Failed"}
                            tone={serverStatus.success ? "success" : "critical"}>
                      <Text>{serverStatus.message}</Text>
                    </Banner>
                  )}
                </BlockStack>
              </Banner>

              {loaderErrors && loaderErrors.length > 0 && (
                <Banner title="Error loading data" tone="critical">
                  <ul>
                    {loaderErrors.map((error, index) => (
                      <li key={index}>{error.message || JSON.stringify(error)}</li>
                    ))}
                  </ul>
                </Banner>
              )}

              {errorMessage && (
                <Banner title="Error" tone="critical">
                  <Text>{errorMessage}</Text>
                  <div style={{ marginTop: '10px' }}>
                    <Text>Troubleshooting steps:</Text>
                    <ul>
                      <li>Check PHP server logs for details</li>
                      <li>Try a different API version</li>
                      <li>Ensure your server has cURL enabled</li>
                      <li>Verify proxy endpoint is working correctly</li>
                    </ul>
                  </div>
                </Banner>
              )}

              {warningMessage && (
                <Banner title="Warning" tone="warning">
                  <Text>{warningMessage}</Text>
                  <div style={{ marginTop: '10px' }}>
                    <Text>The article was created, but there was an issue with the template.</Text>
                    <Text>Try using a different API version or template format.</Text>
                  </div>
                </Banner>
              )}

              {successMessage && (
                <Banner title="Success" tone="success">
                  <Text>{successMessage}</Text>
                  {templateStatus && (
                    <div style={{ marginTop: '10px' }}>
                      <Text tone={templateStatus.success ? "success" : "warning"}>
                        {templateStatus.message}
                      </Text>
                    </div>
                  )}
                </Banner>
              )}

              <form onSubmit={handleFormSubmit}>
                <FormLayout>
                  <BlockStack gap="400">
                    {blogs && blogs.length > 0 ? (
                      <Select
                        label="Select Blog"
                        options={blogOptions}
                        onChange={handleBlogChange}
                        value={selectedBlogId}
                        disabled={isLoading}
                        requiredIndicator
                      />
                    ) : (
                      <Text as="p" tone={loaderErrors ? "critical" : "subdued"}>
                        {loaderErrors ? 'Could not load blogs.' : 'No blogs found on this store or unable to load.'}
                      </Text>
                    )}

                    <TextField
                      label="Article Title"
                      value={title}
                      onChange={setTitle}
                      autoComplete="off"
                      disabled={isLoading}
                      requiredIndicator
                    />

                    <Select
                      label="Shopify API Version"
                      options={apiVersionOptions}
                      onChange={handleApiVersionChange}
                      value={apiVersion}
                      disabled={isLoading}
                      helpText="Changing the API version may fix template creation issues"
                    />

                    <Checkbox
                      label="Use JSON template format (for Dawn and other modern themes)"
                      checked={useJsonTemplate}
                      onChange={setUseJsonTemplate}
                      helpText={isModernTheme ? "Recommended for your theme" : "Only select this for modern themes"}
                    />

                    <Button
                      submit={true}
                      primary
                      loading={isLoading}
                      disabled={isLoading || !selectedBlogId || !title || blogOptions.length === 0}
                    >
                      Create Article with Template
                    </Button>
                  </BlockStack>
                </FormLayout>
              </form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {debugInfo && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300" padding="400">
                <Text as="h2" variant="headingMd">Debug Information</Text>
                <Box
                  as="pre"
                  padding="400"
                  background="bg-surface-secondary"
                  overflowX="scroll"
                  style={{
                    borderRadius: "var(--p-border-radius-200)",
                    fontSize: "var(--p-font-size-100)"
                  }}
                >
                  {JSON.stringify(debugInfo, null, 2)}
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300" padding="400">
              <Text as="h2" variant="headingMd">Troubleshooting Template Creation</Text>
              <Text>
                If you're experiencing the "Template creation failed: HTTP 404: Not Found" error, try the following:
              </Text>
              <ol>
                <li><strong>Change the API version</strong>: Different Shopify themes may require different API versions. Try 2023-01 or 2022-10 if the latest doesn't work.</li>
                <li><strong>Change the template format</strong>: Toggle the "Use JSON template format" checkbox. Dawn and other modern themes use JSON templates, while older themes use Liquid templates.</li>
                <li><strong>Check theme compatibility</strong>: Some custom themes may have non-standard directory structures that are not compatible with template creation.</li>
              </ol>

              <Text as="h3" variant="headingMd">API Version Compatibility</Text>
              <Text>
                Different API versions have different levels of support for template operations:
              </Text>
              <ul>
                <li><strong>2023-07</strong>: Latest API version with the most features but may have compatibility issues with older themes</li>
                <li><strong>2023-01</strong>: Good compatibility with many themes, recommended if the latest version doesn't work</li>
                <li><strong>2022-10</strong>: May work better with older themes</li>
              </ul>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}