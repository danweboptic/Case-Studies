import { useState, useCallback } from "react";
import { json, redirect } from "@remix-run/node";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useSubmit,
  useNavigate,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  TextField,
  Text,
  Banner,
  FormLayout,
  Spinner,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

// Helper function to generate a handle from a title
const generateHandle = (title) => {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, ''); // Remove all non-word chars
};

// Helper function to get the numeric ID from a Shopify GID
const getNumericId = (gid) => {
  if (!gid) return null;
  return gid.substring(gid.lastIndexOf("/") + 1);
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return json({ shop: session.shop });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const title = formData.get("title");

  if (!title || typeof title !== 'string' || title.trim() === "") {
    return json({ errors: { title: "Title is required." }, shop }, { status: 400 });
  }

  try {
    // 1. Find the 'case-studies' blog ID
    const blogQueryResponse = await admin.graphql(
      `#graphql
        query GetBlogByHandle($handle: String!) {
          blogs(first: 1, query: $handle) {
            edges {
              node {
                id
              }
            }
          }
        }`,
      { variables: { handle: "handle:'case-studies'" } }
    );
    const blogQueryJson = await blogQueryResponse.json();
    const blogNode = blogQueryJson.data?.blogs?.edges[0]?.node;

    if (!blogNode?.id) {
      return json({ errors: { form: "Could not find the 'case-studies' blog. Please ensure it exists." }, shop }, { status: 500 });
    }
    const blogId = blogNode.id;
    const articleHandle = generateHandle(title);

    // 2. Create the new article
    const createArticleResponse = await admin.graphql(
      `#graphql
        mutation ArticleCreate($input: ArticleInput!) {
          articleCreate(blogId: "${blogId}", input: $input) {
            article {
              id
              handle
              title
              onlineStoreUrl
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          input: {
            title: title,
            handle: articleHandle, // Shopify will auto-generate if not provided or if it collides
            published: false, // Create as draft initially
            author: "Case Study Author", // Optional: Or fetch current user
            bodyHtml: "<p>Start writing your case study here...</p>", // Basic placeholder
            // SEO fields can be added here if needed
          },
        },
      }
    );

    const createArticleJson = await createArticleResponse.json();
    if (createArticleJson.data?.articleCreate?.userErrors?.length > 0) {
      console.error("Article creation user errors:", createArticleJson.data.articleCreate.userErrors);
      return json({ errors: { form: createArticleJson.data.articleCreate.userErrors.map(e => e.message).join(", ") }, shop }, { status: 400 });
    }
    if (!createArticleJson.data?.articleCreate?.article) {
      console.error("Failed to create article:", createArticleJson.errors || createArticleJson);
      return json({ errors: { form: "Failed to create article. Check server logs." }, shop }, { status: 500 });
    }
    const newArticle = createArticleJson.data.articleCreate.article;
    const newArticleNumericId = getNumericId(newArticle.id);

    // 3. Get the current main theme ID
    let currentThemeId = null;
    try {
      const themeResponse = await admin.rest.get({ path: "themes", query: { role: "main" } });
      const themeResponseJson = await themeResponse.json();
      if (themeResponseJson.themes && themeResponseJson.themes.length > 0) {
        currentThemeId = themeResponseJson.themes[0].id;
      }
    } catch (themeError) {
      console.error("Failed to fetch main theme:", themeError);
      // Proceed without template creation if theme fetch fails, but redirect to article
       return json({
        success: true,
        warning: "Article created, but failed to get theme info for template creation.",
        article: newArticle,
        shop,
        themeEditorUrl: newArticle.onlineStoreUrl || `https://${shop}/admin/articles/${newArticleNumericId}` // Fallback URL
      });
    }

    if (!currentThemeId) {
       return json({
        success: true,
        warning: "Article created, but no main theme found for template creation.",
        article: newArticle,
        shop,
        themeEditorUrl: newArticle.onlineStoreUrl || `https://${shop}/admin/articles/${newArticleNumericId}`
      });
    }

    // 4. Generate a unique name for a new JSON template and create it
    const templateName = `case-study-${newArticle.handle}`; // e.g., article.case-study-my-cool-post
    const fullTemplateKey = `templates/article.${templateName}.json`;
    const basicJsonTemplate = {
      sections: {
        main: {
          type: "main-article", // Assumes your theme has a 'main-article' section
          settings: {},
        },
      },
      order: ["main"],
    };

    try {
      await admin.rest.put({
        path: `themes/${currentThemeId}/assets`,
        data: {
          asset: {
            key: fullTemplateKey,
            value: JSON.stringify(basicJsonTemplate, null, 2),
          },
        },
      });
    } catch (assetError) {
      console.error(`Failed to create template asset ${fullTemplateKey}:`, assetError);
      return json({
        success: true,
        warning: `Article created, but failed to create the JSON template (${assetError.message}). You may need to create it manually.`,
        article: newArticle,
        shop,
        themeEditorUrl: newArticle.onlineStoreUrl || `https://${shop}/admin/articles/${newArticleNumericId}`
      });
    }

    // 5. Update the article to use this new template via metafield
    // The metafield for article template is 'system.online_store.template_suffix'
    // However, Shopify often uses a convention like template: "article.suffix"
    // For JSON templates, the article's `template_suffix` metafield should be set to the template name *without* "article." and ".json"
    // So, for `article.case-study-my-cool-post.json`, the suffix is `case-study-my-cool-post`
    const templateSuffixToApply = templateName;

    await admin.graphql(
      `#graphql
        mutation UpdateArticleTemplate($input: ArticleInput!) {
          articleUpdate(id: "${newArticle.id}", input: $input) {
            article {
              id
              templateSuffix
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          input: {
            templateSuffix: templateSuffixToApply,
            // Metafields can also be used if your theme relies on a custom metafield
            // metafields: [
            //   { namespace: "custom", key: "article_template", value: `article.${templateName}`, type: "single_line_text_field" }
            // ]
          },
        },
      }
    );
    // We don't strictly need to check the result of articleUpdate for this flow,
    // as the main goal is to redirect to the editor with the template.

    // 6. Construct the theme editor URL and return it for client-side redirect
    const themeEditorUrl = `https://${shop}/admin/themes/${currentThemeId}/editor?template=article.${templateSuffixToApply}&type=article&id=${newArticleNumericId}`;

    return json({
      success: true,
      article: newArticle,
      themeEditorUrl: themeEditorUrl,
      shop
    });

  } catch (error) {
    console.error("Action error:", error);
    return json({ errors: { form: `An unexpected error occurred: ${error.message}` }, shop }, { status: 500 });
  }
};

export default function ArticleNew() {
  const { shop } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [formErrors, setFormErrors] = useState({});

  const isLoading = navigation.state === "submitting" || navigation.state === "loading";

  // Handle action data for success/error messages and redirect
  useState(() => {
    if (actionData) {
      if (actionData.errors) {
        setFormErrors(actionData.errors);
        shopify.toast.show(actionData.errors.form || "Please check the form for errors.", { isError: true });
      } else if (actionData.success) {
        const message = actionData.warning || `Article "${actionData.article?.title}" created successfully!`;
        shopify.toast.show(message, { isError: !!actionData.warning });
        if (actionData.themeEditorUrl) {
          // Open in new tab
           shopify.host.dispatch({
            type: 'APP::NAVIGATION::OPEN_NEW_TAB',
            payload: { url: actionData.themeEditorUrl },
          });
          // Potentially navigate back to the articles list in the app
          navigate("/app/articles");
        }
      }
    }
  }, [actionData, shopify, navigate]);


  const handleFormSubmit = useCallback(
    (event) => {
      event.preventDefault();
      setFormErrors({}); // Clear previous errors
      const formData = new FormData();
      formData.append("title", title);
      submit(formData, { method: "post" });
    },
    [title, submit]
  );

  return (
    <Page>
      <TitleBar title="Create New Case Study">
         <button onClick={() => navigate("/app/articles")}>
          Cancel
        </button>
      </TitleBar>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="p" variant="bodyMd">
                Create a new article for the 'case-studies' blog. A basic JSON template will be automatically created and applied in your current theme.
              </Text>
              <form onSubmit={handleFormSubmit}>
                <FormLayout>
                  <TextField
                    label="Article Title"
                    value={title}
                    onChange={setTitle}
                    autoComplete="off"
                    error={formErrors.title}
                    requiredIndicator
                    disabled={isLoading}
                  />
                  {formErrors.form && (
                     <Banner title="Error" tone="critical" onDismiss={() => setFormErrors(prev => ({...prev, form: undefined}))}>
                        <Text>{formErrors.form}</Text>
                     </Banner>
                  )}
                  <Button
                    submit={true}
                    variant="primary"
                    loading={isLoading}
                    disabled={isLoading || !title.trim()}
                  >
                    Create Article and Open Editor
                  </Button>
                </FormLayout>
              </form>
            </BlockStack>
          </Card>
        </Layout.Section>
         {isLoading && (
          <Layout.Section>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px' }}>
              <Spinner accessibilityLabel="Processing form" size="large" />
            </div>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}