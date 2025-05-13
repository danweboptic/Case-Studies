import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  await authenticate.admin(request); // Handles auth and App Bridge context setup

  const apiKey = process.env.SHOPIFY_API_KEY || "";
  // Log to server console during development
  console.log(
    "App.jsx Loader - Shopify API Key being used:",
    apiKey ? "Key Present" : "MISSING_OR_EMPTY"
  );
  if (!apiKey) {
    console.warn(
      "CRITICAL WARNING: SHOPIFY_API_KEY is not set in your environment variables. App Bridge will not function correctly and app.host will be undefined."
    );
  }

  return { apiKey: apiKey }; // Always return apiKey, even if empty
};

export default function App() {
  const { apiKey } = useLoaderData();

  if (!apiKey) {
    // If API key is missing, render an error page instead of trying to load AppProvider
    return (
      <html>
        <head>
          <title>App Configuration Error</title>
          {links().map((link) => (
            <link key={link.href} rel={link.rel} href={link.href} />
          ))}
        </head>
        <body>
          <div style={{ padding: "20px", textAlign: "center", fontFamily: "sans-serif" }}>
            <h1>Application Configuration Error</h1>
            <p>The Shopify API Key is missing or not configured correctly.</p>
            <p>Please ensure the <code>SHOPIFY_API_KEY</code> environment variable is set on your server and the application is restarted.</p>
            <p>App Bridge and other Shopify Admin features will not work without it.</p>
          </div>
        </body>
      </html>
    );
  }

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        {/* Ensure the route "/app/blog-posts/new" exists if you keep this link */}
        <Link to="/app/blog-posts/new">New Case Study</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};