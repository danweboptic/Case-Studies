import { useState, useCallback } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  Banner,
  Box,
  Divider,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

// Loader function
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  return json({
    shop: session.shop
  });
};

// Action function focused specifically on testing template creation
export const action = async ({ request }) => {
  console.log("Template Debug: Action started at " + new Date().toISOString());

  try {
    const { admin, session } = await authenticate.admin(request);
    console.log("Template Debug: Authenticated for shop:", session.shop);

    // Get a theme to work with
    console.log("Getting main theme...");
    const themeResponse = await admin.rest.get({
      path: '/themes.json',
      query: { role: 'main' }
    });

    if (!themeResponse.ok) {
      const errorText = await themeResponse.text();
      return json({
        error: `Failed to get theme: ${themeResponse.status}`,
        details: errorText,
        step: "theme_fetch"
      }, { status: 500 });
    }

    const themeJson = await themeResponse.json();

    if (!themeJson.themes || themeJson.themes.length === 0) {
      return json({
        error: "No themes found in the store",
        details: "The store must have at least one theme",
        step: "theme_fetch"
      }, { status: 404 });
    }

    const mainTheme = themeJson.themes.find(theme => theme.role === 'main') || themeJson.themes[0];
    console.log(`Using theme: ${mainTheme.name} (ID: ${mainTheme.id})`);

    // Debug theme permissions by creating a simple text file first
    console.log("Testing theme asset permissions...");
    const timestamp = new Date().getTime();
    const testAssetKey = `assets/test-${timestamp}.txt`;

    try {
      const permissionTestResponse = await admin.rest.put({
        path: `/themes/${mainTheme.id}/assets.json`,
        data: {
          asset: {
            key: testAssetKey,
            value: "This is a test file to verify asset creation permissions."
          }
        }
      });

      if (!permissionTestResponse.ok) {
        const errorText = await permissionTestResponse.text();
        return json({
          error: `Permission test failed: ${permissionTestResponse.status}`,
          details: errorText,
          step: "permission_test"
        }, { status: 500 });
      }

      console.log("Permission test passed - can create assets");
    } catch (permError) {
      console.error("Permission test error:", permError);
      return json({
        error: "Permission test failed with exception",
        details: permError ? permError.message || String(permError) : "Unknown error",
        step: "permission_test"
      }, { status: 500 });
    }

    // Now try to create a template in 3 different formats to see which works
    const testResults = [];
    const templateSuffix = `debug-${timestamp}`;

    // Test Format 1: JSON template
    try {
      console.log("Testing JSON template format...");
      const jsonTemplateKey = `templates/article.${templateSuffix}-json.json`;

      const jsonTemplateValue = JSON.stringify({
        sections: {
          main: {
            type: "main-article",
            settings: {}
          }
        },
        order: ["main"]
      }, null, 2);

      console.log(`Creating template: ${jsonTemplateKey}`);

      const jsonResponse = await admin.rest.put({
        path: `/themes/${mainTheme.id}/assets.json`,
        data: {
          asset: {
            key: jsonTemplateKey,
            value: jsonTemplateValue
          }
        }
      });

      const success = jsonResponse.ok;
      let responseData;

      try {
        responseData = success ? await jsonResponse.json() : await jsonResponse.text();
      } catch (e) {
        responseData = "Could not parse response: " + (e.message || String(e));
      }

      testResults.push({
        format: "JSON",
        success,
        status: jsonResponse.status,
        data: responseData
      });
    } catch (error) {
      console.error("JSON template test error:", error);
      testResults.push({
        format: "JSON",
        success: false,
        error: error ? error.message || String(error) : "Unknown error",
        errorDetails: error
      });
    }

    // Test Format 2: Liquid template
    try {
      console.log("Testing Liquid template format...");
      const liquidTemplateKey = `templates/article.${templateSuffix}-liquid.liquid`;

      const liquidTemplateValue = `
{% assign article = article %}
<div class="page-width">
  <article class="article">
    <header class="article__header">
      <h1>{{ article.title }}</h1>
      <span>{{ article.published_at | date: "%B %d, %Y" }}</span>
    </header>
    <div class="article__content">
      {{ article.content }}
    </div>
  </article>
</div>
      `.trim();

      console.log(`Creating template: ${liquidTemplateKey}`);

      const liquidResponse = await admin.rest.put({
        path: `/themes/${mainTheme.id}/assets.json`,
        data: {
          asset: {
            key: liquidTemplateKey,
            value: liquidTemplateValue
          }
        }
      });

      const success = liquidResponse.ok;
      let responseData;

      try {
        responseData = success ? await liquidResponse.json() : await liquidResponse.text();
      } catch (e) {
        responseData = "Could not parse response: " + (e.message || String(e));
      }

      testResults.push({
        format: "Liquid",
        success,
        status: liquidResponse.status,
        data: responseData
      });
    } catch (error) {
      console.error("Liquid template test error:", error);
      testResults.push({
        format: "Liquid",
        success: false,
        error: error ? error.message || String(error) : "Unknown error",
        errorDetails: error
      });
    }

    // Test Format 3: Minimal JSON template (simpler structure)
    try {
      console.log("Testing minimal JSON template format...");
      const minimalJsonTemplateKey = `templates/article.${templateSuffix}-minimal.json`;

      // Extremely minimal template structure
      const minimalJsonTemplateValue = JSON.stringify({
        sections: {},
        order: []
      }, null, 2);

      console.log(`Creating template: ${minimalJsonTemplateKey}`);

      const minimalJsonResponse = await admin.rest.put({
        path: `/themes/${mainTheme.id}/assets.json`,
        data: {
          asset: {
            key: minimalJsonTemplateKey,
            value: minimalJsonTemplateValue
          }
        }
      });

      const success = minimalJsonResponse.ok;
      let responseData;

      try {
        responseData = success ? await minimalJsonResponse.json() : await minimalJsonResponse.text();
      } catch (e) {
        responseData = "Could not parse response: " + (e.message || String(e));
      }

      testResults.push({
        format: "Minimal JSON",
        success,
        status: minimalJsonResponse.status,
        data: responseData
      });
    } catch (error) {
      console.error("Minimal JSON template test error:", error);
      testResults.push({
        format: "Minimal JSON",
        success: false,
        error: error ? error.message || String(error) : "Unknown error",
        errorDetails: error
      });
    }

    // See if any format succeeded
    const anySuccess = testResults.some(result => result.success);

    return json({
      success: anySuccess,
      message: anySuccess
        ? "At least one template format was created successfully"
        : "All template formats failed",
      testResults,
      theme: {
        id: mainTheme.id,
        name: mainTheme.name,
        role: mainTheme.role
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Template Debug: Unexpected error:", error);
    return json({
      error: "Unexpected error",
      details: error ? error.message || String(error) : "Unknown error (undefined)",
      stack: error && error.stack,
      step: "unknown"
    }, { status: 500 });
  }
};

// Component for displaying template test results
export default function TemplateDebug() {
  const { shop } = useLoaderData();
  const actionData = useActionData();
  const [isRunning, setIsRunning] = useState(false);

  const handleSubmit = useCallback(() => {
    setIsRunning(true);
  }, []);

  // Helper function to format response data
  const formatData = (data) => {
    if (typeof data === 'string') {
      return data;
    }
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return String(data);
    }
  };

  return (
    <Page
      title="Template Creation Debug"
      subtitle={`For ${shop}`}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Text as="h2" variant="headingMd">
                This tool tests different template formats to identify what works for your store
              </Text>

              <Box paddingBlockStart="400" paddingBlockEnd="400">
                <Text as="p">
                  Click the button below to run the test. This will attempt to create template assets
                  in different formats and report which ones succeed.
                </Text>
              </Box>

              <Form method="post" onSubmit={handleSubmit}>
                <Button
                  submit
                  primary
                  disabled={isRunning && !actionData}
                >
                  {isRunning && !actionData ? "Running Test..." : "Run Template Test"}
                </Button>
              </Form>

              {isRunning && !actionData && (
                <Box paddingBlockStart="400" textAlign="center">
                  <Spinner size="large" />
                  <Box paddingBlockStart="300">
                    <Text>Testing template formats...</Text>
                  </Box>
                </Box>
              )}

              {actionData && actionData.error && (
                <Box paddingBlockStart="400">
                  <Banner status="critical">
                    <Text as="h3" variant="headingMd">{actionData.error}</Text>
                    <Box paddingBlockStart="300">
                      <Text>{actionData.details}</Text>
                    </Box>
                    <Box paddingBlockStart="300">
                      <Text as="p">Step: {actionData.step}</Text>
                    </Box>
                  </Banner>
                </Box>
              )}

              {actionData && actionData.testResults && (
                <Box paddingBlockStart="400">
                  <Banner status={actionData.success ? "success" : "critical"}>
                    <Text as="h3" variant="headingMd">{actionData.message}</Text>
                  </Banner>

                  <Box paddingBlockStart="400">
                    <Text variant="headingMd">Test Results</Text>

                    {actionData.testResults.map((result, index) => (
                      <Box
                        key={index}
                        paddingBlockStart="400"
                        paddingBlockEnd="400"
                        borderBlockEndWidth="050"
                        borderColor="border"
                      >
                        <Text as="h4" variant="headingSm">
                          Format: {result.format} - {result.success ? "SUCCESS" : "FAILED"}
                        </Text>

                        {result.success ? (
                          <Box paddingBlockStart="300">
                            <Text>Template created successfully</Text>
                            <Box paddingBlockStart="200">
                              <Text as="p">Status: {result.status}</Text>
                            </Box>
                          </Box>
                        ) : (
                          <Box paddingBlockStart="300">
                            <Text>Template creation failed</Text>
                            {result.status && (
                              <Box paddingBlockStart="200">
                                <Text as="p">Status: {result.status}</Text>
                              </Box>
                            )}
                            {result.error && (
                              <Box paddingBlockStart="200">
                                <Text as="p">Error: {result.error}</Text>
                              </Box>
                            )}
                          </Box>
                        )}

                        <Box paddingBlockStart="300">
                          <details>
                            <summary>
                              <Text>View Response Data</Text>
                            </summary>
                            <Box padding="300" background="bg-surface-secondary">
                              <pre style={{ margin: 0, overflowX: 'auto' }}>
                                {formatData(result.data || result.errorDetails || "No data available")}
                              </pre>
                            </Box>
                          </details>
                        </Box>
                      </Box>
                    ))}

                    <Box paddingBlockStart="400">
                      <Text variant="headingSm">Theme Information</Text>
                      <Box paddingBlockStart="200">
                        <Text as="p">ID: {actionData.theme.id}</Text>
                        <Text as="p">Name: {actionData.theme.name}</Text>
                        <Text as="p">Role: {actionData.theme.role}</Text>
                      </Box>
                    </Box>

                    <Box paddingBlockStart="400" textAlign="right">
                      <Text as="p" tone="subdued">
                        Test completed at: {actionData.timestamp}
                      </Text>
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}