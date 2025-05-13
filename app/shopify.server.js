import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  // LATEST_API_VERSION, // Or the specific version you are using
  // REMOVED: restResources import is not needed here
} from "@shopify/shopify-app-remix/server";

// Import your session storage strategy (Prisma in the QR code example)
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server"; // Assuming db.server.js is in the app directory

// Define the API version (use the same one as in your project)
// Example: Use 2024-04, adjust if necessary
const SHOPIFY_API_VERSION = ApiVersion.V2024_04; // Make sure this matches your needs

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: SHOPIFY_API_VERSION,
  scopes: process.env.SCOPES?.split(","), // Ensure 'read_content' and 'write_content' are in your .env SCOPES
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma), // Use Prisma session storage like the QR code example
  distribution: AppDistribution.AppStore, // Or AppDistribution.SingleMerchant if private

  // REMOVED: restResources configuration line is not needed here

  // Optional: Add billing configuration if needed
  // billing: { // ... }
  // Optional: If you need webhooks
  // webhooks: { // ... }

  // Keep any future flags you have
  future: {
    v3_webhookAdminContext: true,
    v3_authenticatePublic: true,
    // unstable_newEmbeddedAuthStrategy: true, // Keep if you use this
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

// Export the necessary functions and objects
export default shopify;
export const apiVersion = SHOPIFY_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate; // This is used in your route files
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;