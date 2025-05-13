import { useState, useCallback } from "react";
import { json } from "@remix-run/node";
import {
  useLoaderData,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  TextField,
  // Select, // No longer needed
  Text,
  Banner,
  FormLayout,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { proxyPost } from "../utils/proxyClient";

// Loader function to fetch the "case-studies" blog and current theme
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const targetBlogHandle = "case-studies";
  console.log(`Loader: Authenticated session: ${session.shop}. Looking for blog: ${targetBlogHandle}`);

  let caseStudiesBlog = null;
  let currentThemeId = null;
  let themeInfo = null;
  let loaderErrors = [];

  try {
    // Fetch blogs to find the "case-studies" blog
    const blogResponse = await admin.graphql(
      `#graphql
        query Blogs($query: String) {
          blogs(first: 25, query: $query) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
        }`,
      {
        variables: {
          query: `handle:'${targetBlogHandle}'` // Query specifically for the handle
        }
      }
    );

    const blogResponseJson = await blogResponse.json();

    if (!blogResponse.ok || blogResponseJson.errors || !blogResponseJson.data?.blogs) {
      const errors = blogResponseJson.errors || [{ message: `Failed to fetch blog '${targetBlogHandle}' or access denied.` }];
      console.error(`Loader: Failed to fetch blog '${targetBlogHandle}':`, JSON.stringify(errors, null, 2));
      loaderErrors.push(...errors.map(e => ({ message: e.message })));
    } else {
      const foundBlogNode = blogResponseJson.data.blogs.edges.find(edge => edge.node.handle === targetBlogHandle)?.node;
      if (foundBlogNode) {
        caseStudiesBlog = {
          id: foundBlogNode.id,
          title: foundBlogNode.title,
          handle: foundBlogNode.handle,
          restId: foundBlogNode.id.split('/').pop(),
        };
        console.log("Loader: Found 'case-studies' blog:", caseStudiesBlog);
      } else {
        const errorMessage = `Blog with handle '${targetBlogHandle}' not found.`;
        console.error("Loader:", errorMessage);
        loaderErrors.push({ message: errorMessage });
      }
    }
  } catch (blogFetchError) {
    console.error(`Loader: Unexpected error fetching blog '${targetBlogHandle}':`, blogFetchError);
    loaderErrors.push({ message: `Error fetching blog: ${blogFetchError.message}` });
  }

  // Fetch theme ID using REST API via admin API
  // This part remains the same
  if (loaderErrors.length === 0 || caseStudiesBlog) { // Attempt to fetch theme even if blog has minor issues, if needed by PHP
    try {
      const themesResponse = await fetch(
        `https://${session.shop}/admin/api/2023-07/themes.json`, // Using a recent, stable API version
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
        const themeErrorMsg = `Failed to fetch theme information (Status: ${themesResponse.status}). Template creation might be affected.`;
        console.warn("Loader:", themeErrorMsg);
        // Not adding to loaderErrors, as it might not be critical for all operations
      }
    } catch (themeError) {
      console.error("Loader: Error fetching theme:", themeError);
      // Not adding to loaderErrors
    }
  }

  return json({
    shop: session.shop,
    caseStudiesBlog, // Pass the specific blog details
    currentThemeId,
    themeInfo,
    errors: loaderErrors.length > 0 ? loaderErrors : null
  });
};

// Default export - React component
export default function BlogPostNewPreselectedBlog() {
  const { shop, caseStudiesBlog, currentThemeId, themeInfo, errors: loaderErrors } = useLoaderData();

  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const phpServerUrl = "https://v4.droplet.weboptichosting.co.uk/shopify/case-studies/index.php";

  const handleFormSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (!caseStudiesBlog) {
      setErrorMessage("Cannot create article: 'case-studies' blog details are missing. Please check store configuration.");
      return;
    }

    setSuccessMessage("");
    setErrorMessage("");
    setIsLoading(true);

    try {
      const formData = {
        blogId: caseStudiesBlog.restId,
        blogHandle: caseStudiesBlog.handle,
        title: title,
        themeId: currentThemeId,
        themeInfo: themeInfo,
        timestamp: new Date().toISOString()
      };

      console.log("Sending data via proxy (preselected blog):", formData);
      const result = await proxyPost(phpServerUrl, formData, {}, false);

      if (result.success) {
        setSuccessMessage(result.message || "Article created successfully!");
        if (result.warning) {
          setSuccessMessage(prev => `${prev} (Warning: ${result.warning})`);
        }
        if (result.resetForm) {
          setTitle("");
        }
      } else {
        setErrorMessage(result.error || "Something went wrong creating the article.");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      setErrorMessage(`Client-side error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [caseStudiesBlog, title, currentThemeId, themeInfo, phpServerUrl]);

  if (loaderErrors && loaderErrors.length > 0 && !caseStudiesBlog) {
    // If there are loader errors and specifically the caseStudiesBlog is not found,
    // it's a critical issue for this page.
    return (
      <Page>
        <ui-title-bar title="Create New Case Study" />
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400" padding="400">
                <Banner title="Error Loading Page Data" tone="critical">
                  <Text>Could not load required information for creating a case study:</Text>
                  <ul>
                    {loaderErrors.map((error, index) => (
                      <li key={index}>{error.message || JSON.stringify(error)}</li>
                    ))}
                  </ul>
                  <Text>Please ensure a blog with the handle "case-studies" exists in your Shopify store.</Text>
                </Banner>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }


  return (
    <Page>
      <ui-title-bar title="Create New Case Study" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400" padding="400">

              {/* Display non-critical loader errors if caseStudiesBlog was found but other minor issues occurred */}
              {loaderErrors && loaderErrors.length > 0 && caseStudiesBlog && (
                 <Banner title="Page Information" tone="warning">
                   <Text>There were some issues loading page data, but core functionality should be available:</Text>
                   <ul>
                     {loaderErrors.map((error, index) => (
                       <li key={index}>{error.message || JSON.stringify(error)}</li>
                     ))}
                   </ul>
                 </Banner>
               )}


              {errorMessage && (
                <Banner title="Error Creating Article" tone="critical">
                  <Text>{errorMessage}</Text>
                </Banner>
              )}

              {successMessage && (
                <Banner title="Article Action Status" tone="success">
                  <Text>{successMessage}</Text>
                </Banner>
              )}

              <form onSubmit={handleFormSubmit}>
                <FormLayout>
                  <BlockStack gap="400">
                    <TextField
                      label="Article Title"
                      value={title}
                      onChange={setTitle}
                      autoComplete="off"
                      disabled={isLoading || !caseStudiesBlog} // Disable if blog details not loaded
                      requiredIndicator
                      helpText={`This article will be created in the "${(caseStudiesBlog && caseStudiesBlog.title) || 'case-studies'}" blog.`}
                    />

                    <Button
                      submit={true}
                      primary
                      loading={isLoading}
                      disabled={isLoading || !title || !caseStudiesBlog}
                    >
                      Create Case Study Article
                    </Button>
                  </BlockStack>
                </FormLayout>
              </form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}