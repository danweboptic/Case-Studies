import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  DataTable,
  Badge,
  ButtonGroup,
  Text,
  Box,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { useState, useEffect } from "react";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop; // e.g., your-store.myshopify.com
  const targetBlogHandle = "case-studies";
  let articles = [];
  let blogData = null;
  let themeId = null;
  let loaderErrors = [];

  try {
    const blogResponse = await admin.graphql(
      `#graphql
        query getBlogWithArticles($blogHandle: String!) {
          blogs(first: 1, query: $blogHandle) {
            edges {
              node {
                id
                title
                handle # Blog handle
                # Updated articles query: removed sortKey, kept reverse: true
                articles(first: 30, reverse: true) {
                  edges {
                    node {
                      id
                      title
                      handle # Article handle
                      publishedAt
                      blog { # Nested blog info for each article
                        id
                        handle # Blog handle again
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { variables: { blogHandle: `handle:'${targetBlogHandle}'` } }
    );

    if (!blogResponse.ok) {
      throw new Error(`Failed to fetch blog data. Status: ${blogResponse.status} ${await blogResponse.text()}`);
    }
    const blogResponseJson = await blogResponse.json();
    if (blogResponseJson.errors) {
      console.error("GraphQL errors in app._index.jsx loader:", JSON.stringify(blogResponseJson.errors, null, 2));
      // If the error was related to sortKey, this log will now show if other errors occur or if it's resolved.
      blogResponseJson.errors.forEach(err => loaderErrors.push({ message: `GraphQL error: ${err.message}` }));
    }
    blogData = blogResponseJson.data?.blogs?.edges[0]?.node || null;
    articles = blogData?.articles?.edges.map(edge => edge.node) || [];

  } catch (error) {
    console.error("Error fetching blog data in app._index.jsx loader:", error);
    loaderErrors.push({ message: error.message || "An unknown error occurred while fetching blog data." });
  }

  try {
    const themeResponse = await admin.rest.get({ path: "themes", query: { role: "main" } });
    if (!themeResponse.ok) {
      let themeErrorMsg = `Failed to fetch theme data. Status: ${themeResponse.status}`;
      try { const errorJson = await themeResponse.json(); if (errorJson?.errors) themeErrorMsg = `Failed to fetch theme data: ${JSON.stringify(errorJson.errors)}`; } catch (e) {/* ignore */}
      console.warn("app._index.jsx loader: " + themeErrorMsg);
    } else {
      const themeResponseJson = await themeResponse.json();
      if (themeResponseJson.themes?.length > 0) {
        themeId = themeResponseJson.themes[0].id;
      } else {
        console.warn("app._index.jsx loader: Main theme not found.");
      }
    }
  } catch (error) {
    console.warn("Error fetching main theme in app._index.jsx loader:", error);
  }

  return json({ articles, blogData, shop, themeId, errors: loaderErrors.length > 0 ? loaderErrors : null });
};

export default function Index() {
  const { articles, blogData, shop, themeId, errors: loaderErrors } = useLoaderData();
  const app = useAppBridge();
  const [appBridgeFeaturesReady, setAppBridgeFeaturesReady] = useState({
    dispatch: false,
    toast: false,
  });

  useEffect(() => {
    let dispatchAvailable = false;
    let toastAvailable = false;
    if (app) {
      if (typeof app.dispatch === 'function') dispatchAvailable = true;
      if (app.toast && typeof app.toast.show === 'function') toastAvailable = true;
      setAppBridgeFeaturesReady({ dispatch: dispatchAvailable, toast: toastAvailable });
      if (!dispatchAvailable) console.warn("app._index.jsx Effect: App Bridge 'dispatch' is UNDEFINED.");
    } else {
      setAppBridgeFeaturesReady({ dispatch: false, toast: false });
    }
  }, [app]);

  const showToast = (message, options = {}) => {
    if (appBridgeFeaturesReady.toast && app && app.toast && typeof app.toast.show === 'function') {
      app.toast.show(message, options);
    } else {
      alert(message);
    }
  };

  const getArticleThemeEditorUrl = (article) => {
    if (!shop || !themeId || !article || !article.handle || !article.blog?.handle) {
      console.warn("getArticleThemeEditorUrl: Missing required data.", { shop, themeId, articleHandle: article?.handle, blogHandle: article?.blog?.handle });
      return null;
    }
    const storeName = shop.split('.')[0];
    if (!storeName) {
        console.warn("getArticleThemeEditorUrl: Could not extract store name from shop domain:", shop);
        return null;
    }
    const blogHandle = article.blog.handle;
    const articleHandle = article.handle;
    const previewPath = `/blogs/${encodeURIComponent(blogHandle)}/${encodeURIComponent(articleHandle)}`;
    return `https://admin.shopify.com/store/${storeName}/themes/${themeId}/editor?previewPath=${encodeURIComponent(previewPath)}`;
  };

  const getArticleAdminUrl = (article) => {
    const articleNumericId = article.id ? article.id.split('/').pop() : null;
    const blogNumericId = article.blog?.id ? article.blog.id.split('/').pop() : null;
    return (shop && articleNumericId && blogNumericId) ? `https://${shop}/admin/blogs/${blogNumericId}/articles/${articleNumericId}` : null;
  };

  const getArticleFrontendUrl = (article) => {
    return (shop && article.blog?.handle && article.handle) ? `https://${shop}/blogs/${article.blog.handle}/${article.handle}` : null;
  };

  const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : "Not Published";

  const getStatusBadge = (publishedAt) => {
    if (publishedAt) {
      return new Date(publishedAt) <= new Date() ? <Badge status="success">Published</Badge> : <Badge status="info">Scheduled</Badge>;
    }
    return <Badge status="attention">Draft</Badge>;
  };

  const rows = articles.map(article => [
    article.title,
    formatDate(article.publishedAt),
    getStatusBadge(article.publishedAt),
    <ButtonGroup key={article.id}>
      <Button size="slim" disabled={!shop || !themeId || !article.handle || !article.blog?.handle} onClick={() => {
        const url = getArticleThemeEditorUrl(article);
        if (url) {
          if (appBridgeFeaturesReady.dispatch && app && typeof app.dispatch === 'function') {
            app.dispatch({ type: 'APP::NAVIGATION::OPEN_NEW_TAB', payload: { url, newContext: false } });
          } else {
            console.warn("Fallback: app.dispatch not available for 'Edit Template'. Using window.open(). URL:", url);
            window.open(url, '_blank');
          }
        } else {
          showToast("Could not construct theme editor URL. Check console for details.", { isError: true });
        }
      }}>Edit Template</Button>
      <Button size="slim" disabled={!article.id || !article.blog?.id} onClick={() => {
        const url = getArticleAdminUrl(article);
        if (url) {
          if (appBridgeFeaturesReady.dispatch && app && typeof app.dispatch === 'function') {
            app.dispatch({ type: 'APP::NAVIGATION::REDIRECT', payload: { url, newContext: false } });
          } else {
            // window.top.location.href = url;
            window.open(url, '_blank');
          }
        } else {
          showToast("Could not construct admin editor URL.", { isError: true });
        }
      }}>Edit Content</Button>
      <Button size="slim" disabled={!article.blog?.handle || !article.handle} onClick={() => {
        const url = getArticleFrontendUrl(article);
        if (url) {
          if (appBridgeFeaturesReady.dispatch && app && typeof app.dispatch === 'function') {
            app.dispatch({ type: 'APP::NAVIGATION::OPEN_NEW_TAB', payload: { url } });
          } else {
            window.open(url, '_blank');
          }
        } else {
          showToast("Could not construct frontend URL.", { isError: true });
        }
      }}>View Live</Button>
    </ButtonGroup>
  ]);

  if (loaderErrors && loaderErrors.length > 0 && !articles.length) { // Show critical error if no articles and loader had issues
    return (
      <Page>
        <TitleBar title={(blogData?.title || "Case Studies")} />
        <Layout><Layout.Section><Card>
          <BlockStack gap="200" padding="400">
            <Text as="h2" variant="headingMd" tone="critical">Error loading page data</Text>
            <ul>
              {loaderErrors.map((err, index) => (<li key={index}><Text tone="critical">{err.message}</Text></li>))}
            </ul>
          </BlockStack>
        </Card></Layout.Section></Layout>
      </Page>
    );
  }

  return (
    <Page>
      <TitleBar title={blogData?.title || "Case Studies"} />
      {/* {(!appBridgeFeaturesReady.dispatch) && (
        <Box paddingBlockEnd="400"><Card><BlockStack gap="200">
          <Text as="h2" variant="headingMd" tone="warning">Shopify Integration Note</Text>
          <Text as="p" tone="subdued">Navigation features are using fallbacks as App Bridge 'dispatch' is not fully available.</Text>
        </BlockStack></Card></Box>
      )}*/}
      {/* Display non-critical loader errors if articles were still loaded */}
      {loaderErrors && loaderErrors.length > 0 && articles.length > 0 && (
         <Box paddingBlockEnd="400"><Card><BlockStack gap="200">
           <Text as="h2" variant="headingMd" tone="warning">Page Information</Text>
            <Text as="p" tone="subdued">There were some issues loading page data, but article information is available:</Text>
           <ul>
             {loaderErrors.map((error, index) => (
               <li key={index}><Text tone="subdued">{error.message}</Text></li>
             ))}
           </ul>
         </BlockStack></Card></Box>
       )}
      <BlockStack gap="400"><Layout><Layout.Section><Card padding="0">
        <DataTable columnContentTypes={['text', 'text', 'text', 'text']} headings={['Title', 'Published Date', 'Status', 'Actions']} rows={rows} footerContent={articles.length > 0 ? `Showing ${articles.length} article${articles.length === 1 ? '' : 's'} from ${blogData?.title || 'case-studies'}` : `No articles found in '${blogData?.title || 'case-studies'}'`} />
        {articles.length === 0 && (!loaderErrors || loaderErrors.length === 0) && (<Box padding="400"><Text as="p" alignment="center">No articles found in the '{blogData?.title || 'case-studies'}' blog.</Text></Box>)}
      </Card></Layout.Section></Layout></BlockStack>
    </Page>
  );
}