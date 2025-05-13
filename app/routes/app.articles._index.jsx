import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  EmptyState,
  IndexTable,
  Thumbnail,
  Icon, // Keep Icon if NoteIcon needs it, or if Thumbnail directly uses NoteIcon component
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import shopify, { authenticate } from "../shopify.server"; // Import shopify (default export) AND authenticate
import { NoteIcon } from "@shopify/polaris-icons"; // Assuming NoteIcon is the correct import

const getNumericId = (gid) => (gid ? gid.substring(gid.lastIndexOf("/") + 1) : null);

export const loader = async ({ request }) => {
  const RURL = new URL(request.url).pathname + new URL(request.url).search;
  console.log(`[app.articles._index.jsx loader START] for ${RURL}`);
  try {
    const { admin, session } = await authenticate.admin(request);
    // Log the entire session object for more details if needed
    // console.log(`[app.articles._index.jsx loader SESSION DETAILS] for ${RURL}:`, session);
    console.log(`[app.articles._index.jsx loader SUCCESS] for ${RURL}. Shop: ${session?.shop}, SessionID: ${session?.id}, IsOnline: ${session?.isOnline}`);

    const shopDomain = session.shop; // Use shopDomain for clarity, it's from the session

    const blogDataResponse = await admin.graphql(
      `#graphql
        query GetBlogByHandle($handle: String!) {
          blogs(first: 1, query: $handle) {
            edges {
              node {
                id
                handle # Add blog handle for constructing links if needed
                articles(first: 50, sortKey: PUBLISHED_AT, reverse: true) {
                  edges {
                    node {
                      id
                      title
                      handle
                      publishedAt
                      image {
                        url
                      }
                      templateSuffix
                    }
                  }
                }
              }
            }
          }
        }`,
      { variables: { handle: "handle:'case-studies'" } }
    );
    const blogDataJson = await blogDataResponse.json();

    if (!blogDataResponse.ok || blogDataJson.errors) {
      console.error("[app.articles._index.jsx loader] Failed to fetch blog data:", blogDataJson.errors);
      return json({ articles: [], shop: shopDomain, blogId: null, themeId: null, errors: blogDataJson.errors || [{ message: "Failed to fetch blog data." }] }, { status: 500 });
    }

    const blogNode = blogDataJson.data?.blogs?.edges[0]?.node;
    const articles = blogNode?.articles?.edges.map(edge => edge.node) || [];
    const blogGid = blogNode?.id; // For constructing admin links

    let themeId = null;
    try {
      // Use the imported `shopify` (app instance) to get a REST client
      const restClient = new shopify.clients.Rest({ session }); // session is from authenticate.admin
      const themeResponse = await restClient.get({
        path: "themes",
        query: { role: "main" },
      });
      // The line above assumes themeResponse is directly the data. Often it's { body: data }.
      // Let's assume themeResponse.json() or similar is needed if it's a fetch-like response.
      // However, shopify.clients.Rest usually returns the body directly.
      // Let's be safe:
      const themeData = themeResponse.body || themeResponse; // Adjust based on actual client behavior
      if (themeData.themes && themeData.themes.length > 0) {
        themeId = themeData.themes[0].id;
      }
    } catch (error) {
      console.error("[app.articles._index.jsx loader] Failed to fetch main theme:", error);
      // Proceed without themeId, edit button functionality will be limited
    }

    return json({ articles, shop: shopDomain, blogGid, blogHandle: blogNode?.handle, themeId, errors: null });
  } catch (error) {
    // Log the error object itself if it's not a Response, or its details if it is
    if (error instanceof Response) {
      console.error(`[app.articles._index.jsx loader ERROR - Response] for ${RURL}: Status ${error.status}, Location: ${error.headers.get('Location')}`);
    } else {
      console.error(`[app.articles._index.jsx loader ERROR - General] for ${RURL}:`, error);
    }
    throw error;
  }
};

export default function ArticlesIndex() {
  // Make sure to destructure blogGid and blogHandle if needed by the Edit button
  const { articles, shop, blogGid, blogHandle, themeId, errors } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  if (errors && errors.length > 0) {
    return (
      <Page>
        <TitleBar title="Case Studies" />
        <Layout><Layout.Section><Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Error loading articles</Text>
            {errors.map((err, index) => (<Text key={index} tone="critical">{err.message}</Text>))}
          </BlockStack>
        </Card></Layout.Section></Layout>
      </Page>
    );
  }

  const resourceName = { singular: 'article', plural: 'articles' };

  const rowMarkup = articles.map(
    ({ id, title, handle, publishedAt, image, templateSuffix }, index) => (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell><Thumbnail source={image?.url || NoteIcon} alt={title} size="small" /></IndexTable.Cell>
        <IndexTable.Cell><Text variant="bodyMd" fontWeight="bold" as="span">{title}</Text></IndexTable.Cell>
        <IndexTable.Cell>{handle}</IndexTable.Cell>
        <IndexTable.Cell>{publishedAt ? new Date(publishedAt).toLocaleDateString() : 'Draft'}</IndexTable.Cell>
        <IndexTable.Cell>
          <Button
            onClick={() => {
              const articleNumericId = getNumericId(id);
              if (shop && themeId && articleNumericId) {
                const templateToOpen = templateSuffix || `case-study-${handle}`;
                const themeEditorUrl = `https://${shop}/admin/themes/${themeId}/editor?template=article.${templateToOpen}&type=article&id=${articleNumericId}`;
                shopify.host.dispatch({ type: 'APP::NAVIGATION::OPEN_NEW_TAB', payload: { url: themeEditorUrl } });
              } else if (shop && blogGid && articleNumericId) {
                // Fallback to article admin page if theme editor link can't be formed
                const blogNumericId = getNumericId(blogGid);
                const articleAdminUrl = `https://${shop}/admin/blogs/${blogNumericId}/articles/${articleNumericId}`;
                 shopify.host.dispatch({ type: 'APP::NAVIGATION::OPEN_NEW_TAB', payload: { url: articleAdminUrl } });
                shopify.toast.show("Opened article in admin. Theme info missing for direct editor link.");
              } else {
                shopify.toast.show("Unable to open article editor.", { isError: true });
              }
            }}
            disabled={!shop} // Enable if shop is known, specific link depends on other data
          >Edit</Button>
        </IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  return (
    <Page>
      <TitleBar title="Case Studies"><button onClick={() => navigate("/app/articles/new")}>Create new case study</button></TitleBar>
      <Layout><Layout.Section>
        <Card padding="0">
          {(articles.length === 0 && (!errors || errors.length === 0)) ? (
            <EmptyState
              heading="No case studies found"
              action={{ content: 'Create new case study', onAction: () => navigate("/app/articles/new") }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            ><p>Articles from the 'case-studies' blog will appear here.</p></EmptyState>
          ) : (
            <IndexTable resourceName={resourceName} itemCount={articles.length} headings={[{title:''},{title:'Title'},{title:'Handle'},{title:'Published Date'},{title:'Actions'}]} selectable={false}>
              {rowMarkup}
            </IndexTable>
          )}
        </Card>
      </Layout.Section></Layout>
    </Page>
  );
}